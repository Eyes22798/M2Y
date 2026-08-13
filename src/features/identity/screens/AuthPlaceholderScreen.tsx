import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';

export function AuthPlaceholderScreen({
  description,
  step,
  title,
}: {
  description: string;
  step: string;
  title: string;
}) {
  return (
    <ScreenScaffold eyebrow={`安全建立 · ${step}`} title={title} description={description}>
      <View style={styles.boundaryCard}>
        <Text style={styles.boundaryTitle}>此页面只定义流程边界</Text>
        <Text style={styles.boundaryBody}>
          不生成演示密钥，不伪装 E2EE 已经完成，也不把敏感身份信息写进普通状态容器。
        </Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  boundaryCard: {
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  boundaryTitle: { ...typography.title, color: colors.surface },
  boundaryBody: { ...typography.body, color: colors.inkFaint },
});
