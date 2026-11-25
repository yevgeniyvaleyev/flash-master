import { addDays, dayKey } from '@/logic/dates';
import { dayProgress, type DayProgress, type Entry, type Topic, type TopicMode } from '@/logic/goal';
import type { HistoryEntry } from '@/logic/history';
import type { DayResults } from '@/logic/progress';
import type { TopicDay } from '@/logic/stats';
import { normalizeUrl } from '@/logic/links';
import { dayRules, doneKey, EVERY_DAY, nextDay, type Credit, type DayRule } from '@/logic/day-rules';
import { colorForId, nextTopicColor } from '@/logic/topic-colors';

import { db, writeTransaction } from './client';

// ---------- Topics ----------

interface TopicRow {
  id: number;
  name: string;
  unit: string;
  daily_target: number;
  unlock_min: number;
  minutes_per_unit: number;
  max_grant_minutes: number | null;
  step: number;
  mode: string;
  position_total: number | null;
  position_current: number | null;
  done_before: number | null;
  deadline_minutes: number | null;
  linked_package: string | null;
  link_url: string | null;
  color: string | null;
  icon: string | null;
  weekdays: number | null;
  paused: number;
  completed_at: number | null;
  reset_at: number | null;
  archived: number;
  sort_order: number;
}

const toTopic = (r: TopicRow): Topic => ({
  id: r.id,
  name: r.name,
  unit: r.unit,
  dailyTarget: r.daily_target,
  unlockMin: r.unlock_min,
  minutesPerUnit: r.minutes_per_unit,
  maxGrantMinutes: r.max_grant_minutes,
  step: r.step,
  mode: r.mode === 'position' ? 'position' : 'count',
  positionTotal: r.position_total,
  positionCurrent: r.position_current,
  doneBefore: r.done_before ?? 0,
  deadlineMinutes: r.deadline_minutes,
  linkedPackage: r.linked_package,
  linkUrl: r.link_url,
  color: r.color ?? colorForId(r.id),
  icon: r.icon,
  weekdays: r.weekdays,
  paused: r.paused === 1,
  completedAt: r.completed_at,
  resetAt: r.reset_at,
  archived: r.archived === 1,
  sortOrder: r.sort_order,
});

/** Topics in display order; archived ones only when asked. */
export async function listTopics(includeArchived = false): Promise<Topic[]> {
  const rows = await db.getAllAsync<TopicRow>(
    `SELECT * FROM topics ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY sort_order, id`,
  );
  return rows.map(toTopic);
}

export async function getTopic(id: number): Promise<Topic | null> {
  const row = await db.getFirstAsync<TopicRow>('SELECT * FROM topics WHERE id = ?', id);
  return row ? toTopic(row) : null;
}

export interface TopicInput {
  name: string;
  unit: string;
  dailyTarget: number;
  unlockMin: number;
  minutesPerUnit: number;
  /** null = the global setting. */
  maxGrantMinutes: number | null;
  step: number;
  mode: TopicMode;
  positionTotal: number | null;
  positionCurrent: number | null;
  linkedPackage: string | null;
  /** Web address (normalized; anything but http(s) is dropped). */
  linkUrl: string | null;
  /** Daily deadline in minutes after midnight; null = none. */
  deadlineMinutes: number | null;
  /** null: the next unused palette color (new topic) or unchanged (edit). */
  color: string | null;
  /** Icon name (validated by the form against the icon font); null = the color dot. */
  icon: string | null;
  /** Weekday bitmask (Mon = 1 … Sun = 64); null or 127 = every day. */
  weekdays: number | null;
  paused: boolean;
}

const clampInput = (t: TopicInput) => {
  const target = Math.max(1, Math.round(t.dailyTarget));
  return {
    name: t.name.trim() || 'Тема',
    unit: t.unit.trim() || 'ед.',
    target,
    min: Math.max(0, Math.min(target, Math.round(t.unlockMin))),
    minutes: Math.max(0, t.minutesPerUnit),
    maxGrant: t.maxGrantMinutes == null ? null : Math.max(0, t.maxGrantMinutes),
    step: Math.max(1, Math.round(t.step)),
    mode: t.mode,
    total: t.positionTotal != null ? Math.max(1, Math.round(t.positionTotal)) : null,
    current: t.mode === 'position' && t.positionCurrent != null ? Math.max(0, Math.round(t.positionCurrent)) : null,
    linked: t.linkedPackage || null,
    link: normalizeUrl(t.linkUrl),
    deadline: t.deadlineMinutes == null ? null : Math.max(0, Math.min(1439, Math.round(t.deadlineMinutes))),
    color: t.color && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : null,
    icon: t.icon && /^[a-z0-9-]{1,64}$/.test(t.icon) ? t.icon : null,
    weekdays:
      t.weekdays == null || (t.weekdays & EVERY_DAY) === EVERY_DAY || (t.weekdays & EVERY_DAY) === 0
        ? null
        : t.weekdays & EVERY_DAY,
    paused: t.paused ? 1 : 0,
  };
};

export async function createTopic(input: TopicInput, now: number = Date.now()): Promise<number> {
  const t = clampInput(input);
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM topics');
  const color = t.color ?? nextTopicColor((await listTopics()).map((x) => x.color));
  const r = await db.runAsync(
    `INSERT INTO topics (name, unit, daily_target, unlock_min, minutes_per_unit, max_grant_minutes, step, mode,
       position_total, position_current, linked_package, link_url, deadline_minutes, color, icon, weekdays, paused,
       sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.name,
    t.unit,
    t.target,
    t.min,
    t.minutes,
    t.maxGrant,
    t.step,
    t.mode,
    t.total,
    t.current,
    t.linked,
    t.link,
    t.deadline,
    color,
    t.icon,
    t.weekdays,
    t.paused,
    (max?.m ?? 0) + 1,
    now,
  );
  return r.lastInsertRowId;
}

export async function updateTopic(id: number, input: TopicInput): Promise<void> {
  const t = clampInput(input);
  await db.runAsync(
    `UPDATE topics SET name = ?, unit = ?, daily_target = ?, unlock_min = ?, minutes_per_unit = ?,
       max_grant_minutes = ?, step = ?, mode = ?,
       position_total = ?, position_current = ?, linked_package = ?, link_url = ?, deadline_minutes = ?,
       color = COALESCE(?, color), icon = ?, weekdays = ?, paused = ?
     WHERE id = ?`,
    t.name,
    t.unit,
    t.target,
    t.min,
    t.minutes,
    t.maxGrant,
    t.step,
    t.mode,
    t.total,
    t.current,
    t.linked,
    t.link,
    t.deadline,
    t.color,
    t.icon,
    t.weekdays,
    t.paused,
    id,
  );
}

export async function setTopicPaused(id: number, paused: boolean): Promise<void> {
  await db.runAsync('UPDATE topics SET paused = ? WHERE id = ?', paused ? 1 : 0, id);
}

/** Marks the topic as fully finished (`at`), or back in progress (null). */
export async function setTopicCompleted(id: number, at: number | null): Promise<void> {
  await db.runAsync('UPDATE topics SET completed_at = ? WHERE id = ?', at, id);
}

/**
 * Starts the topic's progress over: statistics and the total count from `at` on; entries and the day log stay.
 * `start` is where the overall progress starts: the page in book mode (null leaves it), the units already done in
 * count mode (null = 0).
 */
export async function resetTopicProgress(id: number, at: number, start: number | null): Promise<void> {
  const n = start == null ? null : Math.max(0, Math.round(start));
  await db.runAsync(
    `UPDATE topics SET reset_at = ?,
       position_current = CASE WHEN mode = 'position' THEN COALESCE(?, position_current) ELSE position_current END,
       done_before = CASE WHEN mode = 'position' THEN done_before ELSE COALESCE(?, 0) END
     WHERE id = ?`,
    at,
    n,
    n,
    id,
  );
}

/** Count mode: sets the units toward the total not covered by the entries since the reset (may be negative). */
export async function setTopicDoneBefore(id: number, units: number): Promise<void> {
  await db.runAsync('UPDATE topics SET done_before = ? WHERE id = ?', units, id);
}

/** Hides the topic everywhere except history and statistics. */
export async function archiveTopic(id: number): Promise<void> {
  await db.runAsync('UPDATE topics SET archived = 1 WHERE id = ?', id);
}

/** Swaps the topic with its neighbour in display order (`dir` −1 = up), among topics of the same status. */
export async function moveTopic(id: number, dir: -1 | 1): Promise<void> {
  const all = await listTopics();
  const done = all.find((t) => t.id === id)?.completedAt != null;
  const topics = all.filter((t) => (t.completedAt != null) === done);
  const i = topics.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= topics.length) return;
  const order = topics.map((t) => t.id);
  [order[i], order[j]] = [order[j], order[i]];
  await writeTransaction(async (tx) => {
    // Reuse this group's sort_order slots so the other group's order stays as it is.
    const slots = topics.map((t) => t.sortOrder).sort((a, b) => a - b);
    for (let k = 0; k < order.length; k++) {
      await tx.runAsync('UPDATE topics SET sort_order = ? WHERE id = ?', slots[k], order[k]);
    }
  });
}

// ---------- Entries ----------

interface EntryRow {
  id: number;
  topic_id: number;
  day: string;
  ts: number;
  units: number;
  position: number | null;
}

const toEntry = (r: EntryRow): Entry => ({
  id: r.id,
  topicId: r.topic_id,
  day: r.day,
  ts: r.ts,
  units: r.units,
  position: r.position,
});

/** Logs `units` for today. In book mode `position` is the page reached and becomes the topic's current page. */
export async function addEntry(
  topicId: number,
  units: number,
  position: number | null = null,
  now: number = Date.now(),
): Promise<void> {
  const n = Math.round(units);
  if (n <= 0) return;
  await writeTransaction(async (tx) => {
    await tx.runAsync(
      'INSERT INTO entries (topic_id, day, ts, units, position) VALUES (?, ?, ?, ?, ?)',
      topicId,
      dayKey(new Date(now)),
      now,
      n,
      position,
    );
    if (position != null) await tx.runAsync('UPDATE topics SET position_current = ? WHERE id = ?', position, topicId);
  });
}

/** Removes an entry; in book mode the current page moves back by its units. */
export async function deleteEntry(id: number): Promise<void> {
  await writeTransaction(async (tx) => {
    const e = await tx.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
    if (!e) return;
    await tx.runAsync('DELETE FROM entries WHERE id = ?', id);
    if (e.position != null) {
      await tx.runAsync(
        'UPDATE topics SET position_current = MAX(0, COALESCE(position_current, 0) - ?) WHERE id = ?',
        e.units,
        e.topic_id,
      );
    }
  });
}

export async function getEntries(day: string): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE day = ? ORDER BY ts, id', day);
  return rows.map(toEntry);
}

/** Units logged per topic over all time. */
/** Units per topic since its progress reset (all time without one). */
export async function getTopicTotals(): Promise<Record<number, number>> {
  const rows = await db.getAllAsync<{ topic_id: number; n: number }>(
    `SELECT e.topic_id, SUM(e.units) AS n FROM entries e JOIN topics t ON t.id = e.topic_id
     WHERE e.ts >= COALESCE(t.reset_at, 0) GROUP BY e.topic_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.topic_id, r.n]));
}

// ---------- Today ----------

export interface Today {
  day: string;
  /** Non-archived topics in display order (paused included). */
  topics: Topic[];
  entries: Entry[];
  progress: DayProgress;
  /** Each topic's rule today: weekday, credit (see day-rules.ts). */
  rules: Map<number, DayRule>;
  /** Tomorrow's rules (alarms and reminders plan the next day with them). */
  tomorrow: Map<number, DayRule>;
}

/** How far back credits and their days' work are loaded (a credit's last day is at most 2 active days on). */
const CREDIT_LOOKBACK_DAYS = 21;

/** Everything about today's norm in one load. */
export async function loadToday(today: Date = new Date()): Promise<Today> {
  const day = dayKey(today);
  const since = dayKey(addDays(today, -CREDIT_LOOKBACK_DAYS));
  const [topics, entries, credits, done] = await Promise.all([
    listTopics(),
    getEntries(day),
    listCredits(since),
    getDoneByDay(since),
  ]);
  const rules = dayRules(topics, credits, done, day);
  const tomorrow = dayRules(topics, credits, done, nextDay(day));
  return { day, topics, entries, progress: dayProgress(topics, entries, today.getTime(), rules), rules, tomorrow };
}

// ---------- Credits ----------

/** Credits taken on `sinceDay` or later. */
export async function listCredits(sinceDay: string): Promise<Credit[]> {
  const rows = await db.getAllAsync<{
    id: number;
    topic_id: number;
    day: string;
    days: number;
    target: number;
    minimum: number;
  }>('SELECT * FROM credits WHERE day >= ? ORDER BY day, id', sinceDay);
  return rows.map((r) => ({
    id: r.id,
    topicId: r.topic_id,
    day: r.day,
    days: r.days,
    target: r.target,
    minimum: r.minimum,
  }));
}

/** Units per topic per day since `sinceDay` (keys from `doneKey`). */
async function getDoneByDay(sinceDay: string): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ topic_id: number; day: string; n: number }>(
    'SELECT topic_id, day, SUM(units) AS n FROM entries WHERE day >= ? GROUP BY topic_id, day',
    sinceDay,
  );
  return new Map(rows.map((r) => [doneKey(r.topic_id, r.day), r.n]));
}

/** Takes a credit on the topic today: its unfinished target moves to its next `days` (1–2) active days. */
export async function addCredit(
  topicId: number,
  days: number,
  target: number,
  minimum: number,
  now: number = Date.now(),
): Promise<void> {
  await db.runAsync(
    'INSERT INTO credits (topic_id, day, days, target, minimum, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    topicId,
    dayKey(new Date(now)),
    Math.max(1, Math.min(2, Math.round(days))),
    target,
    minimum,
    now,
  );
}

/** Cancels a credit (only offered on the day it was taken). */
export async function deleteCredit(id: number): Promise<void> {
  await db.runAsync('DELETE FROM credits WHERE id = ?', id);
}

/** Upserts the day's per-topic results and the day's totals (streak, charts, statistics). */
export async function saveDayResults(t: Today): Promise<void> {
  const { day, progress } = t;
  const byTopic = new Map(progress.topics.map((p) => [p.topicId, p]));
  await writeTransaction(async (tx) => {
    for (const topic of t.topics) {
      const p = byTopic.get(topic.id);
      const done = t.entries.filter((e) => e.topicId === topic.id).reduce((s, e) => s + e.units, 0);
      await tx.runAsync(
        `INSERT INTO topic_days (day, topic_id, target, minimum, done, paused) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, topic_id) DO UPDATE SET target = excluded.target, minimum = excluded.minimum,
           done = excluded.done, paused = excluded.paused`,
        day,
        topic.id,
        p?.target ?? topic.dailyTarget,
        p?.minimum ?? topic.unlockMin,
        done,
        p ? 0 : 1,
      );
    }
    await tx.runAsync(
      `INSERT INTO day_results (day, min_done, min_total, target_done, target_total, min_met, target_met)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET min_done = excluded.min_done, min_total = excluded.min_total,
         target_done = excluded.target_done, target_total = excluded.target_total, min_met = excluded.min_met,
         target_met = excluded.target_met`,
      day,
      progress.minDone,
      progress.minTotal,
      progress.targetDone,
      progress.targetTotal,
      progress.unlocked ? 1 : 0,
      progress.targetMet ? 1 : 0,
    );
  });
}

export interface DayResultRow {
  day: string;
  minDone: number;
  minTotal: number;
  targetDone: number;
  targetTotal: number;
  minMet: boolean;
  targetMet: boolean;
}

export async function getDayResultRows(days: number, today: Date = new Date()): Promise<Record<string, DayResultRow>> {
  const rows = await db.getAllAsync<{
    day: string;
    min_done: number;
    min_total: number;
    target_done: number;
    target_total: number;
    min_met: number;
    target_met: number;
  }>('SELECT * FROM day_results WHERE day >= ?', dayKey(addDays(today, -days)));
  return Object.fromEntries(
    rows.map((r) => [
      r.day,
      {
        day: r.day,
        minDone: r.min_done,
        minTotal: r.min_total,
        targetDone: r.target_done,
        targetTotal: r.target_total,
        minMet: r.min_met === 1,
        targetMet: r.target_met === 1,
      },
    ]),
  );
}

/** Day → every target met (null when nothing was active that day), for the streak. */
export async function getDayResults(days: number, today: Date = new Date()): Promise<DayResults> {
  const rows = await getDayResultRows(days, today);
  return Object.fromEntries(Object.values(rows).map((r) => [r.day, r.targetTotal === 0 ? null : r.targetMet]));
}

export async function getTopicDays(days: number, today: Date = new Date()): Promise<TopicDay[]> {
  const rows = await db.getAllAsync<{
    day: string;
    topic_id: number;
    target: number;
    minimum: number;
    done: number;
    paused: number;
  }>('SELECT * FROM topic_days WHERE day >= ?', dayKey(addDays(today, -days)));
  return rows.map((r) => ({
    day: r.day,
    topicId: r.topic_id,
    target: r.target,
    minimum: r.minimum,
    done: r.done,
    paused: r.paused === 1,
  }));
}

/** Entries of the last `days` days with their topic, for the day log. */
export async function getHistory(days: number, today: Date = new Date()): Promise<HistoryEntry[]> {
  const rows = await db.getAllAsync<EntryRow & { name: string | null; unit: string | null }>(
    `SELECT e.*, t.name, t.unit FROM entries e LEFT JOIN topics t ON t.id = e.topic_id
     WHERE e.day >= ? ORDER BY e.ts DESC`,
    dayKey(addDays(today, -(days - 1))),
  );
  return rows.map((r) => ({
    id: r.id,
    day: r.day,
    ts: r.ts,
    units: r.units,
    topicId: r.topic_id,
    topicName: r.name ?? 'Удалённая тема',
    unit: r.unit ?? '',
    position: r.position,
  }));
}
