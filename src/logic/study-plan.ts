/**
 * Even study plan for the rest of the learning day: the time from max(now, start) to the deadline is split into one
 * interval per remaining topic block, and each block's learning time is centred in its interval. An alarm rings at
 * the start of the next block. Mirrored in Kotlin by modules/study-alarms/.../StudyPlan.kt — keep them in sync.
 *
 * Blocks with their own (topic) deadline come first: for each deadline (earliest first) the blocks due by then form
 * a group spread from the end of the previous group up to that deadline. Other blocks that come before them in order
 * join the group only while everything still fits; the rest move after the deadline (keeping their order). Without
 * topic deadlines there is one group and the plan is the plain even one. The plan is returned in time order; `index`
 * points back to the item.
 */

export interface PlanItem {
  costMs: number;
  /** Must be done by this moment; null/undefined = the day's deadline. Ignored once passed or past the day's end. */
  deadline?: number | null;
}

export interface PlannedBlock {
  start: number;
  end: number;
  /** Position of the planned item in `items`. */
  index: number;
}

/** Alarms never ring sooner than this after "now" (just finished or dismissed a block). */
export const MIN_ALARM_GAP_MS = 10 * 60_000;

export function planDay(input: {
  now: number;
  start: number;
  deadline: number;
  items: readonly PlanItem[];
}): PlannedBlock[] {
  const { deadline, items } = input;
  const from = Math.max(input.now, input.start);
  if (items.length === 0 || from >= deadline) return [];
  const own = items.map((i) =>
    i.deadline != null && i.deadline > from && i.deadline < deadline ? i.deadline : Infinity,
  );
  const cost = (ids: readonly number[]) => ids.reduce((sum, i) => sum + items[i].costMs, 0);
  let remaining = items.map((_, i) => i);
  const plan: PlannedBlock[] = [];
  let t = from;
  const place = (ids: number[], to: number) => {
    const group = spread(
      t,
      Math.max(t, to),
      ids.map((i) => items[i]),
    );
    group.forEach((b, k) => plan.push({ ...b, index: ids[k] }));
    // The next group starts right after this one: free time before a deadline isn't wasted.
    t = group[group.length - 1].end;
    remaining = remaining.filter((i) => !ids.includes(i));
  };

  const deadlines = [...new Set(own.filter((d) => d !== Infinity))].sort((a, b) => a - b);
  deadlines.forEach((d, j) => {
    let last = -1;
    remaining.forEach((i, k) => {
      if (own[i] <= d) last = k;
    });
    if (last < 0) return;
    const candidates = remaining.slice(0, last + 1);
    const due = candidates.filter((i) => own[i] <= d);
    // End early enough that the work due by each later deadline still fits before it.
    let to = d;
    for (const later of deadlines.slice(j + 1)) {
      const dueLater = remaining.filter((i) => own[i] > d && own[i] <= later);
      to = Math.min(to, later - cost(dueLater));
    }
    // Blocks without this deadline fill what's left before it, in order, as long as they fit.
    let room = to - t - cost(due);
    const group = candidates.filter((i) => {
      if (own[i] <= d) return true;
      if (items[i].costMs > room) return false;
      room -= items[i].costMs;
      return true;
    });
    place(group, to);
  });
  if (remaining.length > 0) place([...remaining], deadline);
  return plan;
}

/** Spreads `items` evenly over [from, to]; back to back from `from` when they don't fit. */
function spread(from: number, to: number, items: readonly PlanItem[]): { start: number; end: number }[] {
  const span = to - from;
  const total = items.reduce((sum, i) => sum + i.costMs, 0);

  // Doesn't fit at all: back to back from now (the timeline reports the shortage).
  if (total > span || span <= 0) {
    let t = from;
    return items.map((i) => ({ start: t, end: (t += i.costMs) }));
  }

  // Equal intervals when every block fits its interval, otherwise intervals proportional to cost.
  const equal = span / items.length;
  const proportional = items.some((i) => i.costMs > equal);
  let t = from;
  return items.map((i) => {
    const width = proportional && total > 0 ? (span * i.costMs) / total : equal;
    const mid = t + width / 2;
    t += width;
    return { start: mid - i.costMs / 2, end: mid + i.costMs / 2 };
  });
}

/** When the next alarm should ring for this plan; null when nothing is planned. */
export function nextAlarmAt(plan: readonly PlannedBlock[], now: number): number | null {
  if (plan.length === 0) return null;
  return Math.max(plan[0].start, now + MIN_ALARM_GAP_MS);
}
