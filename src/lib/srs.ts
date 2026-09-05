/**
 * Compatibility wrapper around the canonical SM-2 implementation in `./sm2`.
 * Prefer importing from `./sm2` directly in new code.
 */
export { calculateNextReview, updateEaseFactor, type SM2Quality, type SM2CardState, type SM2Result } from "./sm2";

import { calculateNextReview, type SM2CardState, type SM2Result } from "./sm2";

/** @deprecated Use `calculateNextReview` from `./sm2` instead. Kept so existing imports keep working. */
export function schedule(
  state: SM2CardState,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  now: Date = new Date()
): SM2Result {
  return calculateNextReview(state, quality, now);
}
