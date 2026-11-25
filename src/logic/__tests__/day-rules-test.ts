import {
  activeOnDay,
  creditState,
  dayRule,
  doneKey,
  nextActiveDays,
  openCredit,
  weekdayOf,
  weekdaysLabel,
  type Credit,
} from '../day-rules';
import { dayProgress, fineAt, type Entry, type Topic } from '../goal';

// 2024-01-01 is a Monday.
const MON = '2024-01-01';
const TUE = '2024-01-02';
const WED = '2024-01-03';
const THU = '2024-01-04';
const FRI = '2024-01-05';

const topic = (patch: Partial<Topic> = {}): Topic => ({
  id: 1,
  name: 'Книга',
  unit: 'стр.',
  dailyTarget: 20,
  unlockMin: 4,
  minutesPerUnit: 2,
  maxGrantMinutes: null,
  step: 5,
  mode: 'count',
  positionTotal: null,
  positionCurrent: null,
  doneBefore: 0,
  deadlineMinutes: null,
  linkedPackage: null,
  linkUrl: null,
  weekdays: null,
  color: '#4C6EF5',
  icon: null,
  paused: false,
  completedAt: null,
  resetAt: null,
  archived: false,
  sortOrder: 1,
  ...patch,
});

const credit = (patch: Partial<Credit> = {}): Credit => ({
  id: 7,
  topicId: 1,
  day: MON,
  days: 2,
  target: 20,
  minimum: 4,
  ...patch,
});

const done = (rows: Record<string, number>, topicId = 1) =>
  new Map(Object.entries(rows).map(([day, n]) => [doneKey(topicId, day), n]));

// Mon + Wed + Fri.
const MWF = 1 | 4 | 16;

describe('weekdays', () => {
  it('reads the weekday from the day key, Monday first', () => {
    expect(weekdayOf(MON)).toBe(0);
    expect(weekdayOf('2024-01-07')).toBe(6);
  });

  it('is every day without a mask', () => {
    expect(activeOnDay(topic(), TUE)).toBe(true);
    expect(weekdaysLabel(topic())).toBeNull();
    expect(weekdaysLabel(topic({ weekdays: 127 }))).toBeNull();
  });

  it('keeps only the chosen days', () => {
    const t = topic({ weekdays: MWF });
    expect([MON, TUE, WED].map((d) => activeOnDay(t, d))).toEqual([true, false, true]);
    expect(weekdaysLabel(t)).toBe('Пн Ср Пт');
    expect(nextActiveDays(t, MON, 2)).toEqual([WED, FRI]);
  });

  it('leaves an off-day topic out of the day progress', () => {
    const t = topic({ weekdays: MWF });
    const rules = new Map([[1, dayRule(t, [], new Map(), TUE)]]);
    const p = dayProgress([t], [], 0, rules);
    expect(p.topics).toEqual([]);
    expect(p.targetMet).toBe(false);
    expect(p.targetTotal).toBe(0);
  });
});

describe('credit', () => {
  it('lets the credit day count as met once the minimum is done, ignoring the deadline', () => {
    const t = topic({ deadlineMinutes: 600 });
    const before = dayRule(t, [credit()], done({ [MON]: 2 }), MON);
    expect(before.target).toBe(4);
    expect(before.ignoreDeadline).toBe(true);
    const after = dayRule(t, [credit()], done({ [MON]: 9 }), MON);
    expect(after.target).toBe(9);
    expect(after.credit).toEqual({ kind: 'taken', creditId: 7, debt: 11, dueDays: [TUE, WED] });
    expect(after.creditable).toBe(false);
  });

  it('caps the debt at target − minimum (the minimum is never credited)', () => {
    expect(creditState(credit(), topic(), done({})).debt).toBe(16);
    expect(creditState(credit(), topic(), done({ [MON]: 25 })).debt).toBe(0);
  });

  it('puts a 1-day debt on the next day', () => {
    const c = credit({ days: 1 });
    const s = creditState(c, topic(), done({ [MON]: 9 }));
    expect(s.shares).toEqual([11]);
    expect(dayRule(topic(), [c], done({ [MON]: 9 }), TUE).target).toBe(31);
    expect(dayRule(topic(), [c], done({ [MON]: 9 }), WED).target).toBe(20);
  });

  it('splits an odd debt over 2 days, the larger share first', () => {
    const d = done({ [MON]: 9 });
    expect(creditState(credit(), topic(), d).shares).toEqual([6, 5]);
    const tue = dayRule(topic(), [credit()], d, TUE);
    expect(tue.target).toBe(26);
    expect(tue.credit).toMatchObject({ kind: 'repay', share: 6, dayIndex: 0 });
    expect(dayRule(topic(), [credit()], d, WED).target).toBe(25);
  });

  it('skips off days when repaying', () => {
    const t = topic({ weekdays: MWF });
    expect(creditState(credit(), t, done({ [MON]: 9 })).dueDays).toEqual([WED, FRI]);
    expect(dayRule(t, [credit()], done({ [MON]: 9 }), WED).target).toBe(26);
  });

  it('lowers the second share when the first day pays ahead, and drops a shortfall', () => {
    expect(creditState(credit(), topic(), done({ [MON]: 9, [TUE]: 29 })).shares).toEqual([6, 2]);
    expect(creditState(credit(), topic(), done({ [MON]: 9, [TUE]: 37 })).shares).toEqual([6, 0]);
    // Tuesday did only its base target: Wednesday's share stays as planned.
    expect(creditState(credit(), topic(), done({ [MON]: 9, [TUE]: 20 })).shares).toEqual([6, 5]);
  });

  it('keeps one open credit per topic until repaid or its last day ended', () => {
    const t = topic();
    const d = done({ [MON]: 9, [TUE]: 26 });
    expect(openCredit(t, [credit()], d, MON)).not.toBeNull();
    expect(openCredit(t, [credit()], d, WED)).not.toBeNull();
    expect(dayRule(t, [credit()], d, WED).creditable).toBe(false);
    expect(openCredit(t, [credit()], d, THU)).toBeNull();
    expect(dayRule(t, [credit()], d, THU).creditable).toBe(true);
    // Repaid in full on Tuesday: free again on Wednesday.
    const paid = done({ [MON]: 9, [TUE]: 31 });
    expect(openCredit(t, [credit()], paid, WED)).toBeNull();
    expect(dayRule(t, [credit()], paid, WED).target).toBe(20);
  });

  it('is creditable only with an unfinished target above the minimum', () => {
    expect(dayRule(topic(), [], done({ [MON]: 5 }), MON).creditable).toBe(true);
    expect(dayRule(topic(), [], done({ [MON]: 20 }), MON).creditable).toBe(false);
    expect(dayRule(topic({ unlockMin: 20 }), [], done({}), MON).creditable).toBe(false);
    expect(dayRule(topic({ weekdays: MWF }), [], done({}), TUE).creditable).toBe(false);
  });

  it('applies the rule in the day progress: met with the minimum, raised target on repayment', () => {
    const t = topic();
    const e = (units: number): Entry[] => [{ id: 1, topicId: 1, day: MON, ts: 1, units, position: null }];
    const monRules = new Map([[1, dayRule(t, [credit()], done({ [MON]: 4 }), MON)]]);
    const mon = dayProgress([t], e(4), 0, monRules);
    expect(mon.targetMet).toBe(true);
    expect(mon.topics[0].credit).toMatchObject({ kind: 'taken', debt: 16 });
    const tueRules = new Map([[1, dayRule(t, [credit()], done({ [MON]: 4 }), TUE)]]);
    const tue = dayProgress([t], e(20), 0, tueRules);
    expect(tue.topics[0].target).toBe(28);
    expect(tue.targetMet).toBe(false);
  });
});

describe('fineAt', () => {
  const at = (h: number) => new Date(2024, 0, 1, h).getTime();
  const e = (topicId: number, units: number, ts: number): Entry => ({
    id: topicId * 100 + ts,
    topicId,
    day: MON,
    ts,
    units,
    position: null,
  });

  it('is null without deadlines', () => {
    expect(fineAt(dayProgress([topic()], [], at(20)))).toBeNull();
  });

  it('takes the earliest deadline whose target is not met by it, ahead or missed', () => {
    const a = topic({ id: 1, name: 'A', deadlineMinutes: 15 * 60 });
    const b = topic({ id: 2, name: 'B', deadlineMinutes: 12 * 60 });
    expect(fineAt(dayProgress([a, b], [], at(9)))).toEqual({ at: at(12), topic: 'B' });
    expect(fineAt(dayProgress([a, b], [], at(13)))).toEqual({ at: at(12), topic: 'B' });
  });

  it('ignores a target met in time but keeps one met late', () => {
    const b = topic({ id: 2, name: 'B', deadlineMinutes: 12 * 60 });
    expect(fineAt(dayProgress([b], [e(2, 20, at(11))], at(13)))).toBeNull();
    expect(fineAt(dayProgress([b], [e(2, 20, at(13))], at(14)))).toEqual({ at: at(12), topic: 'B' });
  });

  it('has no fine on a credit day, for paused or off-day topics', () => {
    const t = topic({ deadlineMinutes: 12 * 60 });
    const credited = new Map([[1, dayRule(t, [credit()], done({ [MON]: 4 }), MON)]]);
    expect(fineAt(dayProgress([t], [e(1, 4, at(9))], at(13), credited))).toBeNull();
    expect(fineAt(dayProgress([{ ...t, paused: true }], [], at(13)))).toBeNull();
    const off = topic({ deadlineMinutes: 12 * 60, weekdays: 2 });
    const offRules = new Map([[1, dayRule(off, [], new Map(), MON)]]);
    expect(fineAt(dayProgress([off], [], at(13), offRules))).toBeNull();
  });
});
