import {
  commitIdentityRegistration as commitNativeIdentityRegistration,
  inspectProductionIdentity as inspectNativeProductionIdentity,
  prepareIdentityRegistration as prepareNativeIdentityRegistration,
  resetProductionIdentity as resetNativeProductionIdentity,
  signDeviceRequest as signNativeDeviceRequest,
} from '../../../modules/m2y-crypto';

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
