import { channelId, VIBRATIONS, vibrationOf, vibrationRepeatOf, vibrationWaveform } from '../vibration';

describe('vibration presets', () => {
  it('have valid Android patterns', () => {
    for (const v of VIBRATIONS) {
      expect(v.pattern.every((ms) => Number.isInteger(ms) && ms >= 0)).toBe(true);
      if (v.key === 'none') expect(v.pattern).toEqual([]);
      else expect(v.pattern[0]).toBe(0);
    }
    expect(new Set(VIBRATIONS.map((v) => v.key)).size).toBe(VIBRATIONS.length);
  });

  it('keeps the old alarm pattern as the default and falls back to it', () => {
    expect(vibrationOf('default').pattern).toEqual([0, 800, 400, 800, 400]);
    expect(vibrationOf('nope').key).toBe('default');
    expect(vibrationOf(undefined).key).toBe('default');
    expect(vibrationOf('sos').label).toBe('SOS');
  });

  it('names a channel per preset', () => {
    expect(channelId('reminders', 'pulse')).toBe('reminders-pulse');
  });
});

describe('vibrationWaveform', () => {
  const p = [0, 200, 100, 200]; // ends with "on"
  const odd = [0, 800, 400, 800, 400]; // ends with "off"

  it('plays once', () => {
    expect(vibrationWaveform(p, vibrationRepeatOf('1'))).toEqual({ timings: p, repeat: -1 });
  });

  it('repeats a set number of times with a pause, keeping off/on alternation', () => {
    expect(vibrationWaveform(p, vibrationRepeatOf('2'))).toEqual({
      timings: [0, 200, 100, 200, 1000, 200, 100, 200],
      repeat: -1,
    });
    expect(vibrationWaveform(odd, vibrationRepeatOf('2')).timings).toEqual([
      0, 800, 400, 800, 1400, 800, 400, 800, 400,
    ]);
    const ten = vibrationWaveform(p, vibrationRepeatOf('10')).timings;
    expect(ten.filter((_, i) => i % 2 === 1 && i > 0).reduce((s, x) => s + x, 0)).toBe(10 * 400);
  });

  it('loops from the start with the pause at the end of each cycle', () => {
    expect(vibrationWaveform(p, vibrationRepeatOf('loop-pause'))).toEqual({
      timings: [0, 200, 100, 200, 5000],
      repeat: 0,
    });
    expect(vibrationWaveform(odd, vibrationRepeatOf('loop-pause'))).toEqual({
      timings: [0, 800, 400, 800, 5400],
      repeat: 0,
    });
    expect(vibrationWaveform(odd, vibrationRepeatOf('loop'))).toEqual({ timings: odd, repeat: 0 });
  });

  it('is empty without vibration and defaults to the loop with a pause', () => {
    expect(vibrationWaveform([], vibrationRepeatOf('3'))).toEqual({ timings: [], repeat: -1 });
    expect(vibrationRepeatOf('nope').key).toBe('loop-pause');
  });
});
