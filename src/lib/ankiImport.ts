/**
 * Anki .apkg importer for FlashStack.
 *
 * .apkg files are zip archives containing a SQLite database (`collection.anki2`
 * or `collection.anki21` for newer schemas) plus media files. This runs fully
 * client-side:
 *   1. JSZip unzips the archive in memory
 *   2. sql.js (SQLite compiled to WASM) reads the collection database
 *   3. Notes are converted to FlashStack cards (Anki HTML -> basic markdown)
 *   4. Referenced images are extracted and inlined as base64 data URLs
 */
import JSZip from "jszip";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
// Vite serves the WASM binary as a URL asset; sql.js fetches it via locateFile.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { db } from "@/lib/db";

/* --------------------------------- Types ---------------------------------- */

export interface AnkiCardData {
  front: string;
  back: string;
}

export interface AnkiDeckData {
  name: string;
  cards: AnkiCardData[];
}

export interface AnkiImportResult {
  decks: AnkiDeckData[];
  totalCards: number;
}

export type ImportStage = "unzipping" | "database" | "parsing" | "media" | "saving";

export interface ImportProgress {
  stage: ImportStage;
  /** Human-readable detail, e.g. "Parsing 42 of 120 cards" */
  message: string;
  current: number;
  total: number;
}

export type ProgressCallback = (progress: ImportProgress) => void | Promise<void>;

/* ------------------------------ Entry points ------------------------------ */

/**
 * Parse an .apkg File into structured deck/card data.
 * Throws `Error` with a user-friendly message for corrupt/invalid files.
 */
export async function parseAnkiFile(
  file: File,
  onProgress?: ProgressCallback
): Promise<AnkiImportResult> {
  if (!file.name.toLowerCase().endsWith(".apkg")) {
    throw new Error("Please select a valid Anki package (.apkg) file.");
  }
  const report = (stage: ImportStage, message: string, current: number, total: number) =>
    onProgress?.({ stage, message, current, total });

  /* ------------------------------ 1. Unzip ------------------------------ */
  report("unzipping", "Reading package…", 0, 1);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be opened — it may not be a valid .apkg archive.");
  }
  report("unzipping", "Package opened.", 1, 1);

  /* --------------------------- 2. Load SQLite ---------------------------- */
  const dbFile =
    zip.file("collection.anki21") ??
    zip.file("collection.anki21b") ??
    zip.file("collection.anki2");
  if (!dbFile) {
    throw new Error(
      "No Anki collection database found inside the package — the file may be corrupt."
    );
  }

  report("database", "Starting SQLite engine…", 0, 1);
  let sqlDb: Database;
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    sqlDb = new SQL.Database(await dbFile.async("uint8array"));
  } catch (err) {
    console.error("sql.js init failed:", err);
    throw new Error("Failed to read the collection database — the file may be corrupt.");
  }
  report("database", "Database loaded.", 1, 1);

  try {
    /* ------------------------ 3. Parse metadata -------------------------- */
    const colRow = execFirst(sqlDb, "SELECT decks, models FROM col");
    if (!colRow) throw new Error("The collection database is empty or corrupt.");

    const deckNames = parseJsonSafe<Record<string, { name: string }>>(
      String(colRow.decks ?? "{}"),
      {}
    );
    const models = parseJsonSafe<Record<string, AnkiModel>>(
      String(colRow.models ?? "{}"),
      {}
    );

    // Note id -> deck id (the notes table has no deck; the cards table does)
    const noteDeck = new Map<string, string>();
    for (const cardRow of execAll(sqlDb, "SELECT nid, did FROM cards")) {
      noteDeck.set(String(cardRow.nid), String(cardRow.did));
    }

    // Media extraction runs before parsing so converted fields are final
    const mediaMap = await buildMediaMap(zip, (cur, tot) =>
      report("media", `Extracting media ${cur} of ${tot}…`, cur, tot)
    );

    /* --------------------------- 4. Parse notes -------------------------- */
    const noteRows = execAll(sqlDb, "SELECT id, mid, flds FROM notes ORDER BY id");
    const total = noteRows.length;
    if (total === 0) throw new Error("No cards were found in this package.");

    const decks = new Map<string, AnkiDeckData>();
    let processed = 0;

    for (const row of noteRows) {
      const model = models[String(row.mid)];
      const deckId = noteDeck.get(String(row.id)) ?? String(model?.did ?? "1");
      const deckName = deckNames[deckId]?.name?.trim() || "Imported deck";
      if (!decks.has(deckName)) decks.set(deckName, { name: deckName, cards: [] });
      const target = decks.get(deckName)!;

      const fields = String(row.flds ?? "").split("\x1f");
      const isCloze = model?.type === 1;

      const converted = fields.map((field) =>
        ankiFieldToMarkdown(field, { isCloze, mediaMap })
      );

      let front: string;
      let back: string;
      if (isCloze) {
        const body = converted.filter(Boolean).join("\n\n");
        // Front blanks the answers; back reveals them
        front = clozeBlanked(body);
        back = clozeRevealed(body);
      } else {
        front = converted[0] ?? "";
        back = converted.slice(1).filter(Boolean).join("\n\n");
      }
      front = front.trim();
      back = back.trim();

      if (front || back) {
        target.cards.push({ front, back });
      }

      processed++;
      if (processed % 25 === 0 || processed === total) {
        report("parsing", `Parsing ${processed} of ${total} cards…`, processed, total);
        // Yield to the event loop so the UI can repaint
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const resultDecks = [...decks.values()].filter((d) => d.cards.length > 0);
    const totalCards = resultDecks.reduce((sum, d) => sum + d.cards.length, 0);
    if (totalCards === 0) throw new Error("No usable cards were found in this package.");

    return { decks: resultDecks, totalCards };
  } finally {
    sqlDb.close();
  }
}

/**
 * Parse + persist to the local Dexie database in one go.
 * Returns the ids of newly created decks.
 */
export async function importAnkiToDb(
  file: File,
  onProgress?: ProgressCallback
): Promise<{ deckIds: number[]; totalCards: number }> {
  const parsed = await parseAnkiFile(file, onProgress);

  onProgress?.({
    stage: "saving",
    message: `Saving ${parsed.totalCards} cards…`,
    current: 0,
    total: parsed.totalCards,
  });

  const now = new Date();
  const deckIds: number[] = [];
  let saved = 0;

  for (const deckData of parsed.decks) {
    const deckId = await db.decks.add({
      name: deckData.name,
      description: "Imported from Anki",
      cardCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.cards.bulkAdd(
      deckData.cards.map((c) => ({
        deckId,
        front: c.front,
        back: c.back,
        createdAt: now,
        interval: 0,
        repetitions: 0,
        easeFactor: 2.5,
        dueDate: now,
      }))
    );
    await db.decks.update(deckId, { cardCount: deckData.cards.length });
    deckIds.push(deckId);

    saved += deckData.cards.length;
    onProgress?.({
      stage: "saving",
      message: `Saving cards… ${saved} of ${parsed.totalCards}`,
      current: saved,
      total: parsed.totalCards,
    });
  }

  return { deckIds, totalCards: parsed.totalCards };
}

/* --------------------------- HTML -> markdown ----------------------------- */

interface FieldConversionCtx {
  isCloze: boolean;
  /** media filename -> data URL */
  mediaMap: Map<string, string>;
}

const CLOZE_MARK = "\u0000C";

/**
 * Convert one Anki note field to FlashStack markdown.
 * Keeps **bold**, *italic*, `code` and images; strips all other HTML.
 * Cloze spans are preserved as {{cloze::answer}} markers for the caller to
 * render per-face via clozeBlanked / clozeRevealed.
 */
export function ankiFieldToMarkdown(html: string, ctx: FieldConversionCtx): string {
  let text = html;

  // Remove Anki sound references: [sound:foo.mp3]
  text = text.replace(/\[sound:[^\]]*\]/gi, "");

  // Cloze spans -> neutral markers (before tag stripping could break them)
  if (ctx.isCloze) {
    text = text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::[^{}]*)?\}\}/gi, (_m, _n, body: string) =>
      `${CLOZE_MARK}${body}\u0000E`
    );
  }

  // Images: <img src="x.png"> -> markdown image with inlined data URL
  text = text.replace(
    /<img\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (tag, src: string) => {
      const alt = tag.match(/alt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
      const dataUrl =
        ctx.mediaMap.get(src) ?? ctx.mediaMap.get(decodeURIComponent(src)) ?? "";
      return `![${alt}](${dataUrl})`;
    }
  );

  // Basic formatting
  text = text
    .replace(/<(b|strong)\b[^>]*>/gi, "**")
    .replace(/<\/(b|strong)>/gi, "**")
    .replace(/<(i|em)\b[^>]*>/gi, "*")
    .replace(/<\/(i|em)>/gi, "*")
    .replace(/<code\b[^>]*>/gi, "`")
    .replace(/<\/code>/gi, "`")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(div|p|h[1-6]|tr)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<hr\s*\/?\s*>/gi, "\n---\n");

  // Strip every remaining tag
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      safeFromCodePoint(parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_m, code: string) => safeFromCodePoint(Number(code)));

  // Tidy whitespace (keep intentional newlines; collapse 3+ blank lines)
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Cloze markers back to {{cloze::…}} form
  if (ctx.isCloze) {
    text = text
      .split(CLOZE_MARK)
      .join("{{cloze::")
      .split("\u0000E")
      .join("}}");
  }

  return text;
}

/** Front face for cloze notes: answers hidden as `[...]`. */
export function clozeBlanked(markdown: string): string {
  return markdown.replace(/\{\{cloze::([\s\S]*?)\}\}/g, "[...]");
}

/** Back face for cloze notes: answers revealed in bold. */
export function clozeRevealed(markdown: string): string {
  return markdown.replace(/\{\{cloze::([\s\S]*?)\}\}/g, (_m, body: string) => `**${body.trim()}**`);
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/* ------------------------------- Media map -------------------------------- */

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/**
 * Build a map of media reference -> data URL.
 * Old .apkg format: files are named "0", "1", … plus a `media` JSON manifest
 * mapping index -> real filename. Newer exports store real filenames directly.
 */
async function buildMediaMap(
  zip: JSZip,
  onProgress?: (current: number, total: number) => void | Promise<void>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const idxToName = new Map<string, string>(); // zip entry name ("0") -> real filename

  const manifestFile = zip.file("media");
  if (manifestFile) {
    const manifest = parseJsonSafe<Record<string, string>>(
      await manifestFile.async("string"),
      {}
    );
    for (const [idx, filename] of Object.entries(manifest)) {
      idxToName.set(idx, filename);
    }
  }

  // Only image extensions are inlined for MVP; audio/video refs are dropped.
  // Old-format entries are named "0", "1", … with no extension — resolve the
  // real filename (and thus the extension) via the manifest.
  const entries = Object.keys(zip.files).filter((name) => {
    if (name === "media" || name.startsWith("collection.")) return false;
    const realName = idxToName.get(name) ?? name;
    const ext = realName.split(".").pop()?.toLowerCase() ?? "";
    return ext in MIME_BY_EXT;
  });

  let current = 0;
  for (const entryName of entries) {
    const file = zip.file(entryName);
    if (!file) continue;
    const realName = idxToName.get(entryName) ?? entryName;
    const ext = realName.split(".").pop()?.toLowerCase() ?? "";
    const dataUrl = `data:${MIME_BY_EXT[ext]};base64,${await file.async("base64")}`;

    // Register under the zip entry name, the manifest's real filename and its
    // bare basename so `<img src="…">` of any of those shapes resolves.
    map.set(entryName, dataUrl);
    if (idxToName.has(entryName)) {
      map.set(realName, dataUrl);
      map.set(realName.split("/").pop() ?? realName, dataUrl);
    }

    current++;
    if (current % 10 === 0 || current === entries.length) {
      await onProgress?.(current, entries.length);
    }
  }

  return map;
}

/* -------------------------------- sql.js ---------------------------------- */

function execAll(sqlDb: Database, query: string): Array<Record<string, SqlValue>> {
  const stmt = sqlDb.prepare(query);
  const rows: Array<Record<string, SqlValue>> = [];
  try {
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Record<string, SqlValue>);
    }
  } finally {
    stmt.free();
  }
  return rows;
}

function execFirst(sqlDb: Database, query: string): Record<string, SqlValue> | null {
  return execAll(sqlDb, query)[0] ?? null;
}

/* --------------------------------- utils ---------------------------------- */

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}


interface AnkiModel {
  name?: string;
  /** 0 = standard note, 1 = cloze */
  type?: number;
  flds?: Array<{ name: string }>;
  tmpls?: Array<{ name: string; qfmt?: string; afmt?: string }>;
  /** Default deck id for this note type */
  did?: number;
}

