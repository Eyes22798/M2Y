import {
  hasExactNativeKeys,
  invalidNativeResponse,
  isEpochMs,
  isNativeRecord,
  isNonNegativeSafeInteger,
  isUuidV4,
} from './strict-native-decoder';

/**
 * native 生产配对合同。首包作为不透明密文允许短暂穿过 JavaScript 交给 transport；私钥、会话记录、
 * 安全号码和解密后的 peer identity 永不越过边界。其余字段只包含不透明 ID、枚举和计数。
 *
 * 枚举字面量与 native 持久值完全一致；这里若擅自放宽，会接受 native 永远不会产生的状态。
 */

/** Statuses a local decision can settle a pairing candidate into. */
export const productionPairingStatuses = ['accepted', 'cancelled', 'mismatch', 'rejected'] as const;

/**
 * The decisions a caller may ask for. Expiry is deliberately absent: it belongs to the clock and the
 * native sweep, so naming it here would let the UI retire a request that is still live.
 */
export const productionPairingActions = ['accept', 'cancel', 'mismatch', 'reject'] as const;

export const productionPairingActivationDecisions = [
  'activate',
  'alreadyActive',
  'peerIdentityChanged',
  'relationshipConflict',
] as const;

export const productionPairingPacketTypes = [
  'pair-cancel',
  'pair-request',
  'pair-response',
  'pair-verify',
] as const;

export const productionPairingIntentDecisions = [
  'accept',
  'cancel',
  'confirm',
  'mismatch',
  'reject',
  'submit',
] as const;

export type ProductionPairingStatus = (typeof productionPairingStatuses)[number];
export type ProductionPairingAction = (typeof productionPairingActions)[number];
export type ProductionPairingActivationDecision =
  (typeof productionPairingActivationDecisions)[number];
export type ProductionPairingPacketType = (typeof productionPairingPacketTypes)[number];
export type ProductionPairingIntentDecision = (typeof productionPairingIntentDecisions)[number];

/**
 * Which decisions each packet type may carry, mirroring the native intent kinds. A packet type and a
 * decision that are each individually known but never paired natively is still a rejected payload.
 */
const PAIRING_INTENTS: Readonly<
  Record<ProductionPairingPacketType, readonly ProductionPairingIntentDecision[]>
> = {
  'pair-cancel': ['cancel', 'mismatch'],
  'pair-request': ['submit'],
  'pair-response': ['accept', 'reject'],
  'pair-verify': ['confirm'],
};

/**
 * A settled local decision plus the operation the transport must deliver for it. The operation id is
 * always present because every decision reachable from the module boundary queues exactly one packet;
 * repeating the decision returns the same id rather than queueing a second.
 */
export type ProductionPairingDecision = Readonly<{
  operationId: string;
  requestId: string;
  schemaVersion: 1;
  status: ProductionPairingStatus;
}>;

/**
 * The local half of safety-number verification. The candidate stays accepted: confirming is not an
 * outcome, it is one of the two independent confirmations activation later requires.
 */
export type ProductionPairingConfirmation = Readonly<{
  operationId: string;
  requestId: string;
  schemaVersion: 1;
  status: 'accepted';
}>;

/** What an activation attempt meant against the single relationship the native schema allows. */
export type ProductionPairingActivation = Readonly<{
  decision: ProductionPairingActivationDecision;
  requestId: string;
  schemaVersion: 1;
}>;

export type ProductionPairingOutboxItem = Readonly<{
  createdAtMs: number;
  decision: ProductionPairingIntentDecision;
  expiresAtMs?: number;
  operationId: string;
  packet?: string;
  packetType: ProductionPairingPacketType;
  requestId: string;
  retryCount: number;
  targetDeviceId?: string;
  targetM2yId?: string;
  targetStableIdentityId?: string;
}>;

/** native 已把 PQXDH 会话和首包 outbox 同事务提交后的可传输结果。 */
export type ProductionPreparedPairingPacket = Readonly<{
  expiresAtMs: number;
  operationId: string;
  packet: string;
  requestId: string;
  schemaVersion: 1;
  status: 'committed';
  targetDeviceId: string;
  targetM2yId: string;
  targetStableIdentityId: string;
}>;

/** Pending transport work in the native insertion order the store guarantees. */
export type ProductionPairingOutbox = Readonly<{
  items: readonly ProductionPairingOutboxItem[];
  schemaVersion: 1;
}>;

export type ProductionPairingAcknowledgement = Readonly<{
  operationId: string;
  schemaVersion: 1;
  status: 'acknowledged';
}>;

/** What the clock-driven sweep retired. Every count is legitimately zero on a quiet device. */
export type ProductionPairingSweep = Readonly<{
  expiredCandidates: number;
  removedInboxMarkers: number;
  removedTombstones: number;
  schemaVersion: 1;
}>;

function isKnownIntent(packetType: unknown, decision: unknown): boolean {
  const allowed = productionPairingPacketTypes.find((type) => type === packetType);
  return (
    allowed !== undefined && PAIRING_INTENTS[allowed].some((candidate) => candidate === decision)
  );
}

/**
 * Both settling a candidate and confirming its safety number report the same four fields, so they
 * share one field check; only the accepted status set differs.
 */
function decodedDecision(
  value: unknown,
  statuses: readonly ProductionPairingStatus[],
): ProductionPairingDecision {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['operationId', 'requestId', 'schemaVersion', 'status']) ||
    value.schemaVersion !== 1 ||
    !isUuidV4(value.operationId) ||
    !isUuidV4(value.requestId) ||
    !statuses.some((status) => status === value.status)
  ) {
    return invalidNativeResponse();
  }
  return {
    operationId: value.operationId,
    requestId: value.requestId,
    schemaVersion: 1,
    status: value.status as ProductionPairingStatus,
  };
}

export function decodeProductionPairingDecision(value: unknown): ProductionPairingDecision {
  return decodedDecision(value, productionPairingStatuses);
}

export function decodeProductionPairingConfirmation(value: unknown): ProductionPairingConfirmation {
  const decoded = decodedDecision(value, ['accepted']);
  return {
    operationId: decoded.operationId,
    requestId: decoded.requestId,
    schemaVersion: 1,
    status: 'accepted',
  };
}

export function decodeProductionPairingActivation(value: unknown): ProductionPairingActivation {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['decision', 'requestId', 'schemaVersion']) ||
    value.schemaVersion !== 1 ||
    !isUuidV4(value.requestId) ||
    !productionPairingActivationDecisions.some((decision) => decision === value.decision)
  ) {
    return invalidNativeResponse();
  }
  return {
    decision: value.decision as ProductionPairingActivationDecision,
    requestId: value.requestId,
    schemaVersion: 1,
  };
}

export function decodeProductionPairingAcknowledgement(
  value: unknown,
): ProductionPairingAcknowledgement {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['operationId', 'schemaVersion', 'status']) ||
    value.schemaVersion !== 1 ||
    !isUuidV4(value.operationId) ||
    value.status !== 'acknowledged'
  ) {
    return invalidNativeResponse();
  }
  return { operationId: value.operationId, schemaVersion: 1, status: 'acknowledged' };
}

export function decodeProductionPreparedPairingPacket(
  value: unknown,
): ProductionPreparedPairingPacket {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, [
      'expiresAtMs',
      'operationId',
      'packet',
      'requestId',
      'schemaVersion',
      'status',
      'targetDeviceId',
      'targetM2yId',
      'targetStableIdentityId',
    ]) ||
    value.schemaVersion !== 1 ||
    value.status !== 'committed' ||
    !isEpochMs(value.expiresAtMs) ||
    !isUuidV4(value.operationId) ||
    !isUuidV4(value.requestId) ||
    !isUuidV4(value.targetDeviceId) ||
    !isUuidV4(value.targetStableIdentityId) ||
    !isM2yId(value.targetM2yId) ||
    !isOpaquePacket(value.packet)
  ) {
    return invalidNativeResponse();
  }
  return {
    expiresAtMs: value.expiresAtMs,
    operationId: value.operationId,
    packet: value.packet,
    requestId: value.requestId,
    schemaVersion: 1,
    status: 'committed',
    targetDeviceId: value.targetDeviceId,
    targetM2yId: value.targetM2yId,
    targetStableIdentityId: value.targetStableIdentityId,
  };
}

export function decodeProductionPairingOutbox(value: unknown): ProductionPairingOutbox {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['items', 'schemaVersion']) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.items)
  ) {
    return invalidNativeResponse();
  }

  const items = value.items.map((item): ProductionPairingOutboxItem => {
    const carriesPacket = isNativeRecord(item) && item.packetType === 'pair-request';
    const packet = isNativeRecord(item) ? item.packet : undefined;
    if (
      !isNativeRecord(item) ||
      !hasExactNativeKeys(item, [
        'createdAtMs',
        'decision',
        'operationId',
        'packetType',
        'requestId',
        'retryCount',
        ...(carriesPacket
          ? ['expiresAtMs', 'packet', 'targetDeviceId', 'targetM2yId', 'targetStableIdentityId']
          : []),
      ]) ||
      !isUuidV4(item.operationId) ||
      !isUuidV4(item.requestId) ||
      !isEpochMs(item.createdAtMs) ||
      !isNonNegativeSafeInteger(item.retryCount) ||
      !isKnownIntent(item.packetType, item.decision) ||
      (carriesPacket &&
        (!isOpaquePacket(packet) ||
          !isEpochMs(item.expiresAtMs) ||
          !isUuidV4(item.targetDeviceId) ||
          !isM2yId(item.targetM2yId) ||
          !isUuidV4(item.targetStableIdentityId)))
    ) {
      return invalidNativeResponse();
    }
    return {
      createdAtMs: item.createdAtMs,
      decision: item.decision as ProductionPairingIntentDecision,
      ...(carriesPacket && isEpochMs(item.expiresAtMs) ? { expiresAtMs: item.expiresAtMs } : {}),
      operationId: item.operationId,
      ...(carriesPacket && isOpaquePacket(packet) ? { packet } : {}),
      packetType: item.packetType as ProductionPairingPacketType,
      requestId: item.requestId,
      retryCount: item.retryCount,
      ...(carriesPacket && isUuidV4(item.targetDeviceId)
        ? { targetDeviceId: item.targetDeviceId }
        : {}),
      ...(carriesPacket && isM2yId(item.targetM2yId) ? { targetM2yId: item.targetM2yId } : {}),
      ...(carriesPacket && isUuidV4(item.targetStableIdentityId)
        ? { targetStableIdentityId: item.targetStableIdentityId }
        : {}),
    };
  });
  if (new Set(items.map(({ operationId }) => operationId)).size !== items.length) {
    return invalidNativeResponse();
  }
  return { items, schemaVersion: 1 };
}

function isM2yId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u.test(
      value,
    )
  );
}

function isOpaquePacket(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.length <= 24_576 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

export function decodeProductionPairingSweep(value: unknown): ProductionPairingSweep {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, [
      'expiredCandidates',
      'removedInboxMarkers',
      'removedTombstones',
      'schemaVersion',
    ]) ||
    value.schemaVersion !== 1 ||
    !isNonNegativeSafeInteger(value.expiredCandidates) ||
    !isNonNegativeSafeInteger(value.removedInboxMarkers) ||
    !isNonNegativeSafeInteger(value.removedTombstones)
  ) {
    return invalidNativeResponse();
  }
  return {
    expiredCandidates: value.expiredCandidates,
    removedInboxMarkers: value.removedInboxMarkers,
    removedTombstones: value.removedTombstones,
    schemaVersion: 1,
  };
}
