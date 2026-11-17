import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, DevSettings, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  exportToFolder,
  getBackupFolderName,
  getBackupStatus,
  pickBackupFile,
  pickBackupFolder,
  requestRestore,
  runAutoBackup,
  type BackupStatus,
} from '@/backup/backup';
import { Row, Stepper } from '@/components/SettingRows';
import { kvGet, RESTORE_ERROR_KEY } from '@/db/client';
import { backupFileName } from '@/logic/backup';
import { dayKey } from '@/logic/dates';
import { useSettings } from '@/store/settings';
import { useColors } from '@/theme';

const formatBackupTime = (ms: number) => {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (dayKey(d) === dayKey()) return `сегодня, ${hm}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}, ${hm}`;
};

/** Export/import of a backup file, the daily copy into a chosen folder and its status (same as AlgoMaster). */
export function BackupSection() {
  const colors = useColors();
  const s = useSettings();
  const [folder, setFolder] = useState<string | null>(null);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    void (async () => {
      setFolder(await getBackupFolderName());
      setStatus(await getBackupStatus());
      setRestoreError(await kvGet<string>(RESTORE_ERROR_KEY));
    })();
  }, []);
  useFocusEffect(load);
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const button = (label: string, onPress: () => void, primary = false) => (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={[
        styles.button,
        primary ? { backgroundColor: colors.primary } : { borderColor: colors.border, borderWidth: 1 },
        busy && { opacity: 0.5 },
      ]}
    >
      <Text style={{ color: primary ? colors.onPrimary : colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      Alert.alert('Не получилось', String(e));
    } finally {
      setBusy(false);
      load();
    }
  };

  const exportNow = () =>
    run(async () => {
      const name = await exportToFolder();
      if (name) Alert.alert('Копия сохранена', `Файл ${backupFileName(dayKey())} в папке «${name}».`);
    });

  const importNow = () =>
    run(async () => {
      const parsed = await pickBackupFile();
      if (!parsed) return;
      if (!parsed.ok) {
        Alert.alert('Нельзя восстановить', parsed.error);
        return;
      }
      const { summary: m } = parsed;
      Alert.alert(
        'Заменить текущие данные?',
        `Копия от ${formatBackupTime(m.createdAt)}: тем ${m.topics}, записей ${m.entries}, дней с записями ${m.historyDays}.\n\nТекущие данные и настройки будут заменены (их копия сохранится внутри приложения).`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Восстановить',
            style: 'destructive',
            onPress: () =>
              run(async () => {
                await requestRestore(parsed.backup);
                if (__DEV__) DevSettings.reload();
                else Alert.alert('Восстановление при запуске', 'Закрой и снова открой приложение.');
              }),
          },
        ],
      );
    });

  const chooseFolder = () =>
    run(async () => {
      const name = await pickBackupFolder();
      if (!name) return;
      s.update({ autoBackupEnabled: true });
      await runAutoBackup();
    });

  const statusText =
    status?.folderError && s.autoBackupEnabled
      ? 'Нет доступа к папке — выбери её заново'
      : status?.at
        ? `Последняя копия: ${formatBackupTime(status.at)}`
        : 'Копий ещё не было';

  return (
    <View style={card}>
      <Row label="Сохранить копию" hint="Все темы, записи, статистика и настройки в один файл в выбранной папке">
        {button('Сохранить', exportNow, true)}
      </Row>
      <Row
        label="Восстановить из файла"
        hint={restoreError ? `Последнее восстановление не удалось: ${restoreError}` : 'Заменяет текущие данные копией'}
      >
        {button('Выбрать', importNow)}
      </Row>
      <Row
        label="Автокопия в папку"
        hint={
          s.autoBackupEnabled && folder
            ? `Раз в день в «${folder}». ${statusText}`
            : `Раз в день копия сохраняется внутри приложения (Android также сохраняет данные в Google-аккаунт, если включено резервное копирование устройства). ${statusText}`
        }
      >
        <Switch
          value={s.autoBackupEnabled && folder != null}
          onValueChange={(v) => (v && !folder ? void chooseFolder() : s.update({ autoBackupEnabled: v }))}
          trackColor={{ true: colors.primary }}
        />
      </Row>
      {s.autoBackupEnabled && folder != null && (
        <>
          <Row label="Папка" hint={folder}>
            {button('Изменить', chooseFolder)}
          </Row>
          <Row label="Хранить копий" hint="Более старые файлы копий в папке удаляются">
            <Stepper value={s.autoBackupKeep} min={3} max={30} onChange={(v) => s.update({ autoBackupKeep: v })} />
          </Row>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 16 },
  button: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
