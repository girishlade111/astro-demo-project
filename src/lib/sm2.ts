/**
 * SM-2 spaced repetition algorithm — pure, side-effect free, unit-testable.
 *
 * Reference: Piotr Wozniak, "Optimization of learning" (1990), the algorithm
 * used by SuperMemo and popularized by Anki:
 * https://supermemo.gutenberg.edu/en/optimization-of-learning — see the SM-2
 * section ("Application of a computer to improve the results of learning").
 *
 * The algorithm schedules the next repetition of an item (a flashcard) based on
 * a self-assessed recall quality. It maintains three per-card state values:
 *
 * - `interval`     — days until the card should be shown again
 * - `repetitions`  — count of consecutive successful recalls (resets on lapse)
 * - `easeFactor`   — multiplier controlling interval growth; starts at 2.5 and
 *                    adapts to how easy the card is for the learner (min 1.3)
 */

/** Recall quality rating, as on SuperMemo's original 0–5 scale. */
export type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** The mutable scheduling state stored per card. */
export interface SM2CardState {
  /** Current interval between reviews, in days (0 for new/lapsed cards). */
  interval: number;
  /** Consecutive successful (quality >= 3) recalls. */
  repetitions: number;
  /** Easiness multiplier. Clamped to a minimum of 1.3; new cards start at 2.5. */
  easeFactor: number;
}

/** The new scheduling state returned by {@link calculateNextReview}. */
export interface SM2Result {
  /** New interval in days. */
  interval: number;
  /** New consecutive-success count. */
  repetitions: number;
  /** Updated easiness factor. */
  easeFactor: number;
  /** The date the card should next be shown (now + interval days). */
  dueDate: Date;
}

/** SM-2 minimum ease factor: below this, intervals barely grow. */
export const MIN_EASE_FACTOR = 1.3;

/** Default ease factor for new cards. */
export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Update the ease factor for a given quality using SM-2's linear formula:
 *
 *   EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 *
 * Intuition: quality 5 raises EF by +0.1 (card is easy → grow faster),
 * quality 4 leaves EF unchanged, and every step below 4 lowers EF by an
 * increasing amount (quality 0 costs -0.8... well, -0.8 max: EF + (-0.8)).
 * The result is clamped so EF never drops below {@link MIN_EASE_FACTOR},
 * preventing intervals from stalling entirely.
 *
 * @param easeFactor - the current ease factor
 * @param quality - the recall quality (0–5)
 * @returns the updated ease factor, always >= {@link MIN_EASE_FACTOR}
 */
export function updateEaseFactor(easeFactor: number, quality: number): number {
  const newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASE_FACTOR, newEF);
}

/**
 * Compute the next scheduling state for a card, per the standard SM-2 rules.
 *
 * Rules (in order of precedence):
 *
 * 1. **Lapse** (quality < 3): the card was not remembered. Reset
 *    `repetitions` to 0 and the new `interval` to 1 day — the card re-enters
 *    the learning pipeline as if nearly new. NOTE: the EF update still applies
 *    on lapses; a forgotten card becomes progressively "easier" (lower EF),
 *    so its future intervals grow more slowly.
 *
 * 2. **Success** (quality >= 3): the card was remembered.
 *    - `repetitions` was 0 (new or lapsed card): interval = 1 day
 *    - `repetitions` was 1 (first successful review after that): interval = 6 days
 *    - `repetitions` >= 2 (mature card): interval = previous interval × EF
 *    Then `repetitions` is incremented.
 *
 * 3. **Ease factor** is updated with {@link updateEaseFactor} in both the
 *    success and lapse cases.
 *
 * 4. **Due date**: today + new interval days. If the new interval is 0
 *    (only possible when callers pass a 0-interval card with quality >= 3,
 *    or by convention), the card is due immediately.
 *
 * This function is PURE: it never reads or writes storage, never touches the
 * clock (callers pass `now` via `calculateNextReview`'s options), and mutates
 * nothing — the input card is untouched and a fresh result object is returned.
 * That makes it trivially unit-testable and safe to run inside transactions.
 *
 * @param card - current scheduling state (interval, repetitions, easeFactor)
 * @param quality - recall quality from 0 (total blackout) to 5 (perfect)
 * @param now - reference date used to compute dueDate; defaults to `new Date()`
 * @returns a new {@link SM2Result} with updated state and dueDate
 *
 * @example
 * // New card answered "good" (4): 1 day, 1 rep, EF unchanged (2.5)
 * calculateNextReview({ interval: 0, repetitions: 0, easeFactor: 2.5 }, 4);
 * // => { interval: 1, repetitions: 1, easeFactor: 2.5, dueDate: <tomorrow> }
 *
 * @example
 * // Mature card (interval 10, EF 2.5) answered "easy" (5):
 * // EF' = 2.6, interval = 10 * 2.6 = 26 days
 * calculateNextReview({ interval: 10, repetitions: 5, easeFactor: 2.5 }, 5);
 * // => { interval: 26, repetitions: 6, easeFactor: 2.6, dueDate: <+26d> }
 */
export function calculateNextReview(
  card: SM2CardState,
  quality: SM2Quality,
  now: Date = new Date()
): SM2Result {
  // 1. Update ease factor (applies to both successes and lapses).
  const easeFactor = updateEaseFactor(card.easeFactor, quality);

  let interval: number;
  let repetitions: number;

  if (quality < 3) {
    // 2. Lapse: forget everything, restart the learning pipeline.
    repetitions = 0;
    interval = 1;
  } else {
    // 3. Success: grow the interval according to the repetition count.
    repetitions = card.repetitions + 1;
    if (card.repetitions === 0) {
      interval = 1;
    } else if (card.repetitions === 1) {
      interval = 6;
    } else {
      interval = card.interval * easeFactor;
    }
  }

  // 4. Compute the due date: today + interval days.
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + interval);

  return { interval, repetitions, easeFactor, dueDate };
}
