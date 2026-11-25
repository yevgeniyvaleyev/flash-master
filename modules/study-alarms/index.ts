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
  /** The topic's deadline in minutes after midnight (the plan fits the item before it); -1 = none. */
  deadlineMinutes: number;
  /** The topic icon's character in the MaterialCommunityIcons font (alarm screen); '' = none. */
  icon: string;
  /** The topic's color (hex), for the icon. */
  color: string;
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
  /** The ring's vibration waveform ([off, on, off, …] ms; empty = none) and the index it repeats from (-1 = once). */
  vibrationTimings: number[];
  vibrationRepeat: number;
  /** Alarm sound: '' = the default alarm sound, 'silent' = none, else a content URI from getAlarmSounds. */
  sound: string;
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
  /**
   * Whether the alarm screen opens by itself while the phone is in use: needs the app blocker's accessibility service
   * or «Поверх других приложений». Without either, an alarm in use is only a heads-up notification.
   */
  canOpenAlarmScreen(): boolean;
  /** The phone's alarm sounds, then its ringtones. */
  getAlarmSounds(): { title: string; uri: string }[];
  /** Plays a sound for 5 seconds ('' = the default alarm sound). */
  previewSound(sound: string): void;
  stopPreview(): void;
  openOverlaySettings(): void;
  /** Rings a test alarm in a few seconds. */
  testAlarm(): void;
}

/** Native study alarms; null in Expo Go (Android-only local module). */
// Named apart from AlgoMaster's module (also "StudyAlarms" there): if this bundle is loaded into AlgoMaster's dev
// client, it finds nothing instead of overwriting AlgoMaster's alarms.
export const StudyAlarms = requireOptionalNativeModule<StudyAlarmsModule>('FlashMasterStudyAlarms');
