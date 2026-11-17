import { Ionicons } from '@expo/vector-icons';
import { AppBlocker } from '@modules/app-blocker';
import { StudyAlarms } from '@modules/study-alarms';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BackupSection } from '@/components/BackupSection';
import { Row, Stepper } from '@/components/SettingRows';
import { ensureNotificationPermission, remindersSupported } from '@/notifications/reminders';
import { useSettings, type ThemeMode } from '@/store/settings';
import { useColors } from '@/theme';

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
/** Latest «Новый день с»; the learning day (reminder window) may not start before it. */
const MAX_DAY_START_HOUR = 6;

const THEMES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Авто' },
  { key: 'light', label: 'Светлая' },
  { key: 'dark', label: 'Тёмная' },
];

/** Whether the accessibility service is on; re-read on focus and when returning from system settings. */
/** Reads a native status on focus and whenever the app returns to the foreground (e.g. from Android settings). */
function useNativeValue<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const refresh = useCallback(() => setValue(readRef.current()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  return value;
}

const formatAlarm = (at: number) => {
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.getDate() === new Date().getDate() ? time : `завтра ${time}`;
};

export default function SettingsScreen() {
  const colors = useColors();
  const s = useSettings();
  const serviceEnabled = useNativeValue(() => AppBlocker?.isServiceEnabled() ?? false);
  const fullScreenAllowed = useNativeValue(() => StudyAlarms?.canUseFullScreenIntent() ?? true);
  const nextAlarm = useNativeValue(() => StudyAlarms?.getNextAlarm() ?? null);

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.section, { color: colors.textMuted }]}>Оформление</Text>
      <View style={card}>
        <Row label="Тема">
          <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
            {THEMES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => s.update({ theme: t.key })}
                style={[styles.segmentItem, s.theme === t.key && { backgroundColor: colors.primary }]}
              >
                <Text
                  style={{ color: s.theme === t.key ? colors.onPrimary : colors.text, fontWeight: '600', fontSize: 13 }}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Row>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>День</Text>
      <View style={card}>
        <Row
          label="Дневная норма"
          hint="Задаётся в каждой теме: цель и минимум. Блокировка снимается, когда во всех активных темах выполнен минимум"
        >
          <Ionicons name="list-outline" size={22} color={colors.textMuted} />
        </Row>
        <Row label="Новый день с" hint="Записи до этого часа засчитываются в предыдущий день">
          <Stepper
            value={s.dayStartHour}
            min={0}
            max={Math.min(MAX_DAY_START_HOUR, s.reminderStartHour)}
            format={hourLabel}
            onChange={(v) => s.update({ dayStartHour: v })}
          />
        </Row>
        <Row label="Рабочий день с" hint="Окно напоминаний и будильников, начало шкалы дня">
          <Stepper
            value={s.reminderStartHour}
            min={s.dayStartHour}
            max={s.reminderEndHour - 1}
            format={hourLabel}
            onChange={(v) => s.update({ reminderStartHour: v })}
          />
        </Row>
        <Row label="Рабочий день до" hint="К этому времени минимум должен быть выполнен">
          <Stepper
            value={s.reminderEndHour}
            min={s.reminderStartHour + 1}
            max={23}
            format={hourLabel}
            onChange={(v) => s.update({ reminderEndHour: v })}
          />
        </Row>
        <Row
          label="Минимальная сессия"
          hint="Работа по каждой теме делится на сессии не короче этого и распределяется по всему дню; 0 — одним блоком"
        >
          <Stepper
            value={s.minSessionMinutes}
            min={0}
            max={120}
            step={5}
            suffix=" мин"
            onChange={(v) => s.update({ minSessionMinutes: v })}
          />
        </Row>
        <Row label="Дней в журнале" hint="Сколько последних дней показывать в журнале на вкладке «Статистика»">
          <Stepper
            value={s.historyDays}
            min={1}
            max={90}
            suffix=" дн."
            onChange={(v) => s.update({ historyDays: v })}
          />
        </Row>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Новая тема</Text>
      <View style={card}>
        <Row label="Минут на единицу" hint="Значение по умолчанию; меняется в каждой теме">
          <Stepper
            value={s.defaultMinutesPerUnit}
            min={0.5}
            max={60}
            step={0.5}
            suffix=" мин."
            onChange={(v) => s.update({ defaultMinutesPerUnit: v })}
          />
        </Row>
        <Row label="Минимум от цели" hint="Подсказка минимума при создании темы">
          <Stepper
            value={s.defaultUnlockShare}
            min={0.1}
            max={1}
            step={0.1}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => s.update({ defaultUnlockShare: v })}
          />
        </Row>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Напоминания</Text>
      <View style={card}>
        <Row
          label="Напоминать"
          hint={
            remindersSupported
              ? 'Уведомления: сначала что осталось до минимума, потом до цели'
              : 'Недоступно в Expo Go — работает в установленном приложении (APK)'
          }
        >
          <Switch
            disabled={!remindersSupported}
            value={remindersSupported && s.remindersEnabled}
            onValueChange={async (v) => {
              if (v && !(await ensureNotificationPermission())) {
                Alert.alert('Нет разрешения', 'Разрешите уведомления для FlashMaster в настройках Android.', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
                ]);
                return;
              }
              s.update({ remindersEnabled: v });
            }}
            trackColor={{ true: colors.primary }}
          />
        </Row>
        {remindersSupported && s.remindersEnabled && (
          <>
            <Row label="Каждые">
              <Stepper
                value={s.reminderIntervalHours}
                min={1}
                max={6}
                suffix=" ч."
                onChange={(v) => s.update({ reminderIntervalHours: v })}
              />
            </Row>
          </>
        )}
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Будильники</Text>
      <View style={card}>
        <Row
          label="Будильник для каждой темы"
          hint={
            StudyAlarms
              ? 'Работа до цели распределяется равномерно по рабочему дню; будильник звонит в начале блока каждой темы. Пропущенный — план пересчитывается'
              : 'Недоступно в Expo Go — работает в установленном приложении (APK)'
          }
        >
          <Switch
            disabled={!StudyAlarms}
            value={StudyAlarms != null && s.alarmsEnabled}
            onValueChange={async (v) => {
              if (v && !(await ensureNotificationPermission())) {
                Alert.alert('Нет разрешения', 'Разрешите уведомления для FlashMaster в настройках Android.', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
                ]);
                return;
              }
              s.update({ alarmsEnabled: v });
            }}
            trackColor={{ true: colors.primary }}
          />
        </Row>
        {StudyAlarms && s.alarmsEnabled && (
          <>
            <Row
              label="Следующий будильник"
              hint={nextAlarm ? `${formatAlarm(nextAlarm.at)} — ${nextAlarm.title}` : 'Не запланирован: цели выполнены'}
            >
              <Ionicons name="alarm" size={22} color={nextAlarm ? colors.primary : colors.border} />
            </Row>
            {!fullScreenAllowed && (
              <Row
                label="Полноэкранный будильник"
                hint="Запрещён — будильник придёт как уведомление. Разрешите «Полноэкранные уведомления»"
              >
                <Pressable
                  onPress={() => StudyAlarms?.openFullScreenIntentSettings()}
                  style={[styles.button, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Разрешить</Text>
                </Pressable>
              </Row>
            )}
            <Row label="Проверить" hint="Будильник зазвонит через 5 секунд — можно заблокировать экран">
              <Pressable
                onPress={() => StudyAlarms?.testAlarm()}
                style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Проверить</Text>
              </Pressable>
            </Row>
          </>
        )}
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Блокировка приложений</Text>
      <View style={card}>
        <Row
          label="Максимум минут за единицу"
          hint="Каждая единица на пути к минимуму даёт долю свободного времени до конца рабочего дня, но не больше этого. По умолчанию для всех тем; в теме можно задать своё"
        >
          <Stepper value={s.maxGrantMinutes} min={1} max={60} onChange={(v) => s.update({ maxGrantMinutes: v })} />
        </Row>
        <Row
          label="Служба блокировки"
          hint={
            !AppBlocker
              ? 'Недоступно в Expo Go — работает в установленном приложении (APK)'
              : serviceEnabled
                ? 'Включена'
                : 'Выключена: включите «FlashMaster: блокировка приложений» в специальных возможностях'
          }
        >
          {AppBlocker && !serviceEnabled && (
            <Pressable
              onPress={() => AppBlocker?.openAccessibilitySettings()}
              style={[styles.button, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Включить</Text>
            </Pressable>
          )}
          {AppBlocker && serviceEnabled && <Ionicons name="checkmark-circle" size={24} color={colors.success} />}
        </Row>
        {AppBlocker && !serviceEnabled && (
          <Row
            label="Настройка недоступна?"
            hint="Для установленного APK Android может скрывать её: О приложении → ⋮ → «Разрешить ограниченные настройки», затем снова «Включить»"
          >
            <Pressable
              onPress={() => AppBlocker?.openAppSettings()}
              style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>О приложении</Text>
            </Pressable>
          </Row>
        )}
        <Row
          label="Вместе с AlgoMaster"
          hint="Если AlgoMaster тоже блокирует приложение, оно откроется, только когда разрешат оба. Друг друга приложения не блокируют"
        >
          <Ionicons name="link-outline" size={22} color={colors.textMuted} />
        </Row>
        <Pressable onPress={() => router.push('/blocked-apps')} disabled={!AppBlocker}>
          <Row
            label="Блокируемые приложения"
            hint={s.blockedPackages.length === 0 ? 'Не выбраны — блокировка выключена' : undefined}
          >
            <View style={styles.stepper}>
              <Text style={{ color: colors.textMuted, fontWeight: '700' }}>{s.blockedPackages.length}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Row>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: colors.textMuted }]}>Резервные копии</Text>
      <BackupSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  segmentItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
});
