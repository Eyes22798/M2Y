import {
  cleanupAcceptance as cleanupNativeAcceptance,
  getPendingAcceptanceRunId as getNativePendingAcceptanceRunId,
  getSpikeInfo as getNativeSpikeInfo,
  runFreshAcceptance as runNativeFreshAcceptance,
  runNegativeAcceptance as runNativeNegativeAcceptance,
  runPerformanceAcceptance as runNativePerformanceAcceptance,
  runResumeAcceptance as runNativeResumeAcceptance,
} from '../../../modules/m2y-crypto';

import {
  decodeM2YCryptoCleanupAcceptance,
  decodeM2YCryptoFreshAcceptance,
  decodeM2YCryptoNegativeAcceptance,
  decodeM2YCryptoPendingRunId,
  decodeM2YCryptoPerformanceAcceptance,
  decodeM2YCryptoResumeAcceptance,
  decodeM2YCryptoSpikeInfo,
  type M2YCryptoCleanupAcceptance,
  type M2YCryptoFreshAcceptance,
  type M2YCryptoNegativeAcceptance,
  type M2YCryptoPerformanceAcceptance,
  type M2YCryptoResumeAcceptance,
  type M2YCryptoSpikeInfo,
} from './M2YCryptoSpikeContract';

export type {
  M2YCryptoCleanupAcceptance,
  M2YCryptoFreshAcceptance,
  M2YCryptoNegativeAcceptance,
  M2YCryptoPerformanceAcceptance,
  M2YCryptoResumeAcceptance,
  M2YCryptoSpikeInfo,
} from './M2YCryptoSpikeContract';

export function getM2YCryptoSpikeInfo(): M2YCryptoSpikeInfo {
  return decodeM2YCryptoSpikeInfo(getNativeSpikeInfo());
}

export async function getM2YCryptoPendingAcceptanceRunId(): Promise<string | null> {
  return decodeM2YCryptoPendingRunId(await getNativePendingAcceptanceRunId());
}

export async function runM2YCryptoFreshAcceptance(): Promise<M2YCryptoFreshAcceptance> {
  return decodeM2YCryptoFreshAcceptance(await runNativeFreshAcceptance());
}

export async function runM2YCryptoResumeAcceptance(
  runId: string,
): Promise<M2YCryptoResumeAcceptance> {
  return decodeM2YCryptoResumeAcceptance(await runNativeResumeAcceptance(runId));
}

export async function runM2YCryptoNegativeAcceptance(
  runId: string,
): Promise<M2YCryptoNegativeAcceptance> {
  return decodeM2YCryptoNegativeAcceptance(await runNativeNegativeAcceptance(runId));
}

export async function runM2YCryptoPerformanceAcceptance(
  runId: string,
): Promise<M2YCryptoPerformanceAcceptance> {
  return decodeM2YCryptoPerformanceAcceptance(await runNativePerformanceAcceptance(runId));
}

export async function cleanupM2YCryptoAcceptance(
  runId: string,
): Promise<M2YCryptoCleanupAcceptance> {
  return decodeM2YCryptoCleanupAcceptance(await cleanupNativeAcceptance(runId));
}
