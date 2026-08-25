import type { IdentityRelationshipState } from '@/domain/identity/types';

import type { WorkspaceAccess } from './workspace-access';

export type IdentityRoute = '/chat' | '/create-identity' | '/pair' | '/verify-safety-number';

export type IdentityRouteDecision =
  | Readonly<{ kind: 'route'; route: IdentityRoute }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'faulted' }>;

/**
 * Maps an identity state to the one screen that can still be acted on.
 *
 * This is a pure function because the mapping has to be applied on every render of every screen that
 * participates, not once when the entry route mounts. Reading it once is what let a finished identity
 * strand the user on the creation screen: the state moved to `registering`, the button that produced
 * it became a no-op, and no code was left watching.
 *
 * The two non-route outcomes are deliberately separate, because callers must treat them differently.
 * `pending` means the native store has not answered yet and committing to any route would be a guess —
 * the entry route has to keep waiting instead of landing somewhere it would have to leave again.
 * `faulted` means `IdentityRelationshipGate` is painting a fault screen over whatever is mounted, so
 * the route underneath only matters if the user chooses to continue into local data.
 */
export function resolveIdentityRoute(
  state: IdentityRelationshipState,
  access: WorkspaceAccess,
): IdentityRouteDecision {
  switch (state.status) {
    case 'inspecting':
      return { kind: 'pending' };
    case 'recoveryRequired':
    case 'fatal':
      return { kind: 'faulted' };
    case 'needsIdentity':
    case 'creatingIdentity':
      return { kind: 'route', route: '/create-identity' };
    case 'awaitingSafetyVerification':
      return { kind: 'route', route: '/verify-safety-number' };
    case 'active':
      return { kind: 'route', route: '/chat' };
    /**
     * Everything here owns an identity but no relationship. The pairing screens are worth entering
     * only when a request could actually be sent; without a reachable service the local workspace is
     * the only honest destination, which is the same condition `decideWorkspaceAccess` uses to decide
     * that the workspace may stay open at all.
     */
    case 'registering':
    case 'unpaired':
    case 'outgoingPending':
    case 'incomingReview':
    case 'rejected':
    case 'cancelled':
    case 'expired':
    case 'networkFailed':
    case 'identityChanged':
      return isPairingReachable(access)
        ? { kind: 'route', route: '/pair' }
        : { kind: 'route', route: '/chat' };
    default:
      return assertNever(state);
  }
}

function isPairingReachable(access: WorkspaceAccess): boolean {
  return !(access.kind === 'granted' && access.reason === 'pairing-transport-unavailable');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled identity state: ${JSON.stringify(value)}`);
}
