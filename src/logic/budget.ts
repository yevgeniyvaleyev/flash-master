import { logicalDay } from './dates';
import { nextAlarmAt, planDay, type PlannedBlock } from './study-plan';

/**
 * Adaptive entertainment budget (same model as AlgoMaster). The learning day runs from `startHour` to `endHour` (the
 * deadline for the daily minimum). Each unit still ahead on the way to the minimums reserves its topic's estimated
 * time; whatever is left until the deadline is slack. Completing a task grants a share of the slack, capped
 * at `maxGrantMs`, and the spendable balance is additionally capped by the current slack, so the goal stays reachable
 * before the deadline.
 */

export interface UpcomingTask {
  costMs: number;
}

/** Timestamp of `hour`:00 on the app's day of `now` (hours are ≥ the day start hour). */
export function atHour(now: number, hour: number): number {
  const d = logicalDay(new Date(now));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).getTime();
}

/** Time reserved for the next `left` tasks (in session order). */
export function reserveMs(left: number, upcoming: readonly UpcomingTask[]): number {
  return upcoming.slice(0, Math.max(0, left)).reduce((sum, a) => sum + a.costMs, 0);
}

/** Free time until the deadline after reserving learning time; negative when the goal is already at risk. */
export function slackMs(now: number, deadline: number, reserve: number): number {
  return deadline - now - reserve;
}

/**
 * Entertainment time granted by today's completed tasks (oldest first, with their cost). The k-th event shares the
 * slack at that moment between itself and each task still to do: clamp(slack / (left + 1), 0, maxGrant). What was
 * ahead at an earlier event = the tasks actually done after it plus the start of the current upcoming list. Events
 * that meet the goal grant nothing (everything unlocks anyway).
 */
export function grantedMs(
  /** `maxGrantMs` per event overrides the default cap (a topic's own setting). */
  done: readonly { ts: number; costMs: number; maxGrantMs?: number }[],
  goal: number,
  deadline: number,
  upcoming: readonly UpcomingTask[],
  maxGrantMs: number,
): number {
  let total = 0;
  done.forEach((event, i) => {
    const left = goal - (i + 1);
    if (left <= 0) return;
    const later = done.slice(i + 1, i + 1 + left);
    const reserve = later.reduce((sum, l) => sum + l.costMs, 0) + reserveMs(left - later.length, upcoming);
    const slack = slackMs(event.ts, deadline, reserve);
    total += Math.min(event.maxGrantMs ?? maxGrantMs, Math.max(0, slack / (left + 1)));
  });
  return Math.floor(total);
}

/** Spendable entertainment time right now; null = unlimited (goal met). */
export function availableMs(
  now: number,
  done: number,
  goal: number,
  granted: number,
  used: number,
  deadline: number,
  reserve: number,
): number | null {
  if (done >= goal) return null;
  return Math.max(0, Math.min(granted - used, slackMs(now, deadline, reserve)));
}

/** A session of a topic's remaining work for today (up to its target) in the study plan. */
export interface StudyBlock {
  topicId: number;
  /** Topic name and color (timeline segment and legend). */
  name: string;
  color: string;
  label: string;
  costMs: number;
  /** The topic's deadline today (the plan fits the block before it); null/undefined = the day's end. */
  deadline?: number | null;
}

export type TimelineSegment =
  | { kind: 'past'; start: number; end: number }
  | { kind: 'fun' | 'free' | 'unlimited'; start: number; end: number }
  | { kind: 'study'; start: number; end: number; topicId: number; name: string; color: string; label: string };

export interface DayTimeline {
  start: number;
  end: number;
  /** "Now" clamped to the window. */
  now: number;
  segments: TimelineSegment[];
  /** Today's entries inside the window, as ticks on the past part. */
  ticks: { ts: number }[];
  /** Latest moment to start and still reach every target by the deadline; null when nothing is left. */
  latestStart: number | null;
  /** How much learning time doesn't fit before the deadline (0 when it fits). */
  shortageMs: number;
  /** The deadline has passed with work left. */
  ended: boolean;
  /** Evenly spread plan, one block per work session (see study-plan.ts and sessions.ts). */
  plan: (PlannedBlock & StudyBlock)[];
  /** When the next study alarm rings; null when nothing is planned. */
  nextAlarm: number | null;
}

/**
 * Lays out the learning day: the past, then each topic's remaining work up to its target where the study plan puts
 * it (evenly spread, see planDay), and in the gaps the entertainment available now and free time — or, once the
 * minimums are met (`goalMet`, apps unlocked), unlimited time. Blocks that run past the deadline are cut off there;
 * `shortageMs` says how much work doesn't fit.
 */
export function dayTimeline(input: {
  now: number;
  start: number;
  end: number;
  done: readonly { ts: number }[];
  /** The minimums are met: entertainment is unlimited. */
  goalMet: boolean;
  /** Work left up to the targets, as sessions spread over the day (splitSessions). */
  blocks: readonly StudyBlock[];
  available: number | null;
}): DayTimeline {
  const { start, end, blocks, available, goalMet } = input;
  const now = Math.min(end, Math.max(start, input.now));
  const segments: TimelineSegment[] = [];
  if (now > start) segments.push({ kind: 'past', start, end: now });
  const ticks = input.done.filter((l) => l.ts >= start && l.ts <= end).map((l) => ({ ts: l.ts }));

  if (blocks.length === 0) {
    if (now < end) segments.push({ kind: goalMet ? 'unlimited' : 'free', start: now, end });
    return {
      start,
      end,
      now,
      segments,
      ticks,
      latestStart: null,
      shortageMs: 0,
      ended: false,
      plan: [],
      nextAlarm: null,
    };
  }

  const reserve = blocks.reduce((sum, b) => sum + b.costMs, 0);
  const ended = input.now >= end;
  const shortageMs = ended ? 0 : Math.max(0, reserve - Math.max(0, end - now));
  const latestStart = end - reserve;
  // In time order (blocks before a topic deadline may be moved ahead of others).
  const plan = planDay({ now: input.now, start, deadline: end, items: blocks }).map((b) => ({
    ...blocks[b.index],
    ...b,
  }));

  if (!ended) {
    const gap = goalMet ? 'unlimited' : 'free';
    const visible = plan.filter((b) => b.start < end).map((b) => ({ ...b, end: Math.min(end, b.end) }));
    const firstStart = visible[0]?.start ?? end;
    const funEnd = goalMet ? now : Math.min(now + Math.max(0, available ?? 0), firstStart);
    if (funEnd > now) segments.push({ kind: 'fun', start: now, end: funEnd });
    let t = funEnd > now ? funEnd : now;
    for (const b of visible) {
      if (b.start > t) segments.push({ kind: gap, start: t, end: b.start });
      segments.push({
        kind: 'study',
        start: b.start,
        end: b.end,
        topicId: b.topicId,
        name: b.name,
        color: b.color,
        label: b.label,
      });
      t = b.end;
    }
    if (t < end) segments.push({ kind: gap, start: t, end });
  }

  return {
    start,
    end,
    now,
    segments,
    ticks,
    latestStart,
    shortageMs,
    ended,
    plan,
    nextAlarm: nextAlarmAt(plan, input.now),
  };
}
