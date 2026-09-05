import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logReview } from "@/lib/db";
import { schedule, type SM2Quality } from "@/lib/srs";

// Map UI buttons to SM-2 quality: Again=0 (lapse), Hard=3, Good=4, Easy=5
const RATINGS: Array<{ label: string; quality: SM2Quality; className: string }> = [
  { label: "Again", quality: 0, className: "bg-red-600 hover:bg-red-700" },
  { label: "Hard", quality: 3, className: "bg-amber-500 hover:bg-amber-600" },
  { label: "Good", quality: 4, className: "bg-emerald-600 hover:bg-emerald-700" },
  { label: "Easy", quality: 5, className: "bg-sky-600 hover:bg-sky-700" },
];

export default function ReviewSession() {
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const dueCard = useLiveQuery(async () => {
    const now = new Date();
    const cards = await db.cards.where("dueDate").belowOrEqual(now).sortBy("dueDate");
    return cards[0] ?? null;
  }, []);

  async function answer(quality: SM2Quality) {
    if (!dueCard?.id) return;
    const next = schedule(dueCard, quality);
    await logReview(dueCard.id, quality, next);
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
          {RATINGS.map(({ label, quality, className }) => (
            <button
              key={quality}
              onClick={() => answer(quality)}
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
