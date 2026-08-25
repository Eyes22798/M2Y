import type { IdentityRelationshipState, IdentitySummary } from '@/domain/identity/types';

/**
 * What the production identity store reports about this device. The three cases mirror the native
 * inspection contract, minus the storage bookkeeping (`revision`, `schemaVersion`) that no
 * application decision depends on.
 */
export type IdentityInspection =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'pendingRegistration'; identity: IdentitySummary; operationId: string }>
  | Readonly<{ kind: 'unpaired'; identity: IdentitySummary }>;

/**
 * The part of a prepared registration the UI may see. The public key bundle stays inside the native
 * outbox: only the pairing API client will ever need it, and `prepareIdentity` is idempotent, so
 * dropping it here loses nothing that cannot be re-read.
 */
export type IdentityDraft = Readonly<{ identity: IdentitySummary; operationId: string }>;

/**
 * Every method rejects instead of returning a failure union: the native module reports one opaque
 * failure code, so a richer result type here would be invented precision. The controller maps a
 * rejection onto a fail-closed state.
 */
export interface ProductionIdentityPort {
  inspectIdentity(): Promise<IdentityInspection>;
  prepareIdentity(displayName: string | null): Promise<IdentityDraft>;
  resetIdentity(): Promise<void>;
}

export interface IdentityRelationshipController {
  getState(): IdentityRelationshipState;
  subscribe(listener: () => void): () => void;
  inspect(): Promise<void>;
  createIdentity(displayName: string | null): Promise<void>;
  resetLocalData(): Promise<void>;
  retry(): Promise<void>;
}
