import { calculateNextReview, updateEaseFactor, DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR } from "./sm2";

const NOW = new Date("2026-01-01T12:00:00.000Z");
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  passed++;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// 1. New card, quality 4: interval 1 day, reps 1, EF unchanged
let r = calculateNextReview({ interval: 0, repetitions: 0, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 1, `new q=4 interval expected 1, got ${r.interval}`);
assert(r.repetitions === 1, `new q=4 reps expected 1, got ${r.repetitions}`);
assert(r.easeFactor === 2.5, `new q=4 EF expected 2.5, got ${r.easeFactor}`);
assert(daysBetween(NOW, r.dueDate) === 1, "new q=4 dueDate should be +1 day");

// 2. First success then q=4 again: interval 6, reps 2
r = calculateNextReview({ interval: 1, repetitions: 1, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 6, `reps1 q=4 interval expected 6, got ${r.interval}`);
assert(r.repetitions === 2, `reps1 q=4 reps expected 2, got ${r.repetitions}`);

// 3. Mature card q=4: interval = prev * EF (6 * 2.5 = 15)
r = calculateNextReview({ interval: 6, repetitions: 2, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 15, `mature q=4 interval expected 15, got ${r.interval}`);
assert(r.easeFactor === 2.5, "mature q=4 EF unchanged");

// 4. Easy q=5 on interval 10 EF 2.5: EF 2.6, interval 26
r = calculateNextReview({ interval: 10, repetitions: 5, easeFactor: 2.5 }, 5, NOW);
assert(r.easeFactor === 2.6, `q=5 EF expected 2.6, got ${r.easeFactor}`);
assert(r.interval === 26, `q=5 interval expected 26, got ${r.interval}`);
assert(daysBetween(NOW, r.dueDate) === 26, "q=5 dueDate +26 days");

// 5. Lapse q=2: reps 0, interval 1, EF lowered
r = calculateNextReview({ interval: 10, repetitions: 5, easeFactor: 2.5 }, 2, NOW);
assert(r.repetitions === 0, `lapse reps expected 0, got ${r.repetitions}`);
assert(r.interval === 1, `lapse interval expected 1, got ${r.interval}`);
assert(r.easeFactor < 2.5, "lapse should lower EF");

// 6. EF floor at 1.3 after repeated lapses
let state = { interval: 1, repetitions: 3, easeFactor: 2.5 };
for (let i = 0; i < 10; i++) state = calculateNextReview(state, 0, NOW);
assert(state.easeFactor === MIN_EASE_FACTOR, `EF floor expected 1.3, got ${state.easeFactor}`);

// 7. updateEaseFactor math: q=3 lowers, q=4 unchanged, q=5 raises
assert(updateEaseFactor(2.5, 4) === 2.5, "q=4 EF unchanged");
assert(updateEaseFactor(2.5, 5) === 2.6, "q=5 EF +0.1");
assert(updateEaseFactor(2.5, 3) === 2.36, `q=3 EF expected 2.36, got ${updateEaseFactor(2.5, 3)}`);

// 8. Purity: input not mutated
const input = { interval: 10, repetitions: 2, easeFactor: 2.5 };
const snapshot = { ...input };
calculateNextReview(input, 5, NOW);
assert(
  input.interval === snapshot.interval && input.repetitions === snapshot.repetitions && input.easeFactor === snapshot.easeFactor,
  "input card must not be mutated"
);

// 9. DEFAULT_EASE_FACTOR sanity
assert(DEFAULT_EASE_FACTOR === 2.5, "default EF 2.5");

console.log(`All ${passed} SM-2 assertions passed ✅`);
