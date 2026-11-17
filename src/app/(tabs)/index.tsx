import { Ionicons } from '@expo/vector-icons';
import { AppBlocker } from '@modules/app-blocker';
import { StudyAlarms } from '@modules/study-alarms';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Meter, TopicBars } from '@/components/charts';
import { DayTimeline } from '@/components/DayTimeline';
import { LogControls } from '@/components/LogControls';
import { getDayResults } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import { availableMs, dayTimeline } from '@/logic/budget';
import { loadDayBudget } from '@/logic/day-budget';
import { computeStreak } from '@/logic/progress';
import { useSettings } from '@/store/settings';
import { useColors } from '@/theme';

async function loadDashboard() {
  const [budget, results] = await Promise.all([loadDayBudget(), getDayResults(400)]);
  // Expo Go has no blocker, so nothing has been used there.
  return { budget, results, usedMs: AppBlocker?.getUsedMs() ?? 0 };
}

const formatLeft = (left: number | null) => (left == null ? 'без ограничений' : `${Math.floor(left / 60_000)} мин.`);

/** Current time, refreshed every minute (moves the "now" marker and the live cap). */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Today: what's left to unlock the apps and to reach the targets, logging per topic, and the day plan. */
export default function TodayScreen() {
  const colors = useColors();
  const blocking = useSettings((s) => s.blockedPackages.length > 0) && AppBlocker != null;
  const alarms = useSettings((s) => s.alarmsEnabled) && StudyAlarms != null;
  // The budget reads these settings, so reload when any of them changes.
  const budgetKey = useSettings((s) =>
    JSON.stringify([s.dayStartHour, s.maxGrantMinutes, s.minSessionMinutes, s.reminderStartHour, s.reminderEndHour]),
  );
  const data = useQuery(loadDashboard, budgetKey);
  const now = useNow();

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const b = data.budget;
  const { progress, topics } = b.today;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const streak = computeStreak({
    ...data.results,
    [b.today.day]: progress.targetTotal === 0 ? null : progress.targetMet,
  });
  const available = availableMs(now, b.done, b.goal, b.granted, data.usedMs, b.deadline, b.reserve);
  const timeline = dayTimeline({
    now,
    start: b.start,
    end: b.deadline,
    done: b.today.entries,
    goalMet: progress.unlocked,
    blocks: b.blocks,
    available,
  });
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const paused = topics.filter((t) => t.paused && t.completedAt == null);

  // Completed topics live on the «Темы» tab only.
  if (topics.every((t) => t.completedAt != null)) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.background }]}>
        <Ionicons name="flag-outline" size={56} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.text }]}>Пока нет ни одной темы</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
          Тема — это дневная норма: 10 карточек, 20 страниц, 30 минут. Минимум по каждой теме открывает развлекательные
          приложения, а напоминания ведут к полной цели.
        </Text>
        <Pressable
          onPress={() => router.push('/topic/edit')}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="add" size={18} color={colors.onPrimary} />
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>Добавить тему</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={card}>
        <Text style={[styles.todayTitle, { color: colors.text }]}>
          {progress.targetMet
            ? 'Цель на сегодня выполнена!'
            : progress.unlocked
              ? 'Минимум выполнен — приложения открыты'
              : `До разблокировки: ${progress.minTotal - progress.minDone}`}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statRow}>
            <Ionicons name={progress.unlocked ? 'lock-open' : 'lock-closed'} size={16} color={colors.warning} />
            <Text style={{ color: colors.text }}>
              Минимум {progress.minDone}/{progress.minTotal}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="flag" size={16} color={colors.accent} />
            <Text style={{ color: colors.text }}>
              Цель {progress.targetDone}/{progress.targetTotal}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="flame" size={16} color={colors.warning} />
            <Text style={{ color: colors.text }}>Серия {streak} дн.</Text>
          </View>
          {blocking && (
            <View style={styles.statRow}>
              <Ionicons name="game-controller" size={16} color={colors.danger} />
              <Text style={{ color: colors.text }}>{formatLeft(available)}</Text>
            </View>
          )}
        </View>
        {progress.topics.length > 0 && (
          <TopicBars
            items={progress.topics.map((p) => ({
              key: p.topicId,
              name: p.name,
              color: p.color,
              done: p.done,
              target: p.target,
              minimum: p.minimum,
            }))}
          />
        )}
      </View>

      <View style={card}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Темы на сегодня</Text>
        {progress.topics.map((p) => {
          const topic = byId.get(p.topicId)!;
          return (
            <View key={p.topicId} style={styles.topicRow}>
              <Pressable
                style={{ flex: 1, gap: 4 }}
                onPress={() => router.push({ pathname: '/topic/[id]', params: { id: String(p.topicId) } })}
              >
                <Meter
                  label={p.name}
                  value={p.done}
                  total={Math.max(p.target, 1)}
                  color={p.color}
                  mark={p.minimum}
                  suffix={p.unit}
                />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {p.targetMet
                    ? 'Цель выполнена'
                    : p.minMet
                      ? `Минимум есть · до цели ${p.leftToTarget} ${p.unit}`
                      : `До минимума ${p.leftToMin} ${p.unit} · до цели ${p.leftToTarget}`}
                </Text>
              </Pressable>
              <LogControls topic={topic} />
            </View>
          );
        })}
        {paused.length > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            На паузе: {paused.map((t) => t.name).join(', ')}
          </Text>
        )}
      </View>

      {b.start < b.deadline && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>План дня</Text>
          <DayTimeline timeline={timeline} alarms={alarms} nextTitle={timeline.plan[0]?.label} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 14 },
  todayTitle: { fontSize: 17, fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
