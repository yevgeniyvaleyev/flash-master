/**
 * Vibration presets for alerts (settings «Вибрация» for reminders and «Вибрация будильника» for study alarms).
 * Patterns are Android's [wait, on, off, on, …] in ms. On Android 8+ a notification channel's vibration can't be
 * changed once created, so every preset gets its own channel (`channelId`) and the other ones are deleted.
 */

export type VibrationKey = 'default' | 'short' | 'double' | 'long' | 'pulse' | 'rising' | 'sos' | 'none';

export interface VibrationPreset {
  key: VibrationKey;
  label: string;
  pattern: number[];
}

const S = 150;
const L = 450;
const GAP = 150;

export const VIBRATIONS: readonly VibrationPreset[] = [
  { key: 'default', label: 'Обычная', pattern: [0, 800, 400, 800, 400] },
  { key: 'short', label: 'Короткая', pattern: [0, 200] },
  { key: 'double', label: 'Двойная', pattern: [0, 150, 120, 150] },
  { key: 'long', label: 'Долгая', pattern: [0, 1500, 500, 1500] },
  { key: 'pulse', label: 'Пульс', pattern: [0, 120, 100, 120, 600, 120, 100, 120] },
  { key: 'rising', label: 'Нарастающая', pattern: [0, 100, 300, 300, 300, 600, 300, 1000] },
  { key: 'sos', label: 'SOS', pattern: [0, S, GAP, S, GAP, S, GAP * 2, L, GAP, L, GAP, L, GAP * 2, S, GAP, S, GAP, S] },
  { key: 'none', label: 'Без вибрации', pattern: [] },
];

export function vibrationOf(key: string | null | undefined): VibrationPreset {
  return VIBRATIONS.find((v) => v.key === key) ?? VIBRATIONS[0];
}

/** Notification channel for `base` ('reminders', 'study-alarms') with this preset's vibration. */
export const channelId = (base: string, key: VibrationKey) => `${base}-${key}`;

// ---------- Repetition (study alarms) ----------

export type VibrationRepeatKey = '1' | '2' | '3' | '5' | '10' | 'loop-pause' | 'loop';

export interface VibrationRepeat {
  key: VibrationRepeatKey;
  label: string;
  /** Times the pattern plays; null = until the alarm is answered (or stops ringing). */
  count: number | null;
  /** Pause between repetitions, ms. */
  pauseMs: number;
}

/** Pause between counted repetitions. */
const COUNT_GAP_MS = 1000;

export const VIBRATION_REPEATS: readonly VibrationRepeat[] = [
  { key: '1', label: '1 раз', count: 1, pauseMs: 0 },
  { key: '2', label: '2 раза', count: 2, pauseMs: COUNT_GAP_MS },
  { key: '3', label: '3 раза', count: 3, pauseMs: COUNT_GAP_MS },
  { key: '5', label: '5 раз', count: 5, pauseMs: COUNT_GAP_MS },
  { key: '10', label: '10 раз', count: 10, pauseMs: COUNT_GAP_MS },
  { key: 'loop-pause', label: 'Пока не отвечу, пауза 5 с', count: null, pauseMs: 5000 },
  { key: 'loop', label: 'Пока не отвечу, без пауз', count: null, pauseMs: 0 },
];

export function vibrationRepeatOf(key: string | null | undefined): VibrationRepeat {
  return VIBRATION_REPEATS.find((r) => r.key === key) ?? VIBRATION_REPEATS.find((r) => r.key === 'loop-pause')!;
}

/** Android waveform: alternating off/on timings (starting with off) and the index to repeat from (-1 = once). */
export interface Waveform {
  timings: number[];
  repeat: number;
}

/** Appends `b` to `a` with `gap` ms of stillness between them, keeping the off/on alternation. */
function concat(a: number[], b: readonly number[], gap: number): number[] {
  if (b.length === 0) return a;
  const out = [...a];
  if (out.length % 2 === 1) {
    // `a` ends with an "off": stretch it by the gap and b's leading wait.
    out[out.length - 1] += gap + b[0];
  } else {
    out.push(gap + b[0]);
  }
  out.push(...b.slice(1));
  return out;
}

/**
 * The full vibration of one ring: the preset `pattern` played `repeat.count` times with `repeat.pauseMs` between
 * them, or (count null) repeated from the start with that pause until it's cancelled. Empty for no vibration.
 */
export function vibrationWaveform(pattern: readonly number[], repeat: VibrationRepeat): Waveform {
  if (pattern.length < 2) return { timings: [], repeat: -1 };
  if (repeat.count == null) {
    // One cycle = the pattern, then the pause as a trailing "off"; the waveform repeats from its start.
    const timings = [...pattern];
    if (timings.length % 2 === 1) timings[timings.length - 1] += repeat.pauseMs;
    else timings.push(repeat.pauseMs);
    return { timings, repeat: 0 };
  }
  let timings = [...pattern];
  for (let i = 1; i < repeat.count; i++) timings = concat(timings, pattern, repeat.pauseMs);
  return { timings, repeat: -1 };
}
