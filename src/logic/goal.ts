/**
 * The daily norm. Every active (not paused, completed or archived) topic has a target and a minimum of units per day:
 * - the minimum is what unlocks entertainment apps: once every active topic reached it, everything unlocks;
 * - the target is what the day plan, reminders, alarms and the streak aim for.
 * The blocker only knows "tasks": goal = Σ minimums, done = Σ min(done, minimum).
 */

export type TopicMode = 'count' | 'position';

export interface Topic {
  id: number;
  name: string;
  /** Short unit label: «стр.», «карт.», «мин». */
  unit: string;
  dailyTarget: number;
  /** Units that unlock entertainment apps (≤ dailyTarget). */
  unlockMin: number;
  minutesPerUnit: number;
  /** Most entertainment minutes one unit of this topic can grant; null = the global setting. */
  maxGrantMinutes: number | null;
  /** Quick-add step besides +1 (e.g. +5 pages). */
  step: number;
  /** 'position': units are logged by entering the page reached. */
  mode: TopicMode;
  positionTotal: number | null;
  positionCurrent: number | null;
  /** App opened from the topic screen (never blocked). */
  linkedPackage: string | null;
  /** Hex color of the topic (plan of the day, bars). */
  color: string;
  paused: boolean;
  /** When the topic was marked as fully finished; null while it's in progress. */
  completedAt: number | null;
  /** Progress reset: statistics and the total count only from this moment; null = from the start. */
  resetAt: number | null;
  archived: boolean;
  sortOrder: number;
}

/** One logged entry. */
export interface Entry {
  id: number;
  topicId: number;
  day: string;
  ts: number;
  units: number;
  position: number | null;
}

export interface TopicProgress {
  topicId: number;
  name: string;
  unit: string;
  color: string;
  done: number;
  target: number;
  minimum: number;
  /** Units counted toward the unlock: min(done, minimum). */
  minDone: number;
  leftToMin: number;
  leftToTarget: number;
  minMet: boolean;
  targetMet: boolean;
}

export interface DayProgress {
  topics: TopicProgress[];
  minDone: number;
  minTotal: number;
  /** Units toward the targets, each topic capped at its target. */
  targetDone: number;
  targetTotal: number;
  /** Every active topic reached its minimum (also true without active topics). */
  unlocked: boolean;
  /** Every active topic reached its target (false without active topics: nothing to celebrate). */
  targetMet: boolean;
}

export const isActive = (t: Pick<Topic, 'paused' | 'archived' | 'completedAt'>) =>
  !t.paused && !t.archived && t.completedAt == null;

/** The minimum actually required: never above the target, at least 0. */
export const effectiveMin = (t: Pick<Topic, 'dailyTarget' | 'unlockMin'>) =>
  Math.max(0, Math.min(t.unlockMin, t.dailyTarget));

export function topicProgress(topic: Topic, done: number): TopicProgress {
  const target = Math.max(0, topic.dailyTarget);
  const minimum = effectiveMin(topic);
  const minDone = Math.min(done, minimum);
  return {
    topicId: topic.id,
    name: topic.name,
    unit: topic.unit,
    color: topic.color,
    done,
    target,
    minimum,
    minDone,
    leftToMin: minimum - minDone,
    leftToTarget: Math.max(0, target - done),
    minMet: done >= minimum,
    targetMet: done >= target,
  };
}

/** Units per topic in the given entries. */
export function unitsByTopic(entries: readonly Entry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) m.set(e.topicId, (m.get(e.topicId) ?? 0) + e.units);
  return m;
}

/** Today's progress over the active topics (in the given order). */
export function dayProgress(topics: readonly Topic[], entries: readonly Entry[]): DayProgress {
  const done = unitsByTopic(entries);
  const list = topics.filter(isActive).map((t) => topicProgress(t, done.get(t.id) ?? 0));
  const sum = (f: (p: TopicProgress) => number) => list.reduce((s, p) => s + f(p), 0);
  return {
    topics: list,
    minDone: sum((p) => p.minDone),
    minTotal: sum((p) => p.minimum),
    targetDone: sum((p) => Math.min(p.done, p.target)),
    targetTotal: sum((p) => p.target),
    unlocked: list.every((p) => p.minMet),
    targetMet: list.length > 0 && list.every((p) => p.targetMet),
  };
}

/**
 * Today's units that count toward the unlock, one event per unit in time order (an entry of 5 pages is 5 events at
 * its time), each with its topic's time cost. Units beyond a topic's minimum are left out: the budget only rewards
 * the way to the unlock.
 */
export function completionEvents(
  entries: readonly Entry[],
  topics: readonly Topic[],
): { ts: number; topicId: number; costMs: number }[] {
  const byId = new Map(topics.filter(isActive).map((t) => [t.id, t]));
  const counted = new Map<number, number>();
  const events: { ts: number; topicId: number; costMs: number }[] = [];
  for (const e of [...entries].sort((a, b) => a.ts - b.ts || a.id - b.id)) {
    const t = byId.get(e.topicId);
    if (!t) continue;
    const room = effectiveMin(t) - (counted.get(t.id) ?? 0);
    const n = Math.min(room, e.units);
    if (n <= 0) continue;
    counted.set(t.id, (counted.get(t.id) ?? 0) + n);
    for (let i = 0; i < n; i++) events.push({ ts: e.ts, topicId: t.id, costMs: unitCostMs(t) });
  }
  return events;
}

export const unitCostMs = (t: Pick<Topic, 'minutesPerUnit'>) => Math.round(Math.max(0, t.minutesPerUnit) * 60_000);

/** «12 стр.» */
export const unitsLabel = (n: number, unit: string) => `${n} ${unit}`;

/** «~24 мин» / «~1 ч 10 мин» for an amount of work. */
export function durationLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `~${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `~${h} ч` : `~${h} ч ${m} мин`;
}
