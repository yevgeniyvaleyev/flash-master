import { StudyAlarms, type AlarmItem } from '@modules/study-alarms';

import { loadDayBudget, type DayBudget } from '@/logic/day-budget';
import { isActive, unitCostMs, unitsLabel } from '@/logic/goal';
import { splitSessions } from '@/logic/sessions';
import { useSettings } from '@/store/settings';

/**
 * Pushes the day-plan inputs to the native alarm scheduler (no-op in Expo Go). The native side plans the even
 * schedule itself (StudyPlan.kt mirrors src/logic/study-plan.ts) so it can re-plan after an alarm, a reboot or at
 * the start of a new day without the app running.
 * - today: one block (and alarm) per work session (splitSessions), topics interleaved over the day; alarms stop once
 *   every target is met;
 * - tomorrow (and a day the app wasn't opened yet): every active topic's full target, split the same way.
 * `slug` is the topic id (deep link flashmaster://topic/<id>) and `difficulty` the units label «12 стр.».
 */
export async function syncAlarms(budget?: DayBudget): Promise<void> {
  if (!StudyAlarms) return;
  const s = useSettings.getState();
  const b = budget ?? (await loadDayBudget());
  const active = b.today.topics.filter(isActive);
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
      })),
    s.minSessionMinutes * 60_000,
  ).map((session) => ({
    slug: String(session.topicId),
    title: session.name,
    difficulty: unitsLabel(session.units, session.unit),
    costMs: session.costMs,
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
    })),
    tomorrowGoal: active.reduce((sum, t) => sum + Math.max(0, t.dailyTarget), 0),
    tomorrow,
  });
}
