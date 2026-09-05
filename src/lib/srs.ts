/**
 * SM-2 spaced repetition algorithm.
 * Ratings: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
 */
export type Rating = 0 | 1 | 2 | 3;

export interface SchedulerState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface ScheduledCard extends SchedulerState {
  dueDate: Date;
}

export function schedule(
  state: SchedulerState,
  rating: Rating,
  now: Date = new Date()
): ScheduledCard {
  let { easeFactor, intervalDays, repetitions } = state;

  if (rating === 0) {
    repetitions = 0;
    intervalDays = 0; // relearn today
  } else {
    // Adjust ease factor per SM-2
    const q = rating === 1 ? 3 : rating === 2 ? 4 : 5;
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    repetitions += 1;

    if (repetitions === 1) {
      intervalDays = rating === 1 ? 1 : 1;
    } else if (repetitions === 2) {
      intervalDays = rating === 1 ? 3 : rating === 3 ? 4 : 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
      if (rating === 1) intervalDays = Math.max(1, Math.round(intervalDays * 0.6));
      if (rating === 3) intervalDays = Math.round(intervalDays * 1.3);
    }
  }

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + intervalDays);
  if (rating === 0) dueDate.setMinutes(dueDate.getMinutes() + 10); // review in 10 min

  return { easeFactor, intervalDays, repetitions, dueDate };
}
