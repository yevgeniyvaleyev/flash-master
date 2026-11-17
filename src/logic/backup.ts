/**
 * Backup file format (pure, tested), the same as AlgoMaster's. A backup is a JSON snapshot of every user table of the
 * SQLite database (settings in `kv` included), restored on the next start by `migrate` in `src/db/client.ts`.
 */

export const BACKUP_APP = 'flashmaster';
export const BACKUP_FORMAT = 1;

export type BackupRow = Record<string, unknown>;

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  /** `PRAGMA user_version` of the database the snapshot was taken from. */
  dbVersion: number;
  createdAt: number;
  tables: Record<string, BackupRow[]>;
}

/** What the confirmation dialog shows about a backup. */
export interface BackupSummary {
  createdAt: number;
  /** Topics that weren't deleted (completed ones included). */
  topics: number;
  entries: number;
  /** Days with at least one entry. */
  historyDays: number;
}

export function buildBackup(tables: Record<string, BackupRow[]>, dbVersion: number, now: number): Backup {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, dbVersion, createdAt: now, tables };
}

export type ParsedBackup = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

/** Validates a backup file's text; `maxDbVersion` is the app's schema version (newer snapshots can't be restored). */
export function parseBackup(text: string, maxDbVersion: number): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Файл не является резервной копией (не JSON)' };
  }
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || typeof b.tables !== 'object' || b.tables == null)
    return { ok: false, error: 'Это не резервная копия FlashMaster' };
  if (b.format !== BACKUP_FORMAT) return { ok: false, error: `Неизвестный формат копии (${String(b.format)})` };
  if (typeof b.dbVersion !== 'number' || typeof b.createdAt !== 'number')
    return { ok: false, error: 'Копия повреждена' };
  if (b.dbVersion > maxDbVersion)
    return { ok: false, error: 'Копия сделана более новой версией приложения — сначала обнови приложение' };
  for (const rows of Object.values(b.tables)) if (!Array.isArray(rows)) return { ok: false, error: 'Копия повреждена' };
  const backup = b as Backup;
  return { ok: true, backup, summary: summarize(backup) };
}

function summarize(b: Backup): BackupSummary {
  const rows = (name: string) => b.tables[name] ?? [];
  const entries = rows('entries');
  return {
    createdAt: b.createdAt,
    topics: rows('topics').filter((t) => !t.archived).length,
    entries: entries.length,
    historyDays: new Set(entries.map((r) => r.day)).size,
  };
}

/**
 * The part of a backed-up row that fits the current schema: only columns that exist in both, so an older backup
 * restores into a newer database (new columns take their defaults) and dropped columns are ignored.
 */
export function rowForSchema(row: BackupRow, columns: readonly string[]): { columns: string[]; values: unknown[] } {
  const keys = columns.filter((c) => Object.prototype.hasOwnProperty.call(row, c));
  return { columns: keys, values: keys.map((k) => row[k] ?? null) };
}

const FILE_RE = /^flashmaster-(\d{4}-\d{2}-\d{2})\.json$/;

/** `flashmaster-YYYY-MM-DD.json` for a day key. */
export const backupFileName = (day: string) => `flashmaster-${day}.json`;

/** Our backup files beyond the newest `keep` (by the day in the name); other files are never touched. */
export function backupsToDelete(names: readonly string[], keep: number): string[] {
  return names
    .filter((n) => FILE_RE.test(n))
    .sort()
    .reverse()
    .slice(Math.max(0, keep));
}

/** Today's automatic copy is still missing. */
export const isBackupDue = (lastDay: string | null, today: string) => lastDay !== today;
