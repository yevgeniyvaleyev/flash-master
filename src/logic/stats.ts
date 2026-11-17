import { lastDays } from './dates';
import { bestStreak, computeStreak, type DayResults } from './progress';

/** A topic's result on one day, with the target and minimum that applied then (`topic_days`). */
export interface TopicDay {
  day: string;
  topicId: number;
  target: number;
  minimum: number;
  done: number;
  paused: boolean;
}

export interface TopicStats {
  /** Units over the window. */
  windowTotal: number;
  /** Average units per day over the window's tracked days. */
  avgPerDay: number;
  /** Share (0–1) of tracked days on which the target was met; null without tracked days. */
  metRate: number | null;
  currentStreak: number;
  bestStreak: number;
}

/** Day key → target met (null on paused days), for one topic. */
export function topicResults(rows: readonly TopicDay[], topicId: number): DayResults {
  const out: DayResults = {};
  for (const r of rows) if (r.topicId === topicId) out[r.day] = r.paused ? null : r.done >= r.target;
  return out;
}

/** Keeps a topic's rows from `sinceDay` on (its progress reset day); all rows when null. */
export function rowsSince(rows: readonly TopicDay[], topicId: number, sinceDay: string | null): TopicDay[] {
  return rows.filter((r) => r.topicId === topicId && (sinceDay == null || r.day >= sinceDay));
}

/**
 * A topic's numbers over the last `windowDays` days (today included). Only days the app tracked the topic count
 * (from its first row on, or from `sinceDay`, its progress reset): a topic created yesterday isn't averaged over a
 * month.
 */
export function topicStats(
  rows: readonly TopicDay[],
  topicId: number,
  windowDays: number,
  today: Date = new Date(),
  sinceDay: string | null = null,
): TopicStats {
  const mine = rowsSince(rows, topicId, sinceDay);
  const byDay = new Map(mine.map((r) => [r.day, r]));
  const firstDay = mine.reduce<string | null>((min, r) => (min == null || r.day < min ? r.day : min), null);
  const window = lastDays(windowDays, today).filter((d) => firstDay != null && d >= firstDay);
  const tracked = window.filter((d) => byDay.get(d)?.paused !== true);
  const windowTotal = window.reduce((s, d) => s + (byDay.get(d)?.done ?? 0), 0);
  const met = tracked.filter((d) => {
    const r = byDay.get(d);
    return r != null && r.done >= r.target;
  }).length;

  const results = topicResults(mine, topicId);
  const allDays = firstDay ? lastDays(daysBetween(firstDay, today), today) : [];
  return {
    windowTotal,
    avgPerDay: tracked.length > 0 ? windowTotal / tracked.length : 0,
    metRate: tracked.length > 0 ? met / tracked.length : null,
    currentStreak: computeStreak(results, today),
    bestStreak: bestStreak(allDays.map((d) => results[d])),
  };
}

/** Days from `fromKey` to `today`, both included. */
function daysBetween(fromKey: string, today: Date): number {
  const [y, m, d] = fromKey.split('-').map(Number);
  const from = new Date(y, m - 1, d);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

/** How a past day went: every target met, every minimum met, or not. */
export type DayGrade = 'target' | 'minimum' | 'missed' | 'none';

export function dayGrade(r: { minMet: boolean; targetMet: boolean; targetTotal: number } | undefined): DayGrade {
  if (!r || r.targetTotal === 0) return 'none';
  if (r.targetMet) return 'target';
  if (r.minMet) return 'minimum';
  return 'missed';
}
