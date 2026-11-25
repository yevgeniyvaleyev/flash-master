import type { StudyBlock } from './budget';
import { durationLabel, unitsLabel } from './goal';

/**
 * Splits each topic's work left for today into sessions and interleaves the topics, so the day plan spreads every
 * topic across the whole day instead of one long block per topic. A session is never shorter than `minSessionMs`
 * (unless the topic's whole remainder is shorter) and always holds whole units. Each topic's sessions sit at evenly
 * spaced points of the day (k + ½) / n, and all sessions are ordered by those points; planDay then spaces them out.
 * A topic with a deadline spreads its sessions only over the part of the day before it (given `window`), so they come
 * earlier and closer together.
 */

export interface SessionInput {
  topicId: number;
  name: string;
  unit: string;
  color: string;
  /** Units left (up to the target). */
  units: number;
  /** Time per unit. */
  unitMs: number;
  /** Today's deadline (timestamp) and its time of day; null = the end of the day. */
  deadline: number | null;
  deadlineMinutes: number | null;
}

export interface WorkSession extends StudyBlock {
  units: number;
  unit: string;
  deadline: number | null;
  deadlineMinutes: number | null;
}

/** The planned part of the day: from max(now, start) to the day's end. */
export interface PlanWindow {
  from: number;
  end: number;
}

/** Share (0..1] of the window before the deadline; 1 without one, or once it has passed or lies past the end. */
export function deadlineShare(deadline: number | null, window: PlanWindow | undefined): number {
  if (deadline == null || !window || window.end <= window.from) return 1;
  if (deadline <= window.from || deadline >= window.end) return 1;
  return (deadline - window.from) / (window.end - window.from);
}

/** «Книга · 12 стр. · ~24 мин» */
export function blockLabel(name: string, units: number, unit: string, costMs: number): string {
  return `${name} · ${unitsLabel(units, unit)} · ${durationLabel(costMs)}`;
}

/** How many sessions a topic's remainder is split into (1 when `minSessionMs` ≤ 0 means "don't split"). */
export function sessionCount(units: number, unitMs: number, minSessionMs: number): number {
  if (units <= 0) return 0;
  if (minSessionMs <= 0 || unitMs <= 0) return 1;
  return Math.max(1, Math.min(units, Math.floor((units * unitMs) / minSessionMs)));
}

export function splitSessions(
  items: readonly SessionInput[],
  minSessionMs: number,
  window?: PlanWindow,
): WorkSession[] {
  const placed: { at: number; order: number; session: WorkSession }[] = [];
  items.forEach((item, order) => {
    const n = sessionCount(item.units, item.unitMs, minSessionMs);
    const share = deadlineShare(item.deadline, window);
    const base = Math.floor(item.units / n);
    const extra = item.units % n;
    for (let k = 0; k < n; k++) {
      // Larger sessions first: the day's first session of a topic also moves its minimum forward.
      const units = base + (k < extra ? 1 : 0);
      const costMs = units * item.unitMs;
      placed.push({
        at: ((k + 0.5) / n) * share,
        order,
        session: {
          topicId: item.topicId,
          name: item.name,
          color: item.color,
          unit: item.unit,
          units,
          costMs,
          deadline: item.deadline,
          deadlineMinutes: item.deadlineMinutes,
          label: blockLabel(item.name, units, item.unit, costMs),
        },
      });
    }
  });
  return placed.sort((a, b) => a.at - b.at || a.order - b.order).map((p) => p.session);
}
