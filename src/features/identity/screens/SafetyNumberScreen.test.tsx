import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import type { IdentityRelationshipController } from '@/application/identity/contracts';
import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipState } from '@/domain/identity/types';
import { IdentityRelationshipProvider } from '@/stores/identity/IdentityRelationshipProvider';

import { SafetyNumberScreen } from './SafetyNumberScreen';

const groups = [
  '00000',
  '00001',
  '00002',
  '00003',
  '00004',
  '00005',
  '00006',
  '00007',
  '00008',
  '00009',
  '00010',
  '00011',
] as const;

const state: IdentityRelationshipState = {
  status: 'awaitingSafetyVerification',
  identity: {
    deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
    m2yId: 'M2Y-2345-6789-ABCD-EFGH',
    stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
  },
  localConfirmed: false,
  remoteConfirmed: false,
  request: {
    expiresAtMs: 1_800_000_600_000,
    method: 'm2y-id',
    peer: {
      m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
      routeId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
    },
    requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
  },
  safetyNumber: { groups },
};

const publicConfig: PublicConfigResult = {
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

it('展示并复制 native 已提交的完整安全码', async () => {
  const controller: IdentityRelationshipController = {
    applyEvents: jest.fn(async () => ({ ok: true as const })),
    createIdentity: jest.fn(async () => undefined),
    getState: () => state,
    inspect: jest.fn(async () => undefined),
    resetLocalData: jest.fn(async () => undefined),
    respondToPairingRequest: jest.fn(async () => ({ ok: true as const })),
    retry: jest.fn(async () => undefined),
    startM2yPairing: jest.fn(async () => ({ ok: true as const })),
    subscribe: () => () => undefined,
  };
  const view = await render(
    <IdentityRelationshipProvider controller={controller} publicConfig={publicConfig}>
      <SafetyNumberScreen />
    </IdentityRelationshipProvider>,
  );

  expect(view.getByText('配对你们的设备')).toBeTruthy();
  for (const group of groups) expect(view.getByText(group)).toBeTruthy();

  await act(async () => {
    fireEvent.press(view.getByLabelText('复制安全号码'));
  });
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(groups.join(' ')));
});
