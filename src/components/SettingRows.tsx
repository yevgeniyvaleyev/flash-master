import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme';

/** − value + control for a number setting. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
  format,
  step = 1,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  format?: (v: number) => string;
  step?: number;
}) {
  const colors = useColors();
  // Rounded so fractional steps (0.25) don't accumulate float noise.
  const change = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <View style={styles.stepper}>
      <Pressable hitSlop={8} disabled={value <= min} onPress={() => change(value - step)}>
        <Ionicons name="remove-circle-outline" size={26} color={value <= min ? colors.border : colors.primary} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: colors.text }]}>
        {format ? format(value) : value}
        {suffix}
      </Text>
      <Pressable hitSlop={8} disabled={value >= max} onPress={() => change(value + step)}>
        <Ionicons name="add-circle-outline" size={26} color={value >= max ? colors.border : colors.primary} />
      </Pressable>
    </View>
  );
}

/** A settings row: label + hint on the left, a control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperValue: { minWidth: 44, textAlign: 'center', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
