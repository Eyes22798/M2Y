import { requireNativeModule } from 'expo';

import type { M2YCryptoNativeModule } from './M2YCrypto.types';

const nativeModule = requireNativeModule<M2YCryptoNativeModule>('M2YCrypto');

export function getSpikeInfo(): unknown {
  return nativeModule.getSpikeInfo();
}

export function getPendingAcceptanceRunId(): Promise<unknown> {
  return nativeModule.getPendingAcceptanceRunId();
}

export function runFreshAcceptance(): Promise<unknown> {
  return nativeModule.runFreshAcceptance();
}

export function runResumeAcceptance(runId: string): Promise<unknown> {
  return nativeModule.runResumeAcceptance(runId);
}

export function runNegativeAcceptance(runId: string): Promise<unknown> {
  return nativeModule.runNegativeAcceptance(runId);
}

export function runPerformanceAcceptance(runId: string): Promise<unknown> {
  return nativeModule.runPerformanceAcceptance(runId);
}

export function cleanupAcceptance(runId: string): Promise<unknown> {
  return nativeModule.cleanupAcceptance(runId);
}

export function inspectProductionIdentity(): Promise<unknown> {
  return nativeModule.inspectProductionIdentity();
}

export function prepareIdentityRegistration(displayName: string | null): Promise<unknown> {
  return nativeModule.prepareIdentityRegistration(displayName);
}

export function commitIdentityRegistration(
  operationId: string,
  receiptId: string,
): Promise<unknown> {
  return nativeModule.commitIdentityRegistration(operationId, receiptId);
}

export function signDeviceRequest(canonicalRequest: string): Promise<unknown> {
  return nativeModule.signDeviceRequest(canonicalRequest);
}

export function resetProductionIdentity(): Promise<unknown> {
  return nativeModule.resetProductionIdentity();
}
