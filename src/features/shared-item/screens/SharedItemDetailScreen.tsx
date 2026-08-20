import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { ConfirmDialog } from '@/design/patterns/ConfirmDialog';
import { EmptyState } from '@/design/patterns/EmptyState';
import { StatusBadge } from '@/design/patterns/StatusBadge';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { SharedItemStatus } from '@/domain/shared-item/types';
import {
  editableStatusOptions,
  getKindIcon,
  sharedItemKindLabels,
} from '@/features/shared-item/shared-item-presenters';
import { useWorkspace } from '@/stores/workspace/WorkspaceProvider';

export function SharedItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { busy, commands, state } = useWorkspace();
  const item = state.sharedItems.find((candidate) => candidate.id === itemId);
  const [title, setTitle] = useState(item?.title ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [status, setStatus] = useState<SharedItemStatus>(item?.status ?? 'active');
  const [feedback, setFeedback] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!item) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.notFoundHeader}>
          <BackButton />
        </View>
        <EmptyState
          actionLabel="返回 Space"
          description="这个条目可能已被删除，或链接已经失效。"
          icon="space"
          onAction={() => router.back()}
          title="找不到共享条目"
        />
      </SafeAreaView>
    );
  }

  const save = async () => {
    const result = await commands.updateSharedItem({ itemId: item.id, title, detail, status });
    if (!result.ok) {
      setFeedback(
        result.reason === 'blank-title'
          ? '标题不能为空'
          : result.reason === 'item-not-found'
            ? '条目已不存在'
            : '暂时无法写入本机数据',
      );
      return;
    }
    setFeedback('已保存到当前设备');
  };

  const remove = async () => {
    const result = await commands.deleteSharedItem(item.id);
    setConfirmDelete(false);
    if (result.ok) router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.topBar}>
        <BackButton />
        <Text style={styles.topBarTitle}>共享条目</Text>
        <MotionPressable
          accessibilityLabel="删除共享条目"
          onPress={() => setConfirmDelete(true)}
          style={styles.deleteIconButton}
        >
          <AppIcon color={colors.danger} name="delete" size={20} />
        </MotionPressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={spacing.xl}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        testID="shared-item-keyboard-scroll"
      >
        <View style={styles.itemHero}>
          <View style={styles.heroIcon}>
            <AppIcon color={colors.accent} name={getKindIcon(item.kind)} size={28} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.kindLabel}>{sharedItemKindLabels[item.kind]}</Text>
            <StatusBadge status={item.status} />
          </View>
        </View>

        {item.kind === 'agreement' ? (
          <View style={styles.agreementNotice}>
            <AppIcon color={colors.waiting} name="waiting" size={20} />
            <Text style={styles.agreementNoticeText}>
              这是本地约定草稿，当前没有另一端参与，也不代表对方已经确认。
            </Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>标题</Text>
          <TextInput
            accessibilityLabel="共享条目标题"
            maxLength={60}
            onChangeText={(value) => {
              setTitle(value);
              setFeedback('');
            }}
            style={styles.input}
            value={title}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>内容</Text>
          <TextInput
            accessibilityLabel="共享条目内容"
            multiline
            onChangeText={setDetail}
            placeholder="补充一点说明"
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, styles.detailInput]}
            textAlignVertical="top"
            value={detail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>状态</Text>
          <View style={styles.statusGrid}>
            {editableStatusOptions.map((option) => (
              <MotionPressable
                accessibilityLabel={`状态：${option.label}`}
                key={option.status}
                onPress={() => setStatus(option.status)}
                style={[styles.statusOption, status === option.status && styles.statusOptionActive]}
              >
                {status === option.status ? (
                  <AppIcon color={colors.surfaceRaised} name="check" size={16} />
                ) : null}
                <Text
                  style={[
                    styles.statusOptionText,
                    status === option.status && styles.statusOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </MotionPressable>
            ))}
          </View>
        </View>

        <View style={styles.sourceCard}>
          <AppIcon color={colors.inkMuted} name="chat" size={20} />
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceTitle}>来源</Text>
            <Text style={styles.sourceDetail}>
              {item.sourceMessageId ? `来自 Chat · ${item.sourceMessageId}` : '在 Space 中创建'}
            </Text>
          </View>
        </View>

        {feedback ? (
          <Text style={[styles.feedback, feedback.includes('不能为空') && styles.errorFeedback]}>
            {feedback}
          </Text>
        ) : null}

        <MotionPressable
          accessibilityLabel="保存共享条目"
          disabled={busy || !title.trim()}
          onPress={() => void save()}
          style={[styles.saveButton, (busy || !title.trim()) && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveText}>保存修改</Text>
        </MotionPressable>
      </KeyboardAwareScrollView>

      <ConfirmDialog
        confirmLabel="删除条目"
        description="删除后，它会从 Space 和来源消息的保存标记中移除。此操作只影响当前设备。"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="删除这个共享条目？"
        visible={confirmDelete}
      />
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <MotionPressable
      accessibilityLabel="返回"
      onPress={() => router.back()}
      style={styles.backButton}
    >
      <AppIcon color={colors.ink} name="back" size={20} />
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
  },
  notFoundHeader: { padding: spacing.lg },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  topBarTitle: { ...typography.title, flex: 1, color: colors.ink, textAlign: 'center' },
  deleteIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
  },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.section },
  itemHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  heroCopy: { flex: 1, gap: spacing.sm },
  kindLabel: { ...typography.title, color: colors.ink },
  agreementNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.waitingSoft,
  },
  agreementNoticeText: { ...typography.body, flex: 1, color: colors.waiting },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.ink },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    ...typography.body,
  },
  detailInput: { minHeight: 120 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  statusOptionActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  statusOptionText: { ...typography.label, color: colors.inkMuted },
  statusOptionTextActive: { color: colors.surfaceRaised },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  sourceCopy: { flex: 1, gap: spacing.xs },
  sourceTitle: { ...typography.label, color: colors.ink },
  sourceDetail: { ...typography.caption, color: colors.inkMuted },
  feedback: { ...typography.caption, color: colors.positive, textAlign: 'center' },
  errorFeedback: { color: colors.danger },
  saveButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: { opacity: 0.42 },
  saveText: { ...typography.title, color: colors.surfaceRaised },
});
