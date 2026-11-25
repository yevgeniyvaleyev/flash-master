import { Appearance } from 'react-native';
import { create } from 'zustand';

import { kvGet, kvSet } from '@/db/client';
import { setDayStartHour } from '@/logic/dates';
import type { VibrationKey, VibrationRepeatKey } from '@/logic/vibration';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  /** Hour (0–6) the app's day starts: answers before it count for the previous day (see `dayKey`). */
  dayStartHour: number;
  /** Upper bound of entertainment minutes a single unit (on the way to the minimums) can grant. */
  maxGrantMinutes: number;
  /**
   * Shortest work session in the day plan: each topic's work left is split into sessions of at least this length,
   * spread over the day (0 = one block per topic).
   */
  minSessionMinutes: number;
  /** Defaults for a new topic. */
  defaultMinutesPerUnit: number;
  /** Suggested minimum as a share of the target (0–1). */
  defaultUnlockShare: number;
  /** How many recent days the day log in «Статистика» shows (display only; entries are never pruned). */
  historyDays: number;
  theme: ThemeMode;
  blockedPackages: string[];
  remindersEnabled: boolean;
  reminderStartHour: number;
  reminderEndHour: number;
  reminderIntervalHours: number;
  /** Vibration of reminders and of study alarms (presets in src/logic/vibration.ts). */
  reminderVibration: VibrationKey;
  alarmVibration: VibrationKey;
  /** How often an alarm's vibration repeats (once, N times, until answered with a 5 s pause, nonstop). */
  alarmVibrationRepeat: VibrationRepeatKey;
  /** Alarm sound: '' = the phone's default alarm sound, 'silent' = none, else a content URI; title for display. */
  alarmSound: string;
  alarmSoundTitle: string;
  /** Daily copy into the folder picked in Settings (a copy inside the app is always made). */
  autoBackupEnabled: boolean;
  /** How many daily copies to keep in that folder. */
  autoBackupKeep: number;
  /** Full-screen alarm at the start of each evenly planned topic block (installed builds only). */
  alarmsEnabled: boolean;
  /** A topic's deadline missed without its target blocks the blocked apps until the end of the day. */
  deadlineFine: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dayStartHour: 0,
  maxGrantMinutes: 5,
  minSessionMinutes: 15,
  defaultMinutesPerUnit: 2,
  defaultUnlockShare: 0.2,
  historyDays: 14,
  theme: 'system',
  blockedPackages: [],
  remindersEnabled: true,
  reminderStartHour: 9,
  reminderEndHour: 21,
  reminderIntervalHours: 1,
  reminderVibration: 'default',
  alarmVibration: 'default',
  alarmVibrationRepeat: 'loop-pause',
  alarmSound: '',
  alarmSoundTitle: '',
  alarmsEnabled: true,
  deadlineFine: false,
  autoBackupEnabled: false,
  autoBackupKeep: 7,
};

const KV_KEY = 'settings';

interface SettingsState extends Settings {
  hydrate: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

function applyTheme(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrate: async () => {
    const stored = (await kvGet<Partial<Settings>>(KV_KEY)) ?? {};
    const next = { ...DEFAULT_SETTINGS, ...stored };
    setDayStartHour(next.dayStartHour);
    set(next);
    applyTheme(next.theme);
  },
  update: (patch) => {
    if (patch.dayStartHour != null) setDayStartHour(patch.dayStartHour);
    set(patch);
    if (patch.theme) applyTheme(patch.theme);
    const { hydrate: _h, update: _u, ...values } = get();
    void kvSet(KV_KEY, values);
  },
}));
