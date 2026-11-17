import { requireOptionalNativeModule } from 'expo';

/** One topic's remaining work (one planned block / alarm). */
export interface AlarmItem {
  /** Topic id; the alarm's «Начать» opens flashmaster://topic/<slug>. */
  slug: string;
  /** Topic name. */
  title: string;
  /** Ready-made label shown next to the title (e.g. «12 стр.»); the native side adds the minutes. */
  difficulty: string;
  /** Estimated time for the work. */
  costMs: number;
}

export interface StudyAlarmsConfig {
  enabled: boolean;
  /** Learning day; the native side plans today and, once today is done, tomorrow from these hours. */
  startHour: number;
  endHour: number;
  goal: number;
  learnedToday: number;
  /** Local day ('YYYY-MM-DD') that learnedToday refers to. */
  day: string;
  /** Hour the app's day starts (setting «Новый день с»); the native "today" and plan hours are shifted by it. */
  dayStartHour: number;
  /** Topics with work left today (up to their targets), in display order. */
  upcoming: AlarmItem[];
  /** A fresh day's full targets: planned for tomorrow, or once the stored day is over. */
  tomorrowGoal: number;
  tomorrow: AlarmItem[];
}

export interface NextAlarm {
  at: number;
  slug: string;
  title: string;
}

interface StudyAlarmsModule {
  /** Saves the inputs and reschedules the next alarm (see src/logic/study-plan.ts, mirrored in StudyPlan.kt). */
  setConfig(config: StudyAlarmsConfig): void;
  getNextAlarm(): NextAlarm | null;
  /** Android 14+ may deny full-screen alarms; they then show as a heads-up notification. */
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
  /** Rings a test alarm in a few seconds. */
  testAlarm(): void;
}

/** Native study alarms; null in Expo Go (Android-only local module). */
// Named apart from AlgoMaster's module (also "StudyAlarms" there): if this bundle is loaded into AlgoMaster's dev
// client, it finds nothing instead of overwriting AlgoMaster's alarms.
export const StudyAlarms = requireOptionalNativeModule<StudyAlarmsModule>('FlashMasterStudyAlarms');
