import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { BottomSheet } from '@/design/patterns/BottomSheet';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { Message } from '@/domain/message/types';
import type { PreviewSharedItemKind } from '@/domain/shared-item/types';
import { previewKindOptions } from '@/features/shared-item/shared-item-presenters';
import { useWorkspace } from '@/stores/workspace/WorkspaceProvider';

export function SaveToSpaceSheet({
  message,
  onClose,
  onSaved,
  visible,
}: {
  message: Message;
  onClose: () => void;
  onSaved: (message: string) => void;
  visible: boolean;
}) {
  const { busy, commands } = useWorkspace();
  const [kind, setKind] = useState<PreviewSharedItemKind>('note');
  const [title, setTitle] = useState(message.body.slice(0, 24));
  const [detail, setDetail] = useState(message.body);
  const [error, setError] = useState('');

  const save = async () => {
    const result = await commands.saveMessageToSpace({
      messageId: message.id,
      kind,
      title,
      detail,
    });

    if (!result.ok) {
      if (result.reason === 'blank-title') {
        setError('请填写标题');
      } else if (result.reason === 'duplicate-item') {
        setError('这条消息已经保存为相同类型');
      } else if (result.reason === 'message-not-found') {
        setError('原始消息已不存在，请重新选择');
      } else {
        setError('暂时无法写入本机数据，请稍后重试');
      }
      return;
    }

    onSaved(
      `已保存为${previewKindOptions.find((option) => option.kind === kind)?.label ?? '共享条目'}`,
    );
    onClose();
  };

  return (
    <BottomSheet
      description="内容只保存在当前设备，不会同步到其他设备。"
      footer={
        <MotionPressable
          accessibilityLabel="保存到 Space"
          disabled={busy || !title.trim()}
          onPress={() => void save()}
          style={[styles.saveButton, (busy || !title.trim()) && styles.saveButtonDisabled]}
          testID="save-to-space-submit"
        >
          <Text style={styles.saveButtonText}>保存到 Space</Text>
        </MotionPressable>
      }
      onClose={onClose}
      title="保存到 Space"
      visible={visible}
    >
      <View style={styles.kindGrid}>
        {previewKindOptions.map((option) => {
          const selected = option.kind === kind;
          return (
            <MotionPressable
              accessibilityLabel={`保存为${option.label}`}
              key={option.kind}
              onPress={() => {
                setKind(option.kind);
                setError('');
              }}
              style={[styles.kindCard, selected && styles.kindCardSelected]}
            >
              <AppIcon
                color={selected ? colors.accent : colors.inkMuted}
                name={option.icon}
                size={22}
              />
              <Text style={[styles.kindLabel, selected && styles.kindLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.kindDescription}>{option.description}</Text>
            </MotionPressable>
          );
        })}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>标题</Text>
        <TextInput
          accessibilityLabel="共享条目标题"
          maxLength={60}
          onChangeText={(value) => {
            setTitle(value);
            setError('');
          }}
          placeholder="这件事叫什么？"
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, error && !title.trim() ? styles.inputError : undefined]}
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

      {kind === 'agreement' ? (
        <View style={styles.notice}>
          <AppIcon color={colors.waiting} name="waiting" size={18} />
          <Text style={styles.noticeText}>这是本地约定草稿，尚未获得对方确认。</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  kindGrid: { flexDirection: 'row', gap: spacing.sm },
  kindCard: {
    flex: 1,
    minHeight: 112,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  kindCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  kindLabel: { ...typography.label, color: colors.ink },
  kindLabelSelected: { color: colors.accent },
  kindDescription: { ...typography.caption, color: colors.inkMuted },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.ink },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    ...typography.body,
  },
  detailInput: { minHeight: 88 },
  inputError: { borderColor: colors.danger },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.waitingSoft,
  },
  noticeText: { ...typography.caption, flex: 1, color: colors.waiting },
  error: { ...typography.caption, color: colors.danger },
  saveButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { ...typography.title, color: colors.surfaceRaised },
});
