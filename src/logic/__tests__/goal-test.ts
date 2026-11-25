import {
  completionEvents,
  dayProgress,
  deadlineLabel,
  durationLabel,
  topicProgress,
  type Entry,
  type Topic,
} from '../goal';

const topic = (patch: Partial<Topic> = {}): Topic => ({
  id: 1,
  name: 'Книга',
  unit: 'стр.',
  dailyTarget: 20,
  unlockMin: 3,
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

let nextId = 1;
const entry = (topicId: number, units: number, ts = 1000 + nextId): Entry => ({
  id: nextId++,
  topicId,
  day: '2026-11-17',
  ts,
  units,
  position: null,
});

describe('topicProgress', () => {
  it('splits the way to the minimum and to the target', () => {
    expect(topicProgress(topic(), 2)).toMatchObject({
      done: 2,
      minDone: 2,
      leftToMin: 1,
      leftToTarget: 18,
      minMet: false,
      targetMet: false,
    });
    expect(topicProgress(topic(), 5)).toMatchObject({ minDone: 3, leftToMin: 0, minMet: true, leftToTarget: 15 });
    expect(topicProgress(topic(), 25)).toMatchObject({ leftToTarget: 0, targetMet: true });
  });

  it('never requires more than the target as the minimum', () => {
    expect(topicProgress(topic({ dailyTarget: 5, unlockMin: 10 }), 0).minimum).toBe(5);
    expect(topicProgress(topic({ unlockMin: 0 }), 0).minMet).toBe(true);
  });
});

describe('dayProgress', () => {
  const topics = [topic(), topic({ id: 2, name: 'Испанский', unit: 'карт.', dailyTarget: 10, unlockMin: 5 })];

  it('unlocks only when every active topic reached its minimum', () => {
    const half = dayProgress(topics, [entry(1, 3), entry(2, 4)]);
    expect(half).toMatchObject({ minDone: 7, minTotal: 8, unlocked: false, targetMet: false });
    const all = dayProgress(topics, [entry(1, 3), entry(2, 4), entry(2, 1)]);
    expect(all).toMatchObject({ minDone: 8, unlocked: true, targetDone: 8, targetTotal: 30, targetMet: false });
  });

  it('caps each topic at its target in the target total', () => {
    const p = dayProgress(topics, [entry(1, 40), entry(2, 10)]);
    expect(p).toMatchObject({ targetDone: 30, targetMet: true });
  });

  it('ignores paused, completed and archived topics; no active topic means unlocked', () => {
    const p = dayProgress(
      [topic({ paused: true }), topic({ id: 2, archived: true }), topic({ id: 3, completedAt: 1 })],
      [entry(1, 1)],
    );
    expect(p.topics).toEqual([]);
    expect(p).toMatchObject({ unlocked: true, targetMet: false, minTotal: 0 });
  });
});

describe('completionEvents', () => {
  it('emits one event per unit up to the minimum, in time order, with the topic cost', () => {
    const topics = [topic(), topic({ id: 2, unlockMin: 1, minutesPerUnit: 0.5 })];
    const events = completionEvents([entry(1, 2, 300), entry(2, 4, 100), entry(1, 5, 200)], topics);
    expect(events.map((e) => [e.ts, e.topicId, e.costMs])).toEqual([
      [100, 2, 30_000],
      [200, 1, 120_000],
      [200, 1, 120_000],
      [200, 1, 120_000],
    ]);
  });

  it('skips inactive topics', () => {
    expect(completionEvents([entry(1, 2)], [topic({ paused: true })])).toEqual([]);
  });
});

it('formats durations', () => {
  expect(durationLabel(24 * 60_000)).toBe('~24 мин');
  expect(durationLabel(70 * 60_000)).toBe('~1 ч 10 мин');
  expect(durationLabel(120 * 60_000)).toBe('~2 ч');
  expect(durationLabel(0)).toBe('~1 мин');
});

describe('deadline', () => {
  const day = new Date(2026, 10, 17);
  const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m).getTime();
  const book = topic({ dailyTarget: 10, unlockMin: 2, deadlineMinutes: 15 * 60 });
  const e = (units: number, ts: number): Entry => ({
    id: nextId++,
    topicId: 1,
    day: '2026-11-17',
    ts,
    units,
    position: null,
  });

  it('counts the target as met when reached before the deadline', () => {
    const p = dayProgress([book], [e(6, at(10)), e(4, at(14, 59))], at(16)).topics[0];
    expect(p).toMatchObject({ targetMet: true, deadlineMissed: false, deadline: at(15) });
    expect(deadlineLabel(p)).toBeNull();
  });

  it('fails the target (and the day) when it is reached only after the deadline', () => {
    const d = dayProgress([book], [e(6, at(10)), e(4, at(15, 30))], at(16));
    expect(d.topics[0]).toMatchObject({ done: 10, leftToTarget: 0, targetMet: false, deadlineMissed: true });
    expect(d.targetMet).toBe(false);
    // Units after the deadline still count toward the minimum (unlock).
    expect(d.unlocked).toBe(true);
    expect(deadlineLabel(d.topics[0])).toBe('срок 15:00 пропущен');
  });

  it('is not missed before the deadline', () => {
    const p = dayProgress([book], [e(3, at(10))], at(12)).topics[0];
    expect(p).toMatchObject({ targetMet: false, deadlineMissed: false });
    expect(deadlineLabel(p)).toBe('до 15:00');
  });

  it('leaves topics without a deadline as before', () => {
    const p = dayProgress([topic({ dailyTarget: 5 })], [e(5, at(23))], day.getTime()).topics[0];
    expect(p).toMatchObject({ targetMet: true, deadline: null, deadlineMissed: false });
  });
});
