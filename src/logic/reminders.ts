import { addDays, formatMinutes, logicalDay } from './dates';

export interface ReminderWindow {
  /** First reminder hour (0–23), inclusive. */
  startHour: number;
  /** Last reminder hour, inclusive; 24+ = after midnight (the app day runs until the day start hour). */
  endHour: number;
  /** Hours between reminders (≥ 1). */
  intervalHours: number;
}

export interface PlannedReminder {
  date: Date;
  /** Units still to do on that day at scheduling time (the full targets as the estimate for later days). */
  remaining: number;
  isToday: boolean;
}

/** Reminder hours of a day: startHour, startHour + interval, … up to endHour. */
export function reminderHours({ startHour, endHour, intervalHours }: ReminderWindow): number[] {
  const hours: number[] = [];
  const step = Math.max(1, Math.floor(intervalHours));
  for (let h = startHour; h <= endHour; h += step) hours.push(h);
  return hours;
}

/**
 * Reminders for today (only those still ahead, and only if the goal isn't met yet) and for the following days,
 * where nothing is done yet (`futureGoal` units; 0 = none, e.g. without any active topic). Everything is rescheduled whenever progress or settings change, so the counts
 * baked into today's texts stay accurate.
 */
export function planReminders(
  window: ReminderWindow,
  goal: number,
  learnedToday: number,
  now: Date,
  daysAhead: number,
  futureGoal: number = goal,
): PlannedReminder[] {
  const hours = reminderHours(window);
  const plan: PlannedReminder[] = [];
  for (let d = 0; d < daysAhead; d++) {
    const isToday = d === 0;
    const remaining = isToday ? goal - learnedToday : futureGoal;
    if (remaining <= 0) continue;
    const day = addDays(logicalDay(now), d);
    for (const h of hours) {
      const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0);
      if (date.getTime() > now.getTime()) plan.push({ date, remaining, isToday });
    }
  }
  return plan;
}

/** Today's reminder text from the progress: what's left to unlock first, then what's left to the targets. */
export function reminderText(p: {
  unlocked: boolean;
  topics: readonly {
    name: string;
    unit: string;
    leftToMin: number;
    leftToTarget: number;
    /** Deadline in minutes after midnight (still ahead); null/undefined = none. */
    deadlineMinutes?: number | null;
    deadlineMissed?: boolean;
  }[];
}): { title: string; body: string } {
  const due = (t: (typeof p.topics)[number]) =>
    t.deadlineMinutes != null && !t.deadlineMissed ? ` (до ${formatMinutes(t.deadlineMinutes)})` : '';
  const list = (left: (t: (typeof p.topics)[number]) => number) =>
    p.topics
      .filter((t) => left(t) > 0)
      .map((t) => `${t.name} — ${left(t)} ${t.unit}${due(t)}`)
      .join(', ');
  if (!p.unlocked) {
    return { title: 'Минимум не выполнен', body: `До разблокировки: ${list((t) => t.leftToMin)}` };
  }
  return { title: 'Цель на сегодня не выполнена', body: `Осталось: ${list((t) => t.leftToTarget)}` };
}

/** Text for a future day's reminders (nothing done yet). */
export const FUTURE_REMINDER = { title: 'Дневная норма ждёт', body: 'Пора начинать — минимум откроет развлечения.' };
