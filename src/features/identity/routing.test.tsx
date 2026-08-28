import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import type { IdentityRoute } from '@/application/identity/routing';
import type { IdentityRelationshipState } from '@/domain/identity/types';
import { IdentityRelationshipProvider } from '@/stores/identity/IdentityRelationshipProvider';

import { useIdentityEntryRoute, useIdentityRouteGuard } from './routing';

const identity = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};

const placeholderConfig: PublicConfigResult = {
  ok: true,
  config: {
    pairingEndpoint: { kind: 'placeholder', host: 'api.m2y.invalid' },
    variant: 'production',
  },
};

const reachableConfig: PublicConfigResult = {
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

/**
 * A controller whose state can move while the probe stays mounted. The defect being covered here only
 * appears in that window: a snapshot-only fixture would pass against the broken code too.
 */
function createStore(initial: IdentityRelationshipState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const controller: IdentityRelationshipController = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    inspect: jest.fn(async () => undefined),
    createIdentity: jest.fn(async () => undefined),
    resetLocalData: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    startM2yPairing: jest.fn(async () => ({ ok: true as const })),
  };
  return {
    controller,
    /**
     * Must be awaited: `render` is async in this version of the testing library, so a synchronous
     * `act` leaves React's act queue mid-scope and every later render in the file fails.
     */
    async advance(next: IdentityRelationshipState) {
      await act(async () => {
        state = next;
        for (const listener of listeners) {
          listener();
        }
      });
    },
  };
}

function EntryProbe() {
  const route = useIdentityEntryRoute();
  return <Text>{route === null ? 'entry:pending' : `entry:${route}`}</Text>;
}

function GuardProbe({ current }: { current: IdentityRoute }) {
  const next = useIdentityRouteGuard(current);
  return <Text>{next === null ? 'guard:stay' : `guard:${next}`}</Text>;
}

async function renderProbe(
  probe: React.ReactNode,
  state: IdentityRelationshipState,
  publicConfig: PublicConfigResult = placeholderConfig,
) {
  const store = createStore(state);
  const view = await render(
    <IdentityRelationshipProvider controller={store.controller} publicConfig={publicConfig}>
      {probe}
    </IdentityRelationshipProvider>,
  );
  return { store, view };
}

describe('useIdentityEntryRoute', () => {
  it('commits to no route until the native store has answered', async () => {
    const { store, view } = await renderProbe(<EntryProbe />, { status: 'inspecting' });

    expect(view.getByText('entry:pending')).toBeTruthy();

    await store.advance({ status: 'needsIdentity' });
    expect(view.getByText('entry:/create-identity')).toBeTruthy();
  });

  it('lands on the local workspace for a persisted identity that cannot be registered', async () => {
    const { view } = await renderProbe(<EntryProbe />, {
      status: 'registering',
      identity,
      operationId: 'operation-1',
    });

    expect(view.getByText('entry:/chat')).toBeTruthy();
  });

  it('lands on the local workspace behind an identity fault screen', async () => {
    const { view } = await renderProbe(<EntryProbe />, {
      status: 'fatal',
      code: 'identity-store-unreadable',
      retryable: false,
    });

    expect(view.getByText('entry:/chat')).toBeTruthy();
  });
});

describe('useIdentityRouteGuard', () => {
  /**
   * The reported defect. Pressing "生成我的身份" ran to completion — keys in Keystore, registration
   * packet queued — but the screen stayed and its own button turned into a no-op, because
   * `app/index.tsx` had already unmounted and nothing else read the state.
   */
  it('leaves the creation screen once the identity has been generated', async () => {
    const { store, view } = await renderProbe(<GuardProbe current="/create-identity" />, {
      status: 'needsIdentity',
    });

    expect(view.getByText('guard:stay')).toBeTruthy();

    await store.advance({ status: 'creatingIdentity' });
    expect(view.getByText('guard:stay')).toBeTruthy();

    await store.advance({ status: 'registering', identity, operationId: 'operation-1' });
    expect(view.getByText('guard:/chat')).toBeTruthy();
  });

  it('sends the finished identity to pairing when a request could be delivered', async () => {
    const { store, view } = await renderProbe(
      <GuardProbe current="/create-identity" />,
      { status: 'creatingIdentity' },
      reachableConfig,
    );

    await store.advance({ status: 'unpaired', identity });
    expect(view.getByText('guard:/pair')).toBeTruthy();
  });

  it('moves the pairing screen to safety verification when the peer accepts', async () => {
    const { store, view } = await renderProbe(
      <GuardProbe current="/pair" />,
      { status: 'outgoingPending', identity, request: request() },
      reachableConfig,
    );

    expect(view.getByText('guard:stay')).toBeTruthy();

    await store.advance({
      status: 'awaitingSafetyVerification',
      identity,
      localConfirmed: false,
      remoteConfirmed: false,
      request: request(),
      safetyNumber: { groups: ['11111', '22222', '33333', '44444', '55555', '66666'] },
    });
    expect(view.getByText('guard:/verify-safety-number')).toBeTruthy();
  });

  it('returns to identity creation after a local reset clears the identity', async () => {
    const { store, view } = await renderProbe(
      <GuardProbe current="/pair" />,
      { status: 'unpaired', identity },
      reachableConfig,
    );

    /** `resetLocalData` re-inspects first; navigating mid-flight would move the screen twice. */
    await store.advance({ status: 'inspecting' });
    expect(view.getByText('guard:stay')).toBeTruthy();

    await store.advance({ status: 'needsIdentity' });
    expect(view.getByText('guard:/create-identity')).toBeTruthy();
  });

  it('stays put while the gate is painting a fault over the screen', async () => {
    const { store, view } = await renderProbe(<GuardProbe current="/create-identity" />, {
      status: 'needsIdentity',
    });

    await store.advance({ status: 'recoveryRequired', code: 'identity-reset-failed' });
    expect(view.getByText('guard:stay')).toBeTruthy();

    await store.advance({ status: 'fatal', code: 'identity-store-unreadable', retryable: true });
    expect(view.getByText('guard:stay')).toBeTruthy();
  });
});

function request() {
  return {
    expiresAtMs: 1_800_000_600_000,
    method: 'm2y-id',
    peer: { m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ', routeId: 'peer-route-1' },
    requestId: 'request-1',
  } as const;
}
