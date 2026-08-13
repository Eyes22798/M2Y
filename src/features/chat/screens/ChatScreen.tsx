import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { MotionReveal } from '@/design/motion/MotionReveal';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';

const messages = [
  { id: 'm1', side: 'other', body: '报价最终定 8 万吧。' },
  { id: 'm2', side: 'self', body: '可以，我保存成约定，你确认一下。' },
] as const;

export function ChatScreen() {
  return (
    <ScreenScaffold
      eyebrow="只有我们"
      title="聊天"
      description="聊天是入口，重要内容会沉淀到共同 Space。"
      scroll={false}
    >
      <View style={styles.thread}>
        {messages.map((message, index) => (
          <MotionReveal delay={index * 70} key={message.id}>
            <View
              style={[
                styles.bubble,
                message.side === 'self' ? styles.selfBubble : styles.otherBubble,
              ]}
            >
              <Text style={styles.message}>{message.body}</Text>
            </View>
          </MotionReveal>
        ))}

        <MotionReveal delay={180}>
          <View style={styles.savedCard}>
            <View style={styles.savedHeader}>
              <Text style={styles.savedEyebrow}>已保存到 SPACE · 约定</Text>
              <Text style={styles.waiting}>等待确认</Text>
            </View>
            <Text style={styles.savedTitle}>项目报价：¥80,000</Text>
            <Text style={styles.savedMeta}>关联原始消息 · 双方确认后生效</Text>
          </View>
        </MotionReveal>
      </View>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="消息输入框"
          placeholder="发一条消息…"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
        />
        <MotionPressable accessibilityLabel="发送消息" style={styles.sendButton}>
          <Text style={styles.sendText}>↑</Text>
        </MotionPressable>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  thread: { flex: 1, justifyContent: 'center', gap: spacing.md },
  bubble: { maxWidth: '84%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
  },
  selfBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
  },
  message: { ...typography.body, color: colors.ink },
  savedCard: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  savedHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  savedEyebrow: { ...typography.label, color: colors.positive },
  waiting: { ...typography.caption, color: colors.waiting },
  savedTitle: { ...typography.title, color: colors.ink },
  savedMeta: { ...typography.caption, color: colors.inkMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    color: colors.ink,
    ...typography.body,
  },
  sendButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  sendText: { ...typography.heading, color: colors.surface },
});
