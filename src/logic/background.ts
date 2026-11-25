import { syncAlarms } from '@/alarms/sync';
import { syncBlocker } from '@/blocker/sync';
import { syncReminders } from '@/notifications/reminders';

import { loadDayBudget } from './day-budget';

/** Settings that affect reminders, alarms or blocking (the learning day doubles as the reminder window); changing any re-syncs all. */
export const BACKGROUND_SETTING_KEYS = [
  'dayStartHour',
  'remindersEnabled',
  'reminderStartHour',
  'reminderEndHour',
  'reminderIntervalHours',
  'maxGrantMinutes',
  'minSessionMinutes',
  'blockedPackages',
  'alarmsEnabled',
  'reminderVibration',
  'alarmVibration',
  'alarmVibrationRepeat',
  'alarmSound',
] as const;

/** Brings reminders, study alarms and the native app blocker in line with the current progress and settings. */
export async function syncBackground(): Promise<void> {
  const budget = await loadDayBudget().catch((e) => {
    console.warn('loadDayBudget failed', e);
    return undefined;
  });
  await Promise.all([
    syncReminders(budget),
    syncBlocker(budget).catch((e) => console.warn('syncBlocker failed', e)),
    syncAlarms(budget).catch((e) => console.warn('syncAlarms failed', e)),
  ]);
}
