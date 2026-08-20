export type M2YCryptoSpikeInfoPayload = Readonly<{
  abi: string;
  libraryVersion: string;
  nativeLoadVerified: boolean;
  platform: 'android';
  protocol: string;
}>;

export type M2YCryptoNativeModule = Readonly<{
  cleanupAcceptance(runId: string): Promise<unknown>;
  getPendingAcceptanceRunId(): Promise<unknown>;
  getSpikeInfo(): unknown;
  runFreshAcceptance(): Promise<unknown>;
  runNegativeAcceptance(runId: string): Promise<unknown>;
  runPerformanceAcceptance(runId: string): Promise<unknown>;
  runResumeAcceptance(runId: string): Promise<unknown>;
}>;
