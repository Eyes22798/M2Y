export type PairingMethod = 'handshake-code' | 'm2y-id' | 'qr-ticket';

export type IdentitySummary = Readonly<{
  deviceId: string;
  displayName?: string;
  m2yId: string;
  stableIdentityId: string;
}>;

export type PeerSummary = Readonly<{
  displayName?: string;
  m2yId: string;
  routeId: string;
}>;

export type PairingRequestSummary = Readonly<{
  expiresAtMs: number;
  method: PairingMethod;
  peer: PeerSummary;
  requestId: string;
}>;

export type RelationshipSummary = Readonly<{
  activatedAtMs: number;
  pairId: string;
  peer: PeerSummary;
}>;

export type SafetyNumberDisplay = Readonly<{
  groups: readonly [string, string, string, string, string, string];
}>;

export type IdentityRelationshipState =
  | Readonly<{ status: 'inspecting' }>
  | Readonly<{ status: 'needsIdentity' }>
  | Readonly<{ status: 'creatingIdentity' }>
  | Readonly<{ status: 'registering'; identity: IdentitySummary; operationId: string }>
  | Readonly<{ status: 'unpaired'; identity: IdentitySummary }>
  | Readonly<{
      status: 'outgoingPending';
      identity: IdentitySummary;
      request: PairingRequestSummary;
    }>
  | Readonly<{
      status: 'incomingReview';
      identity: IdentitySummary;
      request: PairingRequestSummary;
    }>
  | Readonly<{
      status: 'awaitingSafetyVerification';
      identity: IdentitySummary;
      localConfirmed: boolean;
      remoteConfirmed: boolean;
      request: PairingRequestSummary;
      safetyNumber: SafetyNumberDisplay;
    }>
  | Readonly<{
      status: 'active';
      identity: IdentitySummary;
      relationship: RelationshipSummary;
    }>
  | Readonly<{ status: 'rejected'; identity: IdentitySummary; requestId: string }>
  | Readonly<{
      status: 'cancelled';
      identity: IdentitySummary;
      reason: 'local' | 'remote' | 'safety-mismatch';
      requestId: string;
    }>
  | Readonly<{ status: 'expired'; identity: IdentitySummary; requestId: string }>
  | Readonly<{
      status: 'networkFailed';
      identity: IdentitySummary;
      retryFrom: 'registering' | 'unpaired' | 'outgoingPending' | 'awaitingSafetyVerification';
    }>
  | Readonly<{ status: 'identityChanged'; identity: IdentitySummary; peer: PeerSummary }>
  | Readonly<{ status: 'recoveryRequired'; code: string }>
  | Readonly<{ status: 'fatal'; code: string; retryable: boolean }>;

export type IdentityRelationshipCommand =
  | Readonly<{ type: 'createIdentity'; displayName?: string }>
  | Readonly<{ type: 'createInvite'; method: 'handshake-code' | 'qr-ticket' }>
  | Readonly<{
      type: 'preparePairRequest';
      method: PairingMethod;
      target: string;
    }>
  | Readonly<{ type: 'acceptPairRequest'; requestId: string }>
  | Readonly<{ type: 'rejectPairRequest'; requestId: string }>
  | Readonly<{ type: 'cancelPairRequest'; requestId: string }>
  | Readonly<{ type: 'confirmSafetyNumber'; requestId: string }>
  | Readonly<{ type: 'reportSafetyMismatch'; requestId: string }>
  | Readonly<{ type: 'retry' }>
  | Readonly<{ type: 'resetLocalData' }>;

export type IdentityRelationshipEvent =
  /**
   * Re-reading the native store always restarts the machine, so a retry or a reset cannot leave a
   * stale identity on screen while the inspection that would replace it is still running.
   */
  | Readonly<{ type: 'inspectStarted' }>
  | Readonly<{ type: 'inspectAbsent' }>
  /**
   * A relaunch has to be able to land back on the state the native store already persisted;
   * without these two events a restart could only ever report "no identity".
   */
  | Readonly<{
      type: 'inspectPendingRegistration';
      identity: IdentitySummary;
      operationId: string;
    }>
  | Readonly<{ type: 'inspectUnpaired'; identity: IdentitySummary }>
  | Readonly<{ type: 'identityCreationStarted' }>
  | Readonly<{
      type: 'identityPrepared';
      identity: IdentitySummary;
      operationId: string;
    }>
  | Readonly<{ type: 'registrationCommitted'; identity: IdentitySummary }>
  | Readonly<{
      type: 'pairRequestPrepared';
      request: PairingRequestSummary;
    }>
  | Readonly<{
      type: 'incomingRequestCommitted';
      request: PairingRequestSummary;
    }>
  | Readonly<{
      type: 'pairRequestAccepted';
      safetyNumber: SafetyNumberDisplay;
    }>
  | Readonly<{ type: 'localSafetyConfirmed' }>
  | Readonly<{ type: 'remoteSafetyConfirmed' }>
  | Readonly<{ type: 'activationCommitted'; relationship: RelationshipSummary }>
  | Readonly<{ type: 'requestRejected' }>
  | Readonly<{ type: 'requestCancelled'; by: 'local' | 'remote' }>
  | Readonly<{ type: 'requestExpired' }>
  | Readonly<{ type: 'safetyMismatch' }>
  | Readonly<{
      type: 'networkFailed';
      retryFrom: 'registering' | 'unpaired' | 'outgoingPending' | 'awaitingSafetyVerification';
    }>
  | Readonly<{ type: 'identityChanged'; peer: PeerSummary }>
  | Readonly<{ type: 'recoveryRequired'; code: string }>
  | Readonly<{ type: 'fatal'; code: string; retryable: boolean }>;
