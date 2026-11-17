import { requireOptionalNativeModule } from 'expo';

export interface BlockerConfig {
  /** Blocking is active only when at least one app is selected. */
  enabled: boolean;
  blockedPackages: string[];
  /** Units required today to unlock: Σ minimums of the active topics (see src/logic/goal.ts). */
  dailyGoal: number;
  /** Units done toward the minimums; learnedToday >= dailyGoal unblocks everything. */
  learnedToday: number;
  /** Entertainment time granted today by learning (see src/logic/budget.ts). */
  grantedMs: number;
  /** End of the learning day (epoch ms); the goal must be reachable by then. */
  deadlineMs: number;
  /** Time reserved for the units still left to the minimums. */
  reserveMs: number;
  /** Local day ('YYYY-MM-DD') that learnedToday refers to. */
  day: string;
  /** Hour the app's day starts (setting «Новый день с»); the native "today" is shifted by it. */
  dayStartHour: number;
}

export interface LaunchableApp {
  packageName: string;
  label: string;
}

interface AppBlockerModule {
  setConfig(config: BlockerConfig): void;
  /** Time spent in blocked apps today (finished sessions). */
  getUsedMs(): number;
  isServiceEnabled(): boolean;
  openAccessibilitySettings(): void;
  openAppSettings(): void;
  /** Opens another app (a topic's linked app); false when it can't be launched. */
  launchApp(packageName: string): boolean;
  getLaunchableApps(): Promise<LaunchableApp[]>;
}

/** Native app blocker; null in Expo Go and on platforms without the module (it is Android-only). */
// Named apart from AlgoMaster's module (also "AppBlocker" there): if this bundle is loaded into AlgoMaster's dev
// client, it finds nothing instead of overwriting AlgoMaster's blocker config.
export const AppBlocker = requireOptionalNativeModule<AppBlockerModule>('FlashMasterAppBlocker');
