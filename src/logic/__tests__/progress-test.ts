import { dayKey, lastDays } from '../dates';
import { bestStreak, computeStreak } from '../progress';

const today = new Date(2026, 9, 11, 15, 0);

describe('dayKey / lastDays', () => {
  it('formats local dates', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns oldest-first window ending today', () => {
    expect(lastDays(3, today)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });
});

describe('computeStreak', () => {
  it('counts consecutive met days including today', () => {
    expect(computeStreak({ '2026-10-09': true, '2026-10-10': true, '2026-10-11': true }, today)).toBe(3);
  });

  it('starts from yesterday when today is not met yet', () => {
    expect(computeStreak({ '2026-10-09': true, '2026-10-10': true, '2026-10-11': false }, today)).toBe(2);
  });

  it('breaks on a gap or a missed day', () => {
    expect(computeStreak({ '2026-10-08': true, '2026-10-10': true }, today)).toBe(1);
    expect(computeStreak({ '2026-10-09': true, '2026-10-10': false }, today)).toBe(0);
  });
});

describe('neutral days', () => {
  it('skips days with nothing active in the current streak', () => {
    expect(computeStreak({ '2026-10-09': true, '2026-10-10': null, '2026-10-11': true }, today)).toBe(2);
  });

  it('finds the best run, skipping neutral days', () => {
    expect(bestStreak([true, true, false, true, null, true, true, undefined, true])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });
});
