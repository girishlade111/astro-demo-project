import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, addCard, createDeck, deleteDeck, parseCards, type Deck } from "@/lib/db";

export default function DeckEditor() {
  const [newDeckName, setNewDeckName] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const decks = useLiveQuery(() => db.decks.orderBy("createdAt").toArray(), []);
  const selectedDeck = decks?.find((d) => d.id === selectedDeckId) ?? null;
  const cards = useLiveQuery(
    () => (selectedDeckId ? db.cards.where("deckId").equals(selectedDeckId).toArray() : []),
    [selectedDeckId]
  );

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    const id = await createDeck(newDeckName.trim());
    setNewDeckName("");
    setSelectedDeckId(id);
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeckId || !front.trim() || !back.trim()) return;
    await addCard(selectedDeckId, front.trim(), back.trim());
    setFront("");
    setBack("");
  }

  async function handleBulkImport() {
    if (!selectedDeckId || !bulk.trim()) return;
    const parsed = parseCards(bulk);
    const now = new Date();
    await db.cards.bulkAdd(
      parsed.map((c) => ({
        deckId: selectedDeckId,
        front: c.front,
        back: c.back,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        dueDate: now,
        createdAt: now,
        updatedAt: now,
      }))
    );
    setBulk("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {/* Deck list / create */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-lg font-semibold">Decks</h2>
        <form onSubmit={handleCreateDeck} className="mb-4 flex gap-2">
          <input
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="New deck name…"
            className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create
          </button>
        </form>
        {decks && decks.length > 0 ? (
          <ul className="space-y-2">
            {decks.map((deck: Deck) => (
              <li
                key={deck.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  deck.id === selectedDeckId
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <button className="flex-1 text-left" onClick={() => setSelectedDeckId(deck.id!)}>
                  <span className="font-medium">{deck.name}</span>
                </button>
                <button
                  onClick={() => deleteDeck(deck.id!)}
                  className="ml-2 text-sm text-red-500 hover:text-red-700"
                  aria-label={`Delete ${deck.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No decks yet — create your first one above.</p>
        )}
      </section>

