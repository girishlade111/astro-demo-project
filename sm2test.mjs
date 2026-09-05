// src/lib/sm2.ts
var MIN_EASE_FACTOR = 1.3;
var DEFAULT_EASE_FACTOR = 2.5;
function updateEaseFactor(easeFactor, quality) {
  const newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASE_FACTOR, newEF);
}
function calculateNextReview(card, quality, now = /* @__PURE__ */ new Date()) {
  const easeFactor = updateEaseFactor(card.easeFactor, quality);
  let interval;
  let repetitions;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions = card.repetitions + 1;
    if (card.repetitions === 0) {
      interval = 1;
    } else if (card.repetitions === 1) {
      interval = 6;
    } else {
      interval = card.interval * easeFactor;
    }
  }
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + interval);
  return { interval, repetitions, easeFactor, dueDate };
}

// src/lib/sm2.smoke-test.ts
var NOW = /* @__PURE__ */ new Date("2026-01-01T12:00:00.000Z");
var passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  passed++;
}
function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}
var r = calculateNextReview({ interval: 0, repetitions: 0, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 1, `new q=4 interval expected 1, got ${r.interval}`);
assert(r.repetitions === 1, `new q=4 reps expected 1, got ${r.repetitions}`);
assert(r.easeFactor === 2.5, `new q=4 EF expected 2.5, got ${r.easeFactor}`);
assert(daysBetween(NOW, r.dueDate) === 1, "new q=4 dueDate should be +1 day");
r = calculateNextReview({ interval: 1, repetitions: 1, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 6, `reps1 q=4 interval expected 6, got ${r.interval}`);
assert(r.repetitions === 2, `reps1 q=4 reps expected 2, got ${r.repetitions}`);
r = calculateNextReview({ interval: 6, repetitions: 2, easeFactor: 2.5 }, 4, NOW);
assert(r.interval === 15, `mature q=4 interval expected 15, got ${r.interval}`);
assert(r.easeFactor === 2.5, "mature q=4 EF unchanged");
r = calculateNextReview({ interval: 10, repetitions: 5, easeFactor: 2.5 }, 5, NOW);
assert(r.easeFactor === 2.6, `q=5 EF expected 2.6, got ${r.easeFactor}`);
assert(r.interval === 26, `q=5 interval expected 26, got ${r.interval}`);
assert(daysBetween(NOW, r.dueDate) === 26, "q=5 dueDate +26 days");
r = calculateNextReview({ interval: 10, repetitions: 5, easeFactor: 2.5 }, 2, NOW);
assert(r.repetitions === 0, `lapse reps expected 0, got ${r.repetitions}`);
assert(r.interval === 1, `lapse interval expected 1, got ${r.interval}`);
assert(r.easeFactor < 2.5, "lapse should lower EF");
var state = { interval: 1, repetitions: 3, easeFactor: 2.5 };
for (let i = 0; i < 10; i++) state = calculateNextReview(state, 0, NOW);
assert(state.easeFactor === MIN_EASE_FACTOR, `EF floor expected 1.3, got ${state.easeFactor}`);
assert(updateEaseFactor(2.5, 4) === 2.5, "q=4 EF unchanged");
assert(updateEaseFactor(2.5, 5) === 2.6, "q=5 EF +0.1");
assert(updateEaseFactor(2.5, 3) === 2.36, `q=3 EF expected 2.36, got ${updateEaseFactor(2.5, 3)}`);
var input = { interval: 10, repetitions: 2, easeFactor: 2.5 };
var snapshot = { ...input };
calculateNextReview(input, 5, NOW);
assert(
  input.interval === snapshot.interval && input.repetitions === snapshot.repetitions && input.easeFactor === snapshot.easeFactor,
  "input card must not be mutated"
);
assert(DEFAULT_EASE_FACTOR === 2.5, "default EF 2.5");
console.log(`All ${passed} SM-2 assertions passed \u2705`);
