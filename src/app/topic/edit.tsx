import { AppBlocker, type LaunchableApp } from '@modules/app-blocker';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { IconPickerModal } from '@/components/IconPickerModal';
import { PickerModal } from '@/components/PickerModal';
import { Row } from '@/components/SettingRows';
import { TopicMark } from '@/components/TopicMark';
import { getTopic, type TopicInput } from '@/db/repo';
import { archiveTopic, createTopic, updateTopic } from '@/logic/actions';
import { EVERY_DAY, weekdayMask, WEEKDAY_NAMES } from '@/logic/day-rules';
import { formatMinutes, parseTime } from '@/logic/dates';
import { normalizeUrl } from '@/logic/links';
import { TOPIC_COLORS } from '@/logic/topic-colors';
import { useSettings } from '@/store/settings';
import { useColors } from '@/theme';

/** Unit presets: label and a typical minutes-per-unit estimate. */
const UNITS: { unit: string; minutes: number }[] = [
  { unit: 'карт.', minutes: 1 },
  { unit: 'стр.', minutes: 2 },
  { unit: 'мин', minutes: 1 },
  { unit: 'задач', minutes: 15 },
  { unit: 'глав', minutes: 30 },
  { unit: 'уроков', minutes: 20 },
];

interface Form {
  name: string;
  unit: string;
  target: string;
  min: string;
  minutes: string;
  /** '' = the global «Максимум минут за единицу». */
  maxGrant: string;
  step: string;
  book: boolean;
  total: string;
  current: string;
  linked: string | null;
  /** Web address as typed; '' = none. */
  link: string;
  /** «15:00»; '' = no deadline. */
  deadline: string;
  /** null: the next unused palette color is assigned on create. */
  color: string | null;
  /** Icon name; null = the color dot. */
  icon: string | null;
  /** Weekday bitmask, Mon = 1 … Sun = 64. */
  weekdays: number;
  paused: boolean;
}

const num = (s: string) => Number(s.replace(',', '.'));
const isInt = (s: string, min: number) => Number.isInteger(num(s)) && num(s) >= min && s.trim() !== '';

/** Create (no `id`) or edit a topic: name, unit, daily target and minimum, time per unit, book mode, linked app. */
export default function TopicEditScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id != null;
  const defaultMinutes = useSettings((s) => s.defaultMinutesPerUnit);
  const globalMaxGrant = useSettings((s) => s.maxGrantMinutes);
  const endHour = useSettings((s) => s.reminderEndHour);
  const unlockShare = useSettings((s) => s.defaultUnlockShare);
  const blocked = useSettings((s) => s.blockedPackages);
  const [form, setForm] = useState<Form | null>(
    editing
      ? null
      : {
          name: '',
          unit: 'стр.',
          target: '20',
          min: String(Math.ceil(20 * unlockShare)),
          minutes: String(defaultMinutes),
          maxGrant: '',
          step: '5',
          book: false,
          total: '',
          current: '',
          linked: null,
          link: '',
          deadline: '',
          color: null,
          icon: null,
          weekdays: EVERY_DAY,
          paused: false,
        },
  );
  const [minTouched, setMinTouched] = useState(editing);
  const [apps, setApps] = useState<LaunchableApp[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);

  useEffect(() => {
    if (!editing) return;
    void getTopic(Number(id)).then((t) => {
      if (!t) return;
      setForm({
        name: t.name,
        unit: t.unit,
        target: String(t.dailyTarget),
        min: String(t.unlockMin),
        minutes: String(t.minutesPerUnit),
        maxGrant: t.maxGrantMinutes != null ? String(t.maxGrantMinutes) : '',
        step: String(t.step),
        book: t.mode === 'position',
        total: t.positionTotal != null ? String(t.positionTotal) : '',
        current: t.positionCurrent != null ? String(t.positionCurrent) : '',
        linked: t.linkedPackage,
        link: t.linkUrl ?? '',
        deadline: t.deadlineMinutes != null ? formatMinutes(t.deadlineMinutes) : '',
        color: t.color,
        icon: t.icon,
        weekdays: weekdayMask(t),
        paused: t.paused,
      });
    });
  }, [editing, id]);

  useEffect(() => {
    AppBlocker?.getLaunchableApps().then(setApps, () => setApps([]));
  }, []);

  if (!form) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setTarget = (target: string) =>
    set(minTouched || !isInt(target, 1) ? { target } : { target, min: String(Math.ceil(num(target) * unlockShare)) });
  const linkedLabel = form.linked ? (apps.find((a) => a.packageName === form.linked)?.label ?? form.linked) : null;

  const save = async () => {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push('Название не задано');
    if (!form.unit.trim()) errors.push('Единица не задана');
    if (!isInt(form.target, 1)) errors.push('Цель — целое число от 1');
    if (!isInt(form.min, 0)) errors.push('Минимум — целое число от 0');
    else if (isInt(form.target, 1) && num(form.min) > num(form.target))
      errors.push('Минимум не может быть больше цели');
    if (!(num(form.minutes) > 0)) errors.push('Время на единицу должно быть больше 0');
    if (form.maxGrant.trim() && !(num(form.maxGrant) >= 0))
      errors.push('Максимум развлечений — число от 0 (или пусто — общее значение)');
    if (!isInt(form.step, 1)) errors.push('Шаг — целое число от 1');
    if (form.total.trim() && !isInt(form.total, 1))
      errors.push(form.book ? 'Страниц в книге — целое число' : 'Всего — целое число');
    if (form.book && form.current.trim() && !isInt(form.current, 0)) errors.push('Текущая страница — целое число');
    if (form.link.trim() && normalizeUrl(form.link) == null) errors.push('Ссылка — адрес сайта, например coursera.org');
    if ((form.weekdays & EVERY_DAY) === 0) errors.push('Выбери хотя бы один день недели');
    if (form.deadline.trim() && parseTime(form.deadline) == null) errors.push('Срок — время вида 15:00 (или пусто)');
    if (errors.length > 0) {
      Alert.alert('Проверь поля', errors.join('\n'));
      return;
    }
    const input: TopicInput = {
      name: form.name,
      unit: form.unit,
      dailyTarget: num(form.target),
      unlockMin: num(form.min),
      minutesPerUnit: num(form.minutes),
      maxGrantMinutes: form.maxGrant.trim() ? num(form.maxGrant) : null,
      step: num(form.step),
      mode: form.book ? 'position' : 'count',
      positionTotal: form.total.trim() ? num(form.total) : null,
      positionCurrent: form.book && form.current.trim() ? num(form.current) : null,
      linkedPackage: form.linked,
      linkUrl: form.link.trim() ? normalizeUrl(form.link) : null,
      deadlineMinutes: form.deadline.trim() ? parseTime(form.deadline) : null,
      color: form.color,
      icon: form.icon,
      weekdays: form.weekdays,
      paused: form.paused,
    };
    if (editing) await updateTopic(Number(id), input);
    else await createTopic(input);
    router.back();
  };

  const confirmArchive = () =>
    Alert.alert('Удалить тему?', `«${form.name}» исчезнет из списка и дневной нормы. История и статистика останутся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await archiveTopic(Number(id));
          router.dismissTo('/topics');
        },
      },
    ]);

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const input = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }];
  const numberInput = (value: string, onChange: (v: string) => void, decimal = false, placeholder?: string) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      selectTextOnFocus
      style={[...input, styles.number]}
    />
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: editing ? 'Изменить тему' : 'Новая тема' }} />

      <View style={[card, styles.block]}>
        <Text style={[styles.label, { color: colors.text }]}>Название</Text>
        <TextInput
          value={form.name}
          onChangeText={(name) => set({ name })}
          placeholder="Например, «Испанский» или «Война и мир»"
          placeholderTextColor={colors.textMuted}
          style={input}
        />
        <Text style={[styles.label, { color: colors.text }]}>Единица работы</Text>
        <View style={styles.chips}>
          {UNITS.map((u) => {
            const on = form.unit === u.unit;
            return (
              <Pressable
                key={u.unit}
                onPress={() => set({ unit: u.unit, minutes: editing ? form.minutes : String(u.minutes) })}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: '600' }}>{u.unit}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={form.unit}
          onChangeText={(unit) => set({ unit })}
          placeholder="Своя единица"
          placeholderTextColor={colors.textMuted}
          style={input}
        />
        <Text style={[styles.label, { color: colors.text }]}>Цвет</Text>
        <View style={styles.chips}>
          {TOPIC_COLORS.map((c) => {
            const on = form.color?.toUpperCase() === c;
            return (
              <Pressable
                key={c}
                accessibilityLabel={`Цвет ${c}`}
                onPress={() => set({ color: c })}
                style={[styles.swatch, { backgroundColor: c, borderColor: on ? colors.text : 'transparent' }]}
              >
                {on && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              </Pressable>
            );
          })}
        </View>
        {form.color == null && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Не выбран — будет назначен свободный цвет</Text>
        )}
        <Pressable onPress={() => setPickingIcon(true)}>
          <Row label="Иконка" hint={form.icon ? 'Показывается вместо цветной точки' : 'Нет — цветная точка'}>
            {form.icon ? (
              <TopicMark color={form.color ?? colors.primary} icon={form.icon} size={16} />
            ) : (
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            )}
          </Row>
        </Pressable>
        <IconPickerModal
          visible={pickingIcon}
          value={form.icon}
          color={form.color ?? colors.primary}
          onPick={(icon) => set({ icon })}
          onClose={() => setPickingIcon(false)}
        />
      </View>

      <View style={card}>
        <Row label="Цель в день" hint={`Сколько ${form.unit || 'единиц'} нужно сделать за день`}>
          {numberInput(form.target, setTarget)}
        </Row>
        <Row label="Минимум" hint="Столько нужно сделать, чтобы открылись развлекательные приложения">
          {numberInput(form.min, (min) => {
            setMinTouched(true);
            set({ min });
          })}
        </Row>
        <Row
          label="Минут на единицу"
          hint={`Сколько примерно занимает 1 ${form.unit || 'ед.'}; для плана дня, будильников и резерва времени`}
        >
          {numberInput(form.minutes, (minutes) => set({ minutes }), true)}
        </Row>
        <Row
          label="Макс. развлечений за единицу"
          hint={`Не больше стольких минут развлечений даёт 1 ${form.unit || 'ед.'} до выполнения минимума. Пусто — общее значение (${globalMaxGrant} мин)`}
        >
          {numberInput(form.maxGrant, (maxGrant) => set({ maxGrant }), true, String(globalMaxGrant))}
        </Row>
        <Row label="Быстрый шаг" hint="Вторая кнопка рядом с +1 (например, +5 страниц)">
          {numberInput(form.step, (step) => set({ step }))}
        </Row>
        <Row
          label="Срок на день"
          hint={`Необязательно: к этому времени цель должна быть выполнена, иначе день не засчитан. План дня и будильники уложат тему до срока. Пусто — до конца рабочего дня (${formatMinutes(endHour * 60)})`}
        >
          <TextInput
            value={form.deadline}
            onChangeText={(deadline) => set({ deadline })}
            keyboardType="numbers-and-punctuation"
            // Empty = the end of the working day, so that's what the empty field shows.
            placeholder={formatMinutes(endHour * 60)}
            placeholderTextColor={colors.textMuted}
            selectTextOnFocus
            style={[...input, styles.number]}
          />
        </Row>
        <Text style={[styles.label, { color: colors.text }]}>Дни недели</Text>
        <View style={styles.chips}>
          {WEEKDAY_NAMES.map((name, i) => {
            const on = (form.weekdays & (1 << i)) !== 0;
            return (
              <Pressable
                key={name}
                onPress={() => set({ weekdays: form.weekdays ^ (1 << i) })}
                accessibilityState={{ selected: on }}
                style={[
                  styles.chip,
                  {
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.onPrimary : colors.text, fontWeight: '600' }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          В другие дни тема не входит в дневную норму и не прерывает серию
        </Text>
      </View>

      <View style={card}>
        <Row label="Режим книги" hint="Вводишь страницу, на которой остановился — засчитывается разница">
          <Switch value={form.book} onValueChange={(book) => set({ book })} trackColor={{ true: colors.primary }} />
        </Row>
        {form.book ? (
          <>
            <Row label="Сейчас на странице" hint="С неё начнётся отсчёт">
              {numberInput(form.current, (current) => set({ current }))}
            </Row>
            <Row label="Страниц в книге" hint="Необязательно: покажет процент и дату окончания">
              {numberInput(form.total, (total) => set({ total }))}
            </Row>
          </>
        ) : (
          <Row
            label={`Всего ${form.unit || 'ед.'} в теме`}
            hint="Необязательно: весь объём (минут лекций, карт в колоде). Покажет общий прогресс и дату окончания"
          >
            {numberInput(form.total, (total) => set({ total }))}
          </Row>
        )}
      </View>

      <View style={card}>
        <Pressable onPress={() => setPicking(true)} disabled={!AppBlocker}>
          <Row
            label="Связанное приложение"
            hint={
              !AppBlocker
                ? 'Недоступно в Expo Go — работает в установленном приложении (APK)'
                : linkedLabel
                  ? `${linkedLabel} — открывается из темы и никогда не блокируется`
                  : 'Например, приложение с карточками или читалка'
            }
          >
            <Ionicons
              name={form.linked ? 'link' : 'add-circle-outline'}
              size={22}
              color={AppBlocker ? colors.primary : colors.textMuted}
            />
          </Row>
        </Pressable>
        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: colors.text }]}>Ссылка</Text>
          <TextInput
            value={form.link}
            onChangeText={(link) => set({ link })}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://… (курс, колода, статья)"
            placeholderTextColor={colors.textMuted}
            style={input}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Необязательно: откроется в браузере с экрана темы. Если браузер в списке блокируемых, он откроется только
            после минимума
          </Text>
        </View>
        <Row label="Пауза" hint="Тема на паузе не входит в дневную норму">
          <Switch
            value={form.paused}
            onValueChange={(paused) => set({ paused })}
            trackColor={{ true: colors.primary }}
          />
        </Row>
      </View>

      <Pressable
        onPress={() => void save()}
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 16 }}>
          {editing ? 'Сохранить' : 'Создать тему'}
        </Text>
      </Pressable>
      {editing && (
        <Pressable onPress={confirmArchive} style={styles.delete}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '600' }}>Удалить тему</Text>
        </Pressable>
      )}

      <PickerModal
        visible={picking}
        title="Связанное приложение"
        options={[
          ...(form.linked ? [{ key: '', label: 'Без приложения', destructive: true }] : []),
          ...apps.map((a) => ({
            key: a.packageName,
            label: blocked.includes(a.packageName) ? `${a.label} (сейчас блокируется)` : a.label,
          })),
        ]}
        onPick={(key) => set({ linked: key || null })}
        onClose={() => setPicking(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 16 },
  block: { paddingVertical: 16, gap: 10 },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  number: { width: 76, textAlign: 'center', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  cta: { alignItems: 'center', paddingVertical: 14, borderRadius: 14 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
});
