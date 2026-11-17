import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useColors } from '@/theme';

export interface TopicBar {
  key: string | number;
  name: string;
  color: string;
  done: number;
  target: number;
  minimum: number;
}

/**
 * One horizontal bar per topic, stacked in a single column: the full topic name (wraps, never cut) with the count on
 * the right, then the bar filled in the topic's color toward its target with a line at the minimum (the unlock level).
 * A lock means the minimum isn't met yet (the fill stays faded until it is); a check means the target is met.
 */
export function TopicBars({ items }: { items: readonly TopicBar[] }) {
  const colors = useColors();
  return (
    <View style={styles.barsList}>
      {items.map((t) => {
        const total = Math.max(1, t.target);
        const ratio = Math.min(1, t.done / total);
        const targetMet = t.done >= t.target;
        const minMet = t.done >= t.minimum;
        return (
          <View key={t.key} style={styles.barItem}>
            <View style={styles.barHead}>
              <Text style={[styles.barTitle, { color: colors.text }]}>{t.name}</Text>
              <Ionicons
                name={targetMet ? 'checkmark-circle' : minMet ? 'lock-open' : 'lock-closed'}
                size={13}
                color={targetMet ? colors.success : minMet ? colors.textMuted : colors.warning}
              />
              <Text style={[styles.barValue, { color: targetMet ? colors.success : colors.textMuted }]}>
                {t.done}/{t.target}
              </Text>
            </View>
            <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${ratio * 100}%`, backgroundColor: t.color, opacity: minMet ? 1 : 0.55 },
                ]}
              />
              {t.minimum > 0 && t.minimum < total && (
                <View
                  style={[styles.barMin, { left: `${(t.minimum / total) * 100}%`, backgroundColor: colors.text }]}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Daily bar chart; bars that reach the goal are drawn in the success color, with a dashed goal line.
 * Each day's count is printed under its bar (empty days stay blank), with optional per-day labels below.
 */
export function DailyBars({
  values,
  goal = 0,
  met,
  barColors,
  labels,
  height = 120,
}: {
  values: number[];
  /** Draws a dashed goal line and colors bars that reach it (when `met` isn't given). */
  goal?: number;
  /** Per-bar "goal met" (the daily goal varies per day). */
  met?: boolean[];
  /** Per-bar fill color; overrides `met`/`goal` coloring. */
  barColors?: string[];
  labels?: string[];
  height?: number;
}) {
  const colors = useColors();
  const max = Math.max(goal, ...values, 1);
  const ok = (v: number, i: number) => (met ? met[i] === true : goal > 0 && v >= goal);
  const gap = values.length > 14 ? 2 : 6;
  const dense = values.length > 14;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${values.length * 20} ${height}`} preserveAspectRatio="none">
          {values.map((v, i) => {
            const h = (v / max) * (height - 4);
            return (
              <Rect
                key={i}
                x={i * 20 + gap / 2}
                y={height - h}
                width={20 - gap}
                height={Math.max(h, v > 0 ? 2 : 0)}
                rx={2}
                fill={barColors?.[i] ?? (ok(v, i) ? colors.success : colors.primary)}
              />
            );
          })}
          {goal > 0 && (
            <Line
              x1={0}
              x2={values.length * 20}
              y1={height - (goal / max) * (height - 4)}
              y2={height - (goal / max) * (height - 4)}
              stroke={colors.textMuted}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
        </Svg>
      </View>
      <View style={styles.barLabels}>
        {values.map((v, i) => (
          <Text
            key={i}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.barLabel,
              { fontSize: dense ? 9 : 13, color: barColors?.[i] ?? (ok(v, i) ? colors.success : colors.text) },
            ]}
          >
            {v > 0 ? v : ''}
          </Text>
        ))}
      </View>
      {labels && (
        <View style={styles.barLabels}>
          {labels.map((l, i) => (
            <Text key={i} numberOfLines={1} style={[styles.barLabel, { fontSize: 11, color: colors.textMuted }]}>
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** A labelled progress bar; `mark` draws a tick at that value (e.g. the minimum on the way to the target). */
export function Meter({
  label,
  value,
  total,
  color,
  mark,
  suffix,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  mark?: number;
  /** Appended to «value/total» (a unit). */
  suffix?: string;
}) {
  const colors = useColors();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
          {value}/{total}
          {suffix ? ` ${suffix}` : ''}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
        {mark != null && mark > 0 && mark < total && (
          <View style={[styles.mark, { left: `${(mark / total) * 100}%`, backgroundColor: colors.text }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barsList: { gap: 12 },
  barItem: { gap: 5 },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  barValue: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barMin: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
  meter: { gap: 6 },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
  barLabels: { flexDirection: 'row' },
  barLabel: { flex: 1, textAlign: 'center', fontWeight: '700', fontVariant: ['tabular-nums'] },
});
