import {
  decodeM2YCryptoCleanupAcceptance,
  decodeM2YCryptoFreshAcceptance,
  decodeM2YCryptoNegativeAcceptance,
  decodeM2YCryptoPendingRunId,
  decodeM2YCryptoPerformanceAcceptance,
  decodeM2YCryptoResumeAcceptance,
  decodeM2YCryptoSpikeInfo,
} from './M2YCryptoSpikeContract';

const runId = 'f7a6b86d-680a-4cb5-8c9d-a043d37ff121';
const freshChecks = [
  'pqxdh-session-established',
  'pre-key-message-decrypted',
  'ratcheted-reply-decrypted',
  'fingerprint-match',
  'corrupt-ciphertext-rejected',
  'duplicate-message-rejected',
  'identity-change-rejected',
  'checkpoint-encrypted-committed',
];

describe('decodeM2YCryptoSpikeInfo', () => {
  const payload = {
    abi: 'arm64-v8a',
    libraryVersion: '0.101.0',
    nativeLoadVerified: true,
    platform: 'android',
    protocol: 'signal-pqxdh-double-ratchet',
  };

  it('accepts the exact redacted Gate 1 contract', () => {
    expect(decodeM2YCryptoSpikeInfo(payload)).toEqual(payload);
  });

  it.each([null, {}, { ...payload, nativeLoadVerified: false }, { ...payload, secret: 'x' }])(
    'rejects invalid or expanded native payloads',
    (value) => {
      expect(() => decodeM2YCryptoSpikeInfo(value)).toThrow('m2y-crypto-invalid-native-response');
    },
  );
});

describe('checkpoint acceptance contracts', () => {
  it('accepts the exact fresh checkpoint result', () => {
    const payload = {
      checks: freshChecks,
      code: 'fresh-pqxdh-checkpoint-verified',
      revision: 1,
      runId,
      stage: 'fresh',
      status: 'passed',
    };
    expect(decodeM2YCryptoFreshAcceptance(payload)).toEqual(payload);
  });

  it('accepts resume, negative, and cleanup results', () => {
    expect(
      decodeM2YCryptoResumeAcceptance({
        checks: [
          'checkpoint-reopened',
          'resumed-alice-to-bob',
          'resumed-bob-to-alice',
          'fingerprint-stable',
          'checkpoint-updated-atomically',
        ],
        code: 'resume-checkpoint-verified',
        revision: 2,
        runId,
        stage: 'resume',
        status: 'passed',
      }),
    ).toMatchObject({ revision: 2, status: 'passed' });

    expect(
      decodeM2YCryptoNegativeAcceptance({
        checks: [
          'checkpoint-write-failure-injected',
          'checkpoint-write-rollback-verified',
          'out-of-order-window-accepted',
          'duplicate-message-rejected',
          'corrupt-ciphertext-rejected',
          'identity-change-rejected',
          'fingerprint-change-visible',
          'checkpoint-updated-atomically',
        ],
        code: 'negative-cases-verified',
        revision: 3,
        runId,
        stage: 'negative',
        status: 'passed',
      }),
    ).toMatchObject({ revision: 3, status: 'passed' });

    expect(
      decodeM2YCryptoCleanupAcceptance({
        checks: ['checkpoint-and-key-cleaned'],
        code: 'acceptance-state-cleaned',
        runId,
        stage: 'cleanup',
        status: 'passed',
      }),
    ).toMatchObject({ status: 'passed' });
  });

  it('accepts only aggregate performance metrics', () => {
    const payload = {
      checks: [
        '1000-message-roundtrip',
        'latency-aggregated',
        'attachment-key-wrapped',
        '100mb-stream-roundtrip',
        'temp-file-cleaned',
        'checkpoint-updated-atomically',
      ],
      code: 'performance-verified',
      metrics: {
        attachmentBytes: 32,
        fileBytes: 104857600,
        memoryDeltaBytes: -1024,
        messageCount: 1000,
        p50Ms: 0.5,
        p95Ms: 1.5,
        totalMs: 750,
      },
      revision: 4,
      runId,
      stage: 'performance',
      status: 'passed',
    };
    expect(decodeM2YCryptoPerformanceAcceptance(payload)).toEqual(payload);
  });

  it('passes through a fixed checkpoint failure code without native details', () => {
    const payload = {
      code: 'checkpoint-corrupt',
      runId,
      stage: 'resume',
      status: 'failed',
    };
    expect(decodeM2YCryptoResumeAcceptance(payload)).toEqual(payload);
  });

  it.each([
    {
      checks: freshChecks,
      code: 'fresh-pqxdh-checkpoint-verified',
      revision: 1,
      runId: 'not-a-run-id',
      stage: 'fresh',
      status: 'passed',
    },
    {
      checks: [...freshChecks].reverse(),
      code: 'fresh-pqxdh-checkpoint-verified',
      revision: 1,
      runId,
      stage: 'fresh',
      status: 'passed',
    },
    {
      checks: freshChecks,
      code: 'fresh-pqxdh-checkpoint-verified',
      privateKey: 'must-not-cross-boundary',
      revision: 1,
      runId,
      stage: 'fresh',
      status: 'passed',
    },
  ])('rejects invalid, reordered, or expanded fresh payloads', (payload) => {
    expect(() => decodeM2YCryptoFreshAcceptance(payload)).toThrow(
      'm2y-crypto-invalid-native-response',
    );
  });

  it('rejects non-finite and inconsistent performance metrics', () => {
    expect(() =>
      decodeM2YCryptoPerformanceAcceptance({
        checks: [
          '1000-message-roundtrip',
          'latency-aggregated',
          'attachment-key-wrapped',
          '100mb-stream-roundtrip',
          'temp-file-cleaned',
          'checkpoint-updated-atomically',
        ],
        code: 'performance-verified',
        metrics: {
          attachmentBytes: 32,
          fileBytes: 104857600,
          memoryDeltaBytes: 0,
          messageCount: 1000,
          p50Ms: 2,
          p95Ms: 1,
          totalMs: Number.NaN,
        },
        revision: 4,
        runId,
        stage: 'performance',
        status: 'passed',
      }),
    ).toThrow('m2y-crypto-invalid-native-response');
  });
});

describe('decodeM2YCryptoPendingRunId', () => {
  it('accepts only an absent or opaque UUID state', () => {
    expect(decodeM2YCryptoPendingRunId(null)).toBeNull();
    expect(decodeM2YCryptoPendingRunId(runId)).toBe(runId);
    expect(() => decodeM2YCryptoPendingRunId('raw-checkpoint')).toThrow(
      'm2y-crypto-invalid-native-response',
    );
  });
});
