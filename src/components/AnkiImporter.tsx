import { useCallback, useRef, useState } from "react";
import { importAnkiToDb, type ImportProgress } from "@/lib/ankiImport";

const btnGhost =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

/**
 * Client-side Anki .apkg importer.
 * Dropzone + progress + error handling; decks land in the local Dexie db.
 */
export default function AnkiImporter({ onDone }: { onDone?: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runImport = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setSummary(null);
      setProgress({ stage: "unzipping", message: "Reading package…", current: 0, total: 1 });
      try {
        const { totalCards } = await importAnkiToDb(file, setProgress);
        setSummary(`Imported ${totalCards} card${totalCards === 1 ? "" : "s"} successfully! 🎉`);
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong during import.");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [onDone]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void runImport(file);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h2 className="mb-1 text-lg font-semibold">Import from Anki</h2>
      <p className="mb-4 text-sm text-slate-500">
        Select an <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">.apkg</code> export
        — everything is processed locally in your browser.
      </p>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click();
        }}
        aria-disabled={busy}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
            : "border-slate-300 hover:border-indigo-400 dark:border-slate-700"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".apkg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void runImport(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        <span className="mb-2 text-3xl">📦</span>
        <p className="font-medium">Drop your .apkg file here</p>
        <p className="mt-1 text-sm text-slate-500">or click to browse</p>
      </div>

      {/* Progress */}
      {busy && progress && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">{progress.message}</span>
            {progress.total > 1 && (
              <span className="text-slate-400">
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{
                width: `${
                  progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Success */}
      {summary && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>{summary}</span>
          <button onClick={onDone} className={btnGhost}>
            View decks
          </button>
        </div>
      )}
    </div>
  );
}
