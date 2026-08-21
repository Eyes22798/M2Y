import {
  hasExactNativeKeys,
  invalidNativeResponse,
  isNativeRecord,
  isPositiveSafeInteger,
  isUuidV4,
} from './strict-native-decoder';

const LIBSIGNAL_VERSION = '0.101.0';
const PROTOCOL_ID = 'signal-pqxdh-double-ratchet';

const FRESH_ACCEPTANCE_CHECKS = [
  'pqxdh-session-established',
  'pre-key-message-decrypted',
  'ratcheted-reply-decrypted',
  'fingerprint-match',
  'corrupt-ciphertext-rejected',
  'duplicate-message-rejected',
  'identity-change-rejected',
  'checkpoint-encrypted-committed',
] as const;

const RESUME_ACCEPTANCE_CHECKS = [
  'checkpoint-reopened',
  'resumed-alice-to-bob',
  'resumed-bob-to-alice',
  'fingerprint-stable',
  'checkpoint-updated-atomically',
] as const;

const NEGATIVE_ACCEPTANCE_CHECKS = [
  'checkpoint-write-failure-injected',
  'checkpoint-write-rollback-verified',
  'out-of-order-window-accepted',
  'duplicate-message-rejected',
  'corrupt-ciphertext-rejected',
  'identity-change-rejected',
  'fingerprint-change-visible',
  'checkpoint-updated-atomically',
] as const;

const PERFORMANCE_ACCEPTANCE_CHECKS = [
  '1000-message-roundtrip',
  'latency-aggregated',
  'attachment-key-wrapped',
  '100mb-stream-roundtrip',
  'temp-file-cleaned',
  'checkpoint-updated-atomically',
] as const;

const CLEANUP_ACCEPTANCE_CHECKS = ['checkpoint-and-key-cleaned'] as const;

const CHECKPOINT_FAILURE_CODES = [
  'checkpoint-already-exists',
  'checkpoint-cleanup-failed',
  'checkpoint-corrupt',
  'checkpoint-key-missing',
  'checkpoint-key-orphaned',
  'checkpoint-key-unavailable',
  'checkpoint-missing',
  'checkpoint-read-failed',
  'checkpoint-run-mismatch',
  'checkpoint-write-failed',
] as const;

type AcceptanceStage = 'cleanup' | 'fresh' | 'negative' | 'performance' | 'resume';
type CheckpointFailureCode = (typeof CHECKPOINT_FAILURE_CODES)[number];

export type M2YCryptoSpikeInfo = Readonly<{
  abi: string;
  libraryVersion: typeof LIBSIGNAL_VERSION;
  nativeLoadVerified: true;
  platform: 'android';
  protocol: typeof PROTOCOL_ID;
}>;

export type M2YCryptoAcceptanceFailure = Readonly<{
  code: CheckpointFailureCode;
  runId: string;
  stage: AcceptanceStage;
  status: 'failed';
}>;

export type M2YCryptoFreshAcceptance =
  | M2YCryptoAcceptanceFailure
  | Readonly<{
      checks: typeof FRESH_ACCEPTANCE_CHECKS;
      code: 'fresh-pqxdh-checkpoint-verified';
      revision: number;
      runId: string;
      stage: 'fresh';
      status: 'passed';
    }>;

export type M2YCryptoResumeAcceptance =
  | M2YCryptoAcceptanceFailure
  | Readonly<{
      checks: typeof RESUME_ACCEPTANCE_CHECKS;
      code: 'resume-checkpoint-verified';
      revision: number;
      runId: string;
      stage: 'resume';
      status: 'passed';
    }>;

export type M2YCryptoNegativeAcceptance =
  | M2YCryptoAcceptanceFailure
  | Readonly<{
      checks: typeof NEGATIVE_ACCEPTANCE_CHECKS;
      code: 'negative-cases-verified';
      revision: number;
      runId: string;
      stage: 'negative';
      status: 'passed';
    }>;

export type M2YCryptoPerformanceMetrics = Readonly<{
  attachmentBytes: 32;
  fileBytes: 104857600;
  memoryDeltaBytes: number;
  messageCount: 1000;
  p50Ms: number;
  p95Ms: number;
  totalMs: number;
}>;

export type M2YCryptoPerformanceAcceptance =
  | M2YCryptoAcceptanceFailure
  | Readonly<{
      checks: typeof PERFORMANCE_ACCEPTANCE_CHECKS;
      code: 'performance-verified';
      metrics: M2YCryptoPerformanceMetrics;
      revision: number;
      runId: string;
      stage: 'performance';
      status: 'passed';
    }>;

export type M2YCryptoCleanupAcceptance =
  | M2YCryptoAcceptanceFailure
  | Readonly<{
      checks: typeof CLEANUP_ACCEPTANCE_CHECKS;
      code: 'acceptance-state-cleaned';
      runId: string;
      stage: 'cleanup';
      status: 'passed';
    }>;

function isRunId(value: unknown): value is string {
  return isUuidV4(value);
}

function hasExactChecks<const T extends readonly string[]>(
  value: unknown,
  expected: T,
): value is T {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((check, index) => value[index] === check)
  );
}

function isPositiveRevision(value: unknown): value is number {
  return isPositiveSafeInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFailure(
  value: Readonly<Record<string, unknown>>,
  stage: AcceptanceStage,
): value is M2YCryptoAcceptanceFailure {
  return (
    hasExactNativeKeys(value, ['code', 'runId', 'stage', 'status']) &&
    value.status === 'failed' &&
    value.stage === stage &&
    isRunId(value.runId) &&
    CHECKPOINT_FAILURE_CODES.some((code) => code === value.code)
  );
}

export function decodeM2YCryptoPendingRunId(value: unknown): string | null {
  if (value === null || isRunId(value)) return value;
  return invalidNativeResponse();
}

export function decodeM2YCryptoSpikeInfo(value: unknown): M2YCryptoSpikeInfo {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, [
      'abi',
      'libraryVersion',
      'nativeLoadVerified',
      'platform',
      'protocol',
    ]) ||
    typeof value.abi !== 'string' ||
    value.abi.length === 0 ||
    value.libraryVersion !== LIBSIGNAL_VERSION ||
    value.nativeLoadVerified !== true ||
    value.platform !== 'android' ||
    value.protocol !== PROTOCOL_ID
  ) {
    return invalidNativeResponse();
  }

  return {
    abi: value.abi,
    libraryVersion: LIBSIGNAL_VERSION,
    nativeLoadVerified: true,
    platform: 'android',
    protocol: PROTOCOL_ID,
  };
}

export function decodeM2YCryptoFreshAcceptance(value: unknown): M2YCryptoFreshAcceptance {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (isFailure(value, 'fresh')) return value;
  if (
    !hasExactNativeKeys(value, ['checks', 'code', 'revision', 'runId', 'stage', 'status']) ||
    value.status !== 'passed' ||
    value.stage !== 'fresh' ||
    value.code !== 'fresh-pqxdh-checkpoint-verified' ||
    !isRunId(value.runId) ||
    !isPositiveRevision(value.revision) ||
    !hasExactChecks(value.checks, FRESH_ACCEPTANCE_CHECKS)
  ) {
    return invalidNativeResponse();
  }
  return {
    checks: FRESH_ACCEPTANCE_CHECKS,
    code: 'fresh-pqxdh-checkpoint-verified',
    revision: value.revision,
    runId: value.runId,
    stage: 'fresh',
    status: 'passed',
  };
}

export function decodeM2YCryptoResumeAcceptance(value: unknown): M2YCryptoResumeAcceptance {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (isFailure(value, 'resume')) return value;
  if (
    !hasExactNativeKeys(value, ['checks', 'code', 'revision', 'runId', 'stage', 'status']) ||
    value.status !== 'passed' ||
    value.stage !== 'resume' ||
    value.code !== 'resume-checkpoint-verified' ||
    !isRunId(value.runId) ||
    !isPositiveRevision(value.revision) ||
    !hasExactChecks(value.checks, RESUME_ACCEPTANCE_CHECKS)
  ) {
    return invalidNativeResponse();
  }
  return {
    checks: RESUME_ACCEPTANCE_CHECKS,
    code: 'resume-checkpoint-verified',
    revision: value.revision,
    runId: value.runId,
    stage: 'resume',
    status: 'passed',
  };
}

export function decodeM2YCryptoNegativeAcceptance(value: unknown): M2YCryptoNegativeAcceptance {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (isFailure(value, 'negative')) return value;
  if (
    !hasExactNativeKeys(value, ['checks', 'code', 'revision', 'runId', 'stage', 'status']) ||
    value.status !== 'passed' ||
    value.stage !== 'negative' ||
    value.code !== 'negative-cases-verified' ||
    !isRunId(value.runId) ||
    !isPositiveRevision(value.revision) ||
    !hasExactChecks(value.checks, NEGATIVE_ACCEPTANCE_CHECKS)
  ) {
    return invalidNativeResponse();
  }
  return {
    checks: NEGATIVE_ACCEPTANCE_CHECKS,
    code: 'negative-cases-verified',
    revision: value.revision,
    runId: value.runId,
    stage: 'negative',
    status: 'passed',
  };
}

export function decodeM2YCryptoPerformanceAcceptance(
  value: unknown,
): M2YCryptoPerformanceAcceptance {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (isFailure(value, 'performance')) return value;
  if (
    !hasExactNativeKeys(value, [
      'checks',
      'code',
      'metrics',
      'revision',
      'runId',
      'stage',
      'status',
    ]) ||
    value.status !== 'passed' ||
    value.stage !== 'performance' ||
    value.code !== 'performance-verified' ||
    !isRunId(value.runId) ||
    !isPositiveRevision(value.revision) ||
    !hasExactChecks(value.checks, PERFORMANCE_ACCEPTANCE_CHECKS) ||
    !isNativeRecord(value.metrics) ||
    !hasExactNativeKeys(value.metrics, [
      'attachmentBytes',
      'fileBytes',
      'memoryDeltaBytes',
      'messageCount',
      'p50Ms',
      'p95Ms',
      'totalMs',
    ]) ||
    value.metrics.attachmentBytes !== 32 ||
    value.metrics.fileBytes !== 104857600 ||
    value.metrics.messageCount !== 1000 ||
    !isFiniteNumber(value.metrics.memoryDeltaBytes) ||
    !isFiniteNumber(value.metrics.p50Ms) ||
    value.metrics.p50Ms < 0 ||
    !isFiniteNumber(value.metrics.p95Ms) ||
    value.metrics.p95Ms < value.metrics.p50Ms ||
    !isFiniteNumber(value.metrics.totalMs) ||
    value.metrics.totalMs < 0
  ) {
    return invalidNativeResponse();
  }
  return {
    checks: PERFORMANCE_ACCEPTANCE_CHECKS,
    code: 'performance-verified',
    metrics: {
      attachmentBytes: 32,
      fileBytes: 104857600,
      memoryDeltaBytes: value.metrics.memoryDeltaBytes,
      messageCount: 1000,
      p50Ms: value.metrics.p50Ms,
      p95Ms: value.metrics.p95Ms,
      totalMs: value.metrics.totalMs,
    },
    revision: value.revision,
    runId: value.runId,
    stage: 'performance',
    status: 'passed',
  };
}

export function decodeM2YCryptoCleanupAcceptance(value: unknown): M2YCryptoCleanupAcceptance {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (isFailure(value, 'cleanup')) return value;
  if (
    !hasExactNativeKeys(value, ['checks', 'code', 'runId', 'stage', 'status']) ||
    value.status !== 'passed' ||
    value.stage !== 'cleanup' ||
    value.code !== 'acceptance-state-cleaned' ||
    !isRunId(value.runId) ||
    !hasExactChecks(value.checks, CLEANUP_ACCEPTANCE_CHECKS)
  ) {
    return invalidNativeResponse();
  }
  return {
    checks: CLEANUP_ACCEPTANCE_CHECKS,
    code: 'acceptance-state-cleaned',
    runId: value.runId,
    stage: 'cleanup',
    status: 'passed',
  };
}
