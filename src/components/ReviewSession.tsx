import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getCardsDueToday, logReview, type Card } from "@/lib/db";
import { calculateNextReview, type SM2Quality } from "@/lib/sm2";

/** Rating buttons mapped to SM-2 quality + keyboard shortcut. */
const RATINGS: Array<{
  label: string;
  quality: SM2Quality;
  key: string;
  className: string;
}> = [
  { label: "Again", quality: 0, key: "1", className: "bg-red-600 hover:bg-red-700" },
  { label: "Hard", quality: 2, key: "2", className: "bg-amber-500 hover:bg-amber-600" },
  { label: "Good", quality: 3, key: "3", className: "bg-emerald-600 hover:bg-emerald-700" },
  { label: "Easy", quality: 5, key: "4", className: "bg-sky-600 hover:bg-sky-700" },
];

interface SessionStats {
  reviewed: number;
  correct: number;
  streak: number;
  bestStreak: number;
}

export default function ReviewSession() {
  const [deckId, setDeckId] = useState<number | "all">("all");
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, correct: 0, streak: 0, bestStreak: 0 });
  const [sessionTotal, setSessionTotal] = useState<number | null>(null);

  const decks = useLiveQuery(() => db.decks.orderBy("createdAt").toArray(), []);

  // Cards due today: scoped to the selected deck, or across all decks
  const dueCards = useLiveQuery(async (): Promise<Card[]> => {
    if (deckId === "all") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const cards = await db.cards.where("dueDate").belowOrEqual(endOfToday).toArray();
      return cards.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    }
    return getCardsDueToday(deckId);
  }, [deckId]);

  // Snapshot the total due count once per deck-switch so the progress bar is stable
  useEffect(() => {
    if (dueCards !== undefined && sessionTotal === null) {
      setSessionTotal(dueCards.length);
    }
  }, [dueCards, sessionTotal]);

  function resetSession() {
    setRevealed(false);
    setStats({ reviewed: 0, correct: 0, streak: 0, bestStreak: 0 });
    setSessionTotal(null);
  }

  function switchDeck(next: number | "all") {
    setDeckId(next);
    resetSession();
  }

  async function answer(quality: SM2Quality) {
    if (!currentCard?.id) return;
    const next = calculateNextReview(currentCard, quality);
    await logReview(currentCard.id, quality, next);
    setRevealed(false);
    setStats((s) => {
      const correct = quality >= 3;
      const streak = correct ? s.streak + 1 : 0;
      return {
        reviewed: s.reviewed + 1,
        correct: s.correct + (correct ? 1 : 0),
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
      };
    });
  }

  // Keyboard shortcuts: Space = reveal, 1/2/3/4 = rate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (revealed) {
        const rating = RATINGS.find((r) => r.key === e.key);
        if (rating) answer(rating.quality);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const currentCard: Card | null | undefined =
    dueCards === undefined ? undefined : (dueCards[0] ?? null);
  const remaining = currentCard ? (dueCards?.length ?? 0) : 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <DeckSelector decks={decks ?? []} value={deckId} onChange={switchDeck} />
      <ReviewBody
        loading={dueCards === undefined}
        card={currentCard}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onAnswer={answer}
        remaining={remaining}
        total={sessionTotal ?? 0}
        stats={stats}
        onRestart={resetSession}
      />
    </div>
  );
}

function DeckSelector({
  decks,
  value,
  onChange,
}: {
  decks: Array<{ id?: number; name: string }>;
  value: number | "all";
  onChange: (v: number | "all") => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="review-deck" className="text-sm font-medium text-slate-500">
        Studying
      </label>
      <select
        id="review-deck"
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "all" ? "all" : Number(e.target.value))}
        className={inputCls + " max-w-56"}
      >
        <option value="all">All decks</option>
        {decks.map((deck) => (
          <option key={deck.id} value={String(deck.id)}>
            {deck.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReviewBody({
  loading,
  card,
  revealed,
  onReveal,
  onAnswer,
  remaining,
  total,
  stats,
  onRestart,
}: {
  loading: boolean;
  card: Card | null | undefined;
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (q: SM2Quality) => void;
  remaining: number;
  total: number;
  stats: SessionStats;
  onRestart: () => void;
}) {
  if (loading) {
    return <p className="py-16 text-center text-slate-500">Loading…</p>;
  }

  // Session complete
  if (card === null && stats.reviewed > 0) {
    return <CompleteScreen stats={stats} onRestart={onRestart} />;
  }

  // Nothing due
  if (card === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium">Nothing due right now ✅</p>
        <p className="mt-1 text-sm text-slate-500">
          Come back tomorrow, or add new cards to study immediately.
        </p>
      </div>
    );
  }

  const done = total - remaining;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      {/* Progress bar: X of Y remaining */}
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {done} of {total} reviewed
        </span>
        <span className="flex items-center gap-3">
          {stats.streak > 0 && <span>🔥 {stats.streak} streak</span>}
          <span>{remaining} remaining</span>
        </span>
      </div>
      <div
        className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Card */}
      <button
        onClick={onReveal}
        className="min-h-56 w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900"
      >
        <p className="text-xl font-medium">{card.front}</p>
        {revealed ? (
          <p className="mt-6 border-t border-slate-200 pt-6 text-lg text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {card.back}
          </p>
        ) : (
          <p className="mt-6 text-sm text-slate-400">Show Answer (Space)</p>
        )}
      </button>

      {/* Quality buttons after reveal */}
      {revealed ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map(({ label, quality, key, className }) => (
            <button
              key={quality}
              onClick={() => onAnswer(quality)}
              className={`rounded-lg px-3 py-3 text-sm font-medium text-white transition ${className}`}
            >
              {label} <span className="opacity-70">({key})</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={onReveal}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Show Answer
        </button>
      )}
    </div>
  );
}

function CompleteScreen({ stats, onRestart }: { stats: SessionStats; onRestart: () => void }) {
  const accuracy = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0;
  return (
    <div className="py-16 text-center">
      <p className="text-4xl">🎉</p>
      <h3 className="mt-3 text-2xl font-bold">Session complete!</h3>
      <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
        <StatCard value={String(stats.reviewed)} label="cards reviewed" />
        <StatCard value={`${accuracy}%`} label="accuracy" />
        <StatCard value={String(stats.bestStreak)} label="best streak" />
      </div>
      {stats.streak > 0 && (
        <p className="mt-3 text-sm text-slate-500">🔥 Current streak: {stats.streak}</p>
      )}
      <button
        onClick={onRestart}
        className="mt-6 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Study again
      </button>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

