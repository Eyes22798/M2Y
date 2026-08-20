import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { BottomSheet } from '@/design/patterns/BottomSheet';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { Message } from '@/domain/message/types';
import { SaveToSpaceSheet } from '@/features/save-to-space/components/SaveToSpaceSheet';
import { usePreviewWorkspace } from '@/stores/preview-workspace/PreviewWorkspaceProvider';

export function ChatScreen() {
  const { commands, state } = usePreviewWorkspace();
  const [draft, setDraft] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [saveMessageId, setSaveMessageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef<TextInput>(null);
  const selectedMessage = useMemo(
    () => state.messages.find((message) => message.id === selectedMessageId) ?? null,
    [selectedMessageId, state.messages],
  );
  const saveMessage = useMemo(
    () => state.messages.find((message) => message.id === saveMessageId) ?? null,
    [saveMessageId, state.messages],
  );

  const send = () => {
    const result = commands.sendMessage(draft);
    if (!result.ok) return;
    setDraft('');
    setFeedback('消息已发送 · 当前设备预览');
    Keyboard.dismiss();
  };

  const openSaveSheet = () => {
    if (!selectedMessage) return;
    setSaveMessageId(selectedMessage.id);
    setSelectedMessageId(null);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        automaticOffset
        behavior="padding"
        style={styles.content}
        testID="chat-keyboard-avoiding-view"
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>TA</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.person}>TA</Text>
            <Text style={styles.presence}>本地功能预览 · 未连接其他设备</Text>
          </View>
          <View style={styles.lockChip}>
            <AppIcon color={colors.inkMuted} name="lock" size={15} />
            <Text style={styles.lockText}>未配对</Text>
          </View>
        </View>

        <View style={styles.previewNotice}>
          <Text style={styles.previewNoticeText}>消息和 Space 内容会在 App 重启后清空</Text>
        </View>

        <FlashList
          contentContainerStyle={styles.threadContent}
          data={state.messages}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 80 }}
          renderItem={(info) => (
            <MessageRow info={info} onOpenActions={(message) => setSelectedMessageId(message.id)} />
          )}
        />

        {feedback ? (
          <View style={styles.feedback}>
            <AppIcon color={colors.accent} name="checkCircle" size={18} />
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="消息输入框"
            maxLength={1000}
            multiline
            onChangeText={setDraft}
            onFocus={() => setFeedback('')}
            placeholder="说点什么…"
            placeholderTextColor={colors.inkFaint}
            ref={inputRef}
            style={styles.input}
            testID="chat-input"
            value={draft}
          />
          <MotionPressable
            accessibilityLabel="发送消息"
            disabled={!draft.trim()}
            onPress={send}
            style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
            testID="chat-send"
          >
            <AppIcon color={colors.surfaceRaised} name="send" size={22} />
          </MotionPressable>
        </View>

        <BottomSheet
          description={selectedMessage?.body ?? ''}
          onClose={() => setSelectedMessageId(null)}
          title="消息操作"
          visible={Boolean(selectedMessage)}
        >
          <MotionPressable
            accessibilityLabel="保存到 Space"
            onPress={openSaveSheet}
            style={styles.actionRow}
          >
            <View style={styles.actionIcon}>
              <AppIcon color={colors.accent} name="bookmark" size={20} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>保存到 Space</Text>
              <Text style={styles.actionDescription}>创建笔记、待办或约定草稿</Text>
            </View>
            <AppIcon color={colors.inkFaint} name="chevronRight" size={18} />
          </MotionPressable>
          <Text style={styles.actionHint}>长按任意消息可以再次打开此菜单。</Text>
        </BottomSheet>

        {saveMessage ? (
          <SaveToSpaceSheet
            key={saveMessage.id}
            message={saveMessage}
            onClose={() => setSaveMessageId(null)}
            onSaved={setFeedback}
            visible
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageRow({
  info,
  onOpenActions,
}: {
  info: ListRenderItemInfo<Message>;
  onOpenActions: (message: Message) => void;
}) {
  const { item } = info;
  const isSelf = item.author === 'self';

  return (
    <View style={[styles.messageRow, isSelf && styles.messageRowSelf]}>
      <MotionPressable
        accessibilityLabel={`${isSelf ? '我的' : '对方的'}消息：${item.body}`}
        onLongPress={() => onOpenActions(item)}
        onPress={() => onOpenActions(item)}
        style={[styles.bubble, isSelf ? styles.selfBubble : styles.otherBubble]}
      >
        <Text style={[styles.messageText, isSelf && styles.selfMessageText]}>{item.body}</Text>
        <View style={styles.messageMeta}>
          <Text style={[styles.time, isSelf && styles.selfTime]}>{item.createdAtLabel}</Text>
          {item.savedItemIds.length > 0 ? (
            <View style={styles.savedIndicator}>
              <AppIcon
                color={isSelf ? colors.surfaceRaised : colors.accent}
                name="bookmark"
                size={12}
              />
              <Text style={[styles.savedIndicatorText, isSelf && styles.savedIndicatorTextSelf]}>
                Space
              </Text>
            </View>
          ) : null}
        </View>
      </MotionPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
  },
  avatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: { ...typography.label, color: colors.inkMuted },
  headerCopy: { flex: 1, gap: 1 },
  person: { ...typography.title, color: colors.ink },
  presence: { ...typography.caption, color: colors.positive },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  lockText: { ...typography.caption, color: colors.inkMuted },
  previewNotice: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.accentSoft,
  },
  previewNoticeText: { ...typography.caption, color: colors.accent, textAlign: 'center' },
  threadContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  messageRow: { alignItems: 'flex-start', paddingVertical: spacing.xs },
  messageRowSelf: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg },
  otherBubble: { borderBottomLeftRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  selfBubble: { borderBottomRightRadius: radius.sm, backgroundColor: colors.accent },
  messageText: { ...typography.body, color: colors.ink },
  selfMessageText: { color: colors.surfaceRaised },
  messageMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  time: { ...typography.caption, color: colors.inkFaint },
  selfTime: { color: '#DCD8FF' },
  savedIndicator: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  savedIndicatorText: { ...typography.caption, color: colors.accent },
  savedIndicatorTextSelf: { color: colors.surfaceRaised },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentSoft,
  },
  feedbackText: { ...typography.caption, flex: 1, color: colors.accent },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  input: {
    ...typography.body,
    flex: 1,
    maxHeight: 112,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
  },
  sendButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  sendButtonDisabled: { opacity: 0.36 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  actionCopy: { flex: 1, gap: spacing.xs },
  actionTitle: { ...typography.title, color: colors.ink },
  actionDescription: { ...typography.caption, color: colors.inkMuted },
  actionHint: { ...typography.caption, color: colors.inkFaint, textAlign: 'center' },
});
