import { StyleSheet, Text, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { MotionReveal } from '@/design/motion/MotionReveal';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { SharedItem } from '@/domain/shared-item/types';

const sharedItems: readonly SharedItem[] = [
  {
    id: 'agreement-quote',
    kind: 'agreement',
    title: '项目报价：¥80,000',
    detail: '由聊天保存 · 等待对方确认',
    status: 'waiting',
    pinned: true,
    sourceMessageId: 'm1',
    updatedAtLabel: '刚刚',
  },
  {
    id: 'task-proposal',
    kind: 'task',
    title: '周五前提交新版提案',
    detail: '由你负责 · 截止 8 月 15 日',
    status: 'active',
    pinned: false,
    updatedAtLabel: '12 分钟前',
  },
  {
    id: 'file-contract',
    kind: 'file',
    title: '合同-v3.pdf',
    detail: '来自聊天文件 · 自动索引',
    status: 'active',
    pinned: false,
    updatedAtLabel: '昨天',
  },
];

const kindLabels = {
  task: '待办',
  note: '笔记',
  file: '文件',
  agreement: '约定',
  event: '时间',
} as const;

export function SpaceHomeScreen() {
  return (
    <ScreenScaffold
      eyebrow="我们共同拥有的"
      title="Space"
      description="无需在五个工具之间切换。类型只是筛选，Shared Item 才是核心。"
      trailing={
        <MotionPressable accessibilityLabel="创建共享项" style={styles.addButton}>
          <Text style={styles.addText}>＋</Text>
        </MotionPressable>
      }
    >
      <View style={styles.summaryRow}>
        <Summary value="1" label="等待确认" tone="waiting" />
        <Summary value="2" label="今天更新" tone="positive" />
        <Summary value="1" label="已置顶" tone="neutral" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>需要我们处理</Text>
        {sharedItems.map((item, index) => (
          <MotionReveal delay={index * 50} key={item.id}>
            <MotionPressable accessibilityLabel={`打开${item.title}`} style={styles.itemCard}>
              <View style={styles.itemTopLine}>
                <Text style={styles.kindLabel}>{kindLabels[item.kind]}</Text>
                <Text style={styles.itemMeta}>
                  {item.pinned ? 'PIN · ' : ''}
                  {item.updatedAtLabel}
                </Text>
              </View>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDetail}>{item.detail}</Text>
            </MotionPressable>
          </MotionReveal>
        ))}
      </View>

      <View style={styles.activity}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <Text style={styles.activityText}>你把“项目报价”保存为约定</Text>
        <Text style={styles.activityText}>对方在聊天里上传了“合同-v3.pdf”</Text>
      </View>
    </ScreenScaffold>
  );
}

function Summary({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'waiting' | 'positive' | 'neutral';
  value: string;
}) {
  const backgroundColor =
    tone === 'waiting'
      ? colors.waitingSoft
      : tone === 'positive'
        ? colors.positiveSoft
        : colors.surface;

  return (
    <View style={[styles.summary, { backgroundColor }]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  addText: { ...typography.heading, color: colors.surface },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summary: { flex: 1, padding: spacing.md, gap: spacing.xs, borderRadius: radius.md },
  summaryValue: { ...typography.heading, color: colors.ink },
  summaryLabel: { ...typography.caption, color: colors.inkMuted },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.title, color: colors.ink },
  itemCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  itemTopLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  kindLabel: { ...typography.label, color: colors.accent },
  itemMeta: { ...typography.caption, color: colors.inkFaint },
  itemTitle: { ...typography.title, color: colors.ink },
  itemDetail: { ...typography.caption, color: colors.inkMuted },
  activity: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  activityText: { ...typography.body, color: colors.surface },
});
