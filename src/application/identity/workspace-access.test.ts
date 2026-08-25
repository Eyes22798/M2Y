import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipState, IdentitySummary } from '@/domain/identity/types';

import { decideWorkspaceAccess } from './workspace-access';

const identity: IdentitySummary = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};

const activeState: IdentityRelationshipState = {
  status: 'active',
  identity,
  relationship: {
    activatedAtMs: 1_800_000_000_000,
    pairId: 'pair-1',
    peer: { m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ', routeId: 'peer-route-1' },
  },
};

const shippedPlaceholder: PublicConfigResult = {
  ok: true,
  config: {
    pairingEndpoint: { kind: 'placeholder', host: 'api.m2y.invalid' },
    variant: 'production',
  },
};

const reachableEndpoint: PublicConfigResult = {
  ok: true,
  config: {
    pairingEndpoint: {
      kind: 'configured',
      baseUrl: 'https://pair.m2y.example',
      transport: 'https',
    },
    variant: 'production',
  },
};

describe('decideWorkspaceAccess', () => {
  it('opens the workspace for an active relationship regardless of configuration', () => {
    for (const config of [shippedPlaceholder, reachableEndpoint]) {
      expect(decideWorkspaceAccess(activeState, config)).toEqual({
        kind: 'granted',
        reason: 'active-relationship',
      });
    }
  });

  it.each([
    { label: 'no identity', state: { status: 'needsIdentity' } as const },
    {
      label: 'an uncommitted registration',
      state: { status: 'registering', identity, operationId: 'operation-1' } as const,
    },
    {
      label: 'a registered but unpaired identity',
      state: { status: 'unpaired', identity } as const,
    },
  ])(
    'keeps the local workspace reachable with $label while no pairing service exists',
    ({ state }) => {
      expect(decideWorkspaceAccess(state, shippedPlaceholder)).toEqual({
        kind: 'granted',
        reason: 'pairing-transport-unavailable',
        code: 'placeholder-host',
      });
    },
  );

  it('reports the configuration defect instead of locking the user out of local data', () => {
    expect(
      decideWorkspaceAccess({ status: 'needsIdentity' }, { ok: false, code: 'variant-invalid' }),
    ).toEqual({
      kind: 'granted',
      reason: 'pairing-transport-unavailable',
      code: 'variant-invalid',
    });
  });

  it.each([
    { label: 'no identity', state: { status: 'needsIdentity' } as const },
    {
      label: 'an uncommitted registration',
      state: { status: 'registering', identity, operationId: 'operation-1' } as const,
    },
    { label: 'an unpaired identity', state: { status: 'unpaired', identity } as const },
    {
      label: 'a relationship that was reset',
      state: { status: 'cancelled', identity, reason: 'remote', requestId: 'request-1' } as const,
    },
    {
      label: 'a peer identity change',
      state: {
        status: 'identityChanged',
        identity,
        peer: { m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ', routeId: 'peer-route-1' },
      } as const,
    },
  ])('blocks the workspace with $label once a real pairing endpoint is configured', ({ state }) => {
    expect(decideWorkspaceAccess(state, reachableEndpoint)).toEqual({ kind: 'blocked' });
  });
});
