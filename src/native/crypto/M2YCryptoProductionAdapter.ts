import {
  ackPairingOutbox as ackNativePairingOutbox,
  activatePairedRelationship as activateNativePairedRelationship,
  commitIdentityRegistration as commitNativeIdentityRegistration,
  confirmPairingSafetyNumber as confirmNativePairingSafetyNumber,
  inspectProductionIdentity as inspectNativeProductionIdentity,
  listPairingOutbox as listNativePairingOutbox,
  prepareIdentityRegistration as prepareNativeIdentityRegistration,
  resetProductionIdentity as resetNativeProductionIdentity,
  respondToPairingRequest as respondToNativePairingRequest,
  signDeviceRequest as signNativeDeviceRequest,
  sweepPairingState as sweepNativePairingState,
} from '../../../modules/m2y-crypto';

import {
  decodeProductionPairingAcknowledgement,
  decodeProductionPairingActivation,
  decodeProductionPairingConfirmation,
  decodeProductionPairingDecision,
  decodeProductionPairingOutbox,
  decodeProductionPairingSweep,
  type ProductionPairingAcknowledgement,
  type ProductionPairingAction,
  type ProductionPairingActivation,
  type ProductionPairingConfirmation,
  type ProductionPairingDecision,
  type ProductionPairingOutbox,
  type ProductionPairingSweep,
} from './M2YCryptoPairingContract';
import {
  decodeProductionDeviceSignature,
  decodeProductionIdentityInspection,
  decodeProductionIdentityRegistration,
  decodeProductionIdentityReset,
  type ProductionDeviceSignature,
  type ProductionIdentityInspection,
  type ProductionIdentityRegistration,
  type ProductionIdentityReset,
} from './M2YCryptoProductionContract';

export type {
  ProductionPairingAcknowledgement,
  ProductionPairingAction,
  ProductionPairingActivation,
  ProductionPairingConfirmation,
  ProductionPairingDecision,
  ProductionPairingOutbox,
  ProductionPairingOutboxItem,
  ProductionPairingSweep,
} from './M2YCryptoPairingContract';
export type {
  ProductionDeviceSignature,
  ProductionIdentityInspection,
  ProductionIdentityRegistration,
  ProductionIdentityReset,
} from './M2YCryptoProductionContract';

export class M2YCryptoProductionError extends Error {
  readonly code: 'production-native-operation-failed';

  constructor() {
    super('production-native-operation-failed');
    this.name = 'M2YCryptoProductionError';
    this.code = 'production-native-operation-failed';
  }
}

async function callNative<T>(operation: () => Promise<unknown>, decode: (value: unknown) => T) {
  let value: unknown;
  try {
    value = await operation();
  } catch {
    throw new M2YCryptoProductionError();
  }
  return decode(value);
}

export function inspectM2YProductionIdentity(): Promise<ProductionIdentityInspection> {
  return callNative(inspectNativeProductionIdentity, decodeProductionIdentityInspection);
}

export function prepareM2YIdentityRegistration(
  displayName: string | null,
): Promise<ProductionIdentityRegistration> {
  return callNative(
    () => prepareNativeIdentityRegistration(displayName),
    decodeProductionIdentityRegistration,
  );
}

export function commitM2YIdentityRegistration(
  operationId: string,
  receiptId: string,
): Promise<ProductionIdentityInspection> {
  return callNative(
    () => commitNativeIdentityRegistration(operationId, receiptId),
    decodeProductionIdentityInspection,
  );
}

export function signM2YDeviceRequest(canonicalRequest: string): Promise<ProductionDeviceSignature> {
  return callNative(
    () => signNativeDeviceRequest(canonicalRequest),
    decodeProductionDeviceSignature,
  );
}

export function resetM2YProductionIdentity(): Promise<ProductionIdentityReset> {
  return callNative(resetNativeProductionIdentity, decodeProductionIdentityReset);
}

/**
 * The pairing calls below have no application-layer port yet, for the same reason
 * `commitM2YIdentityRegistration` and `signM2YDeviceRequest` do not: they only become reachable once
 * the pairing API client exists to carry the queued packets. Staging an inbound candidate is not
 * exposed at all — opening a peer packet needs the libsignal session that arrives with the protocol
 * engine, so the native module keeps that entry point package-private.
 */
export function respondToM2YPairingRequest(
  requestId: string,
  action: ProductionPairingAction,
): Promise<ProductionPairingDecision> {
  return callNative(
    () => respondToNativePairingRequest(requestId, action),
    decodeProductionPairingDecision,
  );
}

export function confirmM2YPairingSafetyNumber(
  requestId: string,
): Promise<ProductionPairingConfirmation> {
  return callNative(
    () => confirmNativePairingSafetyNumber(requestId),
    decodeProductionPairingConfirmation,
  );
}

export function activateM2YPairedRelationship(
  requestId: string,
  pairId: string,
): Promise<ProductionPairingActivation> {
  return callNative(
    () => activateNativePairedRelationship(requestId, pairId),
    decodeProductionPairingActivation,
  );
}

export function listM2YPairingOutbox(): Promise<ProductionPairingOutbox> {
  return callNative(listNativePairingOutbox, decodeProductionPairingOutbox);
}

export function ackM2YPairingOutbox(
  operationId: string,
  receiptId: string,
): Promise<ProductionPairingAcknowledgement> {
  return callNative(
    () => ackNativePairingOutbox(operationId, receiptId),
    decodeProductionPairingAcknowledgement,
  );
}

export function sweepM2YPairingState(): Promise<ProductionPairingSweep> {
  return callNative(sweepNativePairingState, decodeProductionPairingSweep);
}
