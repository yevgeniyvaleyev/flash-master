import { StudyAlarms, type AlarmItem } from '@modules/study-alarms';

import { loadDayBudget, type DayBudget } from '@/logic/day-budget';
import { atHour } from '@/logic/budget';
import { atMinutes } from '@/logic/dates';
import { topicsForDay, unitCostMs, unitsLabel } from '@/logic/goal';
import { splitSessions } from '@/logic/sessions';
import { vibrationOf, vibrationRepeatOf, vibrationWaveform } from '@/logic/vibration';
import { useSettings } from '@/store/settings';

/**
 * Pushes the day-plan inputs to the native alarm scheduler (no-op in Expo Go). The native side plans the even
 * schedule itself (StudyPlan.kt mirrors src/logic/study-plan.ts) so it can re-plan after an alarm, a reboot or at
 * the start of a new day without the app running.
 * - today: one block (and alarm) per work session (splitSessions), topics interleaved over the day; alarms stop once
 *   every target is met;
 * - tomorrow (and a day the app wasn't opened yet): every topic's full target for tomorrow (weekdays, credits), split
 *   the same way.
 * `slug` is the topic id (deep link flashmaster://topic/<id>) and `difficulty` the units label «12 стр.».
 * `deadlineMinutes` is the topic's deadline (minutes after midnight, -1 = none): the native plan fits the item before it.
 */
export async function syncAlarms(budget?: DayBudget): Promise<void> {
  if (!StudyAlarms) return;
  const s = useSettings.getState();
  const b = budget ?? (await loadDayBudget());
  // Tomorrow's norm: its weekdays and targets (raised by a credit being repaid).
  const active = topicsForDay(b.today.topics, b.today.tomorrow);
  // Tomorrow's order: today's hours, the whole window (nothing done yet).
  const dayStart = atHour(b.now, s.reminderStartHour);
  const tomorrow: AlarmItem[] = splitSessions(
    active
      .filter((t) => t.dailyTarget > 0)
      .map((t) => ({
        topicId: t.id,
        name: t.name,
        unit: t.unit,
        color: t.color,
        units: t.dailyTarget,
        unitMs: unitCostMs(t),
        deadline: t.deadlineMinutes == null ? null : atMinutes(dayStart, t.deadlineMinutes),
        deadlineMinutes: t.deadlineMinutes,
      })),
    s.minSessionMinutes * 60_000,
    { from: dayStart, end: atHour(b.now, s.reminderEndHour) },
  ).map((session) => ({
    slug: String(session.topicId),
    title: session.name,
    difficulty: unitsLabel(session.units, session.unit),
    costMs: session.costMs,
    deadlineMinutes: session.deadlineMinutes ?? -1,
  }));
  StudyAlarms.setConfig({
    enabled: s.alarmsEnabled,
    startHour: s.reminderStartHour,
    endHour: s.reminderEndHour,
    goal: b.targetTotal,
    learnedToday: b.targetDone,
    day: b.today.day,
    dayStartHour: s.dayStartHour,
    upcoming: b.blocks.map((block) => ({
      slug: String(block.topicId),
      title: block.name,
      difficulty: unitsLabel(block.units, block.unit),
      costMs: block.costMs,
      // A missed deadline no longer constrains the plan.
      deadlineMinutes: block.deadline != null && block.deadline > b.now ? (block.deadlineMinutes ?? -1) : -1,
    })),
    tomorrowGoal: active.reduce((sum, t) => sum + Math.max(0, t.dailyTarget), 0),
    tomorrow,
    // The ring's whole vibration (preset × repetition); the native ring service plays it as one waveform.
    ...((w) => ({ vibrationTimings: w.timings, vibrationRepeat: w.repeat }))(
      vibrationWaveform(vibrationOf(s.alarmVibration).pattern, vibrationRepeatOf(s.alarmVibrationRepeat)),
    ),
    sound: s.alarmSound,
  });
}
