import Dexie, { type Table } from "dexie";

/* ---------------------------------- Types --------------------------------- */

export interface Deck {
  id?: number;
  name: string;
  description?: string;
  /** Maintained by createCard / deleteCard / deleteDeck */
  cardCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Card {
  id?: number;
  deckId: number;
  front: string;
  back: string;
  createdAt: Date;
  /* --- SM-2 state --- */
  /** Current interval in days */
  interval: number;
  repetitions: number;
  /** Default 2.5 per SM-2 */
  easeFactor: number;
  /** Indexed — used for "cards due today" queries */
  dueDate: Date;
  lastReviewed?: Date;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  reviewedAt: Date;
  /** SM-2 quality rating, 0–5 */
  quality: number;
  /** Interval (days) before this review — for retention curves later */
  intervalBefore: number;
  /** Interval (days) after this review */
  intervalAfter: number;
}

/* ---------------------------------- Schema -------------------------------- */

export class FlashStackDB extends Dexie {
  decks!: Table<Deck, number>;
  cards!: Table<Card, number>;
  reviewLogs!: Table<ReviewLog, number>;

  constructor() {
    super("flashstack");
    this.version(1).stores({
      // "++id" = auto-increment primary key; other listed props are indexed
      decks: "++id, createdAt",
      cards: "++id, deckId, dueDate",
      reviewLogs: "++id, cardId, reviewedAt",
    });
  }
}

export const db = new FlashStackDB();

/* ------------------------------ Deck helpers ------------------------------ */

export async function createDeck(name: string, description?: string): Promise<number> {
  const now = new Date();
  return db.decks.add({ name, description, cardCount: 0, createdAt: now, updatedAt: now });
}

export async function deleteDeck(deckId: number): Promise<void> {
  await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
    const cardIds = await db.cards.where("deckId").equals(deckId).primaryKeys();
    await db.reviewLogs.where("cardId").anyOf(cardIds as number[]).delete();
    await db.cards.where("deckId").equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

export async function updateDeck(
  deckId: number,
  changes: Partial<Pick<Deck, "name" | "description">>
): Promise<void> {
  await db.decks.update(deckId, { ...changes, updatedAt: new Date() });
}

export async function getAllDecks(): Promise<Deck[]> {
  return db.decks.orderBy("createdAt").toArray();
}

/* ------------------------------ Card helpers ------------------------------ */

export async function createCard(deckId: number, front: string, back: string): Promise<number> {
  const now = new Date();
  return db.transaction("rw", db.cards, db.decks, async () => {
    const cardId = await db.cards.add({
      deckId,
      front,
      back,
      createdAt: now,
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      dueDate: now,
    });
    // bump denormalized cardCount
    await db.decks.where("id").equals(deckId).modify((deck: Deck) => {
      deck.cardCount += 1;
      deck.updatedAt = new Date();
    });
    return cardId;
  });
}

export async function updateCard(
  cardId: number,
  changes: Partial<Omit<Card, "id" | "deckId">>
): Promise<void> {
  await db.cards.update(cardId, changes);
}

export async function deleteCard(cardId: number): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card) return;
  await db.transaction("rw", db.cards, db.decks, db.reviewLogs, async () => {
    await db.reviewLogs.where("cardId").equals(cardId).delete();
    await db.cards.delete(cardId);
    await db.decks.where("id").equals(card.deckId).modify((deck: Deck) => {
      deck.cardCount = Math.max(0, deck.cardCount - 1);
      deck.updatedAt = new Date();
    });
  });
}

/** Cards whose dueDate is at or before the end of today, for the given deck. */
export async function getCardsDueToday(deckId: number): Promise<Card[]> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return db.cards
    .where("deckId")
    .equals(deckId)
    .and((card) => card.dueDate <= endOfToday)
    .sortBy("dueDate");
}

/* ----------------------------- Review helpers ----------------------------- */

/** Record a review and update the card's SM-2 state atomically. */
export async function logReview(
  cardId: number,
  quality: number,
  next: { interval: number; repetitions: number; easeFactor: number; dueDate: Date }
): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card) return;
  const now = new Date();
  await db.transaction("rw", db.cards, db.reviewLogs, async () => {
    await db.cards.update(cardId, {
      interval: next.interval,
      repetitions: next.repetitions,
      easeFactor: next.easeFactor,
      dueDate: next.dueDate,
      lastReviewed: now,
    });
    await db.reviewLogs.add({
      cardId,
      reviewedAt: now,
      quality,
      intervalBefore: card.interval,
      intervalAfter: next.interval,
    });
  });
}

/* ------------------------------ Text parsing ------------------------------ */

/** Parse pasted text into cards. "front :: back", TSV, or "front - back" per line. */
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
