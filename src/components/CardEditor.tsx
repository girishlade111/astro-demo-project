import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Papa from "papaparse";
import { db, createCard, deleteCard, updateCard, type Card } from "@/lib/db";
import { Markdown } from "@/lib/markdown";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
const taCls =
  "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 dark:border-slate-700";

export default function CardEditor({ deckId }: { deckId: number }) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const cards = useLiveQuery(
    () => db.cards.where("deckId").equals(deckId).toArray(),
    [deckId]
  );

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  function startEdit(card: Card) {
    setEditingId(card.id!);
    setFront(card.front);
    setBack(card.back);
  }

  function cancelEdit() {
    setEditingId(null);
    setFront("");
    setBack("");
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    if (editingId !== null) {
      await updateCard(editingId, { front: front.trim(), back: back.trim() });
    } else {
      await createCard(deckId, front.trim(), back.trim());
    }
    cancelEdit();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h2 className="mb-4 text-xl font-bold">
        {deck ? deck.name : "…"}{" "}
        <span className="text-sm font-normal text-slate-500">({cards?.length ?? 0} cards)</span>
      </h2>

      <CardForm
        mode={editingId !== null ? "edit" : "add"}
        front={front}
        back={back}
        onFrontChange={setFront}
        onBackChange={setBack}
        onSubmit={submitCard}
        onCancel={cancelEdit}
        onOpenBulk={() => setBulkOpen(true)}
      />

      {cards && cards.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onEdit={() => startEdit(card)}
              onDelete={() => deleteCard(card.id!)}
            />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          No cards in this deck yet — add one above or bulk import CSV.
        </p>
      )}

      {bulkOpen && <BulkImportModal deckId={deckId} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function CardForm({
  mode,
  front,
  back,
  onFrontChange,
  onBackChange,
  onSubmit,
  onCancel,
  onOpenBulk,
}: {
  mode: "add" | "edit";
  front: string;
  back: string;
  onFrontChange: (v: string) => void;
  onBackChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onOpenBulk: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{mode === "edit" ? "Edit card" : "Add card"}</h3>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-1 text-slate-500">
            <input
              type="checkbox"
              checked={previewOpen}
              onChange={(e) => setPreviewOpen(e.target.checked)}
              className="accent-indigo-600"
            />
            Preview
          </label>
          <button type="button" onClick={onOpenBulk} className="text-indigo-600 hover:underline dark:text-indigo-400">
            Bulk import (CSV)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <textarea
          value={front}
          onChange={(e) => onFrontChange(e.target.value)}
          rows={2}
          placeholder="Front — supports **bold**, *italic*, `code`, ![alt](image URL)"
          className={taCls}
        />
        <textarea
          value={back}
          onChange={(e) => onBackChange(e.target.value)}
          rows={2}
          placeholder="Back — markdown supported"
          className={taCls}
        />
      </div>

      {previewOpen && (front.trim() || back.trim()) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Front</p>
            <Markdown text={front} />
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Back</p>
            <Markdown text={back} />
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="submit" className={btnPrimary} disabled={!front.trim() || !back.trim()}>
          {mode === "edit" ? "Save changes" : "Add card"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CardItem({ card, onEdit, onDelete }: { card: Card; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Front</p>
          <Markdown text={card.front} className="text-sm" />
        </div>
        <div className="border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0 dark:border-slate-800">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Back</p>
          <Markdown text={card.back} className="text-sm" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
        <span className="text-xs text-slate-400">
          {card.repetitions > 0
            ? `interval ${card.interval}d · EF ${card.easeFactor.toFixed(2)}`
            : "new"}
        </span>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Edit card">
            ✏️
          </button>
          <button onClick={onDelete} className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Delete card">
            🗑️
          </button>
        </div>
      </div>
    </li>
  );
}

function BulkImportModal({ deckId, onClose }: { deckId: number; onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function parseAndImport() {
    const parsed = Papa.parse<{ front: string; back: string }>(csv.trim(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    const rows = parsed.data.filter((row) => row.front?.trim() && row.back?.trim());
    if (rows.length === 0) {
      setStatus("No valid rows found. Expected CSV with front,back columns.");
      return;
    }
    setStatus(`Imported ${rows.length} card${rows.length === 1 ? "" : "s"}.`);
    importRows(deckId, rows).then(onClose);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCsv(await file.text());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold">Bulk import (CSV)</h3>
        <p className="mb-3 text-xs text-slate-500">
          First row must be a header: <code className="font-mono">front,back</code>. Quoted fields
          with commas are supported, or load a .csv file.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="mb-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
        />
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={'front,back\n"Paris, France",Capital of France'}
          className={taCls}
        />
        {status && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{status}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            Close
          </button>
          <button onClick={parseAndImport} disabled={!csv.trim()} className={btnPrimary}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

async function importRows(deckId: number, rows: Array<{ front: string; back: string }>) {
  for (const row of rows) {
    await createCard(deckId, row.front.trim(), row.back.trim());
  }
}

