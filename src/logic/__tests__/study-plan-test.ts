import { MIN_ALARM_GAP_MS, nextAlarmAt, planDay as planWithIndex } from '../study-plan';

/** The plan without item indexes (most tests only look at the times). */
const planDay = (input: Parameters<typeof planWithIndex>[0]) =>
  planWithIndex(input).map(({ start, end }) => ({ start, end }));

const MIN = 60_000;
const day = new Date(2026, 9, 11).getTime();
const at = (h: number, m = 0) => day + h * 60 * MIN + m * MIN;
const items = (...minutes: number[]) => minutes.map((m) => ({ costMs: m * MIN }));
const window = { start: at(9), deadline: at(22) };

describe('planDay', () => {
  it('centres each block in an equal share of the day', () => {
    const plan = planDay({ ...window, now: at(9), items: items(30, 30, 30) });
    expect(plan.map((b) => b.start)).toEqual([at(10, 55), at(15, 15), at(19, 35)]);
    expect(plan.map((b) => b.end)).toEqual([at(11, 25), at(15, 45), at(20, 5)]);
  });

  it('centres blocks of different lengths on the same midpoints', () => {
    const plan = planDay({ ...window, now: at(9), items: items(30, 60) });
    // 780 min / 2 = 390: midpoints 12:15 and 18:45.
    expect(plan).toEqual([
      { start: at(12), end: at(12, 30) },
      { start: at(18, 15), end: at(19, 15) },
    ]);
  });

  it('re-plans from now after an ignored alarm', () => {
    const plan = planDay({ ...window, now: at(10, 55), items: items(30, 30, 30) });
    // 665 min / 3: first midpoint 10:55 + 110.83 min.
    expect(plan[0].start).toBeCloseTo(at(10, 55) + (665 / 6 - 15) * MIN);
  });

  it('starts at the beginning of the window when it is still early', () => {
    expect(planDay({ ...window, now: at(6), items: items(30, 30, 30) })[0].start).toBe(at(10, 55));
  });

  it('uses intervals proportional to cost when a block is longer than its share', () => {
    // 60 min left, 10 + 40: equal shares of 30 can't hold 40, so shares are 12 and 48 min.
    const plan = planDay({ ...window, now: at(21), items: items(10, 40) });
    expect(plan).toEqual([
      { start: at(21, 1), end: at(21, 11) },
      { start: at(21, 16), end: at(21, 56) },
    ]);
  });

  it('packs from now when the work does not fit', () => {
    const plan = planDay({ ...window, now: at(21, 30), items: items(30, 30) });
    expect(plan).toEqual([
      { start: at(21, 30), end: at(22) },
      { start: at(22), end: at(22, 30) },
    ]);
  });

  it('plans nothing after the deadline or without work', () => {
    expect(planDay({ ...window, now: at(22), items: items(30) })).toEqual([]);
    expect(planDay({ ...window, now: at(12), items: [] })).toEqual([]);
  });
});

describe('nextAlarmAt', () => {
  it('rings at the start of the first block', () => {
    expect(nextAlarmAt([{ start: at(12), end: at(12, 30), index: 0 }], at(9))).toBe(at(12));
  });

  it('keeps a minimum gap from now', () => {
    expect(nextAlarmAt([{ start: at(12), end: at(12, 30), index: 0 }], at(11, 55))).toBe(at(11, 55) + MIN_ALARM_GAP_MS);
  });

  it('is null without a plan', () => {
    expect(nextAlarmAt([], at(9))).toBeNull();
  });
});

describe('planDay with topic deadlines', () => {
  it('spreads the blocks before a deadline up to it and the rest after it', () => {
    const plan = planDay({
      ...window,
      now: at(9),
      items: [{ costMs: 30 * MIN, deadline: at(13) }, { costMs: 30 * MIN, deadline: at(13) }, { costMs: 30 * MIN }],
    });
    // 9:00–13:00 in two 120-min intervals (midpoints 10:00, 12:00); the rest from the group's end, 12:15–22:00
    // (midpoint 17:07:30).
    expect(plan.map((b) => b.start)).toEqual([at(9, 45), at(11, 45), at(16, 52) + 30_000]);
  });

  it('pulls a block before a later deadline block into that deadline group', () => {
    const plan = planDay({
      ...window,
      now: at(9),
      items: [{ costMs: 30 * MIN }, { costMs: 30 * MIN, deadline: at(11) }, { costMs: 30 * MIN }],
    });
    expect(plan[1].end).toBeLessThanOrEqual(at(11));
    expect(plan[0].end).toBeLessThanOrEqual(plan[1].start);
    expect(plan[2].start).toBeGreaterThanOrEqual(at(11));
  });

  it('ignores a deadline that has passed or lies after the day', () => {
    const plain = planDay({ ...window, now: at(14), items: items(30, 30) });
    const passed = planDay({
      ...window,
      now: at(14),
      items: [
        { costMs: 30 * MIN, deadline: at(13) },
        { costMs: 30 * MIN, deadline: at(23) },
      ],
    });
    expect(passed).toEqual(plain);
  });

  it('runs back to back from now when the work does not fit before the deadline', () => {
    const plan = planDay({
      ...window,
      now: at(12),
      items: [{ costMs: 90 * MIN, deadline: at(13) }, { costMs: 30 * MIN }],
    });
    expect(plan[0]).toEqual({ start: at(12), end: at(13, 30) });
    expect(plan[1].start).toBeGreaterThan(at(13, 30));
  });
});

describe('planDay with tight deadlines', () => {
  it('plans a deadline topic first and moves other blocks after its deadline when they do not fit', () => {
    // 12:20, deadline 15:00 with 120 min due; other blocks in between would push it late.
    const plan = planWithIndex({
      ...window,
      now: at(12, 20),
      items: [
        { costMs: 60 * MIN, deadline: at(15) },
        { costMs: 40 * MIN },
        { costMs: 60 * MIN, deadline: at(15) },
        { costMs: 40 * MIN },
      ],
    });
    const byIndex = new Map(plan.map((b) => [b.index, b]));
    expect(byIndex.get(0)!.end).toBeLessThanOrEqual(at(15));
    expect(byIndex.get(2)!.end).toBeLessThanOrEqual(at(15));
    // Only one 40-min block fits beside them before 15:00 (160 min); the other moves after.
    expect(plan.filter((b) => b.end <= at(15))).toHaveLength(3);
    expect(byIndex.get(3)!.start).toBeGreaterThanOrEqual(at(15));
    // Time order.
    expect(plan.map((b) => b.start)).toEqual([...plan.map((b) => b.start)].sort((a, b) => a - b));
  });

  it('does not waste the free time before an earlier deadline', () => {
    // 11:03: 16 min due by 12:00, then 66 min due by 13:00: fits only if the second starts before 12:00.
    const plan = planWithIndex({
      ...window,
      now: at(11, 3),
      items: [
        { costMs: 16 * MIN, deadline: at(12) },
        { costMs: 33 * MIN, deadline: at(13) },
        { costMs: 33 * MIN, deadline: at(13) },
      ],
    });
    expect(plan.every((b) => b.end <= (b.index === 0 ? at(12) : at(13)))).toBe(true);
  });

  it('leaves room before an earlier deadline for work due by a later one', () => {
    const plan = planWithIndex({
      ...window,
      now: at(10, 20),
      items: [
        { costMs: 32 * MIN, deadline: at(15) },
        { costMs: 72 * MIN, deadline: at(16) },
      ],
    });
    expect(plan[0].end).toBeLessThanOrEqual(at(15));
    expect(plan[1].end).toBeLessThanOrEqual(at(16));
  });
});
