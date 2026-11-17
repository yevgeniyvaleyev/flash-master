import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { checkpoint, runAutoBackup } from '@/backup/backup';
import { openDb } from '@/db/client';
import { BACKGROUND_SETTING_KEYS, syncBackground } from '@/logic/background';
import { ensureNotificationPermission } from '@/notifications/reminders';
import { useDataVersion } from '@/store/data-version';
import { useSettings } from '@/store/settings';
import { useColors, useIsDark } from '@/theme';

async function bootstrap() {
  await openDb();
  await useSettings.getState().hydrate();
  if (useSettings.getState().remindersEnabled) await ensureNotificationPermission();
  await syncBackground();
  void runAutoBackup();
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const colors = useColors();
  const isDark = useIsDark();

  useEffect(() => {
    bootstrap().finally(() => setReady(true));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Complete .db file for Android Auto Backup.
        void checkpoint();
        return;
      }
      if (state !== 'active') return;
      // The day may have changed while the app was in the background: refresh the screens too.
      useDataVersion.getState().bump();
      void syncBackground().then(() => runAutoBackup());
    });
    const unsubscribe = useSettings.subscribe((next, prev) => {
      if (BACKGROUND_SETTING_KEYS.some((k) => next[k] !== prev[k])) void syncBackground();
    });
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, []);

  // The window background shows behind the transparent system bars (edge-to-edge) and during transitions.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [isDark, colors]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {/* Explicit, not 'auto': the in-app theme override must win over the system scheme. */}
        <NavigationBar style={isDark ? 'dark' : 'light'} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="topic/[id]" options={{ title: '' }} />
          <Stack.Screen name="topic/edit" options={{ title: 'Тема' }} />
          <Stack.Screen name="blocked-apps" options={{ title: 'Блокируемые приложения' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
