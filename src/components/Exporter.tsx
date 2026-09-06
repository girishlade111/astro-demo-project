import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Deck } from "@/lib/db";
import {
  exportDeckToApkg,
  exportAllDecksToApkg,
  exportFullDbToJson,
  importFullDbFromJson,
  type ExportProgress,
  downloadBlob,
} from "@/lib/ankiExport";

const btnPrimary = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";
const inputCls = "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700";
const dangerBtn = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700";

export default function Exporter({ onDone }: { onDone?: () => void }) {
  const decks = useLiveQuery(() => db.decks.orderBy("createdAt").toArray(), []);
  const [exportTarget, setExportTarget] = useState<"deck" | "all" | "json">("deck");
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  async function handleExport() {
    setError(null);
    setSuccess(null);
    setBusy(true);
    setProgress({ stage: "preparing", message: "Starting…", current: 0, total: 1 });

    try {
      let blob: Blob;
      let filename: string;

      if (exportTarget === "json") {
        const json = await exportFullDbToJson();
        blob = new Blob([json], { type: "application/json" });
        filename = `flashstack-backup-${new Date().toISOString().split("T")[0]}.json`;
      } else if (exportTarget === "all") {
        blob = await exportAllDecksToApkg(setProgress);
        filename = `flashstack-all-decks-${new Date().toISOString().split("T")[0]}.apkg`;
      } else {
        if (!selectedDeckId) throw new Error("Please select a deck.");
        const deck = await db.decks.get(selectedDeckId);
        blob = await exportDeckToApkg(selectedDeckId, setProgress);
        filename = `${deck?.name ?? "deck"}-${new Date().toISOString().split("T")[0]}.apkg`;
      }

      downloadBlob(blob, filename);
      setSuccess(`Exported ${filename}`);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleImport() {
    if (!importFile) {
      setError("Please select a backup file.");
      return;
    }
    if (!importFile.name.endsWith(".json")) {
      setError("Please select a .json backup file.");
      return;
    }

    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const text = await importFile.text();
      const result = await importFullDbFromJson(text);
      setSuccess(`Imported ${result.decks} deck${result.decks !== 1 ? "s" : ""}, ${result.cards} card${result.cards !== 1 ? "s" : ""}, ${result.logs} review log${result.logs !== 1 ? "s" : ""}.`);
      setImportFile(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed. Check file format.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Export section */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Export Data</h2>
        <p className="mb-4 text-sm text-slate-500">
          Export your decks for use in Anki or create a full JSON backup for safekeeping.
        </p>

        <div className="space-y-4">
          {/* Export type selector */}
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exportTarget === "deck"}
                  onChange={() => setExportTarget("deck")}
                  className="accent-indigo-600"
                />
                Single deck → .apkg
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exportTarget === "all"}
                  onChange={() => setExportTarget("all")}
                  className="accent-indigo-600"
                />
                All decks → .apkg
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exportTarget === "json"}
                  onChange={() => setExportTarget("json")}
                  className="accent-indigo-600"
                />
                Full backup → .json
              </label>
            </div>

            {exportTarget === "deck" && decks && decks.length > 0 && (
              <select
                value={String(selectedDeckId ?? "")}
                onChange={(e) => setSelectedDeckId(e.target.value ? Number(e.target.value) : null)}
                className={inputCls + " mt-4"}
                disabled={busy}
              >
                <option value="">Choose a deck…</option>
                {decks.map((d) => (
                  <option key={d.id} value={String(d.id!)}>
                    {d.name} ({d.cardCount} cards)
                  </option>
                ))}
              </select>
            )}

            {exportTarget === "deck" && (!decks || decks.length === 0) && (
              <p className="mt-4 text-sm text-slate-500">No decks available.</p>
            )}
          </div>

          {/* Progress */}
          {busy && progress && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40" aria-live="polite">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{progress.message}</span>
                {progress.total > 1 && (
                  <span className="text-slate-500">{progress.current}/{progress.total}</span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{
                    width: progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={busy || (exportTarget === "deck" && !selectedDeckId)}
            className={btnPrimary + " w-full"}
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </section>

      {/* Divider */}
      <hr className="my-8 border-slate-200 dark:border-slate-800" />

      {/* Import section */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Import Full Backup</h2>
        <p className="mb-4 text-sm text-slate-500">
          Restore from a JSON backup created by FlashStack. This will replace all current data.
        </p>

        <div className="space-y-4">
          <input
            type="file"
            accept=".json"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="import-file"
            ref={(el) => { if (el) el.value = ""; }}
          />
          <label htmlFor="import-file" className={btnGhost + " w-full"}>
            Choose backup file (.json)
          </label>

          {importFile && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={busy || !importFile}
            className={btnPrimary + " w-full"}
          >
            {busy ? "Importing…" : "Import & Replace All Data"}
          </button>
        </div>
      </section>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>{success}</span>
          <button onClick={() => { setSuccess(null); onDone?.(); }} className={btnGhost}>Done</button>
        </div>
      )}
    </div>
  );
}