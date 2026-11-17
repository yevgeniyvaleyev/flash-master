/** Book mode: units are logged by entering the page reached; the difference to the last page is the day's work. */

export class PositionError extends Error {}

/** Units read when moving from `prev` (null = nothing entered yet, counts from 0) to `current`. */
export function positionDelta(prev: number | null, current: number, total: number | null = null): number {
  if (!Number.isFinite(current) || current < 0 || !Number.isInteger(current)) {
    throw new PositionError('Введи номер страницы');
  }
  if (total != null && current > total) throw new PositionError(`В книге всего ${total} стр.`);
  const from = prev ?? 0;
  if (current <= from) throw new PositionError(`Ты уже на странице ${from}`);
  return current - from;
}

/** Days to finish `left` units at `avgPerDay`; null when there's no pace yet. */
export function etaDays(left: number, avgPerDay: number): number | null {
  if (left <= 0) return 0;
  if (!(avgPerDay > 0)) return null;
  return Math.ceil(left / avgPerDay);
}
