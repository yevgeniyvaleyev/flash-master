import { groupHistory, type HistoryEntry } from '../history';

const e = (id: number, day: string, ts: number, topicId: number, units: number): HistoryEntry => ({
  id,
  day,
  ts,
  units,
  topicId,
  topicName: topicId === 1 ? 'Книга' : 'Испанский',
  unit: topicId === 1 ? 'стр.' : 'карт.',
  position: null,
});

it('groups entries by day, newest first, with totals per topic and empty days kept', () => {
  const days = groupHistory(
    [e(1, '2026-11-17', 100, 1, 5), e(2, '2026-11-17', 300, 2, 3), e(3, '2026-11-17', 200, 1, 2)],
    ['2026-11-17', '2026-11-16'],
  );
  expect(days[0].items.map((i) => i.id)).toEqual([2, 3, 1]);
  expect(days[0].totals).toEqual([
    { topicId: 1, name: 'Книга', unit: 'стр.', units: 7 },
    { topicId: 2, name: 'Испанский', unit: 'карт.', units: 3 },
  ]);
  expect(days[1]).toMatchObject({ day: '2026-11-16', items: [], totals: [] });
});
