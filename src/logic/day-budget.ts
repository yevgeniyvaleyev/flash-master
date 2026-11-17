import { loadToday, type Today } from '@/db/repo';
import { useSettings } from '@/store/settings';

import { atHour, grantedMs, reserveMs, type UpcomingTask } from './budget';
import { completionEvents, isActive, unitCostMs } from './goal';
import { splitSessions, type SessionInput, type WorkSession } from './sessions';

/** Everything the adaptive budget and the day plan need for today, loaded from the DB and settings. */
export interface DayBudget {
  now: number;
  start: number;
  deadline: number;
  today: Today;
  /** Units required to unlock (Σ minimums) and how many of them are done. */
  goal: number;
  done: number;
  /** Units toward the targets (each topic capped at its target) and their sum. */
  targetDone: number;
  targetTotal: number;
  /** Units counted toward the unlock, one per unit in time order, with their topic's grant cap. */
  events: { ts: number; topicId: number; costMs: number; maxGrantMs: number }[];
  /** Units still ahead on the way to the minimums, topic by topic in display order. */
  upcoming: UpcomingTask[];
  /** Work left up to the targets, split into sessions and interleaved across the day. */
  blocks: WorkSession[];
  granted: number;
  /** Time reserved for the rest of the minimums. */
  reserve: number;
}

export async function loadDayBudget(now: number = Date.now()): Promise<DayBudget> {
  const s = useSettings.getState();
  const today = await loadToday(new Date(now));
  const { progress, topics } = today;
  const byId = new Map(topics.filter(isActive).map((t) => [t.id, t]));

  const upcoming: UpcomingTask[] = [];
  const left: SessionInput[] = [];
  for (const p of progress.topics) {
    const t = byId.get(p.topicId)!;
    const cost = unitCostMs(t);
    for (let i = 0; i < p.leftToMin; i++) upcoming.push({ costMs: cost });
    if (p.leftToTarget > 0)
      left.push({
        topicId: p.topicId,
        name: p.name,
        unit: p.unit,
        color: p.color,
        units: p.leftToTarget,
        unitMs: cost,
      });
  }
  const blocks = splitSessions(left, s.minSessionMinutes * 60_000);

  // Each unit is capped by its topic's own maximum, or the global one.
  const events = completionEvents(today.entries, topics).map((e) => {
    const own = byId.get(e.topicId)?.maxGrantMinutes;
    return { ...e, maxGrantMs: (own ?? s.maxGrantMinutes) * 60_000 };
  });
  const deadline = atHour(now, s.reminderEndHour);
  const goal = progress.minTotal;
  return {
    now,
    start: atHour(now, s.reminderStartHour),
    deadline,
    today,
    goal,
    done: progress.minDone,
    targetDone: progress.targetDone,
    targetTotal: progress.targetTotal,
    events,
    upcoming,
    blocks,
    granted: grantedMs(events, goal, deadline, upcoming, s.maxGrantMinutes * 60_000),
    reserve: reserveMs(goal - progress.minDone, upcoming),
  };
}
