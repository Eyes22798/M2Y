import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { colors, typography } from '@/design/tokens';

function TabGlyph({ value, color }: { value: string; color: ColorValue }) {
  return <Text style={{ ...typography.title, color }}>{value}</Text>;
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: typography.caption,
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: '聊天',
          tabBarIcon: ({ color }) => <TabGlyph value="↗" color={color} />,
        }}
      />
      <Tabs.Screen
        name="space"
        options={{
          title: 'Space',
          tabBarIcon: ({ color }) => <TabGlyph value="◇" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => <TabGlyph value="··" color={color} />,
        }}
      />
    </Tabs>
  );
}
