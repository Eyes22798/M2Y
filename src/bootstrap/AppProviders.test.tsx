import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

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
    const runtime: AppRuntime = { secureWorkspaceController: controller };
    const view = await render(
      <AppProviders runtime={runtime}>
        <Text>provider content</Text>
      </AppProviders>,
    );

    expect(view.getByText('provider content')).toBeTruthy();
  });
});
