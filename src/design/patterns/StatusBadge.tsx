import { StyleSheet, Text, View } from 'react-native';

import type { SharedItemStatus } from '@/domain/shared-item/types';
import { colors, radius, spacing, typography } from '@/design/tokens';

const labels: Record<SharedItemStatus, string> = {
  active: '进行中',
  waiting: '本地草稿',
  done: '已完成',
  confirmed: '已确认',
  archived: '已归档',
};

export function StatusBadge({ status }: { status: SharedItemStatus }) {
  const tone = status === 'done' || status === 'confirmed' ? 'positive' : status;
  return (
    <View
      style={[
        styles.badge,
        tone === 'positive'
          ? styles.positive
          : tone === 'waiting'
            ? styles.waiting
            : styles.neutral,
      ]}
    >
      <Text
        style={[
          styles.text,
          tone === 'positive'
            ? styles.positiveText
            : tone === 'waiting'
              ? styles.waitingText
              : styles.neutralText,
        ]}
      >
        {labels[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  positive: { backgroundColor: colors.positiveSoft },
  waiting: { backgroundColor: colors.waitingSoft },
  neutral: { backgroundColor: colors.surfaceMuted },
  text: typography.caption,
  positiveText: { color: colors.positive },
  waitingText: { color: colors.waiting },
  neutralText: { color: colors.inkMuted },
});
