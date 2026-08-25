import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import type { IdentityRelationshipState } from '@/domain/identity/types';
import { IdentityRelationshipProvider } from '@/stores/identity/IdentityRelationshipProvider';

import { IdentityRelationshipGate } from './IdentityRelationshipGate';

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

function createController(state: IdentityRelationshipState): IdentityRelationshipController {
  return {
    getState: () => state,
    subscribe: () => () => undefined,
    inspect: jest.fn(async () => undefined),
    createIdentity: jest.fn(async () => undefined),
    resetLocalData: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
  };
}

async function renderGate(
  state: IdentityRelationshipState,
  publicConfig: PublicConfigResult = placeholderConfig,
) {
  const controller = createController(state);
  const view = await render(
    <IdentityRelationshipProvider controller={controller} publicConfig={publicConfig}>
      <IdentityRelationshipGate>
        <Text>private workspace</Text>
      </IdentityRelationshipGate>
    </IdentityRelationshipProvider>,
  );
  return { controller, view };
}

describe('IdentityRelationshipGate', () => {
  it('keeps private content unmounted until the identity state is known', async () => {
    const { controller, view } = await renderGate({ status: 'inspecting' });

    expect(view.queryByText('private workspace')).toBeNull();
    await waitFor(() => expect(controller.inspect).toHaveBeenCalled());
  });

  it('blocks private content and asks for an identity once pairing is reachable', async () => {
    const { view } = await renderGate({ status: 'needsIdentity' }, reachableConfig);

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText('创建你的本地身份')).toBeTruthy();
    expect(view.queryByLabelText('稍后再说，先使用本机空间')).toBeNull();
  });

  it('blocks private content with an unregistered identity once pairing is reachable', async () => {
    const { view } = await renderGate(
      { status: 'registering', identity, operationId: 'operation-1' },
      reachableConfig,
    );

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText(identity.m2yId)).toBeTruthy();
  });

  it.each([
    { label: 'no identity', state: { status: 'needsIdentity' } as const },
    { label: 'an unpaired identity', state: { status: 'unpaired', identity } as const },
  ])(
    'keeps the local workspace usable with $label while no pairing service exists',
    async ({ state }) => {
      const { view } = await renderGate(state);

      expect(view.getByText('private workspace')).toBeTruthy();
    },
  );

  it('reports an unreadable identity store without deleting anything', async () => {
    const { controller, view } = await renderGate({
      status: 'fatal',
      code: 'identity-store-unreadable',
      retryable: true,
    });

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText('诊断代码：identity-store-unreadable')).toBeTruthy();
    fireEvent.press(view.getByLabelText('重试'));
    await waitFor(() => expect(controller.retry).toHaveBeenCalled());
    expect(controller.resetLocalData).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting the identity and promises the workspace survives', async () => {
    const { controller, view } = await renderGate({
      status: 'recoveryRequired',
      code: 'identity-reset-failed',
    });

    fireEvent.press(view.getByLabelText('删除本机身份并重新开始'));
    await waitFor(() => expect(view.getByText('确认删除本机身份？')).toBeTruthy());
    expect(controller.resetLocalData).not.toHaveBeenCalled();
    expect(view.getByText(/已保存的 Chat 与 Space 内容会保留/u)).toBeTruthy();

    fireEvent.press(view.getByLabelText('删除本机身份'));
    await waitFor(() => expect(controller.resetLocalData).toHaveBeenCalled());
  });

  it('lets the user reach local data after acknowledging an identity fault', async () => {
    const { view } = await renderGate({
      status: 'fatal',
      code: 'identity-store-unreadable',
      retryable: false,
    });

    expect(view.queryByText('private workspace')).toBeNull();
    fireEvent.press(view.getByLabelText('继续使用本机空间'));

    await waitFor(() => expect(view.getByText('private workspace')).toBeTruthy());
  });

  it('offers no escape from an identity fault when pairing is reachable', async () => {
    const { view } = await renderGate(
      { status: 'fatal', code: 'identity-store-unreadable', retryable: false },
      reachableConfig,
    );

    expect(view.queryByLabelText('继续使用本机空间')).toBeNull();
  });
});
