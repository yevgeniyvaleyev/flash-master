import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PromptModal } from '@/components/PromptModal';
import { addEntry } from '@/logic/actions';
import type { Topic } from '@/logic/goal';
import { positionDelta, PositionError } from '@/logic/position';
import { useColors } from '@/theme';

/** Largest amount accepted in one entry (a typo guard). */
const MAX_UNITS = 1000;

/**
 * Buttons that log done units for a topic: +1, +step and ✎ (type an amount; long-pressing +1 does the same). In book
 * mode one button asks for the page reached and logs the difference to the current page.
 */
export function LogControls({ topic, large }: { topic: Topic; large?: boolean }) {
  const colors = useColors();
  const [prompt, setPrompt] = useState<'amount' | 'page' | null>(null);
  const book = topic.mode === 'position';

  const logAmount = (text: string) => {
    const n = Number(text.replace(',', '.'));
    if (!Number.isInteger(n) || n <= 0 || n > MAX_UNITS) {
      Alert.alert('Неверное число', `Введи целое число от 1 до ${MAX_UNITS}`);
      return;
    }
    void addEntry(topic.id, n);
  };

  const logPage = (text: string) => {
    try {
      const page = Number(text);
      const delta = positionDelta(topic.positionCurrent, page, topic.positionTotal);
      void addEntry(topic.id, delta, page);
    } catch (e) {
      Alert.alert('Не получилось', e instanceof PositionError ? e.message : String(e));
    }
  };

  const size = large ? 56 : 40;
  const button = (label: string, onPress: () => void, primary: boolean, onLongPress?: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`Добавить ${label}`}
      style={({ pressed }) => [
        styles.button,
        { height: size, minWidth: size, borderRadius: size / 2, paddingHorizontal: large ? 18 : 10 },
        primary
          ? { backgroundColor: colors.primary }
          : { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text
        style={{ color: primary ? colors.onPrimary : colors.primary, fontWeight: '800', fontSize: large ? 18 : 15 }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.row, large && styles.rowLarge]}>
      {book && button(large ? 'Я на странице…' : `стр. ${topic.positionCurrent ?? 0}`, () => setPrompt('page'), true)}
      {!book &&
        button(
          '+1',
          () => void addEntry(topic.id, 1),
          true,
          () => setPrompt('amount'),
        )}
      {!book && topic.step > 1 && button(`+${topic.step}`, () => void addEntry(topic.id, topic.step), false)}
      {!book && (
        <Pressable
          onPress={() => setPrompt('amount')}
          accessibilityLabel="Ввести количество"
          hitSlop={6}
          style={[styles.more, { height: size }]}
        >
          <Ionicons name="create-outline" size={large ? 26 : 20} color={colors.textMuted} />
        </Pressable>
      )}

      <PromptModal
        visible={prompt === 'amount'}
        title={`${topic.name}: сколько сделано?`}
        message={`Единица: ${topic.unit}`}
        placeholder="Количество"
        keyboardType="number-pad"
        confirmLabel="Добавить"
        onSubmit={logAmount}
        onClose={() => setPrompt(null)}
      />
      <PromptModal
        visible={prompt === 'page'}
        title={`${topic.name}: на какой ты странице?`}
        message={
          topic.positionCurrent != null
            ? `Сейчас: ${topic.positionCurrent}${topic.positionTotal ? ` из ${topic.positionTotal}` : ''}`
            : undefined
        }
        placeholder="Страница"
        keyboardType="number-pad"
        confirmLabel="Сохранить"
        onSubmit={logPage}
        onClose={() => setPrompt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLarge: { gap: 12, justifyContent: 'center' },
  button: { alignItems: 'center', justifyContent: 'center' },
  more: { justifyContent: 'center', paddingHorizontal: 4 },
});
