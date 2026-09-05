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
    await db.cards.bulkAdd(
      parsed.map((c) => ({
        deckId: selectedDeckId,
        front: c.front,
        back: c.back,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        dueDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    setBulk("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <DeckList
        decks={decks ?? []}
        selectedDeckId={selectedDeckId}
        onSelect={setSelectedDeckId}
      />
      {selectedDeck && (
        <CardEditor deck={selectedDeck} count={cards?.length ?? 0} />
      )}
    </div>
  );
}
