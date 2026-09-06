import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, createDeck, deleteDeck, updateDeck, type Deck } from "@/lib/db";
import CardEditor from "@/components/CardEditor";
import AnkiImporter from "@/components/AnkiImporter";
import AIGenerator from "@/components/AIGenerator";
import Settings from "@/components/Settings";
import Exporter from "@/components/Exporter";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
const btnGhost =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

export default function DeckManager() {
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  // All decks, live
  const decks = useLiveQuery(() => db.decks.orderBy("createdAt").toArray(), []);
  // Due-today counts per deckId, live
  const dueCounts = useLiveQuery(async () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const cards = await db.cards.toArray();
    const counts: Record<number, number> = {};
    for (const card of cards) {
      if (card.dueDate <= endOfToday) {
        counts[card.deckId] = (counts[card.deckId] ?? 0) + 1;
      }
    }
    return counts;
  }, []);

  if (selectedDeckId !== null) {
    return (
      <div>
        <button
          onClick={() => setSelectedDeckId(null)}
          className="mx-auto mt-4 flex max-w-3xl items-center gap-1 px-4 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← All decks
        </button>
        <CardEditor deckId={selectedDeckId} />
      </div>
    );
  }

  return (
    <DeckListView
      decks={decks ?? null}
      dueCounts={dueCounts ?? null}
      view={view}
      onViewChange={setView}
      onOpenDeck={setSelectedDeckId}
    />
  );
}


function DeckListView({
  decks,
  dueCounts,
  view,
  onViewChange,
  onOpenDeck,
}: {
  decks: Deck[] | null;
  dueCounts: Record<number, number> | null;
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
  onOpenDeck: (id: number) => void;
}) {
  const [newDeckName, setNewDeckName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Deck | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    await createDeck(newDeckName.trim());
    setNewDeckName("");
  }

  async function confirmDelete() {
    if (!pendingDelete?.id) return;
    await deleteDeck(pendingDelete.id);
    setPendingDelete(null);
  }

  async function submitRename() {
    if (renamingId && renameValue.trim()) {
      await updateDeck(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  }

  const actions = (deck: Deck) => ({
    onOpen: () => onOpenDeck(deck.id!),
    onRename: () => {
      setRenamingId(deck.id!);
      setRenameValue(deck.name);
    },
    onDelete: () => setPendingDelete(deck),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <form onSubmit={handleCreate} className="flex flex-1 gap-2">
          <input
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="New deck name…"
            className={inputCls}
          />
          <button type="submit" className={btnPrimary}>
            Create
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowImport(true)} className={btnGhost}>
            📦 Import Anki
          </button>
          <button onClick={() => setShowAI(true)} className={btnGhost}>
            ✨ AI Generate
          </button>
          <button onClick={() => setShowExport(true)} className={btnGhost}>
            📤 Export
          </button>
          <button onClick={() => setShowSettings(true)} className={btnGhost}>
            ⚙️ Settings
          </button>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              aria-label={`${v} view`}
              className={`px-3 py-2 text-sm ${
                view === v
                  ? "bg-indigo-600 text-white"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {v === "grid" ? "▦" : "☰"}
            </button>
          ))}
        </div>
      </div>

      {decks === null ? (
        <p className="py-12 text-center text-sm text-slate-500">Loading decks…</p>
      ) : decks.length === 0 ? (
        <p className="py-12 text-center text-slate-500">
          No decks yet — create your first one above.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} dueCount={dueCounts?.[deck.id!] ?? 0} {...actions(deck)} />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {decks.map((deck) => (
            <DeckRow key={deck.id} deck={deck} dueCount={dueCounts?.[deck.id!] ?? 0} {...actions(deck)} />
          ))}
        </ul>
      )}

      {renamingId !== null && (
        <Modal title="Rename deck" onClose={() => setRenamingId(null)}>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            className={inputCls}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRenamingId(null)} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={submitRename} className={btnPrimary}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="Delete deck?" onClose={() => setPendingDelete(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will permanently delete <strong>{pendingDelete.name}</strong> and
            all {pendingDelete.cardCount} of its cards, including review history.
            This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setPendingDelete(null)} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete deck
            </button>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal title="Import from Anki" onClose={() => setShowImport(false)}>
          <AnkiImporter onDone={() => setShowImport(false)} />
        </Modal>
      )}

      {showAI && (
        <Modal title="AI Flashcard Generator" wide onClose={() => setShowAI(false)}>
          <AIGenerator onDone={() => setShowAI(false)} />
        </Modal>
      )}

      {showExport && (
        <Modal title="Export Data" wide onClose={() => setShowExport(false)}>
          <Exporter onDone={() => setShowExport(false)} />
        </Modal>
      )}

      {showSettings && (
        <Modal title="Settings" wide onClose={() => setShowSettings(false)}>
          <Settings onClose={() => setShowSettings(false)} />
        </Modal>
      )}
    </div>
  );
}


interface DeckActions {
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function DueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
      {count} due
    </span>
  );
}

function DeckCard({ deck, dueCount, onOpen, onRename, onDelete }: { deck: Deck; dueCount: number } & DeckActions) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onOpen} className="text-left">
        <h3 className="font-semibold">{deck.name}</h3>
        {deck.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{deck.description}</p>
        )}
        <p className="mt-2 text-sm text-slate-500">{deck.cardCount} cards</p>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <DueBadge count={dueCount} />
        <div className="flex gap-1 text-sm">
          <button onClick={onRename} className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Rename ${deck.name}`}>
            ✏️
          </button>
          <button onClick={onDelete} className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Delete ${deck.name}`}>
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function DeckRow({ deck, dueCount, onOpen, onRename, onDelete }: { deck: Deck; dueCount: number } & DeckActions) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onOpen} className="flex flex-1 items-center gap-3 text-left">
        <span className="font-medium">{deck.name}</span>
        <span className="text-sm text-slate-500">{deck.cardCount} cards</span>
        <DueBadge count={dueCount} />
      </button>
      <button onClick={onRename} className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Rename ${deck.name}`}>
        ✏️
      </button>
      <button onClick={onDelete} className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Delete ${deck.name}`}>
        🗑️
      </button>
    </li>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
          wide ? "w-full max-w-3xl" : "w-full max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
