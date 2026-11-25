import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopicMark } from '@/components/TopicMark';
import { loadToday } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import { moveTopic } from '@/logic/actions';
import type { Topic, TopicProgress } from '@/logic/goal';
import { formatMinutes } from '@/logic/dates';
import { weekdaysLabel } from '@/logic/day-rules';
import { formatDayMonth } from '@/logic/history';
import { useColors } from '@/theme';

const open = (id: number) => router.push({ pathname: '/topic/[id]', params: { id: String(id) } });

/**
 * All topics: those in progress with their norms and today's progress (arrows reorder, the button adds a topic), and
 * below them the completed ones, which are out of the daily norm but keep their history.
 */
export default function TopicsScreen() {
  const colors = useColors();
  const today = useQuery(() => loadToday());
  const progress = new Map(today?.progress.topics.map((p) => [p.topicId, p]));
  const all = today?.topics ?? [];
  const active = all.filter((t) => t.completedAt == null);
  const completed = all
    .filter((t) => t.completedAt != null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.list}>
        {today && active.length === 0 && (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {completed.length > 0
              ? 'Все темы завершены. Добавь новую, чтобы продолжить.'
              : 'Тем пока нет. Добавь первую: например, «Книга — 20 стр. в день, минимум 3».'}
          </Text>
        )}
        {active.map((t, i) => (
          <ActiveRow
            key={t.id}
            topic={t}
            progress={progress.get(t.id)}
            offDay={today?.rules.get(t.id)?.active === false}
            first={i === 0}
            last={i === active.length - 1}
          />
        ))}

        {completed.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.textMuted }]}>Завершённые</Text>
            {completed.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => open(t.id)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
                ]}
              >
                <TopicMark color={t.color} icon={t.icon} dim />
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: colors.textMuted }]}>{t.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Завершена {formatDayMonth(new Date(t.completedAt!))}
                  </Text>
                </View>
                <Ionicons
                  name="checkmark-done-circle"
                  size={24}
                  color={colors.success}
                  accessibilityLabel="Завершена"
                />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
      <Pressable
        onPress={() => router.push('/topic/edit')}
        accessibilityLabel="Добавить тему"
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

function ActiveRow({
  topic: t,
  progress: p,
  first,
  last,
  offDay,
}: {
  topic: Topic;
  progress: TopicProgress | undefined;
  /** Today isn't one of the topic's weekdays. */
  offDay: boolean;
  first: boolean;
  last: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => open(t.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
      ]}
    >
      <TopicMark color={t.color} icon={t.icon} />
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: colors.text }]}>{t.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {t.dailyTarget} {t.unit} в день · минимум {Math.min(t.unlockMin, t.dailyTarget)} · ~{t.minutesPerUnit} мин/
          {t.unit}
          {t.deadlineMinutes != null ? ` · до ${formatMinutes(t.deadlineMinutes)}` : ''}
          {weekdaysLabel(t) ? ` · ${weekdaysLabel(t)}` : ''}
        </Text>
      </View>
      {t.paused ? (
        <Ionicons name="pause-circle" size={24} color={colors.textMuted} accessibilityLabel="На паузе" />
      ) : offDay ? (
        <Ionicons name="bed-outline" size={22} color={colors.textMuted} accessibilityLabel="Сегодня выходной" />
      ) : p?.targetMet ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.success} accessibilityLabel="Цель выполнена" />
      ) : (
        <Text style={[styles.left, { color: p?.minMet ? colors.accent : colors.warning }]}>
          {p?.done ?? 0}/{p?.target ?? t.dailyTarget}
        </Text>
      )}
      <View style={styles.arrows}>
        <Pressable hitSlop={6} disabled={first} onPress={() => void moveTopic(t.id, -1)} accessibilityLabel="Выше">
          <Ionicons name="chevron-up" size={18} color={first ? colors.border : colors.textMuted} />
        </Pressable>
        <Pressable hitSlop={6} disabled={last} onPress={() => void moveTopic(t.id, 1)} accessibilityLabel="Ниже">
          <Ionicons name="chevron-down" size={18} color={last ? colors.border : colors.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10, paddingBottom: 96 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15, paddingHorizontal: 24 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    paddingRight: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  left: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  arrows: { gap: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
