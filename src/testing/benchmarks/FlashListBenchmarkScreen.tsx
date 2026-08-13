import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/design/tokens';

import { createBenchmarkMessages, type BenchmarkMessage } from './messages';

export function FlashListBenchmarkScreen() {
  const messages = useMemo(() => createBenchmarkMessages(), []);
  const [draft, setDraft] = useState('');
  const [loadTime, setLoadTime] = useState<number | null>(null);

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.metrics}>
        <Text style={styles.metricTitle}>10,000 条确定性混合消息</Text>
        <Text style={styles.metricCaption}>
          首次绘制：{loadTime === null ? '等待测量' : `${loadTime.toFixed(1)} ms`}
        </Text>
      </View>

      <FlashList
        data={messages}
        getItemType={(item) => item.kind}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{
          autoscrollToBottomThreshold: 48,
          animateAutoScrollToBottom: true,
        }}
        onLoad={({ elapsedTimeInMs }) => setLoadTime(elapsedTimeInMs)}
        renderItem={renderMessage}
      />

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="基准页消息输入框"
          onChangeText={setDraft}
          placeholder="键盘与列表共存测试"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          value={draft}
        />
      </View>
    </SafeAreaView>
  );
}

function renderMessage({ item }: ListRenderItemInfo<BenchmarkMessage>) {
  if (item.kind === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{item.body}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, item.author === 'me' && styles.messageRowSelf]}>
      <View style={[styles.bubble, item.author === 'me' && styles.bubbleSelf]}>
        <Text style={styles.messageText}>{item.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  metrics: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.ink,
  },
  metricTitle: { ...typography.title, color: colors.surface },
  metricCaption: { ...typography.caption, color: colors.inkFaint },
  messageRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: 'flex-start',
  },
  messageRowSelf: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  bubbleSelf: { backgroundColor: colors.accentSoft },
  messageText: { ...typography.body, color: colors.ink },
  systemRow: { alignItems: 'center', padding: spacing.md },
  systemText: { ...typography.caption, color: colors.inkMuted },
  composer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    ...typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
    color: colors.ink,
  },
});
