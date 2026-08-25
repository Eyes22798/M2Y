import type { IdentityDraft, IdentityInspection } from '@/application/identity/contracts';

import type {
  ProductionIdentityInspection,
  ProductionIdentityRegistration,
} from './M2YCryptoProductionContract';

/**
 * Translates the decoded native payloads into the application-level identity contracts. Kept free of
 * the native module import so the mapping is unit-testable on a machine with no Android toolchain;
 * the adapter that actually calls into Kotlin stays a thin delegation on top of this.
 */
export function toIdentityInspection(value: ProductionIdentityInspection): IdentityInspection {
  if (value.status === 'absent') {
    return { kind: 'absent' };
  }

  const identity = {
    deviceId: value.deviceId,
    ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
    m2yId: value.m2yId,
    stableIdentityId: value.stableIdentityId,
  };
  return value.status === 'pendingRegistration'
    ? { kind: 'pendingRegistration', identity, operationId: value.operationId }
    : { kind: 'unpaired', identity };
}

/**
 * The prepared bundle carries no display name, so none is reported rather than echoing back the
 * requested one: only the native store knows what it actually persisted, and the next inspection
 * reads it from there. The public key material stays out of the result entirely.
 */
export function toIdentityDraft(value: ProductionIdentityRegistration): IdentityDraft {
  return {
    identity: {
      deviceId: value.deviceId,
      m2yId: value.m2yId,
      stableIdentityId: value.stableIdentityId,
    },
    operationId: value.operationId,
  };
}
