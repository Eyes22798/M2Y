import type {
  LocalCryptoDataResetResult,
  LocalCryptoDataResetter,
} from '@/application/secure-workspace/contracts';

export class M2YCryptoLocalDataResetter implements LocalCryptoDataResetter {
  async resetLocalCryptoData(): Promise<LocalCryptoDataResetResult> {
    try {
      const [{ resetM2YProductionIdentity }, spikeAdapter] = await Promise.all([
        import('./M2YCryptoProductionAdapter'),
        import('./M2YCryptoSpikeAdapter'),
      ]);
      await resetM2YProductionIdentity();
      const pendingAcceptanceRunId = await spikeAdapter.getM2YCryptoPendingAcceptanceRunId();
      if (pendingAcceptanceRunId) {
        const cleanup = await spikeAdapter.cleanupM2YCryptoAcceptance(pendingAcceptanceRunId);
        if (cleanup.status !== 'passed') {
          return { ok: false, reason: 'crypto-cleanup-failed' };
        }
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'crypto-cleanup-failed' };
    }
  }
}
