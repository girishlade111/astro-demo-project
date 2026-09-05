import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { schedule, type Rating } from "@/lib/srs";

const RATINGS: Array<{ label: string; value: Rating; className: string }> = [
  { label: "Again", value: 0, className: "bg-red-600 hover:bg-red-700" },
  { label: "Hard", value: 1, className: "bg-amber-500 hover:bg-amber-600" },
  { label: "Good", value: 2, className: "bg-emerald-600 hover:bg-emerald-700" },
  { label: "Easy", value: 3, className: "bg-sky-600 hover:bg-sky-700" },
];

export default function ReviewSession() {
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const dueCard = useLiveQuery(async () => {
    const now = new Date();
    const cards = await db.cards.where("dueDate").belowOrEqual(now).sortBy("dueDate");
    return cards[0] ?? null;
  }, []);

  async function answer(rating: Rating) {
    if (!dueCard?.id) return;
    const { easeFactor, intervalDays, repetitions, dueDate } = schedule(dueCard, rating);
    await db.cards.update(dueCard.id, {
      easeFactor,
      intervalDays,
      repetitions,
      dueDate,
      updatedAt: new Date(),
    });
    await db.reviewLogs.add({ cardId: dueCard.id, rating, reviewedAt: new Date() });
    setRevealed(false);
  }

  if (done) {
    return <p className="py-16 text-center text-slate-500">All done for now! 🎉</p>;
  }

  if (dueCard === undefined) return <p className="py-16 text-center text-slate-500">Loading…</p>;

  if (dueCard === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium">Nothing due right now ✅</p>
        <p className="mt-1 text-sm text-slate-500">Come back later or review ahead next time.</p>
        <button
          onClick={() => setDone(false)}
          className="mt-4 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Study ahead
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <button
        onClick={() => setRevealed((r) => !r)}
        className="min-h-56 w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900"
      >
        <p className="text-xl font-medium">{dueCard.front}</p>
        {revealed && (
          <p className="mt-6 border-t border-slate-200 pt-6 text-lg text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {dueCard.back}
          </p>
        )}
        {!revealed && <p className="mt-6 text-sm text-slate-400">Tap card to reveal</p>}
      </button>

      {revealed && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map(({ label, value, className }) => (
            <button
              key={value}
              onClick={() => answer(value)}
              className={`rounded-lg px-3 py-3 text-sm font-medium text-white transition ${className}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
