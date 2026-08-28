import type { PairingMethod } from '@/domain/identity/types';

import type { PairingErrorCode } from './error-codes';

export const PAIR_REQUEST_STATUSES = [
  'accepted',
  'active',
  'cancelled',
  'expired',
  'pending',
  'prepared',
  'rejected',
  'verifying',
] as const;
export type PairRequestStatus = (typeof PAIR_REQUEST_STATUSES)[number];

export const PAIR_EVENT_TYPES = [
  'pair-cancel',
  'pair-expired',
  'pair-request',
  'pair-response',
  'pair-verify',
] as const;
export type PairEventType = (typeof PAIR_EVENT_TYPES)[number];

export const PAIRING_CLIENT_FAILURE_CODES = [
  'pairing-network-unavailable',
  'pairing-timeout',
  'pairing-response-invalid',
  'pairing-signing-failed',
  'pairing-signature-device-mismatch',
] as const;
export type PairingClientFailureCode = (typeof PAIRING_CLIENT_FAILURE_CODES)[number];

export type PairingApiFailure =
  | Readonly<{ kind: 'client'; code: PairingClientFailureCode }>
  | Readonly<{ kind: 'server'; code: PairingErrorCode; httpStatus: number }>;

export type PairingApiResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: PairingApiFailure }>;

export type DeviceRequestSignature = Readonly<{
  deviceId: string;
  publicKeyId: 'device-auth-v1';
  signature: string;
}>;

export interface DeviceRequestSigner {
  signDeviceRequest(canonicalRequest: string): Promise<DeviceRequestSignature>;
}

export type PublicOneTimePreKey = Readonly<{ id: number; publicKey: string }>;

export type IdentityRegistrationRequest = Readonly<{
  authPublicKey: string;
  deviceId: string;
  identityPublicKey: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  m2yId: string;
  oneTimePreKeys: readonly PublicOneTimePreKey[];
  operationId: string;
  registrationId: number;
  schemaVersion: 1;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  stableIdentityId: string;
}>;

export type IdentityRegistrationReceipt = Readonly<{
  deviceId: string;
  m2yId: string;
  receiptId: string;
  registeredAtMs: number;
  status: 'registered';
}>;

export type IdentityServerStatus = Readonly<{
  deviceId: string;
  m2yId: string;
  oneTimePreKeyCount: number;
  registeredAtMs: number;
  stableIdentityId: string;
  status: 'registered';
}>;

export type PreKeyReplenishmentRequest = Readonly<{
  oneTimePreKeys: readonly PublicOneTimePreKey[];
  operationId: string;
}>;

export type PreKeyReplenishmentReceipt = Readonly<{
  addedCount: number;
  operationId: string;
  status: 'replenished';
}>;

export type PairingInvitationRequest = Readonly<{
  kind: 'handshake-code' | 'qr-ticket';
  operationId: string;
}>;

export type PairingInvitation =
  | Readonly<{
      deepLink: string;
      expiresAtMs: number;
      inviteId: string;
      kind: 'qr-ticket';
      operationId: string;
      ticket: string;
    }>
  | Readonly<{
      code: string;
      expiresAtMs: number;
      inviteId: string;
      kind: 'handshake-code';
      operationId: string;
    }>;

export type PreparePairRequest =
  | Readonly<{ method: 'm2y-id'; m2yId: string; operationId: string }>
  | Readonly<{ method: 'qr-ticket'; operationId: string; ticket: string }>
  | Readonly<{ code: string; method: 'handshake-code'; operationId: string }>;

export type LeasedPublicBundle = Readonly<{
  deviceId: string;
  identityPublicKey: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  m2yId: string;
  oneTimePreKey: PublicOneTimePreKey;
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  stableIdentityId: string;
}>;

export type PreparedPairRequest = Readonly<{
  expiresAtMs: number;
  method: PairingMethod;
  requestId: string;
  status: 'prepared';
  targetBundle: LeasedPublicBundle;
}>;

export type PairingPacketRequest = Readonly<{ operationId: string; packet: string }>;
export type PairingResponseRequest = PairingPacketRequest &
  Readonly<{ action: 'accept' | 'reject' }>;

export type PairRequestMutation = Readonly<{
  eventCursor: number;
  operationId: string;
  pairId?: string;
  requestId: string;
  status: PairRequestStatus;
}>;

export type PairingEvent = Readonly<{
  cursor: number;
  eventId: string;
  packet?: string;
  requestId: string;
  status: PairRequestStatus;
  type: PairEventType;
}>;

export type PairingEvents = Readonly<{
  events: readonly PairingEvent[];
  nextCursor: number;
}>;

export const PAIRING_CURSOR_FAILURE_CODES = [
  'pairing-cursor-invalid',
  'pairing-cursor-unavailable',
] as const;
export type PairingCursorFailureCode = (typeof PAIRING_CURSOR_FAILURE_CODES)[number];

export type PairingCursorReadResult =
  | Readonly<{ ok: true; cursor: number }>
  | Readonly<{ ok: false; reason: PairingCursorFailureCode }>;

export type PairingCursorWriteResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: PairingCursorFailureCode }>;

export interface PairingCursorStore {
  readCursor(): Promise<PairingCursorReadResult>;
  writeCursor(cursor: number): Promise<PairingCursorWriteResult>;
}

export type PairingEventApplyResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'pairing-event-apply-failed' }>;

export interface PairingEventConsumer {
  applyEvents(events: readonly PairingEvent[]): Promise<PairingEventApplyResult>;
}

export type PairingPollingFailureCode = PairingCursorFailureCode | 'pairing-event-apply-failed';

export type PairingPollingState =
  | Readonly<{ status: 'stopped' }>
  | Readonly<{ status: 'initializing' }>
  | Readonly<{ status: 'paused'; cursor: number }>
  | Readonly<{ status: 'polling'; cursor: number; consecutiveFailures: number }>
  | Readonly<{
      status: 'waiting';
      cursor: number;
      consecutiveFailures: number;
      delayMs: number;
    }>
  | Readonly<{ status: 'failed'; code: PairingPollingFailureCode }>;

export interface PairingPollingController {
  getState(): PairingPollingState;
  subscribe(listener: () => void): () => void;
  start(foreground: boolean): Promise<void>;
  setForeground(foreground: boolean): void;
  stop(): void;
}

export interface PairingApi {
  registerIdentity(
    input: IdentityRegistrationRequest,
  ): Promise<PairingApiResult<IdentityRegistrationReceipt>>;
  readIdentityStatus(): Promise<PairingApiResult<IdentityServerStatus>>;
  replenishPreKeys(
    input: PreKeyReplenishmentRequest,
  ): Promise<PairingApiResult<PreKeyReplenishmentReceipt>>;
  createInvitation(input: PairingInvitationRequest): Promise<PairingApiResult<PairingInvitation>>;
  preparePairRequest(input: PreparePairRequest): Promise<PairingApiResult<PreparedPairRequest>>;
  submitPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>>;
  readEvents(afterCursor: number, signal?: AbortSignal): Promise<PairingApiResult<PairingEvents>>;
  respondToPairRequest(
    requestId: string,
    input: PairingResponseRequest,
  ): Promise<PairingApiResult<PairRequestMutation>>;
  verifyPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>>;
  cancelPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>>;
}
