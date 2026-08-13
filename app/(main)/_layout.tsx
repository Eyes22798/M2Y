import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { AppIcon, type AppIconName } from '@/design/primitives/AppIcon';
import { colors, typography } from '@/design/tokens';

function TabIcon({ color, name }: { color: ColorValue; name: AppIconName }) {
  return <AppIcon color={color} name={name} size={22} />;
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarItemStyle: { paddingVertical: 5 },
        tabBarLabelStyle: typography.caption,
        tabBarStyle: {
          height: 68,
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: '聊天',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="chat" />,
        }}
      />
      <Tabs.Screen
        name="space"
        options={{
          title: 'Space',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="space" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="settings" />,
        }}
      />
    </Tabs>
  );
}
