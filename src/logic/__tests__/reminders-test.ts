import { atHour } from '../budget';
import { setDayStartHour } from '../dates';
import { planReminders, reminderHours, reminderText } from '../reminders';

const window = { startHour: 9, endHour: 21, intervalHours: 1 };
const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m);

it('lists reminder hours inside the window', () => {
  expect(reminderHours(window)).toHaveLength(13);
  expect(reminderHours({ startHour: 9, endHour: 21, intervalHours: 3 })).toEqual([9, 12, 15, 18, 21]);
  expect(reminderHours({ startHour: 20, endHour: 8, intervalHours: 1 })).toEqual([]);
});

it('schedules only the rest of today while the goal is not met', () => {
  const plan = planReminders(window, 3, 1, at(14, 30), 1);
  expect(plan.map((r) => r.date.getHours())).toEqual([15, 16, 17, 18, 19, 20, 21]);
  expect(plan.every((r) => r.remaining === 2 && r.isToday)).toBe(true);
});

it('skips today once the goal is met but keeps the following days', () => {
  const plan = planReminders(window, 3, 3, at(10), 3);
  expect(plan.some((r) => r.isToday)).toBe(false);
  expect(plan).toHaveLength(26);
  expect(plan[0].date).toEqual(new Date(2026, 9, 12, 9));
  expect(plan.every((r) => r.remaining === 3)).toBe(true);
});

it('does not schedule a reminder for the current exact minute', () => {
  const plan = planReminders(window, 3, 0, at(9), 1);
  expect(plan[0].date.getHours()).toBe(10);
});

describe('reminderText', () => {
  const topics = [
    { name: 'Книга', unit: 'стр.', leftToMin: 2, leftToTarget: 12 },
    { name: 'Испанский', unit: 'карт.', leftToMin: 0, leftToTarget: 5 },
  ];

  it('lists what is left to unlock first', () => {
    expect(reminderText({ unlocked: false, topics })).toEqual({
      title: 'Минимум не выполнен',
      body: 'До разблокировки: Книга — 2 стр.',
    });
  });

  it('then what is left to the targets', () => {
    expect(reminderText({ unlocked: true, topics }).body).toBe('Осталось: Книга — 12 стр., Испанский — 5 карт.');
  });
});

describe('a working day past midnight', () => {
  afterEach(() => setDayStartHour(0));

  it('plans reminders after midnight on the same app day', () => {
    setDayStartHour(3);
    const now = new Date(2024, 0, 1, 22, 30);
    const plan = planReminders({ startHour: 9, endHour: 26, intervalHours: 1 }, 5, 0, now, 1);
    expect(plan.map((r) => r.date.getHours())).toEqual([23, 0, 1, 2]);
    expect(plan[1].date.getDate()).toBe(2);
  });

  it('puts the end of the working day on the next calendar day', () => {
    setDayStartHour(3);
    // 01:30 still belongs to Jan 1's app day; the day ends at 02:00 on Jan 2.
    expect(atHour(new Date(2024, 0, 2, 1, 30).getTime(), 26)).toBe(new Date(2024, 0, 2, 2).getTime());
    expect(atHour(new Date(2024, 0, 1, 20).getTime(), 24)).toBe(new Date(2024, 0, 2, 0).getTime());
  });
});
