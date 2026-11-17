import { addDays, calendarKey, dayKey } from './dates';

/** One logged entry with its topic, for the day log. */
export interface HistoryEntry {
  id: number;
  day: string;
  ts: number;
  units: number;
  topicId: number;
  topicName: string;
  unit: string;
  /** Page reached (book mode). */
  position: number | null;
}

export interface HistoryDay {
  day: string;
  date: Date;
  /** Newest first. */
  items: HistoryEntry[];
  /** Units per topic that day, in first-logged order. */
  totals: { topicId: number; name: string; unit: string; units: number }[];
}

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Groups entries by day for the given day keys (in that order), keeping empty days. */
export function groupHistory(rows: readonly HistoryEntry[], dayKeys: readonly string[]): HistoryDay[] {
  const byDay = new Map<string, HistoryEntry[]>();
  for (const r of rows) {
    const list = byDay.get(r.day) ?? [];
    list.push(r);
    byDay.set(r.day, list);
  }
  return dayKeys.map((day) => {
    const [y, m, d] = day.split('-').map(Number);
    const items = [...(byDay.get(day) ?? [])].sort((a, b) => b.ts - a.ts);
    const totals = new Map<number, HistoryDay['totals'][number]>();
    for (const e of [...items].reverse()) {
      const t = totals.get(e.topicId) ?? { topicId: e.topicId, name: e.topicName, unit: e.unit, units: 0 };
      t.units += e.units;
      totals.set(e.topicId, t);
    }
    return { day, date: new Date(y, m - 1, d), items, totals: [...totals.values()] };
  });
}

/** «Сегодня, 14 октября», «Вчера, 13 октября», «Понедельник, 12 октября» (+ the year when it differs). */
export function formatDayHeader(date: Date, today: Date = new Date()): string {
  const key = calendarKey(date);
  const name =
    key === dayKey(today) ? 'Сегодня' : key === dayKey(addDays(today, -1)) ? 'Вчера' : WEEKDAYS[date.getDay()];
  return `${name}, ${formatDayMonth(date, today)}`;
}

/** «14 октября» (+ the year when it differs from today's). */
export function formatDayMonth(date: Date, today: Date = new Date()): string {
  const year = date.getFullYear() !== today.getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}
