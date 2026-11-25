import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DailyBars } from '@/components/charts';
import { TopicMark } from '@/components/TopicMark';
import { getDayResultRows, getHistory, getTopicDays, listTopics, loadToday } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import { dayKey, lastDays } from '@/logic/dates';
import { formatDayHeader, groupHistory } from '@/logic/history';
import { bestStreak, computeStreak, type DayResults } from '@/logic/progress';
import { dayGrade, topicStats } from '@/logic/stats';
import { useSettings } from '@/store/settings';
import { useColors } from '@/theme';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
/** How far back streaks are followed. */
const STREAK_DAYS = 400;

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function loadStats(historyDays: number) {
  const [today, results, topicDays, topics, history] = await Promise.all([
    loadToday(),
    getDayResultRows(STREAK_DAYS),
    getTopicDays(STREAK_DAYS),
    listTopics(true),
    getHistory(historyDays),
  ]);
  return { today, results, topicDays, topics, history };
}

/** Days over 7/30 days, the streaks, every topic's numbers and the day log. */
export default function StatsScreen() {
  const colors = useColors();
  const historyDays = useSettings((s) => s.historyDays);
  const data = useQuery(() => loadStats(historyDays), String(historyDays));
  const [range, setRange] = useState<7 | 30>(7);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const { today } = data;
  const p = today.progress;
  // Today's live result over the stored row (which may lag the last entry).
  const results = {
    ...data.results,
    [today.day]: {
      day: today.day,
      minDone: p.minDone,
      minTotal: p.minTotal,
      targetDone: p.targetDone,
      targetTotal: p.targetTotal,
      minMet: p.unlocked,
      targetMet: p.targetMet,
    },
  };
  const met: DayResults = Object.fromEntries(
    Object.values(results).map((r) => [r.day, r.targetTotal === 0 ? null : r.targetMet]),
  );
  const allDays = lastDays(STREAK_DAYS);
  const days = lastDays(range);
  const gradeColor = { target: colors.success, minimum: colors.accent, missed: colors.warning, none: colors.primary };
  const tracked = days.filter((d) => dayGrade(results[d]) !== 'none');
  const share = (pred: (d: string) => boolean) =>
    tracked.length === 0 ? '—' : `${Math.round((tracked.filter(pred).length / tracked.length) * 100)}%`;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  const liveRows = [
    ...data.topicDays.filter((r) => r.day !== today.day),
    ...today.progress.topics.map((t) => ({
      day: today.day,
      topicId: t.topicId,
      target: t.target,
      minimum: t.minimum,
      done: t.done,
      paused: false,
    })),
  ];
  const topics = data.topics.filter((t) => !t.archived || liveRows.some((r) => r.topicId === t.id && r.done > 0));
  const history = groupHistory(data.history, lastDays(historyDays).reverse());

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={card}>
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Дни</Text>
          <View style={styles.segment}>
            {([7, 30] as const).map((r) => (
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
        <DailyBars
          values={days.map((d) => results[d]?.targetDone ?? 0)}
          barColors={days.map((d) => gradeColor[dayGrade(results[d])])}
          labels={range === 7 ? days.map((d) => WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]) : undefined}
        />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Единиц к цели за день. Зелёным — все цели, бирюзовым — только минимум, жёлтым — минимум не выполнен
        </Text>
        <View style={styles.statsGrid}>
          <Stat label="Серия" value={`${computeStreak(met)} дн.`} />
          <Stat label="Лучшая серия" value={`${bestStreak(allDays.map((d) => met[d]))} дн.`} />
          <Stat label="Дней с целью" value={share((d) => dayGrade(results[d]) === 'target')} />
          <Stat label="Дней с минимумом" value={share((d) => dayGrade(results[d]) !== 'missed')} />
        </View>
      </View>

      {topics.length > 0 && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Темы за {range} дн.</Text>
          {topics.map((t) => {
            const s = topicStats(
              liveRows,
              t.id,
              range,
              new Date(),
              t.resetAt != null ? dayKey(new Date(t.resetAt)) : null,
            );
            return (
              <Pressable
                key={t.id}
                disabled={t.archived}
                onPress={() => router.push({ pathname: '/topic/[id]', params: { id: String(t.id) } })}
                style={styles.topicRow}
              >
                <TopicMark color={t.color} icon={t.icon} size={10} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                    {t.name}
                    {t.archived ? ' (удалена)' : t.completedAt != null ? ' (завершена)' : t.paused ? ' (пауза)' : ''}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {s.windowTotal} {t.unit} · в среднем {Math.round(s.avgPerDay * 10) / 10} в день · цель{' '}
                    {s.metRate == null ? '—' : `${Math.round(s.metRate * 100)}%`} дней
                  </Text>
                </View>
                <View style={styles.streak}>
                  <Ionicons name="flame" size={16} color={s.currentStreak > 0 ? colors.warning : colors.border} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{s.currentStreak}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[styles.section, { color: colors.textMuted }]}>Журнал за {historyDays} дн.</Text>
      {history.map((day) => {
        const r = results[day.day];
        const grade = dayGrade(r);
        return (
          <View key={day.day} style={card}>
            <View style={styles.cardHead}>
              <Text style={[styles.dayTitle, { color: colors.text }]} numberOfLines={1}>
                {formatDayHeader(day.date)}
              </Text>
              {grade !== 'none' && (
                <Ionicons
                  name={grade === 'target' ? 'checkmark-circle' : grade === 'minimum' ? 'lock-open' : 'close-circle'}
                  size={18}
                  color={gradeColor[grade]}
                />
              )}
            </View>
            {day.items.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>Ничего не записано</Text>
            ) : (
              <>
                <Text style={{ color: colors.text }}>
                  {day.totals.map((t) => `${t.name}: ${t.units} ${t.unit}`).join(' · ')}
                </Text>
                {day.items.map((e) => (
                  <View key={e.id} style={styles.entry}>
                    <Text style={{ color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{hhmm(e.ts)}</Text>
                    <Text style={{ color: colors.textMuted, flex: 1 }} numberOfLines={1}>
                      {e.topicName} · +{e.units} {e.unit}
                      {e.position != null ? ` (до стр. ${e.position})` : ''}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        );
      })}
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
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  dayTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 8, marginLeft: 4 },
  segment: { flexDirection: 'row', gap: 4 },
  segmentItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '45%', flexGrow: 1 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entry: { flexDirection: 'row', gap: 10 },
});
