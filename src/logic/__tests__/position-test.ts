import { etaDays, overallProgress, positionDelta, PositionError } from '../position';

describe('positionDelta', () => {
  it('logs the pages since the current one', () => {
    expect(positionDelta(45, 50)).toBe(5);
    expect(positionDelta(null, 12)).toBe(12);
  });

  it('rejects going back, junk and pages past the end', () => {
    expect(() => positionDelta(45, 45)).toThrow(PositionError);
    expect(() => positionDelta(45, 40)).toThrow('Ты уже на странице 45');
    expect(() => positionDelta(0, 1.5)).toThrow(PositionError);
    expect(() => positionDelta(0, NaN)).toThrow(PositionError);
    expect(() => positionDelta(10, 301, 300)).toThrow('В книге всего 300 стр.');
  });
});

it('estimates the days left', () => {
  expect(etaDays(100, 20)).toBe(5);
  expect(etaDays(101, 20)).toBe(6);
  expect(etaDays(0, 20)).toBe(0);
  expect(etaDays(10, 0)).toBeNull();
});

describe('overallProgress', () => {
  const base = { mode: 'count' as const, positionTotal: 500, positionCurrent: null, doneBefore: 0 };

  it('is null without a total', () => {
    expect(overallProgress({ ...base, positionTotal: null }, 10)).toBeNull();
  });

  it('counts the units logged since the reset plus the units done before (count mode)', () => {
    expect(overallProgress({ ...base, doneBefore: 120 }, 30)).toEqual({ done: 150, total: 500, left: 350, share: 0.3 });
  });

  it('takes a correction below the logged units (reviews logged as units) without going negative', () => {
    expect(overallProgress({ ...base, doneBefore: -40 }, 100)?.done).toBe(60);
    expect(overallProgress({ ...base, doneBefore: -400 }, 100)?.done).toBe(0);
  });

  it('uses the page reached in book mode and caps at the total', () => {
    const book = { ...base, mode: 'position' as const, positionTotal: 300, positionCurrent: 75, doneBefore: 99 };
    expect(overallProgress(book, 999)).toEqual({ done: 75, total: 300, left: 225, share: 0.25 });
    expect(overallProgress({ ...book, positionCurrent: 300 }, 0)?.left).toBe(0);
  });
});
