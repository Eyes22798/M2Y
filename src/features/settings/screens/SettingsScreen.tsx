import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';

const privacyRows = [
  ['服务端零明文', '服务端可以转发密文，但不能解密内容'],
  ['本地优先', '身份密钥、搜索与 Space 数据由设备边界保护'],
  ['只有两个人', '关系层不扩展群聊、关注或公开主页'],
] as const;

export function SettingsScreen() {
  return (
    <ScreenScaffold
      eyebrow="边界清晰"
      title="设置"
      description="当前是 M0 工程骨架；安全能力将在独立 Spike 中逐项验证。"
    >
      <View style={styles.card}>
        {privacyRows.map(([title, detail]) => (
          <View key={title} style={styles.row}>
            <Text style={styles.rowTitle}>{title}</Text>
            <Text style={styles.rowDetail}>{detail}</Text>
          </View>
        ))}
      </View>

      {__DEV__ ? (
        <Link href="/_dev/flash-list" style={styles.devLink}>
          打开 10,000 条消息基准页 →
        </Link>
      ) : null}

      <Text style={styles.version}>M2Y 0.1.0 · Expo SDK 56</Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  row: {
    paddingVertical: spacing.lg,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: { ...typography.title, color: colors.ink },
  rowDetail: { ...typography.body, color: colors.inkMuted },
  devLink: {
    ...typography.title,
    padding: spacing.lg,
    color: colors.surface,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  version: { ...typography.caption, color: colors.inkFaint, textAlign: 'center' },
});
