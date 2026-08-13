import { StyleSheet, Text, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { AppIcon, type AppIconName } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';

export function EmptyState({
  actionLabel,
  description,
  icon = 'bookmark',
  onAction,
  title,
}: {
  actionLabel?: string;
  description: string;
  icon?: AppIconName;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <AppIcon color={colors.accent} name={icon} size={26} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <MotionPressable accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </MotionPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
  },
  title: { ...typography.title, color: colors.ink, textAlign: 'center' },
  description: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  action: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  actionText: { ...typography.label, color: colors.surfaceRaised },
});
