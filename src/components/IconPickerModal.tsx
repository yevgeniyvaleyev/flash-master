import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchIcons } from '@/logic/topic-icons';
import { useColors } from '@/theme';

import { ICON_NAMES, type IconName } from './TopicMark';

const COLUMNS = 6;

interface Props {
  visible: boolean;
  /** Current icon (outlined in the grid). */
  value: string | null;
  /** The topic's color: icons are previewed in it. */
  color: string;
  /** null = no icon (the color dot). */
  onPick: (icon: string | null) => void;
  onClose: () => void;
}

/**
 * Icon picker: popular study and hobby icons by default; search by Russian words («книга», «карточки») or by any of
 * the font's English names («guitar»).
 */
export function IconPickerModal({ visible, value, color, onPick, onClose }: Props) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchIcons(query, ICON_NAMES), [query]);
  const pick = (icon: string | null) => {
    onPick(icon);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Иконка темы</Text>
          <View style={[styles.search, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск: книга, карточки, guitar…"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text }]}
            />
            {query !== '' && (
              <Pressable hitSlop={8} onPress={() => setQuery('')} accessibilityLabel="Очистить поиск">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {query.trim() === ''
              ? 'Популярные'
              : results.length === 0
                ? 'Ничего не найдено'
                : `Найдено: ${results.length}`}
          </Text>
          <FlatList
            data={results}
            keyExtractor={(n) => n}
            numColumns={COLUMNS}
            keyboardShouldPersistTaps="handled"
            style={styles.grid}
            renderItem={({ item }) => {
              const on = item === value;
              return (
                <Pressable
                  onPress={() => pick(item)}
                  accessibilityLabel={item}
                  style={({ pressed }) => [
                    styles.cell,
                    { borderColor: on ? colors.text : 'transparent' },
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <MaterialCommunityIcons name={item as IconName} size={26} color={color} />
                </Pressable>
              );
            }}
          />
          <View style={styles.actions}>
            <Pressable onPress={() => pick(null)} hitSlop={6}>
              <Text style={{ color: colors.danger, fontWeight: '600' }}>Без иконки</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={6}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Закрыть</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  card: { borderRadius: 16, padding: 16, gap: 10, maxHeight: '85%' },
  title: { fontSize: 17, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10 },
  input: { flex: 1, paddingVertical: 8, fontSize: 15 },
  grid: { flexGrow: 0, height: 320 },
  cell: {
    flex: 1 / COLUMNS,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 2,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
});
