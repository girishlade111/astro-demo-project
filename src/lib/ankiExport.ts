/**
 * Anki .apkg exporter for FlashStack.
 *
 * Creates a compatible .apkg file using sql.js (SQLite WASM) and JSZip.
 * The generated package follows Anki 2.1+ format and can be imported into Anki.
 */
import JSZip from "jszip";
import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { db, type Deck, type Card } from "@/lib/db";

/* --------------------------------- Types ---------------------------------- */

export interface ExportProgress {
  stage: "preparing" | "database" | "media" | "packaging";
  message: string;
  current: number;
  total: number;
}

export type ProgressCallback = (progress: ExportProgress) => void | Promise<void>;

/* --------------------------- Anki schema constants ------------------------ */

const ANKI_SCHEMA_VERSION = 11; // Anki 2.1.49+ schema
const MODEL_ID = 1743490891; // Basic model id (fixed for consistency)
const MODEL_NAME = "FlashStack Basic";

/* ------------------------------- Entry point ------------------------------ */

/**
 * Export a deck to an .apkg file.
 * Returns a Blob ready for download.
 */
export async function exportDeckToApkg(
  deckId: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const report = (stage: ExportProgress["stage"], message: string, current: number, total: number) =>
    onProgress?.({ stage, message, current, total });

  /* ----------------------------- 1. Load data ----------------------------- */
  report("preparing", "Loading deck and cards…", 0, 1);
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error("Deck not found.");

  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  if (cards.length === 0) throw new Error("No cards to export.");

  /* -------------------------- 2. Initialize SQLite ------------------------ */
  report("database", "Initializing SQLite engine…", 0, 1);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqlDb = new SQL.Database();

  try {
    /* ------------------------ 3. Create Anki schema ----------------------- */
    createAnkiSchema(sqlDb);

    /* -------------------------- 4. Insert data ---------------------------- */
    const now = Math.floor(Date.now() / 1000);
    const deckIdAnki = now * 1000 + Math.floor(Math.random() * 1000); // ms timestamp as Anki deck id

    // Insert collection row
    const decksJson = JSON.stringify({
      [deckIdAnki]: {
        name: deck.name,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        dyn: 0,
        extendNew: 10,
        extendRev: 10,
        usn: -1,
        collapsed: false,
        browserCollapsed: false,
        newOrder: 0,
      },
    });

    const modelsJson = JSON.stringify({
      [MODEL_ID]: {
        id: MODEL_ID,
        name: MODEL_NAME,
        type: 0,
        mod: now,
        usn: -1,
        did: deckIdAnki,
        flds: [{ name: "Front" }, { name: "Back" }],
        tmpls: [
          {
            name: "Card 1",
            ord: 0,
            qfmt: "{{Front}}",
            afmt: '{{Front}}<hr id="answer">{{Back}}',
            bqfmt: "",
            bafmt: "",
          },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        latexPre: "",
        latexPost: "",
        req: [[0, "all", [0], []]],
      },
    });

    sqlDb.run(
      `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [now, now, ANKI_SCHEMA_VERSION, ANKI_SCHEMA_VERSION, 0, -1, now, "{}", modelsJson, decksJson, "{}", ""]
    );

    // Insert cards
    const noteIds: number[] = [];
    let usn = 0;

    report("database", `Inserting ${cards.length} cards…`, 0, cards.length);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const noteId = now * 1000000 + i; // unique note id
      noteIds.push(noteId);

      // Anki uses \x1f as field separator
      const front = escapeAnkiField(card.front);
      const back = escapeAnkiField(card.back);
      const fields = `${front}\x1f${back}`;

      // Insert note
      sqlDb.run(
        `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          generateGuid(),
          MODEL_ID,
          now,
          usn++,
          "",
          fields,
          front, // sort field
          0, // checksum (0 = not calculated)
          0,
          "",
        ]
      );

      // Insert card
      const easeFactor = Math.round(card.easeFactor * 1000); // Anki stores ease * 1000
      const due = Math.floor(card.dueDate.getTime() / 1000 / 86400) - Math.floor(now / 86400); // days from today
      const interval = card.interval;
      const factor = easeFactor;
      const reps = card.repetitions;

      sqlDb.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          now * 1000000 + i + 100000, // card id (different from note id)
          noteId,
          deckIdAnki,
          0, // ord (template index)
          now,
          usn++,
          0, // type: 0 = new, 1 = learning, 2 = review
          card.interval > 0 ? 2 : 0, // queue: 0 = new, 1 = learning, 2 = review
          due,
          interval,
          factor,
          reps,
          0, // lapses
          0, // left
          0, // odue
          0, // odid
          0, // flags
          "",
        ]
      );

      if (i % 25 === 0 || i === cards.length - 1) {
        report("database", `Inserting cards ${i + 1} of ${cards.length}…`, i + 1, cards.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    /* ---------------------------- 5. Media ------------------------------- */
    report("media", "Processing media…", 0, 1);
    // For MVP, we don't extract media from markdown; Anki will handle missing media gracefully.
    // The media file is required but can be empty.
    const mediaJson = JSON.stringify({});

    /* ---------------------------- 6. Package ------------------------------ */
    report("packaging", "Building .apkg archive…", 0, 1);

    const zip = new JSZip();
    zip.file("collection.anki21", new Uint8Array(sqlDb.export()));
    zip.file("media", mediaJson);

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    report("packaging", "Done.", 1, 1);

    return blob;
  } finally {
    sqlDb.close();
  }
}

/**
 * Export all decks to a single .apkg file.
 */
export async function exportAllDecksToApkg(
  onProgress?: ProgressCallback
): Promise<Blob> {
  const report = (stage: ExportProgress["stage"], message: string, current: number, total: number) =>
    onProgress?.({ stage, message, current, total });

  report("preparing", "Loading all decks and cards…", 0, 1);
  const decks = await db.decks.orderBy("createdAt").toArray();
  if (decks.length === 0) throw new Error("No decks to export.");

  const allCards: Array<{ deck: Deck; card: Card }> = [];
  for (const deck of decks) {
    const cards = await db.cards.where("deckId").equals(deck.id!).toArray();
    for (const card of cards) {
      allCards.push({ deck, card });
    }
  }

  if (allCards.length === 0) throw new Error("No cards to export.");

  report("database", "Initializing SQLite engine…", 0, 1);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqlDb = new SQL.Database();

  try {
    createAnkiSchema(sqlDb);

    const now = Math.floor(Date.now() / 1000);
    const deckIdMap = new Map<number, number>(); // FlashStack deck id -> Anki deck id
    let usn = 0;

    // Create a deck entry for each FlashStack deck
    const ankiDecks: Record<string, any> = {};
    for (const deck of decks) {
      const ankiDeckId = now * 1000 + Math.floor(Math.random() * 1000) + deck.id!;
      deckIdMap.set(deck.id!, ankiDeckId);
      ankiDecks[ankiDeckId] = {
        name: deck.name,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        dyn: 0,
        extendNew: 10,
        extendRev: 10,
        usn: -1,
        collapsed: false,
        browserCollapsed: false,
        newOrder: 0,
      };
    }

    const decksJson = JSON.stringify(ankiDecks);
    const modelsJson = JSON.stringify({
      [MODEL_ID]: {
        id: MODEL_ID,
        name: MODEL_NAME,
        type: 0,
        mod: now,
        usn: -1,
        did: deckIdMap.values().next().value ?? 1,
        flds: [{ name: "Front" }, { name: "Back" }],
        tmpls: [
          {
            name: "Card 1",
            ord: 0,
            qfmt: "{{Front}}",
            afmt: '{{Front}}<hr id="answer">{{Back}}',
            bqfmt: "",
            bafmt: "",
          },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        latexPre: "",
        latexPost: "",
        req: [[0, "all", [0], []]],
      },
    });

    sqlDb.run(
      `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [now, now, ANKI_SCHEMA_VERSION, ANKI_SCHEMA_VERSION, 0, -1, now, "{}", modelsJson, decksJson, "{}", ""]
    );

    report("database", `Inserting ${allCards.length} cards…`, 0, allCards.length);
    for (let i = 0; i < allCards.length; i++) {
      const { deck, card } = allCards[i];
      const ankiDeckId = deckIdMap.get(deck.id!)!;
      const noteId = now * 1000000 + i;

      const front = escapeAnkiField(card.front);
      const back = escapeAnkiField(card.back);
      const fields = `${front}\x1f${back}`;

      sqlDb.run(
        `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [noteId, generateGuid(), MODEL_ID, now, usn++, "", fields, front, 0, 0, ""]
      );

      const easeFactor = Math.round(card.easeFactor * 1000);
      const due = Math.floor(card.dueDate.getTime() / 1000 / 86400) - Math.floor(now / 86400);

      sqlDb.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          now * 1000000 + i + 100000,
          noteId,
          ankiDeckId,
          0,
          now,
          usn++,
          0,
          card.interval > 0 ? 2 : 0,
          due,
          card.interval,
          easeFactor,
          card.repetitions,
          0,
          0,
          0,
          0,
          0,
          "",
        ]
      );

      if (i % 25 === 0 || i === allCards.length - 1) {
        report("database", `Inserting cards ${i + 1} of ${allCards.length}…`, i + 1, allCards.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    report("packaging", "Building .apkg archive…", 0, 1);
    const zip = new JSZip();
    zip.file("collection.anki21", new Uint8Array(sqlDb.export()));
    zip.file("media", JSON.stringify({}));

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    report("packaging", "Done.", 1, 1);

    return blob;
  } finally {
    sqlDb.close();
  }
}

/**
 * Export full database as JSON for backup/restore.
 */
export async function exportFullDbToJson(): Promise<string> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    reviewLogs,
  };

  return JSON.stringify(backup, null, 2);
}

/**
 * Import full database from JSON backup.
 */
export async function importFullDbFromJson(json: string): Promise<{ decks: number; cards: number; logs: number }> {
  const backup = JSON.parse(json);

  if (!backup.version || !backup.decks || !backup.cards) {
    throw new Error("Invalid backup format.");
  }

  // Clear existing data
  await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
    await db.reviewLogs.clear();
    await db.cards.clear();
    await db.decks.clear();

    // Restore decks
    if (backup.decks.length > 0) {
      await db.decks.bulkAdd(backup.decks.map((d: any) => ({
        ...d,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
      })));
    }

    // Restore cards
    if (backup.cards.length > 0) {
      await db.cards.bulkAdd(backup.cards.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        dueDate: new Date(c.dueDate),
        lastReviewed: c.lastReviewed ? new Date(c.lastReviewed) : undefined,
      })));
    }

    // Restore review logs
    if (backup.reviewLogs?.length > 0) {
      await db.reviewLogs.bulkAdd(backup.reviewLogs.map((l: any) => ({
        ...l,
        reviewedAt: new Date(l.reviewedAt),
      })));
    }
  });

  return {
    decks: backup.decks.length,
    cards: backup.cards.length,
    logs: backup.reviewLogs?.length ?? 0,
  };
}

/* ------------------------------- Helpers ---------------------------------- */

function createAnkiSchema(sqlDb: Database): void {
  sqlDb.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer not null,
      mod integer not null,
      scm integer not null,
      ver integer not null,
      dty integer not null,
      usn integer not null,
      ls text not null,
      conf text not null,
      models text not null,
      decks text not null,
      dconf text not null,
      tags text not null
    );
  `);

  sqlDb.run(`
    CREATE TABLE notes (
      id integer primary key,
      guid text not null,
      mid integer not null,
      mod integer not null,
      usn integer not null,
      tags text not null,
      flds text not null,
      sfld text not null,
      csum integer not null,
      flags integer not null,
      data text not null
    );
  `);

  sqlDb.run(`
    CREATE TABLE cards (
      id integer primary key,
      nid integer not null,
      did integer not null,
      ord integer not null,
      mod integer not null,
      usn integer not null,
      type integer not null,
      queue integer not null,
      due integer not null,
      ivl integer not null,
      factor integer not null,
      reps integer not null,
      lapses integer not null,
      left integer not null,
      odue integer not null,
      odid integer not null,
      flags integer not null,
      data text not null
    );
  `);

  sqlDb.run(`
    CREATE TABLE revlog (
      id integer primary key,
      cid integer not null,
      usn integer not null,
      ease integer not null,
      ivl integer not null,
      lastivl integer not null,
      factor integer not null,
      time integer not null,
      type integer not null
    );
  `);

  // Indexes
  sqlDb.run(`CREATE INDEX ix_notes_usn ON notes (usn);`);
  sqlDb.run(`CREATE INDEX ix_cards_usn ON cards (usn);`);
  sqlDb.run(`CREATE INDEX ix_cards_nid ON cards (nid);`);
  sqlDb.run(`CREATE INDEX ix_cards_did ON cards (did);`);
  sqlDb.run(`CREATE INDEX ix_revlog_cid ON revlog (cid);`);
  sqlDb.run(`CREATE INDEX ix_revlog_usn ON revlog (usn);`);
}

function escapeAnkiField(text: string): string {
  // Anki fields are plain text with \x1f as separator.
  // We need to escape \x1f and newlines are allowed.
  return text.replace(/\x1f/g, " ").replace(/\x00/g, "");
}

function generateGuid(): string {
  // Anki uses 8-char base64-ish GUIDs
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let guid = "";
  for (let i = 0; i < 8; i++) {
    guid += chars[Math.floor(Math.random() * chars.length)];
  }
  return guid;
}

/* ------------------------------- Download --------------------------------- */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}