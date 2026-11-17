import { Appearance } from 'react-native';
import { create } from 'zustand';

import { kvGet, kvSet } from '@/db/client';
import { setDayStartHour } from '@/logic/dates';

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
  /** Daily copy into the folder picked in Settings (a copy inside the app is always made). */
  autoBackupEnabled: boolean;
  /** How many daily copies to keep in that folder. */
  autoBackupKeep: number;
  /** Full-screen alarm at the start of each evenly planned topic block (installed builds only). */
  alarmsEnabled: boolean;
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
  alarmsEnabled: true,
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
