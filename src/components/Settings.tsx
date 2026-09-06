import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Deck, type Card } from "@/lib/db";
import Exporter from "@/components/Exporter";

const btnPrimary = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
const btnGhost = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";
const dangerBtn = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700";

export default function Settings({ onClose }: { onClose?: () => void }) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<"all" | "reviews" | "decks">("all");
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const stats = useLiveQuery(async () => {
    const [deckCount, cardCount, reviewCount] = await Promise.all([
      db.decks.count(),
      db.cards.count(),
      db.reviewLogs.count(),
    ]);
    return { deckCount, cardCount, reviewCount };
  }, []);

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("flashstack.theme") as "light" | "dark" | "system" | null;
    if (stored) setTheme(stored);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  // Apply theme to document
  useEffect(() => {
    localStorage.setItem("flashstack.theme", theme);
    const root = document.documentElement;
    if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  async function handleClear() {
    setClearError(null);
    setClearing(true);
    try {
      if (clearType === "all") {
        await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
          await db.reviewLogs.clear();
          await db.cards.clear();
          await db.decks.clear();
        });
      } else if (clearType === "reviews") {
        await db.transaction("rw", db.cards, db.reviewLogs, async () => {
          await db.reviewLogs.clear();
          await db.cards.updateAll({ interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: new Date(), lastReviewed: undefined });
          await db.decks.updateAll({ updatedAt: new Date() });
        });
      } else if (clearType === "decks") {
        await db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
          await db.reviewLogs.clear();
          await db.cards.clear();
          await db.decks.clear();
        });
      }
      setShowClearConfirm(false);
      onClose?.();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Failed to clear data.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Theme section */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Appearance</h2>
        <p className="mb-4 text-sm text-slate-500">Choose your preferred color scheme.</p>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex flex-col items-center gap-2 rounded-lg p-4 border-2 transition ${
                  theme === t
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <span className="text-2xl">{t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"}</span>
                <span className="capitalize font-medium">{t}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Storage stats */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Storage</h2>
        <p className="mb-4 text-sm text-slate-500">Local IndexedDB usage.</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Decks" value={stats?.deckCount ?? 0} icon="📚" />
          <StatCard label="Cards" value={stats?.cardCount ?? 0} icon="🃏" />
          <StatCard label="Reviews" value={stats?.reviewCount ?? 0} icon="📊" />
        </div>
      </section>

      {/* Export/Import section */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Data</h2>
        <p className="mb-4 text-sm text-slate-500">Export to Anki, create backups, or restore from a backup file.</p>
        <Exporter onDone={onClose} />
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-red-600">Danger Zone</h2>
        <p className="mb-4 text-sm text-slate-500">Irreversible actions. Deleted data cannot be recovered.</p>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={clearType === "reviews"}
                  onChange={() => setClearType("reviews")}
                  className="accent-red-600"
                />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-300">Clear review history only</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Resets all cards to "new" state (interval 0, ease 2.5). Keeps decks and cards.
                  </p>
                </div>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={clearType === "decks"}
                  onChange={() => setClearType("decks")}
                  className="accent-red-600"
                />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-300">Clear all decks & cards</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Removes all decks and cards but keeps review history (orphaned).
                  </p>
                </div>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={clearType === "all"}
                  onChange={() => setClearType("all")}
                  className="accent-red-600"
                />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-300">Clear everything</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Nuclear option: deletes all decks, cards, and review history. Fresh start.
                  </p>
                </div>
              </label>
            </div>

            {showClearConfirm ? (
              <div className="pt-4 border-t border-red-200 dark:border-red-900">
                <p className="mb-3 text-sm text-red-700 dark:text-red-300">
                  Type <code className="rounded bg-red-100 px-1 dark:bg-red-900">DELETE</code> to confirm:
                </p>
                <input
                  type="text"
                  placeholder="DELETE"
                  onChange={(e) => e.target.value === "DELETE" && handleClear()}
                  className={inputCls + " max-w-xs mb-2"}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowClearConfirm(false)} className={btnGhost}>Cancel</button>
                  <button
                    onClick={handleClear}
                    disabled={clearing}
                    className={dangerBtn}
                  >
                    {clearing ? "Clearing…" : "Confirm Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                <span>🗑️</span>
                <span className="font-medium">Clear data…</span>
              </button>
            )}

            {clearError && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">{clearError}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-semibold">{label}</h3>
      </div>
      <p className="mt-2 text-3xl font-bold text-indigo-600 dark:text-indigo-400">{value.toLocaleString()}</p>
    </div>
  );
}