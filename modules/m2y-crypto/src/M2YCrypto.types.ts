export type M2YCryptoSpikeInfoPayload = Readonly<{
  abi: string;
  libraryVersion: string;
  nativeLoadVerified: boolean;
  platform: 'android';
  protocol: string;
}>;

export type M2YCryptoNativeModule = Readonly<{
  cleanupAcceptance(runId: string): Promise<unknown>;
  commitIdentityRegistration(operationId: string, receiptId: string): Promise<unknown>;
  getPendingAcceptanceRunId(): Promise<unknown>;
  getSpikeInfo(): unknown;
  inspectProductionIdentity(): Promise<unknown>;
  prepareIdentityRegistration(displayName: string | null): Promise<unknown>;
  resetProductionIdentity(): Promise<unknown>;
  runFreshAcceptance(): Promise<unknown>;
  runNegativeAcceptance(runId: string): Promise<unknown>;
  runPerformanceAcceptance(runId: string): Promise<unknown>;
  runResumeAcceptance(runId: string): Promise<unknown>;
  signDeviceRequest(canonicalRequest: string): Promise<unknown>;
}>;
