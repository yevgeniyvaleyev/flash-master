import { AppBlocker } from '@modules/app-blocker';

import { saveDayResults } from '@/db/repo';
import { loadDayBudget, type DayBudget } from '@/logic/day-budget';
import { fineAt } from '@/logic/goal';
import { useSettings } from '@/store/settings';

/**
 * Saves today's results and pushes the adaptive budget and the app selection to the native blocker (no-op in Expo
 * Go). The native side only knows "tasks": dailyGoal = Σ minimums of the active topics, learnedToday = units toward
 * them, so its `learned >= goal` check unlocks everything once every minimum is met. Apps linked to a topic are
 * never blocked. With «Штраф за пропущенный срок» on, `fineAtMs` is the earliest deadline whose target isn't met by
 * it: from then on everything blocked stays blocked until the day ends.
 */
export async function syncBlocker(budget?: DayBudget): Promise<void> {
  const b = budget ?? (await loadDayBudget());
  await saveDayResults(b.today);
  if (!AppBlocker) return;
  const s = useSettings.getState();
  const linked = new Set(b.today.topics.map((t) => t.linkedPackage).filter((p): p is string => p != null));
  const blockedPackages = s.blockedPackages.filter((p) => !linked.has(p));
  AppBlocker.setConfig({
    enabled: blockedPackages.length > 0,
    blockedPackages,
    dailyGoal: b.goal,
    learnedToday: b.done,
    grantedMs: b.granted,
    deadlineMs: b.deadline,
    reserveMs: b.reserve,
    day: b.today.day,
    dayStartHour: s.dayStartHour,
    ...((fine) => ({ fineAtMs: fine?.at ?? 0, fineTopic: fine?.topic ?? '' }))(
      s.deadlineFine ? fineAt(b.today.progress) : null,
    ),
  });
}
