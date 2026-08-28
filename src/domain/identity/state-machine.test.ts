import { identityRelationshipReducer, initialIdentityRelationshipState } from './state-machine';
import type {
  IdentityRelationshipState,
  IdentitySummary,
  PairingRequestSummary,
  RelationshipSummary,
  SafetyNumberDisplay,
} from './types';

const identity: IdentitySummary = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};
const request: PairingRequestSummary = {
  expiresAtMs: 1_800_000_600_000,
  method: 'm2y-id',
  peer: { m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ', routeId: 'peer-route-1' },
  requestId: 'request-1',
};
const safetyNumber: SafetyNumberDisplay = {
  groups: ['12345', '23456', '34567', '45678', '56789', '67890'],
};
const relationship: RelationshipSummary = {
  activatedAtMs: 1_800_000_000_000,
  pairId: 'pair-1',
  peer: request.peer,
};

function awaitingSafety(): IdentityRelationshipState {
  return {
    status: 'awaitingSafetyVerification',
    identity,
    localConfirmed: false,
    remoteConfirmed: false,
    request,
    safetyNumber,
  };
}

describe('identity relationship state machine', () => {
  it('moves from inspection through committed registration without optimistic active state', () => {
    const needsIdentity = identityRelationshipReducer(initialIdentityRelationshipState, {
      type: 'inspectAbsent',
    });
    const creating = identityRelationshipReducer(needsIdentity, {
      type: 'identityCreationStarted',
    });
    const registering = identityRelationshipReducer(creating, {
      type: 'identityPrepared',
      identity,
      operationId: 'operation-1',
    });
    const unpaired = identityRelationshipReducer(registering, {
      type: 'registrationCommitted',
      identity,
    });

    expect([needsIdentity.status, creating.status, registering.status, unpaired.status]).toEqual([
      'needsIdentity',
      'creatingIdentity',
      'registering',
      'unpaired',
    ]);
  });

  it('converges every discovery method on the same outgoing request state', () => {
    const unpaired: IdentityRelationshipState = { status: 'unpaired', identity };
    for (const method of ['qr-ticket', 'm2y-id', 'handshake-code'] as const) {
      const result = identityRelationshipReducer(unpaired, {
        type: 'pairRequestPrepared',
        request: { ...request, method },
      });
      expect(result).toMatchObject({ status: 'outgoingPending', request: { method } });
    }
  });

  it('requires both confirmations and a committed activation before becoming active', () => {
    const initial = awaitingSafety();
    expect(
      identityRelationshipReducer(initial, { type: 'activationCommitted', relationship }).status,
    ).toBe('awaitingSafetyVerification');

    const local = identityRelationshipReducer(initial, { type: 'localSafetyConfirmed' });
    expect(
      identityRelationshipReducer(local, { type: 'activationCommitted', relationship }).status,
    ).toBe('awaitingSafetyVerification');

    const both = identityRelationshipReducer(local, { type: 'remoteSafetyConfirmed' });
    expect(
      identityRelationshipReducer(both, { type: 'activationCommitted', relationship }),
    ).toEqual({ status: 'active', identity, relationship });
  });

  it.each([
    [{ type: 'requestRejected' } as const, 'rejected'],
    [{ type: 'requestCancelled', by: 'local' } as const, 'cancelled'],
    [{ type: 'requestExpired' } as const, 'expired'],
    [{ type: 'safetyMismatch' } as const, 'cancelled'],
  ])('fails closed for terminal pairing event %#', (event, expectedStatus) => {
    expect(identityRelationshipReducer(awaitingSafety(), event).status).toBe(expectedStatus);
  });

  it('moves an active relationship to identityChanged instead of replacing trust', () => {
    const active: IdentityRelationshipState = { status: 'active', identity, relationship };
    expect(
      identityRelationshipReducer(active, {
        type: 'identityChanged',
        peer: { ...request.peer, routeId: 'replacement-route' },
      }).status,
    ).toBe('identityChanged');
  });

  it.each([
    {
      expected: { status: 'registering', identity, operationId: 'operation-1' },
      label: 'a registration the native store has not committed yet',
      event: { type: 'inspectPendingRegistration', identity, operationId: 'operation-1' } as const,
    },
    {
      expected: { status: 'unpaired', identity },
      label: 'a registered identity with no relationship',
      event: { type: 'inspectUnpaired', identity } as const,
    },
    {
      expected: { status: 'outgoingPending', identity, request },
      label: 'an acknowledged outgoing request',
      event: { type: 'inspectOutgoingPending', identity, request } as const,
    },
    {
      expected: { status: 'incomingReview', identity, request },
      label: '已解密并等待本机审核的传入请求',
      event: { type: 'inspectIncomingReview', identity, request } as const,
    },
  ])('restores $label on relaunch', ({ event, expected }) => {
    expect(identityRelationshipReducer(initialIdentityRelationshipState, event)).toEqual(expected);
  });

  it.each([
    ['unpaired', { status: 'unpaired', identity }] as const,
    ['active', { status: 'active', identity, relationship }] as const,
    ['fatal', { status: 'fatal', code: 'native-unavailable', retryable: true }] as const,
    ['recoveryRequired', { status: 'recoveryRequired', code: 'key-boundary-broken' }] as const,
  ])('restarts inspection from %s so no stale identity survives a retry', (_status, state) => {
    expect(identityRelationshipReducer(state, { type: 'inspectStarted' })).toEqual({
      status: 'inspecting',
    });
  });

  it('ignores restore events once an identity is already known', () => {
    const unpaired: IdentityRelationshipState = { status: 'unpaired', identity };
    expect(identityRelationshipReducer(unpaired, { type: 'inspectAbsent' })).toBe(unpaired);
  });
});
