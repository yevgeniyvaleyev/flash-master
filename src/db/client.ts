import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { parseBackup, rowForSchema, type Backup } from '@/logic/backup';

// Fast Refresh re-runs this module after edits; opening a second connection releases the first one while other
// modules still hold it ("Cannot use shared object that was already released"). Keep one per JS runtime.
const cache = globalThis as typeof globalThis & { __flashmasterDb?: SQLite.SQLiteDatabase };
export const db = (cache.__flashmasterDb ??= SQLite.openDatabaseSync('flashmaster.db'));

export const DATABASE_VERSION = 10;

/** How long a statement waits for another connection's write lock before failing with "database is locked". */
const BUSY_TIMEOUT_MS = 5_000;

/**
 * Exclusive write transaction. expo-sqlite runs it on its own connection, which (like the main one) fails at once on a
 * concurrent write unless it has a busy timeout, so one is set first. Use this instead of `withExclusiveTransactionAsync`.
 */
export async function writeTransaction(task: (tx: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await task(tx);
  });
}

/** All user tables (everything but SQLite's own). */
export async function tableNames(): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  return rows.map((r) => r.name);
}

async function dropAllTables(): Promise<void> {
  const tables = await tableNames();
  await writeTransaction(async (tx) => {
    for (const name of tables) await tx.execAsync(`DROP TABLE IF EXISTS "${name}"`);
  });
  await db.execAsync('PRAGMA user_version = 0');
}

/**
 * Backup waiting to be restored (written by `requestRestore` in `src/backup/backup.ts`). It is applied on the next
 * start, before anything else touches the database.
 */
export const pendingRestoreFile = () => new File(Paths.document, 'restore-pending.json');
/** kv key with the error of the last failed restore (shown in Settings). */
export const RESTORE_ERROR_KEY = 'restoreError';

function takePendingRestore(): Backup | null {
  const file = pendingRestoreFile();
  if (!file.exists) return null;
  const parsed = parseBackup(file.textSync(), DATABASE_VERSION);
  if (parsed.ok) return parsed.backup;
  file.delete();
  return null;
}

/** Replaces the freshly migrated tables' rows with the backup's (only columns the current schema has). */
async function applyRestore(backup: Backup): Promise<void> {
  const existing = new Set(await tableNames());
  const columns = new Map<string, string[]>();
  for (const name of Object.keys(backup.tables)) {
    if (!existing.has(name)) continue;
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${name}")`);
    columns.set(
      name,
      info.map((c) => c.name),
    );
  }
  // Foreign keys are checked per statement: insert parents (topics) before entries.
  const order = [...columns.keys()].sort((a, b) => Number(b === 'topics') - Number(a === 'topics'));
  await writeTransaction(async (tx) => {
    for (const name of [...order].reverse()) await tx.runAsync(`DELETE FROM "${name}"`);
    for (const name of order) {
      const cols = columns.get(name)!;
      for (const row of backup.tables[name]) {
        const r = rowForSchema(row, cols);
        if (r.columns.length === 0) continue;
        await tx.runAsync(
          `INSERT INTO "${name}" (${r.columns.map((c) => `"${c}"`).join(', ')}) VALUES (${r.columns.map(() => '?').join(', ')})`,
          r.values as SQLite.SQLiteBindValue[],
        );
      }
    }
  });
}

/** Migrates the schema; a pending restore first drops everything and then fills the fresh tables from the backup. */
export async function migrate(): Promise<void> {
  const restore = takePendingRestore();
  if (restore) await dropAllTables();
  await runMigrations();
  if (!restore) return;
  try {
    await applyRestore(restore);
    pendingRestoreFile().delete();
    await kvSet(RESTORE_ERROR_KEY, null);
  } catch (e) {
    // Rolled back: start empty rather than retry a broken restore on every start. The pre-restore safety copy is in
    // the internal backups folder.
    pendingRestoreFile().delete();
    await kvSet(RESTORE_ERROR_KEY, String(e));
  }
}

/** Schema migrations by `PRAGMA user_version`; add a `if (version === n)` step for every change. */
async function runMigrations(): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
-- A topic: a daily norm of units of work (cards, pages, …). Archived topics keep their history.
CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  daily_target INTEGER NOT NULL,
  unlock_min INTEGER NOT NULL,
  minutes_per_unit REAL NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'count',
  position_total INTEGER,
  position_current INTEGER,
  linked_package TEXT,
  paused INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Units logged by hand; undo deletes the row. position: the page reached (book mode).
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  units INTEGER NOT NULL,
  position INTEGER
);
CREATE INDEX entries_day ON entries(day, topic_id);
-- Per-topic result of a day with the target/minimum that applied then (upserted on every background sync).
-- paused: the topic was paused that day (neither counts nor breaks its streak).
CREATE TABLE topic_days (
  day TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  target INTEGER NOT NULL,
  minimum INTEGER NOT NULL,
  done INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, topic_id)
);
-- The whole day's result: min_met = apps unlocked, target_met = every target reached (streak).
CREATE TABLE day_results (
  day TEXT PRIMARY KEY NOT NULL,
  min_done INTEGER NOT NULL,
  min_total INTEGER NOT NULL,
  target_done INTEGER NOT NULL,
  target_total INTEGER NOT NULL,
  min_met INTEGER NOT NULL,
  target_met INTEGER NOT NULL
);
CREATE TABLE kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
    version = 1;
  }

  if (version === 1) {
    // Each topic gets its own color (plan of the day, dashboard bars). NULL = palette color by id.
    await db.execAsync('ALTER TABLE topics ADD COLUMN color TEXT');
    version = 2;
  }

  if (version === 2) {
    // A finished topic (book read, course done): out of the daily norm, listed under «Завершённые», history kept.
    await db.execAsync('ALTER TABLE topics ADD COLUMN completed_at INTEGER');
    version = 3;
  }

  if (version === 3) {
    // Progress reset: the topic's statistics and total count only from this moment (entries are kept).
    await db.execAsync('ALTER TABLE topics ADD COLUMN reset_at INTEGER');
    version = 4;
  }

  if (version === 4) {
    // Per-topic cap of entertainment minutes one unit can grant; NULL = the global «Максимум минут за единицу».
    await db.execAsync('ALTER TABLE topics ADD COLUMN max_grant_minutes REAL');
    version = 5;
  }

  if (version === 5) {
    // Overall progress toward a topic's total (count mode): units done that aren't in the logged entries since the
    // reset (work done before the app, or a correction such as «cards learned» read from the flashcards app).
    await db.execAsync('ALTER TABLE topics ADD COLUMN done_before REAL NOT NULL DEFAULT 0');
    version = 6;
  }

  if (version === 6) {
    // Optional daily deadline of a topic in minutes after midnight (e.g. 900 = 15:00): its target counts only when
    // reached by then, and the day plan and alarms fit its work before it. NULL = the end of the reminder window.
    await db.execAsync('ALTER TABLE topics ADD COLUMN deadline_minutes INTEGER');
    version = 7;
  }

  if (version === 7) {
    // Topic icon (MaterialCommunityIcons name), shown in the topic's color instead of the dot. NULL = the dot.
    await db.execAsync('ALTER TABLE topics ADD COLUMN icon TEXT');
    version = 8;
  }

  if (version === 8) {
    // Web address opened in the browser from the topic screen (course page, online deck). NULL = none.
    await db.execAsync('ALTER TABLE topics ADD COLUMN link_url TEXT');
    version = 9;
  }

  if (version === 9) {
    // Weekdays a topic is active on (bitmask Mon = 1 … Sun = 64; NULL = every day): on other days it's out of the norm.
    // Credits: a topic's unfinished target moved to its next 1–2 active days (target/minimum: that day's values).
    await db.execAsync(`
ALTER TABLE topics ADD COLUMN weekdays INTEGER;
CREATE TABLE credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  day TEXT NOT NULL,
  days INTEGER NOT NULL,
  target REAL NOT NULL,
  minimum REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX credits_topic ON credits(topic_id, day);
`);
    version = 10;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

/** Foreign keys are off by default in SQLite; entries reference topics. */
export async function openDb(): Promise<void> {
  await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  await db.execAsync('PRAGMA foreign_keys = ON');
  await migrate();
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
