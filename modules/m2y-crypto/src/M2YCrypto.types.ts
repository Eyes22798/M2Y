export type M2YCryptoSpikeInfoPayload = Readonly<{
  abi: string;
  libraryVersion: string;
  nativeLoadVerified: boolean;
  platform: 'android';
  protocol: string;
}>;

export type M2YCryptoNativeModule = Readonly<{
  ackPairingOutbox(operationId: string, receiptId: string): Promise<unknown>;
  activatePairedRelationship(requestId: string, pairId: string): Promise<unknown>;
  cleanupAcceptance(runId: string): Promise<unknown>;
  commitIdentityRegistration(operationId: string, receiptId: string): Promise<unknown>;
  confirmPairingSafetyNumber(requestId: string): Promise<unknown>;
  getPendingAcceptanceRunId(): Promise<unknown>;
  getSpikeInfo(): unknown;
  inspectProductionIdentity(): Promise<unknown>;
  listPairingOutbox(): Promise<unknown>;
  prepareIdentityRegistration(displayName: string | null): Promise<unknown>;
  resetProductionIdentity(): Promise<unknown>;
  respondToPairingRequest(requestId: string, action: string): Promise<unknown>;
  runFreshAcceptance(): Promise<unknown>;
  runNegativeAcceptance(runId: string): Promise<unknown>;
  runPerformanceAcceptance(runId: string): Promise<unknown>;
  runResumeAcceptance(runId: string): Promise<unknown>;
  signDeviceRequest(canonicalRequest: string): Promise<unknown>;
  sweepPairingState(): Promise<unknown>;
}>;
