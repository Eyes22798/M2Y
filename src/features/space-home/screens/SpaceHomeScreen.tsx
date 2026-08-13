import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { EmptyState } from '@/design/patterns/EmptyState';
import { StatusBadge } from '@/design/patterns/StatusBadge';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { PreviewSharedItemKind, SharedItem } from '@/domain/shared-item/types';
import {
  getKindIcon,
  previewKindOptions,
  sharedItemKindLabels,
} from '@/features/shared-item/shared-item-presenters';
import { usePreviewWorkspace } from '@/stores/preview-workspace/PreviewWorkspaceProvider';

type SpaceFilter = 'all' | PreviewSharedItemKind;

export function SpaceHomeScreen() {
  const { state } = usePreviewWorkspace();
  const [filter, setFilter] = useState<SpaceFilter>('all');
  const filteredItems = useMemo(
    () =>
      filter === 'all'
        ? state.sharedItems
        : state.sharedItems.filter((item) => item.kind === filter),
    [filter, state.sharedItems],
  );

  const openItem = (itemId: string) => {
    router.push(`/space/${itemId}` as Href);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Space</Text>
            <Text style={styles.description}>把聊天里重要的事，放到两个人共同的空间。</Text>
          </View>
          <View style={styles.previewChip}>
            <Text style={styles.previewChipText}>本地预览</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryValue}>{state.sharedItems.length}</Text>
            <Text style={styles.summaryLabel}>个共享条目</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryValue}>
              {state.sharedItems.filter((item) => item.status === 'waiting').length}
            </Text>
            <Text style={styles.summaryLabel}>个约定草稿</Text>
          </View>
          <View style={styles.summaryIcon}>
            <AppIcon color={colors.accent} name="space" size={26} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.filters}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <FilterChip active={filter === 'all'} label="全部" onPress={() => setFilter('all')} />
          {previewKindOptions.map((option) => (
            <FilterChip
              active={filter === option.kind}
              key={option.kind}
              label={option.label}
              onPress={() => setFilter(option.kind)}
            />
          ))}
        </ScrollView>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{filter === 'all' ? '最近更新' : '筛选结果'}</Text>
          <Text style={styles.sectionCount}>{filteredItems.length} 项</Text>
        </View>

        {filteredItems.length > 0 ? (
          <View style={styles.list}>
            {filteredItems.map((item) => (
              <SharedItemCard item={item} key={item.id} onPress={() => openItem(item.id)} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <EmptyState
              actionLabel={filter === 'all' ? '回到 Chat' : '查看全部'}
              description={
                filter === 'all'
                  ? '长按 Chat 中的消息，就能把它保存为笔记、待办或约定草稿。'
                  : '当前类型还没有内容，可以查看全部条目。'
              }
              icon="space"
              onAction={() => (filter === 'all' ? router.navigate('/chat') : setFilter('all'))}
              title={filter === 'all' ? 'Space 还是空的' : '没有筛选结果'}
            />
          </View>
        )}

        <View style={styles.localNotice}>
          <AppIcon color={colors.inkMuted} name="lock" size={18} />
          <Text style={styles.localNoticeText}>
            当前内容仅用于本地功能预览，App 重启后会清空，也不会同步到其他设备。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      accessibilityLabel={`筛选${label}`}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </MotionPressable>
  );
}

function SharedItemCard({ item, onPress }: { item: SharedItem; onPress: () => void }) {
  return (
    <MotionPressable
      accessibilityLabel={`打开${item.title}`}
      onPress={onPress}
      style={styles.itemCard}
    >
      <View style={styles.itemIcon}>
        <AppIcon color={colors.accent} name={getKindIcon(item.kind)} size={22} />
      </View>
      <View style={styles.itemCopy}>
        <View style={styles.itemTopLine}>
          <Text style={styles.kindLabel}>{sharedItemKindLabels[item.kind]}</Text>
          <Text style={styles.updatedAt}>{item.updatedAtLabel}</Text>
        </View>
        <Text numberOfLines={1} style={styles.itemTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={styles.itemDetail}>
          {item.detail || '没有补充说明'}
        </Text>
        <StatusBadge status={item.status} />
      </View>
      <AppIcon color={colors.inkFaint} name="chevronRight" size={18} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.section },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { ...typography.hero, color: colors.ink },
  description: { ...typography.body, color: colors.inkMuted },
  previewChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  previewChipText: { ...typography.caption, color: colors.accent },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  summaryValue: { ...typography.heading, color: colors.ink },
  summaryLabel: { ...typography.caption, color: colors.inkMuted },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.line },
  summaryIcon: {
    marginLeft: 'auto',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  filters: { gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  filterText: { ...typography.label, color: colors.inkMuted },
  filterTextActive: { color: colors.surfaceRaised },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.title, color: colors.ink },
  sectionCount: { ...typography.caption, color: colors.inkFaint },
  list: { gap: spacing.md },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  itemIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  itemCopy: { flex: 1, gap: spacing.xs },
  itemTopLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  kindLabel: { ...typography.caption, color: colors.accent },
  updatedAt: { ...typography.caption, color: colors.inkFaint },
  itemTitle: { ...typography.title, color: colors.ink },
  itemDetail: { ...typography.caption, color: colors.inkMuted },
  emptyCard: { borderRadius: radius.lg, backgroundColor: colors.surfaceRaised },
  localNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  localNoticeText: { ...typography.caption, flex: 1, color: colors.inkMuted },
});
