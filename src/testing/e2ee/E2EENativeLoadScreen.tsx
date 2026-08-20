import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { colors, radius, spacing, typography } from '@/design/tokens';
import {
  cleanupM2YCryptoAcceptance,
  getM2YCryptoPendingAcceptanceRunId,
  getM2YCryptoSpikeInfo,
  runM2YCryptoFreshAcceptance,
  runM2YCryptoNegativeAcceptance,
  runM2YCryptoPerformanceAcceptance,
  runM2YCryptoResumeAcceptance,
  type M2YCryptoCleanupAcceptance,
  type M2YCryptoFreshAcceptance,
  type M2YCryptoNegativeAcceptance,
  type M2YCryptoPerformanceAcceptance,
  type M2YCryptoResumeAcceptance,
  type M2YCryptoSpikeInfo,
} from '@/native/crypto/M2YCryptoSpikeAdapter';

type ProbeState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'passed'; value: M2YCryptoSpikeInfo }>
  | Readonly<{ code: 'native-load-failed'; status: 'failed' }>;

type AcceptanceStage = 'cleanup' | 'fresh' | 'negative' | 'performance' | 'resume';
type AcceptanceResult =
  | M2YCryptoCleanupAcceptance
  | M2YCryptoFreshAcceptance
  | M2YCryptoNegativeAcceptance
  | M2YCryptoPerformanceAcceptance
  | M2YCryptoResumeAcceptance;
type AcceptanceDisplay =
  AcceptanceResult | Readonly<{ code: 'native-call-failed'; status: 'error' }>;

export function E2EENativeLoadScreen() {
  const [probe, setProbe] = useState<ProbeState>({ status: 'idle' });
  const [pending, setPending] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [running, setRunning] = useState<AcceptanceStage | null>(null);
  const [results, setResults] = useState<Partial<Record<AcceptanceStage, AcceptanceDisplay>>>({});

  useEffect(() => {
    let active = true;
    void getM2YCryptoPendingAcceptanceRunId()
      .then((value) => {
        if (active) {
          setRunId(value);
          setCheckpointReady(value !== null);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const runProbe = () => {
    try {
      setProbe({ status: 'passed', value: getM2YCryptoSpikeInfo() });
    } catch {
      setProbe({ code: 'native-load-failed', status: 'failed' });
    }
  };

  const runStage = async (stage: AcceptanceStage, operation: () => Promise<AcceptanceResult>) => {
    setRunning(stage);
    try {
      const result = await operation();
      setResults((current) => ({ ...current, [stage]: result }));
      if (stage === 'fresh') {
        setRunId(result.runId);
        setCheckpointReady(result.status === 'passed');
      }
      if (result.status === 'passed' && stage === 'cleanup') {
        setRunId(null);
        setCheckpointReady(false);
      }
    } catch {
      setResults((current) => ({
        ...current,
        [stage]: { code: 'native-call-failed', status: 'error' },
      }));
    } finally {
      setRunning(null);
    }
  };

  const busy = pending || running !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Android E2EE 原生验收</Text>
        <Text style={styles.description}>
          验证官方 libsignal 0.101.0、PQXDH、双棘轮、Android Keystore
          加密检查点、进程重启恢复、异常回滚与本机性能。界面只展示固定检查码和聚合指标。
        </Text>

        <AcceptanceButton disabled={busy} label="运行 Gate 1" onPress={runProbe} />
        {probe.status === 'passed' ? (
          <View style={styles.resultCard}>
            <Text style={styles.passed}>PASS · native-load-verified</Text>
            <Text style={styles.detail}>libsignal {probe.value.libraryVersion}</Text>
            <Text style={styles.detail}>ABI {probe.value.abi}</Text>
            <Text style={styles.detail}>{probe.value.protocol}</Text>
          </View>
        ) : null}
        {probe.status === 'failed' ? <FailureCard code={probe.code} /> : null}

        <Text style={styles.sectionTitle}>持久化验收流程</Text>
        <Text style={styles.description}>
          Fresh 成功后可强制停止并重启 App；页面会自动发现原生加密检查点，再运行 Resume。
        </Text>

        <AcceptanceButton
          disabled={busy || runId !== null}
          label={running === 'fresh' ? '运行中…' : '1. Fresh + 加密提交'}
          onPress={() => void runStage('fresh', () => runM2YCryptoFreshAcceptance())}
        />
        <AcceptanceResultCard value={results.fresh} />

        <AcceptanceButton
          disabled={busy || runId === null || !checkpointReady}
          label={running === 'resume' ? '运行中…' : '2. Resume 重启恢复'}
          onPress={() => void runStage('resume', () => runM2YCryptoResumeAcceptance(runId!))}
        />
        <AcceptanceResultCard value={results.resume} />

        <AcceptanceButton
          disabled={busy || runId === null || !checkpointReady}
          label={running === 'negative' ? '运行中…' : '3. Negative + 回滚'}
          onPress={() => void runStage('negative', () => runM2YCryptoNegativeAcceptance(runId!))}
        />
        <AcceptanceResultCard value={results.negative} />

        <AcceptanceButton
          disabled={busy || runId === null || !checkpointReady}
          label={running === 'performance' ? '运行中…' : '4. 1000 消息 + 100MB'}
          onPress={() =>
            void runStage('performance', () => runM2YCryptoPerformanceAcceptance(runId!))
          }
        />
        <AcceptanceResultCard value={results.performance} />

        <AcceptanceButton
          disabled={busy || runId === null}
          label={running === 'cleanup' ? '清理中…' : '5. 清理检查点与密钥'}
          onPress={() => void runStage('cleanup', () => cleanupM2YCryptoAcceptance(runId!))}
        />
        <AcceptanceResultCard value={results.cleanup} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AcceptanceButton({
  disabled,
  label,
  onPress,
}: Readonly<{ disabled: boolean; label: string; onPress: () => void }>) {
  return (
    <MotionPressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </MotionPressable>
  );
}

function AcceptanceResultCard({ value }: Readonly<{ value: AcceptanceDisplay | undefined }>) {
  if (!value) return null;
  if (value.status !== 'passed') return <FailureCard code={value.code} />;

  return (
    <View style={styles.resultCard}>
      <Text style={styles.passed}>PASS · {value.code}</Text>
      {'revision' in value ? <Text style={styles.detail}>revision {value.revision}</Text> : null}
      {value.checks.map((check) => (
        <Text key={check} style={styles.detail}>
          {check}
        </Text>
      ))}
      {value.stage === 'performance' ? (
        <View style={styles.metrics}>
          <Text style={styles.detail}>total {value.metrics.totalMs.toFixed(1)} ms</Text>
          <Text style={styles.detail}>p50 {value.metrics.p50Ms.toFixed(3)} ms</Text>
          <Text style={styles.detail}>p95 {value.metrics.p95Ms.toFixed(3)} ms</Text>
          <Text style={styles.detail}>memory Δ {value.metrics.memoryDeltaBytes} B</Text>
        </View>
      ) : null}
    </View>
  );
}

function FailureCard({ code }: Readonly<{ code: string }>) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.failed}>FAIL · {code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { gap: spacing.lg, padding: spacing.lg },
  title: { ...typography.heading, color: colors.ink },
  sectionTitle: { ...typography.title, color: colors.ink },
  description: { ...typography.body, color: colors.inkMuted },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...typography.title, color: colors.surfaceRaised },
  resultCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  metrics: { gap: spacing.xs },
  passed: { ...typography.label, color: colors.positive },
  failed: { ...typography.label, color: colors.danger },
  detail: { ...typography.caption, color: colors.inkMuted },
});
