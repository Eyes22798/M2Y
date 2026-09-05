import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import type {
  SecureWorkspaceController,
  SecureWorkspaceState,
} from '@/application/secure-workspace/contracts';
import { demoWorkspaceSnapshot } from '@/application/workspace/demo-workspace';
import { InMemoryWorkspaceSession } from '@/testing/workspace/InMemoryWorkspaceSession';

import { AppProviders } from './AppProviders';
import type { AppRuntime } from './createAppRuntime';

describe('AppProviders', () => {
  it('mounts application content inside the native root providers', async () => {
    const session = new InMemoryWorkspaceSession(demoWorkspaceSnapshot);
    const readyState: SecureWorkspaceState = { status: 'ready', mode: 'device', session };
    const controller: SecureWorkspaceController = {
      getState: () => readyState,
      subscribe: () => () => undefined,
      inspect: async () => undefined,
      setup: async () => undefined,
      unlock: async () => undefined,
      resetLocalData: async () => undefined,
      retry: async () => undefined,
      handleAppBackground: async () => undefined,
    };
    const identityState = { status: 'unpaired', identity } as const;
    const identityRelationshipController: IdentityRelationshipController = {
      applyEvents: async () => ({ ok: true }),
      getState: () => identityState,
      subscribe: () => () => undefined,
      inspect: async () => undefined,
      createIdentity: async () => undefined,
      resetLocalData: async () => undefined,
      retry: async () => undefined,
      respondToPairingRequest: async () => ({ ok: true }),
      startM2yPairing: async () => ({ ok: true }),
    };
    const runtime: AppRuntime = {
      identityRelationshipController,
      publicConfig: shippedPlaceholderConfig,
      secureWorkspaceController: controller,
    };
    const view = await render(
      <AppProviders runtime={runtime}>
        <Text>provider content</Text>
      </AppProviders>,
    );

    expect(view.getByText('provider content')).toBeTruthy();
  });
});

const identity = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};

const shippedPlaceholderConfig: PublicConfigResult = {
  ok: true,
  config: {
    pairingEndpoint: { kind: 'placeholder', host: 'api.m2y.invalid' },
    variant: 'development',
  },
};
