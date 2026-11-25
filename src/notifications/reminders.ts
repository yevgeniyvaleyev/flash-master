import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { loadDayBudget, type DayBudget } from '@/logic/day-budget';
import { topicsForDay } from '@/logic/goal';
import { FUTURE_REMINDER, planReminders, reminderText } from '@/logic/reminders';
import { channelId, vibrationOf } from '@/logic/vibration';
import { useSettings } from '@/store/settings';

type NotificationsModule = typeof import('expo-notifications');

/**
 * expo-notifications is only partly supported in Expo Go on Android (creating a channel throws), so reminders
 * only work in a development or release build. In Expo Go the module is never loaded and every function
 * below is a no-op. (Since SDK 58 `executionEnvironment` doesn't single out Expo Go, so ask `expo` directly.)
 */
export const remindersSupported = !isRunningInExpoGo();

// eslint-disable-next-line @typescript-eslint/no-require-imports -- must not load in Expo Go
const Notifications: NotificationsModule | null = remindersSupported ? require('expo-notifications') : null;

/** Channels are per vibration preset (`reminders-<key>`): Android fixes a channel's vibration once created. */
const CHANNEL_BASE = 'reminders';
/** Days planned ahead, so reminders keep coming even if the app isn't opened for a while. */
const DAYS_AHEAD = 7;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Creates the reminder channel for the selected vibration and deletes the ones of other presets (and the old plain
 * `reminders` channel). `default` keeps the system vibration. Returns the channel id.
 */
async function ensureChannel(): Promise<string> {
  const v = vibrationOf(useSettings.getState().reminderVibration);
  const id = channelId(CHANNEL_BASE, v.key);
  if (!Notifications || Platform.OS !== 'android') return id;
  await Notifications.setNotificationChannelAsync(id, {
    name: 'Напоминания',
    description: 'Напоминания о дневной норме',
    importance: Notifications.AndroidImportance.DEFAULT,
    enableVibrate: v.key !== 'none',
    ...(v.key !== 'default' && v.key !== 'none' ? { vibrationPattern: v.pattern } : {}),
  });
  for (const c of await Notifications.getNotificationChannelsAsync()) {
    if (c.id !== id && (c.id === CHANNEL_BASE || c.id.startsWith(`${CHANNEL_BASE}-`))) {
      await Notifications.deleteNotificationChannelAsync(c.id);
    }
  }
  return id;
}

/** Creates the Android channel and asks for permission (Android 13+ shows a system prompt). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function reschedule(budget?: DayBudget): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const s = useSettings.getState();
  if (!s.remindersEnabled) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const channel = await ensureChannel();

  const now = new Date();
  const b = budget ?? (await loadDayBudget(now.getTime()));
  const { progress, topics } = b.today;
  const futureGoal = topicsForDay(topics, b.today.tomorrow).reduce((sum, t) => sum + Math.max(0, t.dailyTarget), 0);
  const plan = planReminders(
    { startHour: s.reminderStartHour, endHour: s.reminderEndHour, intervalHours: s.reminderIntervalHours },
    b.targetTotal,
    b.targetDone,
    now,
    DAYS_AHEAD,
    futureGoal,
  );
  const today = reminderText(progress);
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: r.isToday ? today : FUTURE_REMINDER,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: channel },
    });
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Replaces all scheduled reminders with a fresh plan. Calls are serialized so overlapping triggers
 * (foreground + answer + settings change) can't interleave cancel/schedule.
 */
export function syncReminders(budget?: DayBudget): Promise<void> {
  queue = queue.then(() => reschedule(budget)).catch((e) => console.warn('syncReminders failed', e));
  return queue;
}
