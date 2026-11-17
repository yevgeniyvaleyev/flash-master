import { backupFileName, backupsToDelete, buildBackup, isBackupDue, parseBackup, rowForSchema } from '../backup';

const tables = {
  topics: [
    { id: 1, name: 'Книга', archived: 0 },
    { id: 2, name: 'Старое', archived: 1 },
  ],
  entries: [
    { id: 1, topic_id: 1, day: '2026-11-16', ts: 1, units: 5 },
    { id: 2, topic_id: 1, day: '2026-11-17', ts: 2, units: 3 },
    { id: 3, topic_id: 1, day: '2026-11-17', ts: 3, units: 2 },
  ],
  kv: [{ key: 'settings', value: '{}' }],
};

describe('parseBackup', () => {
  it('accepts its own backups and summarizes them', () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(tables, 4, 1000)), 4);
    expect(parsed).toMatchObject({ ok: true, summary: { createdAt: 1000, topics: 1, entries: 3, historyDays: 2 } });
  });

  it('restores older schema versions', () => {
    expect(parseBackup(JSON.stringify(buildBackup(tables, 2, 1)), 4).ok).toBe(true);
  });

  it('rejects other files (AlgoMaster too), unknown formats and newer schemas', () => {
    expect(parseBackup('not json', 4)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ ...buildBackup(tables, 4, 1), app: 'algomaster' }), 4)).toMatchObject({
      ok: false,
      error: 'Это не резервная копия FlashMaster',
    });
    expect(parseBackup(JSON.stringify({ ...buildBackup(tables, 4, 1), format: 9 }), 4).ok).toBe(false);
    expect(parseBackup(JSON.stringify(buildBackup(tables, 5, 1)), 4)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify(buildBackup({ topics: {} as never }, 4, 1)), 4).ok).toBe(false);
  });
});

describe('rowForSchema', () => {
  it('keeps only columns of the current schema', () => {
    expect(rowForSchema({ id: 1, old: 1, color: null }, ['id', 'color', 'reset_at'])).toEqual({
      columns: ['id', 'color'],
      values: [1, null],
    });
  });
});

describe('backup files', () => {
  it('names files by day and keeps the newest ones', () => {
    expect(backupFileName('2026-11-17')).toBe('flashmaster-2026-11-17.json');
    const names = [
      'flashmaster-2026-11-10.json',
      'algomaster-2026-11-01.json',
      'flashmaster-2026-11-13.json',
      'flashmaster-2026-11-11.json',
      'flashmaster-2026-11-12.json',
    ];
    expect(backupsToDelete(names, 2)).toEqual(['flashmaster-2026-11-11.json', 'flashmaster-2026-11-10.json']);
    expect(backupsToDelete(names, 10)).toEqual([]);
  });

  it('is due once a day', () => {
    expect(isBackupDue(null, '2026-11-17')).toBe(true);
    expect(isBackupDue('2026-11-16', '2026-11-17')).toBe(true);
    expect(isBackupDue('2026-11-17', '2026-11-17')).toBe(false);
  });
});
