import { addDays, dayKey } from './dates';

/**
 * Day key → whether that day's target was met (kept in `day_results`, written on every background sync).
 * null = a neutral day (nothing was active): it neither counts nor breaks a streak.
 */
export type DayResults = Record<string, boolean | null>;

/** How far back a streak is followed. */
const MAX_STREAK_DAYS = 3660;

/**
 * Consecutive met days ending today (or yesterday, while today isn't met yet). Neutral days are skipped; a day
 * without a result breaks the streak.
 */
export function computeStreak(results: DayResults, today: Date = new Date()): number {
  let cursor = results[dayKey(today)] === true ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < MAX_STREAK_DAYS; i++, cursor = addDays(cursor, -1)) {
    const r = results[dayKey(cursor)];
    if (r === null) continue;
    if (r !== true) break;
    streak++;
  }
  return streak;
}

/** Longest run of met days in an oldest-first series (null = neutral, skipped). */
export function bestStreak(series: readonly (boolean | null | undefined)[]): number {
  let best = 0;
  let run = 0;
  for (const r of series) {
    if (r === null) continue;
    run = r === true ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
