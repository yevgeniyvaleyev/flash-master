import { Ionicons } from '@expo/vector-icons';
import { AppBlocker } from '@modules/app-blocker';
import { StudyAlarms } from '@modules/study-alarms';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  Vibration,
  View,
} from 'react-native';

import { BackupSection } from '@/components/BackupSection';
import { PickerModal } from '@/components/PickerModal';
import { Row, Stepper } from '@/components/SettingRows';
import {
  VIBRATION_REPEATS,
  VIBRATIONS,
  vibrationOf,
  vibrationRepeatOf,
  vibrationWaveform,
  type VibrationKey,
  type VibrationRepeat,
} from '@/logic/vibration';
import { ensureNotificationPermission, remindersSupported } from '@/notifications/reminders';
import { useSettings, type ThemeMode } from '@/store/settings';
import { useColors } from '@/theme';

/** 9 → «09:00»; hours past midnight (the working day may run until the new day starts) → «01:00». */
const hourLabel = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
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

/** A setting chosen from a list: shows the current value; picking an option saves it (and may preview it). */
function ChoiceRow({
  label,
  hint,
  value,
  current,
  options,
  onOpen,
  onPick,
}: {
  label: string;
  hint?: string;
  /** Label of the current value. */
  value: string;
  /** Key of the current option (marked in the list). */
  current: string;
  options: { key: string; label: string }[];
  onOpen?: () => void;
  onPick: (key: string) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        <Row label={label} hint={hint}>
          <View style={styles.vibrationValue}>
            <Text style={{ color: colors.primary, fontWeight: '600', maxWidth: 160 }} numberOfLines={1}>
              {value}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </Row>
      </Pressable>
      <PickerModal
        visible={open}
        title={label}
        options={options.map((o) => ({ key: o.key, label: o.key === current ? `✓ ${o.label}` : o.label }))}
        onPick={onPick}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** Plays a waveform on the phone (a loop previews two cycles). */
function previewVibration(pattern: readonly number[], repeat: VibrationRepeat = vibrationRepeatOf('1')) {
  Vibration.cancel();
  const w = vibrationWaveform(pattern, repeat.count == null ? { ...repeat, count: 2 } : repeat);
  if (w.timings.length > 0) Vibration.vibrate(w.timings);
}

/** A vibration preset picker; picking one saves it and plays it as a preview. */
function VibrationRow({
  label,
  value,
  repeat,
  onChange,
}: {
  label: string;
  value: VibrationKey;
  /** Repetition the preview plays with (alarms). */
  repeat?: VibrationRepeat;
  onChange: (key: VibrationKey) => void;
}) {
  return (
    <ChoiceRow
      label={label}
      hint="Нажми, чтобы выбрать — выбранная вибрация проиграется"
      value={vibrationOf(value).label}
      current={value}
      options={VIBRATIONS.map((v) => ({ key: v.key, label: v.label }))}
      onPick={(key) => {
        const v = vibrationOf(key);
        onChange(v.key);
        previewVibration(v.pattern, repeat);
      }}
    />
  );
}

const DEFAULT_SOUND = { key: '', label: 'Стандартный будильник' };
const SILENT_SOUND = { key: 'silent', label: 'Без звука' };

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
  const alarmScreenOpens = useNativeValue(() => StudyAlarms?.canOpenAlarmScreen() ?? true);
  const [sounds, setSounds] = useState<{ title: string; uri: string }[]>([]);
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
        <Row
          label="Кнопки +1 на главном"
          hint="Кнопки записи рядом с каждой темой на «Сегодня». Выключено — записывай с экрана темы (нажми на тему)"
        >
          <Switch
            value={s.dashboardLogButtons}
            onValueChange={(v) => s.update({ dashboardLogButtons: v })}
            trackColor={{ true: colors.primary }}
          />
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
            // The working day may end after midnight, but not after the new day starts.
            min={Math.max(0, s.reminderEndHour - 24)}
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
        <Row
          label="Рабочий день до"
          hint="К этому времени минимум должен быть выполнен. Можно и после полуночи — до начала нового дня"
        >
          <Stepper
            value={s.reminderEndHour}
            min={s.reminderStartHour + 1}
            // Hours past 23 are after midnight, still on this app day (up to «Новый день с»).
            max={24 + s.dayStartHour}
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
            <VibrationRow
              label="Вибрация"
              value={s.reminderVibration}
              onChange={(reminderVibration) => s.update({ reminderVibration })}
            />
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
            {!alarmScreenOpens && (
              <Row
                label="Будильник поверх приложений"
                hint="Сейчас, пока телефоном пользуются, будильник приходит свёрнутым уведомлением. Разрешите «Поверх других приложений» (или включите блокировку приложений), чтобы он всегда открывался на весь экран"
              >
                <Pressable
                  onPress={() => StudyAlarms?.openOverlaySettings()}
                  style={[styles.button, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Разрешить</Text>
                </Pressable>
              </Row>
            )}
            <ChoiceRow
              label="Мелодия будильника"
              hint="Нажми, чтобы выбрать — мелодия проиграется 5 секунд"
              value={
                s.alarmSound === ''
                  ? DEFAULT_SOUND.label
                  : s.alarmSound === 'silent'
                    ? SILENT_SOUND.label
                    : s.alarmSoundTitle || 'Своя'
              }
              current={s.alarmSound}
              onOpen={() => setSounds(StudyAlarms?.getAlarmSounds() ?? [])}
              options={[DEFAULT_SOUND, SILENT_SOUND, ...sounds.map((x) => ({ key: x.uri, label: x.title }))]}
              onPick={(key) => {
                const title = key === '' || key === 'silent' ? '' : (sounds.find((x) => x.uri === key)?.title ?? '');
                s.update({ alarmSound: key, alarmSoundTitle: title });
                if (key !== 'silent') StudyAlarms?.previewSound(key);
                else StudyAlarms?.stopPreview();
              }}
            />
            <VibrationRow
              label="Вибрация будильника"
              value={s.alarmVibration}
              repeat={vibrationRepeatOf(s.alarmVibrationRepeat)}
              onChange={(alarmVibration) => s.update({ alarmVibration })}
            />
            <ChoiceRow
              label="Повтор вибрации"
              hint="Сколько раз вибрирует будильник; «пока не отвечу» — до ответа или минуты звонка"
              value={vibrationRepeatOf(s.alarmVibrationRepeat).label}
              current={s.alarmVibrationRepeat}
              options={VIBRATION_REPEATS.map((r) => ({ key: r.key, label: r.label }))}
              onPick={(key) => {
                const r = vibrationRepeatOf(key);
                s.update({ alarmVibrationRepeat: r.key });
                previewVibration(vibrationOf(s.alarmVibration).pattern, r);
              }}
            />
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
          label="Штраф за пропущенный срок"
          hint={
            AppBlocker
              ? 'Если цель темы со сроком не выполнена к сроку, блокируемые приложения закрыты до конца дня, даже с выполненным минимумом. Долг на эту тему снимает штраф'
              : 'Недоступно в Expo Go — работает в установленном приложении (APK)'
          }
        >
          <Switch
            disabled={!AppBlocker}
            value={AppBlocker != null && s.deadlineFine}
            onValueChange={(v) => s.update({ deadlineFine: v })}
            trackColor={{ true: colors.primary }}
          />
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
  vibrationValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
