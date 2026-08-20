import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { colors, radius, spacing, typography } from '@/design/tokens';

import {
  runAndroidStorageAcceptance,
  type StorageAcceptanceCheck,
} from './runAndroidStorageAcceptance';

export function StorageAcceptanceScreen() {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<readonly StorageAcceptanceCheck[]>([]);

  const run = async () => {
    setRunning(true);
    try {
      setChecks(await runAndroidStorageAcceptance());
    } finally {
      setRunning(false);
    }
  };

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.title}>此工具仅在开发版本可用</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Android 加密存储验收</Text>
        <Text style={styles.description}>
          使用独立临时数据库验证 SQLCipher、错误密钥拒绝、重复 migration
          与清理。结果只包含稳定代码，不显示密钥、路径或原生异常。
        </Text>
        <MotionPressable
          accessibilityLabel="运行加密存储验收"
          disabled={running}
          onPress={() => void run()}
          style={[styles.button, running && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{running ? '正在运行…' : '运行验收'}</Text>
        </MotionPressable>
        <View style={styles.results}>
          {checks.map((check) => (
            <View key={check.code} style={styles.resultRow}>
              <Text style={styles.resultCode}>{check.code}</Text>
              <Text style={check.passed ? styles.passed : styles.failed}>
                {check.passed ? 'PASS' : 'FAIL'}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { gap: spacing.lg, padding: spacing.lg },
  title: { ...typography.heading, color: colors.ink },
  description: { ...typography.body, color: colors.inkMuted },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.title, color: colors.surfaceRaised },
  results: { gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  resultCode: { ...typography.caption, flex: 1, color: colors.ink },
  passed: { ...typography.label, color: colors.positive },
  failed: { ...typography.label, color: colors.danger },
});
