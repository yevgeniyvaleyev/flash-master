import { calendarKey } from './dates';
import { effectiveMin, type Topic } from './goal';

/**
 * What a topic's norm is on one app day:
 * - weekdays: a topic is active only on its days of the week (`weekdays` bitmask, Mon = 1 … Sun = 64; null = every
 *   day); on other days it's out of the norm like a paused topic (neutral for the streak);
 * - credit: the unfinished part of today's target (never the minimum) moves to the topic's next 1–2 active days. The
 *   credit day counts as target met once the minimum is done; the repayment days get the debt added to their target.
 *   Debt is live: whatever is done on the credit day still lowers it. Day 1 doing more than its raised target lowers
 *   day 2's share. One open credit per topic: a new one only after the current one is repaid or its last day ended.
 */

export const EVERY_DAY = 127;
/** Short Russian weekday names, Monday first (bit i of the mask). */
export const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export interface Credit {
  id: number;
  topicId: number;
  /** App day the credit was taken. */
  day: string;
  /** Repayment days: 1 or 2. */
  days: number;
  /** That day's target and minimum. */
  target: number;
  minimum: number;
}

export type CreditNote =
  | { kind: 'taken'; creditId: number; debt: number; dueDays: string[] }
  | { kind: 'repay'; share: number; dayIndex: number; dueDays: string[]; debt: number };

export interface DayRule {
  /** The topic is in the norm this day (its weekday). Paused/completed topics are handled by `isActive`. */
  active: boolean;
  /** The target that applies this day. */
  target: number;
  /** Credit day: the deadline doesn't apply (the target is moved anyway). */
  ignoreDeadline: boolean;
  credit: CreditNote | null;
  /** A credit can be taken on this topic now (no open credit, unfinished target above the minimum). */
  creditable: boolean;
}

/** Units done per topic per day: `doneKey(topicId, day)`. */
export type DoneByDay = ReadonlyMap<string, number>;
export const doneKey = (topicId: number, day: string) => `${topicId}|${day}`;

/** A day key as a local Date (midnight). */
export const dayDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The calendar day after `day` (day keys are app days already). */
export function nextDay(day: string, n = 1): string {
  const d = dayDate(day);
  d.setDate(d.getDate() + n);
  return calendarKey(d);
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (day: string) => (dayDate(day).getDay() + 6) % 7;

export const weekdayMask = (t: Pick<Topic, 'weekdays'>) =>
  t.weekdays == null || t.weekdays <= 0 ? EVERY_DAY : t.weekdays;

export const activeOnDay = (t: Pick<Topic, 'weekdays'>, day: string) => (weekdayMask(t) & (1 << weekdayOf(day))) !== 0;

/** «Пн Ср Пт», or null when the topic is every day. */
export function weekdaysLabel(t: Pick<Topic, 'weekdays'>): string | null {
  const mask = weekdayMask(t);
  if (mask === EVERY_DAY) return null;
  return WEEKDAY_NAMES.filter((_, i) => mask & (1 << i)).join(' ');
}

/** The topic's next `n` active days after `day`. */
export function nextActiveDays(t: Pick<Topic, 'weekdays'>, day: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 7 * n && out.length < n; i++) {
    const d = nextDay(day, i);
    if (activeOnDay(t, d)) out.push(d);
  }
  return out;
}

export interface CreditState {
  debt: number;
  dueDays: string[];
  /** Debt added to each due day's target. */
  shares: number[];
  /** Debt repaid so far (units beyond the base target on due days, up to the debt). */
  paid: number;
}

export function creditState(c: Credit, topic: Topic, done: DoneByDay): CreditState {
  const at = (day: string) => done.get(doneKey(c.topicId, day)) ?? 0;
  const debt = Math.max(0, Math.min(c.target - at(c.day), c.target - c.minimum));
  const dueDays = nextActiveDays(topic, c.day, Math.max(1, Math.min(2, c.days)));
  const base = Math.max(0, topic.dailyTarget);
  const shares: number[] = [];
  let paid = 0;
  const first = Math.ceil(debt / dueDays.length);
  for (const [i, day] of dueDays.entries()) {
    // Planned split: ceil on the first day, the rest on the last. Paying ahead lowers the last share; falling short
    // doesn't raise it (that day failed and the shortfall is dropped).
    const planned = i === 0 ? first : debt - first;
    const share = i === 0 ? planned : Math.max(0, Math.min(planned, debt - paid));
    shares.push(share);
    paid = Math.min(debt, paid + Math.max(0, at(day) - base));
  }
  return { debt, dueDays, shares, paid };
}

/** The topic's credit that is still open on `day`: taken that day, or not repaid while its due days last. */
export function openCredit(topic: Topic, credits: readonly Credit[], done: DoneByDay, day: string): Credit | null {
  for (const c of credits) {
    if (c.topicId !== topic.id || c.day > day) continue;
    if (c.day === day) return c;
    const s = creditState(c, topic, done);
    if (s.paid < s.debt && s.dueDays.length > 0 && day <= s.dueDays[s.dueDays.length - 1]) return c;
  }
  return null;
}

/** The topic's rule for `day`. `credits` are the recent ones of every topic (repayment looks back a week or two). */
export function dayRule(topic: Topic, credits: readonly Credit[], done: DoneByDay, day: string): DayRule {
  const base = Math.max(0, topic.dailyTarget);
  const active = activeOnDay(topic, day);
  const own = credits.filter((c) => c.topicId === topic.id);
  const taken = own.find((c) => c.day === day);
  if (taken) {
    const s = creditState(taken, topic, done);
    const doneToday = done.get(doneKey(topic.id, day)) ?? 0;
    return {
      active,
      // Met once the minimum is done; work beyond it still lowers the debt.
      target: Math.max(taken.minimum, Math.min(doneToday, taken.target)),
      ignoreDeadline: true,
      credit: { kind: 'taken', creditId: taken.id, debt: s.debt, dueDays: s.dueDays },
      creditable: false,
    };
  }
  let target = base;
  let credit: CreditNote | null = null;
  for (const c of own) {
    if (c.day >= day) continue;
    const s = creditState(c, topic, done);
    const i = s.dueDays.indexOf(day);
    if (i < 0 || s.shares[i] <= 0) continue;
    target += s.shares[i];
    credit = { kind: 'repay', share: s.shares[i], dayIndex: i, dueDays: s.dueDays, debt: s.debt };
  }
  const doneToday = done.get(doneKey(topic.id, day)) ?? 0;
  const creditable =
    active && base > effectiveMin(topic) && doneToday < target && openCredit(topic, own, done, day) == null;
  return { active, target, ignoreDeadline: false, credit, creditable };
}

/** Rules of every topic for `day`. */
export function dayRules(
  topics: readonly Topic[],
  credits: readonly Credit[],
  done: DoneByDay,
  day: string,
): Map<number, DayRule> {
  return new Map(topics.map((t) => [t.id, dayRule(t, credits, done, day)]));
}
