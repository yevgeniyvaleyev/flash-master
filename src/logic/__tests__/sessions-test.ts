import { deadlineShare, sessionCount, splitSessions, type SessionInput } from '../sessions';
import { nextTopicColor, TOPIC_COLORS } from '../topic-colors';

const MIN = 60_000;
const topic = (topicId: number, units: number, minutesPerUnit: number): SessionInput => ({
  topicId,
  name: `T${topicId}`,
  unit: 'стр.',
  color: TOPIC_COLORS[topicId],
  units,
  unitMs: minutesPerUnit * MIN,
  deadline: null,
  deadlineMinutes: null,
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

describe('deadlines', () => {
  const window = { from: 0, end: 600 * MIN };

  it('is the share of the window before the deadline, 1 without one or once passed', () => {
    expect(deadlineShare(300 * MIN, window)).toBe(0.5);
    expect(deadlineShare(null, window)).toBe(1);
    expect(deadlineShare(0, window)).toBe(1);
    expect(deadlineShare(700 * MIN, window)).toBe(1);
  });

  it("moves a deadline topic's sessions into the part of the day before its deadline", () => {
    const a = topic(1, 4, 15); // 4 sessions over the whole day: 1/8, 3/8, 5/8, 7/8
    const b = { ...topic(2, 2, 15), deadline: 300 * MIN, deadlineMinutes: 900 }; // 2 sessions: 1/8, 3/8 of the day
    const order = splitSessions([a, b], 15 * MIN, window).map((s) => s.topicId);
    expect(order).toEqual([1, 2, 1, 2, 1, 1]);
    // Without a window the deadline is ignored: b at 1/4, 3/4.
    expect(splitSessions([a, b], 15 * MIN).map((s) => s.topicId)).toEqual([1, 2, 1, 1, 2, 1]);
  });
});
