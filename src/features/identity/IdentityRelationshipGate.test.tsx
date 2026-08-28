import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import type { PairingPollingController } from '@/application/pairing/contracts';
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
    applyEvents: jest.fn(async () => ({ ok: true as const })),
    getState: () => state,
    subscribe: () => () => undefined,
    inspect: jest.fn(async () => undefined),
    createIdentity: jest.fn(async () => undefined),
    resetLocalData: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    startM2yPairing: jest.fn(async () => ({ ok: true as const })),
  };
}

async function renderGate(
  state: IdentityRelationshipState,
  publicConfig: PublicConfigResult = placeholderConfig,
  pollingController?: PairingPollingController,
) {
  const controller = createController(state);
  const view = await render(
    <IdentityRelationshipProvider
      controller={controller}
      {...(pollingController ? { pollingController } : {})}
      publicConfig={publicConfig}
    >
      <IdentityRelationshipGate>
        <Text>private workspace</Text>
      </IdentityRelationshipGate>
    </IdentityRelationshipProvider>,
  );
  return { controller, view };
}

describe('IdentityRelationshipGate', () => {
  it('身份可接收事件时启动轮询，并在页面卸载时停止', async () => {
    const pollingController: PairingPollingController = {
      getState: () => ({ status: 'stopped' }),
      setForeground: jest.fn(),
      start: jest.fn(async () => undefined),
      stop: jest.fn(),
      subscribe: () => () => undefined,
    };
    const { view } = await renderGate(
      { status: 'unpaired', identity },
      reachableConfig,
      pollingController,
    );

    await waitFor(() =>
      expect(pollingController.start).toHaveBeenCalledWith(AppState.currentState === 'active'),
    );
    await act(async () => view.unmount());
    await waitFor(() => expect(pollingController.stop).toHaveBeenCalledTimes(1));
  });

  it('keeps private content unmounted until the identity state is known', async () => {
    const { controller, view } = await renderGate({ status: 'inspecting' });

    expect(view.queryByText('private workspace')).toBeNull();
    await waitFor(() => expect(controller.inspect).toHaveBeenCalled());
  });

  it('blocks private content and asks for an identity once pairing is reachable', async () => {
    const { view } = await renderGate({ status: 'needsIdentity' }, reachableConfig);

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText('创建你的 M2Y 身份')).toBeTruthy();
    expect(view.queryByLabelText('稍后再说，先使用本机空间')).toBeNull();
  });

  it('blocks private content with an unregistered identity once pairing is reachable', async () => {
    const { view } = await renderGate(
      { status: 'registering', identity, operationId: 'operation-1' },
      reachableConfig,
    );

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText(identity.m2yId)).toBeTruthy();
    expect(view.queryByText(/服务端已登记/u)).toBeNull();
  });

  it('服务端注册和 native receipt 提交后展示真实登记结果', async () => {
    const { controller, view } = await renderGate(
      { status: 'unpaired', identity },
      reachableConfig,
    );

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.getByText('服务端已登记 · 你的 M2Y-ID')).toBeTruthy();
    expect(view.getByText(identity.m2yId)).toBeTruthy();
    expect(view.getByText('身份已登记，目前还没有建立任何关系。')).toBeTruthy();
    expect(view.getByLabelText('对方的 M2Y-ID')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('对方的 M2Y-ID'), 'm2y-jklm-npqr-stuv-wxyz');
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('发送配对请求'));
    });
    await waitFor(() =>
      expect(controller.startM2yPairing).toHaveBeenCalledWith('m2y-jklm-npqr-stuv-wxyz'),
    );
  });

  it('已提交首包后展示等待对方确认和目标 M2Y-ID', async () => {
    const { view } = await renderGate(
      {
        status: 'outgoingPending',
        identity,
        request: {
          expiresAtMs: 1_800_000_600_000,
          method: 'm2y-id',
          peer: {
            m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
            routeId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
          },
          requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
        },
      },
      reachableConfig,
    );

    expect(view.getByText('等待对方确认')).toBeTruthy();
    expect(view.getByText('M2Y-JKLM-NPQR-STUV-WXYZ')).toBeTruthy();
    expect(view.queryByLabelText('对方的 M2Y-ID')).toBeNull();
  });

  it('仅在原生提交候选后展示已验证来源的传入请求摘要', async () => {
    const { view } = await renderGate(
      {
        status: 'incomingReview',
        identity,
        request: {
          expiresAtMs: 1_800_000_600_000,
          method: 'm2y-id',
          peer: {
            m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
            routeId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
          },
          requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
        },
      },
      reachableConfig,
    );

    expect(view.getByText('收到连接请求')).toBeTruthy();
    expect(view.getByText('M2Y-JKLM-NPQR-STUV-WXYZ')).toBeTruthy();
    expect(view.getByText(/尚未接受/u)).toBeTruthy();
    expect(view.queryByText('private workspace')).toBeNull();
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
