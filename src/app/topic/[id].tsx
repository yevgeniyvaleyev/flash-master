import { AppBlocker } from '@modules/app-blocker';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DailyBars, Meter } from '@/components/charts';
import { LogControls } from '@/components/LogControls';
import { PromptModal } from '@/components/PromptModal';
import { TopicMark } from '@/components/TopicMark';
import { getTopic, getTopicDays, getTopicTotals, loadToday } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import {
  cancelCredit,
  deleteEntry,
  resetTopicProgress,
  setTopicCompleted,
  setTopicDoneBefore,
  setTopicPaused,
  takeCredit,
} from '@/logic/actions';
import { addDays, dayKey, lastDays } from '@/logic/dates';
import { dayDate, nextActiveDays } from '@/logic/day-rules';
import { deadlineLabel, topicForDay, topicProgressAt } from '@/logic/goal';
import { formatDayMonth } from '@/logic/history';
import { urlLabel } from '@/logic/links';
import { etaDays, overallProgress } from '@/logic/position';
import { rowsSince, topicStats } from '@/logic/stats';
import { useColors } from '@/theme';

const WINDOW = 30;
const WEEK = 7;

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function loadTopic(id: number) {
  const [topic, today, days, totals] = await Promise.all([
    getTopic(id),
    loadToday(),
    getTopicDays(WINDOW + 400),
    getTopicTotals(),
  ]);
  return { topic, today, days, total: totals[id] ?? 0, now: Date.now() };
}

/** One topic: log today's work, today's entries, the linked app, book progress and the topic's statistics. */
export default function TopicScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topicId = Number(id);
  const data = useQuery(() => loadTopic(topicId), id);
  const [range, setRange] = useState<7 | 30>(WEEK);
  const [pagePrompt, setPagePrompt] = useState(false);
  // Count mode prompts: the units already done when resetting, or a correction of the overall progress.
  const [donePrompt, setDonePrompt] = useState<'reset' | 'adjust' | null>(null);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const { topic, today } = data;
  if (!topic || topic.archived) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>Тема не найдена</Text>
      </View>
    );
  }

  const entries = today.entries.filter((e) => e.topicId === topicId).sort((a, b) => b.ts - a.ts);
  // Today's rule: weekday and credit (a credit day is met with the minimum, a repayment day has a raised target).
  const rule = today.rules.get(topicId);
  const offDay = rule?.active === false;
  const p = topicProgressAt(topicForDay(topic, rule), today.entries, data.now);
  const credit = rule?.credit ?? null;
  // Today's live result on top of the stored days (the stored row may lag the last entry).
  const rows = [
    ...data.days.filter((d) => !(d.topicId === topicId && d.day === today.day)),
    { day: today.day, topicId, target: p.target, minimum: p.minimum, done: p.done, paused: topic.paused || offDay },
  ];
  // After a progress reset the statistics start on the reset day.
  const sinceDay = topic.resetAt != null ? dayKey(new Date(topic.resetAt)) : null;
  const stats = topicStats(rows, topicId, WINDOW, new Date(), sinceDay);
  const byDay = new Map(rowsSince(rows, topicId, sinceDay).map((r) => [r.day, r]));
  const days = lastDays(range);
  const values = days.map((d) => byDay.get(d)?.done ?? 0);
  const barColors = days.map((d) => {
    const r = byDay.get(d);
    if (!r || r.paused || r.done === 0) return colors.primary;
    return r.done >= r.target ? colors.success : r.done >= r.minimum ? colors.accent : colors.warning;
  });
  const book = topic.mode === 'position';
  const overall = overallProgress(topic, data.total);
  const eta = overall ? etaDays(overall.left, stats.avgPerDay || topic.dailyTarget) : null;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  const openLinked = () => {
    if (!topic.linkedPackage || !AppBlocker) return;
    if (!AppBlocker.launchApp(topic.linkedPackage))
      Alert.alert('Не открывается', 'Приложение не найдено на устройстве.');
  };
  const openLink = () => {
    if (!topic.linkUrl) return;
    Linking.openURL(topic.linkUrl).catch(() => Alert.alert('Не открывается', 'Не удалось открыть ссылку в браузере.'));
  };
  const completed = topic.completedAt != null;
  const dueLabel = (due: string[]) => due.map((d) => formatDayMonth(dayDate(d))).join(' и ');
  const confirmCredit = () => {
    const owed = Math.max(0, p.target - Math.max(p.done, p.minimum));
    const take = (n: number) => void takeCredit(topicId, n, p.target, p.minimum);
    Alert.alert(
      'Взять в долг?',
      `Сегодня засчитается цель, если выполнен минимум (${p.minimum} ${topic.unit}). Недоделанное до цели (сейчас ${owed} ${topic.unit}) добавится к цели следующих дней: ` +
        `на 1 день — ${dueLabel(nextActiveDays(topic, today.day, 1))}, на 2 дня — ${dueLabel(nextActiveDays(topic, today.day, 2))}. ` +
        'Если не вернёшь, день возврата не засчитается. Новый долг по теме — только после возврата.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'На 2 дня', onPress: () => take(2) },
        { text: 'На 1 день', onPress: () => take(1) },
      ],
    );
  };
  const confirmComplete = () =>
    Alert.alert(
      'Завершить тему?',
      `«${topic.name}» уйдёт с главного экрана и из дневной нормы и будет в разделе «Завершённые» на вкладке «Темы». История и статистика останутся.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Завершить', onPress: () => void setTopicCompleted(topicId, Date.now()) },
      ],
    );
  const confirmReset = () =>
    Alert.alert(
      'Сбросить прогресс?',
      'Статистика, серия и «Всего» по теме начнутся заново с сегодняшнего дня. Записи остаются в журнале, сегодняшняя норма не меняется.' +
        (book
          ? ' Дальше укажешь страницу, с которой начинаешь.'
          : topic.positionTotal != null
            ? ' Дальше укажешь, сколько уже пройдено.'
            : ''),
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: () =>
            book
              ? setPagePrompt(true)
              : topic.positionTotal != null
                ? setDonePrompt('reset')
                : void resetTopicProgress(topicId, Date.now(), null),
        },
      ],
    );
  const confirmDelete = (entryId: number, units: number) =>
    Alert.alert('Удалить запись?', `${units} ${topic.unit} будут вычтены из сегодняшнего результата.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void deleteEntry(entryId) },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: topic.name,
          headerRight: () => (
            <Pressable
              hitSlop={10}
              accessibilityLabel="Изменить тему"
              onPress={() => router.push({ pathname: '/topic/edit', params: { id: String(topicId) } })}
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />

      <View style={card}>
        <View style={styles.doneRow}>
          <TopicMark color={topic.color} icon={topic.icon} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Сегодня</Text>
        </View>
        {completed ? (
          <>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-done-circle" size={22} color={colors.success} />
              <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>
                Тема завершена {formatDayMonth(new Date(topic.completedAt!))}
              </Text>
            </View>
            <Text style={{ color: colors.textMuted }}>Не входит в дневную норму. История и статистика сохранены.</Text>
            <Pressable
              onPress={() => void setTopicCompleted(topicId, null)}
              style={[styles.secondary, { borderColor: colors.primary }]}
            >
              <Ionicons name="refresh" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Вернуть в работу</Text>
            </Pressable>
          </>
        ) : topic.paused ? (
          <>
            <Text style={{ color: colors.textMuted }}>Тема на паузе — не входит в дневную норму</Text>
            <Pressable
              onPress={() => void setTopicPaused(topicId, false)}
              style={[styles.secondary, { borderColor: colors.primary }]}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Снять с паузы</Text>
            </Pressable>
          </>
        ) : (
          <>
            {offDay && (
              <Text style={{ color: colors.textMuted }}>
                Сегодня выходной по этой теме — она не входит в дневную норму. Заниматься можно, но в норму это не
                пойдёт.
              </Text>
            )}
            {!offDay && (
              <Meter
                label={
                  (p.targetMet
                    ? 'Цель выполнена'
                    : p.minMet
                      ? `Минимум есть · до цели ${p.leftToTarget}`
                      : `До минимума ${p.leftToMin}`) + (deadlineLabel(p) ? ` · ${deadlineLabel(p)}` : '')
                }
                value={p.done}
                total={Math.max(p.target, 1)}
                color={topic.color}
                mark={p.minimum}
                suffix={topic.unit}
              />
            )}
            {!offDay && (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Цель {p.target} {topic.unit} · минимум {p.minimum} · ~{topic.minutesPerUnit} мин/{topic.unit}
                {topic.maxGrantMinutes != null ? ` · до ${topic.maxGrantMinutes} мин развлечений/${topic.unit}` : ''}
              </Text>
            )}
            {credit?.kind === 'taken' && (
              <View style={styles.doneRow}>
                <Ionicons name="time-outline" size={18} color={colors.warning} />
                <Text style={{ color: colors.text, flex: 1 }}>
                  {credit.debt > 0
                    ? `В долг: ${credit.debt} ${topic.unit} → ${dueLabel(credit.dueDays)}`
                    : 'Долг взят, но цель уже выполнена — возвращать нечего'}
                </Text>
                <Pressable hitSlop={8} onPress={() => void cancelCredit(credit.creditId)}>
                  <Text style={{ color: colors.danger, fontWeight: '600' }}>Отменить</Text>
                </Pressable>
              </View>
            )}
            {credit?.kind === 'repay' && (
              <View style={styles.doneRow}>
                <Ionicons name="return-down-back" size={18} color={colors.warning} />
                <Text style={{ color: colors.text, flex: 1 }}>
                  Возврат долга: +{credit.share} {topic.unit} к цели сегодня
                  {credit.dueDays.length > 1 ? ` (день ${credit.dayIndex + 1} из ${credit.dueDays.length})` : ''}
                </Text>
              </View>
            )}
            {p.deadlineMissed && (
              <Text style={{ color: colors.danger, fontSize: 13 }}>
                Цель не выполнена к сроку — день не засчитан. Можно доделать: минимум по-прежнему открывает приложения.
              </Text>
            )}
            <LogControls topic={topic} large />
            {rule?.creditable && !p.targetMet && (
              <Pressable
                onPress={confirmCredit}
                style={({ pressed }) => [styles.secondary, { borderColor: colors.warning, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="time-outline" size={18} color={colors.warning} />
                <Text style={{ color: colors.warning, fontWeight: '700' }}>Взять в долг на 1–2 дня</Text>
              </Pressable>
            )}
          </>
        )}
        {topic.linkUrl && (
          <Pressable
            onPress={openLink}
            style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="globe-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700' }} numberOfLines={1}>
              Открыть {urlLabel(topic.linkUrl)}
            </Text>
          </Pressable>
        )}
        {topic.linkedPackage && (
          <Pressable
            onPress={openLinked}
            disabled={!AppBlocker}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: AppBlocker ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="open-outline" size={18} color={AppBlocker ? colors.primary : colors.textMuted} />
            <Text style={{ color: AppBlocker ? colors.primary : colors.textMuted, fontWeight: '700' }}>
              Открыть приложение
            </Text>
          </Pressable>
        )}
        {topic.linkedPackage && !AppBlocker && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Недоступно в Expo Go — работает в установленном приложении (APK)
          </Text>
        )}
      </View>

      {overall ? (
        <View style={card}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{book ? 'Книга' : 'Общий прогресс'}</Text>
            {!book && (
              <Pressable hitSlop={8} onPress={() => setDonePrompt('adjust')} accessibilityLabel="Уточнить прогресс">
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Уточнить</Text>
              </Pressable>
            )}
          </View>
          <Meter
            label={book ? `Страница ${overall.done}` : `Пройдено ${Math.round(overall.share * 100)}%`}
            value={overall.done}
            total={overall.total}
            color={topic.color}
            suffix={book ? undefined : topic.unit}
          />
          <Text style={{ color: colors.textMuted }}>
            {overall.left <= 0
              ? (book ? 'Книга прочитана!' : 'Всё пройдено!') +
                (completed ? '' : ' Отметь тему завершённой, чтобы убрать её из дневной нормы.')
              : (book ? `Прочитано ${Math.round(overall.share * 100)}% · ` : '') +
                `осталось ${overall.left} ${topic.unit}` +
                (eta != null ? ` · закончишь ~${formatDayMonth(addDays(new Date(), eta))}` : '')}
          </Text>
        </View>
      ) : (
        book && (
          <View style={card}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Книга</Text>
            <Text style={{ color: colors.textMuted }}>
              Сейчас на странице {topic.positionCurrent ?? 0}. Укажи число страниц в настройках темы, чтобы видеть
              процент и дату окончания.
            </Text>
          </View>
        )
      )}

      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Записи за сегодня</Text>
        {entries.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>Пока ничего</Text>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <Text style={{ color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{hhmm(e.ts)}</Text>
              <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>
                +{e.units} {topic.unit}
                {e.position != null ? ` · до стр. ${e.position}` : ''}
              </Text>
              <Pressable hitSlop={8} accessibilityLabel="Удалить запись" onPress={() => confirmDelete(e.id, e.units)}>
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={card}>
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Статистика</Text>
          <View style={styles.segment}>
            {([WEEK, WINDOW] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={[styles.segmentItem, range === r && { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={{ color: range === r ? colors.text : colors.textMuted, fontWeight: '600' }}>{r} дн.</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <DailyBars values={values} barColors={barColors} />
        <View style={styles.statsGrid}>
          <Stat label="Серия" value={`${stats.currentStreak} дн.`} />
          <Stat label="Лучшая серия" value={`${stats.bestStreak} дн.`} />
          <Stat label={`В среднем (${WINDOW} дн.)`} value={`${Math.round(stats.avgPerDay * 10) / 10} ${topic.unit}`} />
          <Stat label="Дней с целью" value={stats.metRate == null ? '—' : `${Math.round(stats.metRate * 100)}%`} />
          <Stat label="Всего" value={`${data.total} ${topic.unit}`} />
        </View>
        {sinceDay != null && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Прогресс считается с {formatDayMonth(new Date(topic.resetAt!))} (после сброса)
          </Text>
        )}
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Зелёным — цель, бирюзовым — минимум, жёлтым — меньше минимума
        </Text>
      </View>

      {!completed && (
        <Pressable onPress={confirmComplete} style={styles.complete}>
          <Ionicons name="checkmark-done" size={18} color={colors.success} />
          <Text style={{ color: colors.success, fontWeight: '700' }}>Тема пройдена — завершить</Text>
        </Pressable>
      )}
      <Pressable onPress={confirmReset} style={styles.complete}>
        <Ionicons name="refresh-circle-outline" size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, fontWeight: '700' }}>Сбросить прогресс</Text>
      </Pressable>

      <PromptModal
        visible={pagePrompt}
        title="С какой страницы начинаешь?"
        message="0 — с самого начала"
        initialValue="0"
        placeholder="Страница"
        keyboardType="number-pad"
        confirmLabel="Сбросить"
        onSubmit={(v) => {
          const page = Number(v.trim());
          if (!Number.isInteger(page) || page < 0) {
            Alert.alert('Неверная страница', 'Введи целое число от 0.');
            return;
          }
          if (topic.positionTotal != null && page > topic.positionTotal) {
            Alert.alert('Неверная страница', `В книге всего ${topic.positionTotal} стр.`);
            return;
          }
          setPagePrompt(false);
          void resetTopicProgress(topicId, Date.now(), page);
        }}
        onClose={() => setPagePrompt(false)}
      />
      <PromptModal
        visible={donePrompt != null}
        title={donePrompt === 'reset' ? 'Сколько уже пройдено?' : 'Сколько пройдено всего?'}
        message={
          donePrompt === 'reset'
            ? `0 — с самого начала (всего ${topic.positionTotal ?? 0} ${topic.unit})`
            : `Например, число изученных карт из приложения с карточками. Всего ${topic.positionTotal ?? 0} ${topic.unit}.`
        }
        initialValue={donePrompt === 'reset' ? '0' : String(overall?.done ?? 0)}
        placeholder={topic.unit}
        keyboardType="number-pad"
        confirmLabel={donePrompt === 'reset' ? 'Сбросить' : 'Сохранить'}
        onSubmit={(v) => {
          const n = Number(v.trim());
          if (!Number.isInteger(n) || n < 0) {
            Alert.alert('Неверное число', 'Введи целое число от 0.');
            return;
          }
          if (topic.positionTotal != null && n > topic.positionTotal) {
            Alert.alert('Неверное число', `Всего ${topic.positionTotal} ${topic.unit}.`);
            return;
          }
          const mode = donePrompt;
          setDonePrompt(null);
          // A correction keeps the logged entries and stores the difference to them.
          if (mode === 'reset') void resetTopicProgress(topicId, Date.now(), n);
          else void setTopicDoneBefore(topicId, n - data.total);
        }}
        onClose={() => setDonePrompt(null)}
      />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  segment: { flexDirection: 'row', gap: 4 },
  segmentItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  complete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '30%', flexGrow: 1 },
});
