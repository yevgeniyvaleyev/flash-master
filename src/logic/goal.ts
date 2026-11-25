import { atMinutes, formatMinutes } from './dates';
import type { CreditNote, DayRule } from './day-rules';

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
  /** Total amount of the whole topic (book pages, lecture minutes, cards in the deck); null = open-ended. */
  positionTotal: number | null;
  /** Book mode: the page reached. */
  positionCurrent: number | null;
  /** Count mode: units toward the total that aren't in the entries since the reset (done before, corrections). */
  doneBefore: number;
  /**
   * Daily deadline in minutes after midnight (900 = 15:00); null = none. The target counts only when reached by then,
   * and the day plan and alarms fit the topic's work before it.
   */
  deadlineMinutes: number | null;
  /** App opened from the topic screen (never blocked). */
  linkedPackage: string | null;
  /** Web address opened in the browser from the topic screen; null = none. */
  linkUrl: string | null;
  /** Hex color of the topic (plan of the day, bars). */
  color: string;
  /** MaterialCommunityIcons name shown in the topic's color instead of the dot; null = the dot. */
  icon: string | null;
  /** Days of the week the topic is active (bitmask Mon = 1 … Sun = 64); null = every day. */
  weekdays: number | null;
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
  /** The target was reached (by the deadline, when the topic has one). */
  targetMet: boolean;
  /** Today's deadline as a timestamp; null without one. */
  deadline: number | null;
  deadlineMinutes: number | null;
  /** The deadline has passed without the target: the topic's target (and the day) is failed. */
  deadlineMissed: boolean;
  /** Credit taken today, or debt being repaid today; null otherwise. */
  credit: CreditNote | null;
  /** A credit can be taken on this topic now. */
  creditable: boolean;
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

/**
 * One topic's progress today. With a deadline (`at`: its timestamp today), only `doneByDeadline` counts toward the
 * target; `now` tells whether the deadline has passed.
 */
export function topicProgress(
  topic: Topic,
  done: number,
  at: { deadline: number; doneByDeadline: number; now: number } | null = null,
): TopicProgress {
  const target = Math.max(0, topic.dailyTarget);
  const minimum = effectiveMin(topic);
  const minDone = Math.min(done, minimum);
  const targetMet = (at ? at.doneByDeadline : done) >= target;
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
    targetMet,
    deadline: at?.deadline ?? null,
    deadlineMinutes: at ? topic.deadlineMinutes : null,
    deadlineMissed: at != null && !targetMet && at.now >= at.deadline,
    credit: null,
    creditable: false,
  };
}

/** Units per topic in the given entries. */
export function unitsByTopic(entries: readonly Entry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) m.set(e.topicId, (m.get(e.topicId) ?? 0) + e.units);
  return m;
}

/** A topic's progress from the day's entries; `now` is a moment of that day (deadline timestamp, missed or not). */
export function topicProgressAt(topic: Topic, entries: readonly Entry[], now: number): TopicProgress {
  const own = entries.filter((e) => e.topicId === topic.id);
  const done = own.reduce((s, e) => s + e.units, 0);
  if (topic.deadlineMinutes == null) return topicProgress(topic, done);
  const deadline = atMinutes(now, topic.deadlineMinutes);
  const doneByDeadline = own.filter((e) => e.ts < deadline).reduce((s, e) => s + e.units, 0);
  return topicProgress(topic, done, { deadline, doneByDeadline, now });
}

/**
 * A topic as it applies on a day under its rule: that day's target (credit day: met with the minimum; repayment day:
 * raised by the debt), without the deadline on a credit day.
 */
export const topicForDay = (t: Topic, rule: DayRule | undefined): Topic =>
  rule ? { ...t, dailyTarget: rule.target, deadlineMinutes: rule.ignoreDeadline ? null : t.deadlineMinutes } : t;

/** In the day's norm: active, and on one of its weekdays (by the day's rules). */
export const activeToday = (t: Topic, rules?: ReadonlyMap<number, DayRule>) =>
  isActive(t) && rules?.get(t.id)?.active !== false;

/** The day's norm: active topics on their weekday, each with that day's target (`topicForDay`). */
export const topicsForDay = (topics: readonly Topic[], rules?: ReadonlyMap<number, DayRule>): Topic[] =>
  topics.filter((t) => activeToday(t, rules)).map((t) => topicForDay(t, rules?.get(t.id)));

/**
 * Today's progress over the active topics (in the given order); `now` is a moment of the entries' day. `rules`
 * (`dayRules` in day-rules.ts) leave out topics off that weekday and apply credits.
 */
export function dayProgress(
  topics: readonly Topic[],
  entries: readonly Entry[],
  now: number = Date.now(),
  rules?: ReadonlyMap<number, DayRule>,
): DayProgress {
  const list = topics
    .filter((t) => activeToday(t, rules))
    .map((t) => {
      const rule = rules?.get(t.id);
      const p = topicProgressAt(topicForDay(t, rule), entries, now);
      return rule ? { ...p, credit: rule.credit, creditable: rule.creditable } : p;
    });
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

/** «до 15:00» / «срок 15:00 пропущен» for a topic with a deadline and its target not met yet; null otherwise. */
export function deadlineLabel(
  p: Pick<TopicProgress, 'deadlineMinutes' | 'deadlineMissed' | 'targetMet'>,
): string | null {
  if (p.deadlineMinutes == null || p.targetMet) return null;
  const time = formatMinutes(p.deadlineMinutes);
  return p.deadlineMissed ? `срок ${time} пропущен` : `до ${time}`;
}

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
