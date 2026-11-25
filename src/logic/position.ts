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

export interface OverallProgress {
  done: number;
  total: number;
  left: number;
  /** 0..1 */
  share: number;
}

/**
 * Progress through the whole topic toward its total (a book's pages, a course's minutes, a deck's cards); null when
 * the topic has no total. Book mode: the page reached. Count mode: `doneBefore` plus the units logged since the reset.
 */
export function overallProgress(
  topic: {
    mode: 'count' | 'position';
    positionTotal: number | null;
    positionCurrent: number | null;
    doneBefore: number;
  },
  loggedSinceReset: number,
): OverallProgress | null {
  const total = topic.positionTotal;
  if (total == null || total <= 0) return null;
  const done = Math.max(
    0,
    topic.mode === 'position' ? (topic.positionCurrent ?? 0) : topic.doneBefore + loggedSinceReset,
  );
  return { done, total, left: Math.max(0, total - done), share: Math.min(1, done / total) };
}
