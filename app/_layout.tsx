import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/bootstrap/AppProviders';
import { colors } from '@/design/tokens';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: 'fade_from_bottom',
          contentStyle: { backgroundColor: colors.canvas },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="_dev/flash-list"
          options={{ title: '10K 消息基准', presentation: 'modal' }}
        />
        <Stack.Screen
          name="_dev/storage"
          options={{ title: '加密存储验收', presentation: 'modal' }}
        />
        <Stack.Screen name="+not-found" options={{ title: '页面不存在' }} />
      </Stack>
    </AppProviders>
  );
}
