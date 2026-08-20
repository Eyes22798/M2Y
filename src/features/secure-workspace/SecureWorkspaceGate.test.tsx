import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type {
  ProtectionMode,
  SecureWorkspaceController,
  SecureWorkspaceState,
} from '@/application/secure-workspace/contracts';
import { SecureWorkspaceProvider } from '@/stores/secure-workspace/SecureWorkspaceProvider';

import { SecureWorkspaceGate } from './SecureWorkspaceGate';

function createController(state: SecureWorkspaceState): SecureWorkspaceController {
  return {
    getState: () => state,
    subscribe: () => () => undefined,
    inspect: jest.fn(async () => undefined),
    setup: jest.fn(async (_mode: ProtectionMode) => undefined),
    unlock: jest.fn(async () => undefined),
    resetLocalData: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    handleAppBackground: jest.fn(async () => undefined),
  };
}

async function renderGate(controller: SecureWorkspaceController) {
  return render(
    <SecureWorkspaceProvider controller={controller}>
      <SecureWorkspaceGate>
        <Text>private workspace</Text>
      </SecureWorkspaceGate>
    </SecureWorkspaceProvider>,
  );
}

describe('SecureWorkspaceGate', () => {
  it('keeps private content unmounted and starts device-protected setup', async () => {
    const controller = createController({
      status: 'setupRequired',
      strongBiometricAvailable: false,
    });
    const view = await renderGate(controller);

    expect(view.queryByText('private workspace')).toBeNull();
    expect(view.queryByLabelText('使用强生物识别解锁')).toBeNull();
    fireEvent.press(view.getByLabelText('使用设备保护并继续'));

    await waitFor(() => expect(controller.setup).toHaveBeenCalledWith('device'));
  });

  it('requires confirmation before destroying recovery data', async () => {
    const controller = createController({
      status: 'recoveryRequired',
      reason: 'key-missing-or-invalidated',
    });
    const view = await renderGate(controller);

    expect(view.queryByText('private workspace')).toBeNull();
    fireEvent.press(view.getByLabelText('删除并重新初始化'));
    await waitFor(() => expect(view.getByText('确认销毁本机数据？')).toBeTruthy());
    expect(controller.resetLocalData).not.toHaveBeenCalled();

    fireEvent.press(view.getByLabelText('删除本机数据'));
    await waitFor(() => expect(controller.resetLocalData).toHaveBeenCalledTimes(1));
  });
});
