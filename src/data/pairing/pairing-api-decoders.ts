import {
  PAIR_EVENT_TYPES,
  PAIR_REQUEST_STATUSES,
  type IdentityRegistrationReceipt,
  type IdentityServerStatus,
  type LeasedPublicBundle,
  type PairingEvent,
  type PairingEvents,
  type PairingInvitation,
  type PairRequestMutation,
  type PreKeyReplenishmentReceipt,
  type PreparedPairRequest,
  type PublicOneTimePreKey,
} from '@/application/pairing/contracts';
import { isPairingErrorCode, type PairingErrorCode } from '@/application/pairing/error-codes';
import type { PairingMethod } from '@/domain/identity/types';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const M2Y_ID_PATTERN =
  /^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const pairingMethods: readonly PairingMethod[] = ['handshake-code', 'm2y-id', 'qr-ticket'];
const requestStatuses: ReadonlySet<string> = new Set(PAIR_REQUEST_STATUSES);
const eventTypes: ReadonlySet<string> = new Set(PAIR_EVENT_TYPES);

export type DecodedServerFailure = Readonly<{ code: PairingErrorCode; schemaVersion: 1 }>;

export function decodeServerFailure(value: unknown): DecodedServerFailure | null {
  if (
    !isExactRecord(value, ['code', 'schemaVersion']) ||
    value.schemaVersion !== 1 ||
    !isPairingErrorCode(value.code)
  ) {
    return null;
  }
  return { code: value.code, schemaVersion: 1 };
}

export function decodeIdentityRegistrationReceipt(
  value: unknown,
): IdentityRegistrationReceipt | null {
  if (
    !isExactRecord(value, [
      'deviceId',
      'm2yId',
      'receiptId',
      'registeredAtMs',
      'schemaVersion',
      'status',
    ]) ||
    value.schemaVersion !== 1 ||
    value.status !== 'registered' ||
    !isUuid(value.deviceId) ||
    !isM2yId(value.m2yId) ||
    !isUuid(value.receiptId) ||
    !isEpochMs(value.registeredAtMs)
  ) {
    return null;
  }
  return {
    deviceId: value.deviceId,
    m2yId: value.m2yId,
    receiptId: value.receiptId,
    registeredAtMs: value.registeredAtMs,
    status: 'registered',
  };
}

export function decodeIdentityServerStatus(value: unknown): IdentityServerStatus | null {
  if (
    !isExactRecord(value, [
      'deviceId',
      'm2yId',
      'oneTimePreKeyCount',
      'registeredAtMs',
      'schemaVersion',
      'stableIdentityId',
      'status',
    ]) ||
    value.schemaVersion !== 1 ||
    value.status !== 'registered' ||
    !isUuid(value.deviceId) ||
    !isM2yId(value.m2yId) ||
    !isNonNegativeInteger(value.oneTimePreKeyCount) ||
    !isEpochMs(value.registeredAtMs) ||
    !isUuid(value.stableIdentityId)
  ) {
    return null;
  }
  return {
    deviceId: value.deviceId,
    m2yId: value.m2yId,
    oneTimePreKeyCount: value.oneTimePreKeyCount,
    registeredAtMs: value.registeredAtMs,
    stableIdentityId: value.stableIdentityId,
    status: 'registered',
  };
}

export function decodePreKeyReplenishmentReceipt(
  value: unknown,
): PreKeyReplenishmentReceipt | null {
  if (
    !isExactRecord(value, ['addedCount', 'operationId', 'schemaVersion', 'status']) ||
    value.schemaVersion !== 1 ||
    value.status !== 'replenished' ||
    !isPositiveInteger(value.addedCount) ||
    !isUuid(value.operationId)
  ) {
    return null;
  }
  return {
    addedCount: value.addedCount,
    operationId: value.operationId,
    status: 'replenished',
  };
}

export function decodePairingInvitation(value: unknown): PairingInvitation | null {
  if (!isRecord(value)) return null;
  if (
    value.kind === 'qr-ticket' &&
    hasExactKeys(value, [
      'deepLink',
      'expiresAtMs',
      'inviteId',
      'kind',
      'operationId',
      'schemaVersion',
      'ticket',
    ]) &&
    value.schemaVersion === 1 &&
    isEpochMs(value.expiresAtMs) &&
    isUuid(value.inviteId) &&
    isUuid(value.operationId) &&
    isBase64Url(value.ticket, 43, 43) &&
    value.deepLink === `m2y://pair?ticket=${value.ticket}`
  ) {
    return {
      deepLink: value.deepLink,
      expiresAtMs: value.expiresAtMs,
      inviteId: value.inviteId,
      kind: 'qr-ticket',
      operationId: value.operationId,
      ticket: value.ticket,
    };
  }
  if (
    value.kind === 'handshake-code' &&
    hasExactKeys(value, [
      'code',
      'expiresAtMs',
      'inviteId',
      'kind',
      'operationId',
      'schemaVersion',
    ]) &&
    value.schemaVersion === 1 &&
    isEpochMs(value.expiresAtMs) &&
    isUuid(value.inviteId) &&
    isUuid(value.operationId) &&
    typeof value.code === 'string' &&
    /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u.test(value.code)
  ) {
    return {
      code: value.code,
      expiresAtMs: value.expiresAtMs,
      inviteId: value.inviteId,
      kind: 'handshake-code',
      operationId: value.operationId,
    };
  }
  return null;
}

export function decodePreparedPairRequest(value: unknown): PreparedPairRequest | null {
  if (
    !isExactRecord(value, [
      'expiresAtMs',
      'method',
      'requestId',
      'schemaVersion',
      'status',
      'targetBundle',
    ]) ||
    value.schemaVersion !== 1 ||
    value.status !== 'prepared' ||
    !isEpochMs(value.expiresAtMs) ||
    !isPairingMethod(value.method) ||
    !isUuid(value.requestId)
  ) {
    return null;
  }
  const targetBundle = decodeLeasedPublicBundle(value.targetBundle);
  if (targetBundle === null) return null;
  return {
    expiresAtMs: value.expiresAtMs,
    method: value.method,
    requestId: value.requestId,
    status: 'prepared',
    targetBundle,
  };
}

export function decodePairRequestMutation(value: unknown): PairRequestMutation | null {
  if (!isRecord(value)) return null;
  const expectedKeys = [
    'eventCursor',
    'operationId',
    ...(value.pairId === undefined ? [] : ['pairId']),
    'requestId',
    'schemaVersion',
    'status',
  ];
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.schemaVersion !== 1 ||
    !isNonNegativeInteger(value.eventCursor) ||
    !isUuid(value.operationId) ||
    !isUuid(value.requestId) ||
    !isRequestStatus(value.status) ||
    (value.pairId !== undefined && !isUuid(value.pairId)) ||
    (value.status === 'active' && value.pairId === undefined) ||
    (value.status !== 'active' && value.pairId !== undefined)
  ) {
    return null;
  }
  return {
    eventCursor: value.eventCursor,
    operationId: value.operationId,
    ...(value.pairId === undefined ? {} : { pairId: value.pairId }),
    requestId: value.requestId,
    status: value.status,
  };
}

export function decodePairingEvents(value: unknown): PairingEvents | null {
  if (
    !isExactRecord(value, ['events', 'nextCursor', 'schemaVersion']) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.events) ||
    value.events.length > 100 ||
    !isNonNegativeInteger(value.nextCursor)
  ) {
    return null;
  }
  const events: PairingEvent[] = [];
  let previousCursor = -1;
  for (const candidate of value.events) {
    const event = decodePairingEvent(candidate);
    if (event === null || event.cursor <= previousCursor) return null;
    previousCursor = event.cursor;
    events.push(event);
  }
  if (events.length > 0 && events[events.length - 1]?.cursor !== value.nextCursor) return null;
  return { events, nextCursor: value.nextCursor };
}

function decodeLeasedPublicBundle(value: unknown): LeasedPublicBundle | null {
  if (
    !isExactRecord(value, [
      'deviceId',
      'identityPublicKey',
      'kyberPreKeyId',
      'kyberPreKeyPublic',
      'kyberPreKeySignature',
      'm2yId',
      'oneTimePreKey',
      'registrationId',
      'signedPreKeyId',
      'signedPreKeyPublic',
      'signedPreKeySignature',
      'stableIdentityId',
    ]) ||
    !isUuid(value.deviceId) ||
    !isUuid(value.stableIdentityId) ||
    !isM2yId(value.m2yId) ||
    !isPositiveInteger(value.registrationId) ||
    !isPositiveInteger(value.signedPreKeyId) ||
    !isPositiveInteger(value.kyberPreKeyId) ||
    !isBase64Url(value.identityPublicKey, 32, 256) ||
    !isBase64Url(value.signedPreKeyPublic, 32, 256) ||
    !isBase64Url(value.signedPreKeySignature, 32, 256) ||
    !isBase64Url(value.kyberPreKeyPublic, 256, 4096) ||
    !isBase64Url(value.kyberPreKeySignature, 32, 256)
  ) {
    return null;
  }
  const oneTimePreKey = decodeOneTimePreKey(value.oneTimePreKey);
  if (oneTimePreKey === null) return null;
  return {
    deviceId: value.deviceId,
    identityPublicKey: value.identityPublicKey,
    kyberPreKeyId: value.kyberPreKeyId,
    kyberPreKeyPublic: value.kyberPreKeyPublic,
    kyberPreKeySignature: value.kyberPreKeySignature,
    m2yId: value.m2yId,
    oneTimePreKey,
    registrationId: value.registrationId,
    signedPreKeyId: value.signedPreKeyId,
    signedPreKeyPublic: value.signedPreKeyPublic,
    signedPreKeySignature: value.signedPreKeySignature,
    stableIdentityId: value.stableIdentityId,
  };
}

function decodeOneTimePreKey(value: unknown): PublicOneTimePreKey | null {
  if (
    !isExactRecord(value, ['id', 'publicKey']) ||
    !isPositiveInteger(value.id) ||
    !isBase64Url(value.publicKey, 32, 256)
  ) {
    return null;
  }
  return { id: value.id, publicKey: value.publicKey };
}

function decodePairingEvent(value: unknown): PairingEvent | null {
  if (!isRecord(value)) return null;
  const expectedKeys = [
    'cursor',
    'eventId',
    ...(value.packet === undefined ? [] : ['packet']),
    'requestId',
    'status',
    'type',
  ];
  if (
    !hasExactKeys(value, expectedKeys) ||
    !isPositiveInteger(value.cursor) ||
    !isUuid(value.eventId) ||
    !isUuid(value.requestId) ||
    !isRequestStatus(value.status) ||
    !isEventType(value.type) ||
    (value.packet !== undefined && !isBase64Url(value.packet, 32, 24_576))
  ) {
    return null;
  }
  return {
    cursor: value.cursor,
    eventId: value.eventId,
    ...(value.packet === undefined ? {} : { packet: value.packet }),
    requestId: value.requestId,
    status: value.status,
    type: value.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

function isM2yId(value: unknown): value is string {
  return typeof value === 'string' && M2Y_ID_PATTERN.test(value);
}

function isBase64Url(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    BASE64_URL_PATTERN.test(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isEpochMs(value: unknown): value is number {
  return isPositiveInteger(value) && value <= 9_999_999_999_999_999;
}

function isPairingMethod(value: unknown): value is PairingMethod {
  return typeof value === 'string' && pairingMethods.includes(value as PairingMethod);
}

function isRequestStatus(value: unknown): value is PairRequestMutation['status'] {
  return typeof value === 'string' && requestStatuses.has(value);
}

function isEventType(value: unknown): value is PairingEvent['type'] {
  return typeof value === 'string' && eventTypes.has(value);
}
