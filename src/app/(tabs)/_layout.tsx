import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';

import { loadToday } from '@/db/repo';
import { useQuery } from '@/hooks/use-query';
import { useColors } from '@/theme';

// Tab bar colors may be any ColorValue; ours are always plain strings.
const tabIcon = (name: keyof typeof Ionicons.glyphMap) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  const today = useQuery(() => loadToday());
  // Units still needed to unlock the apps.
  const toUnlock = today ? today.progress.minTotal - today.progress.minDone : 0;
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        // Explicit theme colors, so the bar (and the system nav bar area under it) follows the in-app theme.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Сегодня',
          tabBarBadge: toUnlock > 0 ? toUnlock : undefined,
          tabBarIcon: tabIcon('today-outline'),
        }}
      />
      <Tabs.Screen name="topics" options={{ title: 'Темы', tabBarIcon: tabIcon('list-outline') }} />
      <Tabs.Screen name="stats" options={{ title: 'Статистика', tabBarIcon: tabIcon('stats-chart') }} />
      <Tabs.Screen name="settings" options={{ title: 'Настройки', tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}
