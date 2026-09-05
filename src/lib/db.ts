import Dexie, { type Table } from "dexie";

export interface Deck {
  id?: number;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Card {
  id?: number;
  deckId: number;
  front: string;
  back: string;
  /** SM-2 state */
  easeFactor: number; // default 2.5
  intervalDays: number;
  repetitions: number;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  rating: 0 | 1 | 2 | 3; // again, hard, good, easy
  reviewedAt: Date;
}

export class FlashStackDB extends Dexie {
  decks!: Table<Deck, number>;
  cards!: Table<Card, number>;
  reviewLogs!: Table<ReviewLog, number>;

  constructor() {
    super("flashstack");
    this.version(1).stores({
      decks: "++id, name, createdAt",
      cards: "++id, deckId, dueDate",
      reviewLogs: "++id, cardId, reviewedAt",
    });
  }
}

export const db = new FlashStackDB();

export async function createDeck(name: string, description?: string): Promise<number> {
  const now = new Date();
  return db.decks.add({ name, description, createdAt: now, updatedAt: now });
}

export async function deleteDeck(deckId: number): Promise<void> {
  await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
    const cards = await db.cards.where("deckId").equals(deckId).toArray();
    const cardIds = cards.map((c) => c.id!);
    await db.reviewLogs.where("cardId").anyOf(cardIds).delete();
    await db.cards.where("deckId").equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

export async function addCard(deckId: number, front: string, back: string): Promise<number> {
  const now = new Date();
  return db.cards.add({
    deckId,
    front,
    back,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: now,
    createdAt: now,
    updatedAt: now,
  });
}

/** Parse pasted text into cards. Format: "front :: back" or "front - back" one per line, or TSV (front\tback). */
export function parseCards(raw: string): Array<{ front: string; back: string }> {
  const cards: Array<{ front: string; back: string }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match =
      trimmed.match(/^(.+?)\s*::\s*(.+)$/) ??
      trimmed.match(/^(.+?)\t(.+)$/) ??
      trimmed.match(/^(.+?)\s+-\s+(.+)$/);
    if (match) {
      cards.push({ front: match[1].trim(), back: match[2].trim() });
    }
  }
  return cards;
}
