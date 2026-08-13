import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/design/tokens';

export default function NotFoundRoute() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>M2Y</Text>
      <Text style={styles.title}>这里还没有内容</Text>
      <Text style={styles.description}>这个入口可能已移动，回到两个人的共享空间继续。</Text>
      <Link href="/chat" style={styles.link}>
        返回聊天
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.canvas,
  },
  eyebrow: { ...typography.label, color: colors.accent },
  title: { ...typography.hero, color: colors.ink, textAlign: 'center' },
  description: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  link: {
    ...typography.label,
    color: colors.surface,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
