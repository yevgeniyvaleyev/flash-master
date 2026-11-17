import { AppBlocker } from '@modules/app-blocker';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DailyBars, Meter } from '@/components/charts';
import { LogControls } from '@/components/LogControls';
import { PromptModal } from '@/components/PromptModal';
import { getTopic, getTopicDays, getTopicTotals, loadToday } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import { deleteEntry, resetTopicProgress, setTopicCompleted, setTopicPaused } from '@/logic/actions';
import { addDays, dayKey, lastDays } from '@/logic/dates';
import { topicProgress, unitsByTopic } from '@/logic/goal';
import { formatDayMonth } from '@/logic/history';
import { etaDays } from '@/logic/position';
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
  return { topic, today, days, total: totals[id] ?? 0 };
}

/** One topic: log today's work, today's entries, the linked app, book progress and the topic's statistics. */
export default function TopicScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topicId = Number(id);
  const data = useQuery(() => loadTopic(topicId), id);
  const [range, setRange] = useState<7 | 30>(WEEK);
  const [pagePrompt, setPagePrompt] = useState(false);

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
  const p = topicProgress(topic, unitsByTopic(today.entries).get(topicId) ?? 0);
  // Today's live result on top of the stored days (the stored row may lag the last entry).
  const rows = [
    ...data.days.filter((d) => !(d.topicId === topicId && d.day === today.day)),
    { day: today.day, topicId, target: p.target, minimum: p.minimum, done: p.done, paused: topic.paused },
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
  const pagesLeft = book && topic.positionTotal != null ? topic.positionTotal - (topic.positionCurrent ?? 0) : null;
  const eta = pagesLeft != null ? etaDays(pagesLeft, stats.avgPerDay || topic.dailyTarget) : null;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  const openLinked = () => {
    if (!topic.linkedPackage || !AppBlocker) return;
    if (!AppBlocker.launchApp(topic.linkedPackage))
      Alert.alert('Не открывается', 'Приложение не найдено на устройстве.');
  };
  const completed = topic.completedAt != null;
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
        (book ? ' Дальше укажешь страницу, с которой начинаешь.' : ''),
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: () => (book ? setPagePrompt(true) : void resetTopicProgress(topicId, Date.now(), null)),
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
        <Text style={[styles.cardTitle, { color: colors.text }]}>Сегодня</Text>
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
            <Meter
              label={
                p.targetMet
                  ? 'Цель выполнена'
                  : p.minMet
                    ? `Минимум есть · до цели ${p.leftToTarget}`
                    : `До минимума ${p.leftToMin}`
              }
              value={p.done}
              total={Math.max(p.target, 1)}
              color={topic.color}
              mark={p.minimum}
              suffix={topic.unit}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Цель {p.target} {topic.unit} · минимум {p.minimum} · ~{topic.minutesPerUnit} мин/{topic.unit}
              {topic.maxGrantMinutes != null ? ` · до ${topic.maxGrantMinutes} мин развлечений/${topic.unit}` : ''}
            </Text>
            <LogControls topic={topic} large />
          </>
        )}
        {topic.linkedPackage && AppBlocker && (
          <Pressable
            onPress={openLinked}
            style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="open-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Открыть приложение</Text>
          </Pressable>
        )}
      </View>

      {book && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Книга</Text>
          {topic.positionTotal != null ? (
            <>
              <Meter
                label={`Страница ${topic.positionCurrent ?? 0}`}
                value={topic.positionCurrent ?? 0}
                total={topic.positionTotal}
                color={colors.primary}
              />
              <Text style={{ color: colors.textMuted }}>
                {pagesLeft != null && pagesLeft <= 0
                  ? completed
                    ? 'Книга прочитана!'
                    : 'Книга прочитана! Отметь тему завершённой, чтобы убрать её из дневной нормы.'
                  : `Прочитано ${Math.round(((topic.positionCurrent ?? 0) / topic.positionTotal) * 100)}% · осталось ${pagesLeft} стр.` +
                    (eta != null ? ` · закончишь ~${formatDayMonth(addDays(new Date(), eta))}` : '')}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.textMuted }}>
              Сейчас на странице {topic.positionCurrent ?? 0}. Укажи число страниц в настройках темы, чтобы видеть
              процент и дату окончания.
            </Text>
          )}
        </View>
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
