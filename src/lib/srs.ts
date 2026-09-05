/**
 * SM-2 spaced repetition algorithm.
 * Quality: 0–5 (0–2 = failed/lapse, 3 = hard, 4 = good, 5 = easy)
 */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SchedulerState {
  easeFactor: number;
  /** Interval in days */
  interval: number;
  repetitions: number;
}

export interface ScheduledCard extends SchedulerState {
  dueDate: Date;
}

export function schedule(
  state: SchedulerState,
  quality: Quality,
  now: Date = new Date()
): ScheduledCard {
  let { easeFactor, interval, repetitions } = state;

  if (quality < 3) {
    // Lapse: relearn
    repetitions = 0;
    interval = 0;
  } else {
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    repetitions += 1;

    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = quality === 3 ? 3 : quality === 5 ? 4 : 6;
    } else {
      interval = Math.round(interval * easeFactor);
      if (quality === 3) interval = Math.max(1, Math.round(interval * 0.6));
      if (quality === 5) interval = Math.round(interval * 1.3);
    }
  }

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + interval);
  if (quality < 3) dueDate.setMinutes(dueDate.getMinutes() + 10); // relearn in 10 min

  return { easeFactor, interval, repetitions, dueDate };
}
