import { etaDays, positionDelta, PositionError } from '../position';

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
