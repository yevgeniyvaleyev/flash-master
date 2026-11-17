import { sessionCount, splitSessions, type SessionInput } from '../sessions';
import { nextTopicColor, TOPIC_COLORS } from '../topic-colors';

const MIN = 60_000;
const topic = (topicId: number, units: number, minutesPerUnit: number): SessionInput => ({
  topicId,
  name: `T${topicId}`,
  unit: 'стр.',
  color: TOPIC_COLORS[topicId],
  units,
  unitMs: minutesPerUnit * MIN,
});

describe('sessionCount', () => {
  it('makes sessions no shorter than the minimum', () => {
    expect(sessionCount(20, 2 * MIN, 15 * MIN)).toBe(2); // 40 min -> 2 × 20 min
    expect(sessionCount(30, 2 * MIN, 15 * MIN)).toBe(4); // 60 min -> 4 × 15 min
  });

  it('keeps a short remainder in one session and never splits a unit', () => {
    expect(sessionCount(5, 2 * MIN, 15 * MIN)).toBe(1);
    expect(sessionCount(3, 30 * MIN, 15 * MIN)).toBe(3);
  });

  it('does not split with a zero minimum or nothing left', () => {
    expect(sessionCount(20, 2 * MIN, 0)).toBe(1);
    expect(sessionCount(0, 2 * MIN, 15 * MIN)).toBe(0);
  });
});

describe('splitSessions', () => {
  it('splits whole units, larger sessions first', () => {
    const s = splitSessions([topic(1, 31, 2)], 15 * MIN); // 62 min -> 4 sessions: 8, 8, 8, 7
    expect(s.map((x) => x.units)).toEqual([8, 8, 8, 7]);
    expect(s[0].costMs).toBe(16 * MIN);
    expect(s[0].label).toBe('T1 · 8 стр. · ~16 мин');
    expect(s[0].color).toBe(TOPIC_COLORS[1]);
  });

  it('interleaves topics so each is spread over the day', () => {
    // A: 4 sessions at 1/8, 3/8, 5/8, 7/8; B: 2 sessions at 1/4, 3/4.
    const s = splitSessions([topic(1, 40, 1.5), topic(2, 15, 2)], 15 * MIN);
    expect(s.map((x) => x.topicId)).toEqual([1, 2, 1, 1, 2, 1]);
  });

  it('keeps topic order for equal positions', () => {
    const s = splitSessions([topic(1, 5, 2), topic(2, 5, 2)], 15 * MIN);
    expect(s.map((x) => x.topicId)).toEqual([1, 2]);
  });
});

describe('nextTopicColor', () => {
  it('takes the first unused palette color', () => {
    expect(nextTopicColor([])).toBe(TOPIC_COLORS[0]);
    expect(nextTopicColor([TOPIC_COLORS[0].toLowerCase(), TOPIC_COLORS[2]])).toBe(TOPIC_COLORS[1]);
  });
});
