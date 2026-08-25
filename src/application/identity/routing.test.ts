import type {
  IdentityRelationshipState,
  IdentitySummary,
  PeerSummary,
} from '@/domain/identity/types';

import { type IdentityRouteDecision, resolveIdentityRoute } from './routing';
import type { WorkspaceAccess } from './workspace-access';

const identity: IdentitySummary = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};

const peer: PeerSummary = { m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ', routeId: 'peer-route-1' };

const request = {
  expiresAtMs: 1_800_000_600_000,
  method: 'm2y-id',
  peer,
  requestId: 'request-1',
} as const;

/** The transitional grant: an identity exists but no pairing service does, so `/pair` is pointless. */
const unreachable: WorkspaceAccess = {
  kind: 'granted',
  reason: 'pairing-transport-unavailable',
  code: 'placeholder-host',
};

const reachable: WorkspaceAccess = { kind: 'blocked' };

const activeAccess: WorkspaceAccess = { kind: 'granted', reason: 'active-relationship' };

/**
 * Every member of `IdentityRelationshipState`, so a status added later fails this table instead of
 * silently inheriting whatever the last branch happened to return.
 */
const states: readonly { state: IdentityRelationshipState; expected: IdentityRouteDecision }[] = [
  { state: { status: 'inspecting' }, expected: { kind: 'pending' } },
  {
    state: { status: 'recoveryRequired', code: 'store-unreadable' },
    expected: { kind: 'faulted' },
  },
  {
    state: { status: 'fatal', code: 'keystore-unavailable', retryable: false },
    expected: { kind: 'faulted' },
  },
  { state: { status: 'needsIdentity' }, expected: { kind: 'route', route: '/create-identity' } },
  {
    state: { status: 'creatingIdentity' },
    expected: { kind: 'route', route: '/create-identity' },
  },
  {
    state: {
      status: 'awaitingSafetyVerification',
      identity,
      localConfirmed: false,
      remoteConfirmed: false,
      request,
      safetyNumber: { groups: ['11111', '22222', '33333', '44444', '55555', '66666'] },
    },
    expected: { kind: 'route', route: '/verify-safety-number' },
  },
  {
    state: {
      status: 'active',
      identity,
      relationship: { activatedAtMs: 1_800_000_000_000, pairId: 'pair-1', peer },
    },
    expected: { kind: 'route', route: '/chat' },
  },
];

/** The nine statuses that own an identity but no relationship; all follow pairing reachability. */
const pairingStates: readonly IdentityRelationshipState[] = [
  { status: 'registering', identity, operationId: 'operation-1' },
  { status: 'unpaired', identity },
  { status: 'outgoingPending', identity, request },
  { status: 'incomingReview', identity, request },
  { status: 'rejected', identity, requestId: 'request-1' },
  { status: 'cancelled', identity, reason: 'remote', requestId: 'request-1' },
  { status: 'expired', identity, requestId: 'request-1' },
  { status: 'networkFailed', identity, retryFrom: 'registering' },
  { status: 'identityChanged', identity, peer },
];

describe('resolveIdentityRoute', () => {
  it.each(states)('maps $state.status to its only actionable screen', ({ state, expected }) => {
    expect(resolveIdentityRoute(state, unreachable)).toEqual(expected);
    expect(resolveIdentityRoute(state, reachable)).toEqual(expected);
  });

  it.each(pairingStates.map((state) => ({ state })))(
    'sends $state.status to /pair when a request could be delivered',
    ({ state }) => {
      expect(resolveIdentityRoute(state, reachable)).toEqual({ kind: 'route', route: '/pair' });
    },
  );

  it.each(pairingStates.map((state) => ({ state })))(
    'keeps $state.status in the local workspace while no pairing transport exists',
    ({ state }) => {
      expect(resolveIdentityRoute(state, unreachable)).toEqual({ kind: 'route', route: '/chat' });
    },
  );

  /**
   * The regression this whole module exists for: pressing "生成我的身份" moves the state here, and
   * nothing was watching, so the screen stayed put while its own button became a no-op.
   */
  it('leaves the creation screen once the identity has been generated', () => {
    const before = resolveIdentityRoute({ status: 'creatingIdentity' }, unreachable);
    const after = resolveIdentityRoute(
      { status: 'registering', identity, operationId: 'operation-1' },
      unreachable,
    );
    expect(before).toEqual({ kind: 'route', route: '/create-identity' });
    expect(after).toEqual({ kind: 'route', route: '/chat' });
  });

  it('never resolves an active relationship anywhere but the workspace', () => {
    expect(
      resolveIdentityRoute(
        {
          status: 'active',
          identity,
          relationship: { activatedAtMs: 1_800_000_000_000, pairId: 'pair-1', peer },
        },
        activeAccess,
      ),
    ).toEqual({ kind: 'route', route: '/chat' });
  });

  it('covers every declared status', () => {
    const covered = new Set([
      ...states.map(({ state }) => state.status),
      ...pairingStates.map((state) => state.status),
    ]);
    expect(covered.size).toBe(16);
  });
});
