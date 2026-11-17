import { dayGrade, topicStats, type TopicDay } from '../stats';

const today = new Date(2026, 10, 17, 15);
const row = (day: string, done: number, patch: Partial<TopicDay> = {}): TopicDay => ({
  day,
  topicId: 1,
  target: 10,
  minimum: 3,
  done,
  paused: false,
  ...patch,
});

describe('topicStats', () => {
  it('averages over the tracked days only and uses the target of each day', () => {
    const rows = [
      row('2026-11-14', 10),
      row('2026-11-15', 4, { target: 4 }),
      row('2026-11-16', 2),
      row('2026-11-17', 10),
    ];
    const s = topicStats(rows, 1, 30, today);
    expect(s.windowTotal).toBe(26);
    expect(s.avgPerDay).toBe(26 / 4);
    expect(s.metRate).toBe(3 / 4);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it('skips paused days in streaks and rates, and breaks on missing days', () => {
    const rows = [
      row('2026-11-13', 10),
      row('2026-11-15', 10),
      row('2026-11-16', 0, { paused: true }),
      row('2026-11-17', 0),
    ];
    const s = topicStats(rows, 1, 30, today);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
    expect(s.metRate).toBe(2 / 4);
  });

  it('has no rate without tracked days', () => {
    expect(topicStats([], 1, 7, today)).toMatchObject({ metRate: null, avgPerDay: 0, currentStreak: 0 });
  });
});

it('grades days', () => {
  expect(dayGrade(undefined)).toBe('none');
  expect(dayGrade({ minMet: true, targetMet: false, targetTotal: 0 })).toBe('none');
  expect(dayGrade({ minMet: true, targetMet: true, targetTotal: 5 })).toBe('target');
  expect(dayGrade({ minMet: true, targetMet: false, targetTotal: 5 })).toBe('minimum');
  expect(dayGrade({ minMet: false, targetMet: false, targetTotal: 5 })).toBe('missed');
});

describe('topicStats after a progress reset', () => {
  it('counts only from the reset day', () => {
    const rows = [row('2026-11-14', 20), row('2026-11-15', 20), row('2026-11-16', 5), row('2026-11-17', 20)];
    const all = topicStats(rows, 1, 7, today);
    const since = topicStats(rows, 1, 7, today, '2026-11-17');
    expect(all.windowTotal).toBe(65);
    expect(since.windowTotal).toBe(20);
    expect(since.avgPerDay).toBe(20);
    expect(since.bestStreak).toBe(1);
    expect(since.currentStreak).toBe(1);
  });
});
