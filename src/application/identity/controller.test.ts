import type { IdentitySummary } from '@/domain/identity/types';
import type {
  IdentityRegistrationRequest,
  IdentityRegistrationReceipt,
  PairingApi,
  PairingApiResult,
  PairingEvent,
} from '@/application/pairing/contracts';

import type { IdentityInspection, ProductionIdentityPort } from './contracts';
import { DefaultIdentityRelationshipController } from './controller';

const identity: IdentitySummary = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};
const operationId = '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2';
const pairingOperationId = 'e1c09d39-652c-4d4c-afd6-a5333d366baa';
const requestId = '9d923119-0e58-4cfa-a191-5397585790bc';
const targetDeviceId = 'b64a01a1-546a-47f8-8920-52e9444fe850';
const targetStableIdentityId = '59e5c303-bba8-46d0-a19c-26a6514938a7';
const targetM2yId = 'M2Y-JKLM-NPQR-STUV-WXYZ';
const expiresAtMs = 1_800_000_600_000;
const safetyNumber = {
  groups: [
    '11111',
    '22222',
    '33333',
    '44444',
    '55555',
    '66666',
    '77777',
    '88888',
    '99999',
    '00000',
    '12345',
    '67890',
  ],
} as const;
const registration: IdentityRegistrationRequest = {
  authPublicKey: 'a'.repeat(64),
  deviceId: identity.deviceId,
  identityPublicKey: 'b'.repeat(32),
  kyberPreKeyId: 3,
  kyberPreKeyPublic: 'c'.repeat(256),
  kyberPreKeySignature: 'd'.repeat(32),
  m2yId: identity.m2yId,
  oneTimePreKeys: Array.from({ length: 16 }, (_, index) => ({
    id: index + 10,
    publicKey: 'e'.repeat(32),
  })),
  operationId,
  registrationId: 1,
  schemaVersion: 1,
  signedPreKeyId: 2,
  signedPreKeyPublic: 'f'.repeat(32),
  signedPreKeySignature: 'g'.repeat(32),
  stableIdentityId: identity.stableIdentityId,
};

function incomingInspection(): Extract<IdentityInspection, { kind: 'incomingReview' }> {
  return {
    kind: 'incomingReview',
    identity,
    request: {
      expiresAtMs,
      method: 'm2y-id',
      peer: { m2yId: targetM2yId, routeId: targetDeviceId },
      requestId,
    },
  };
}

function awaitingInspection(): Extract<IdentityInspection, { kind: 'awaitingSafetyVerification' }> {
  return {
    kind: 'awaitingSafetyVerification',
    identity,
    request: incomingInspection().request,
    safetyNumber,
  };
}

const incomingEvent: PairingEvent = {
  cursor: 1,
  eventId: '5638cfaf-113e-496d-aa30-b5bb2cdbcfec',
  packet: 'q'.repeat(64),
  requestId,
  status: 'pending',
  type: 'pair-request',
};

function createPort(overrides: Partial<ProductionIdentityPort> = {}) {
  return {
    acknowledgePairingPacket: jest.fn(async () => undefined),
    commitRegistration: jest.fn(async () => ({ kind: 'unpaired', identity }) as const),
    consumePairingRequestEvent: jest.fn(async () => incomingInspection()),
    inspectIdentity: jest.fn(async (): Promise<IdentityInspection> => ({ kind: 'absent' })),
    listPendingPairingPackets: jest.fn(async () => []),
    listPendingPairingResponses: jest.fn(async () => []),
    prepareIdentity: jest.fn(async () => ({ identity, operationId, registration })),
    preparePairingPacket: jest.fn(async () => pairingPacket()),
    preparePairingResponse: jest.fn(async () => ({
      action: 'accept' as const,
      operationId: pairingOperationId,
      packet: 'r'.repeat(64),
      requestId,
      safetyNumber,
    })),
    resetIdentity: jest.fn(async () => undefined),
    ...overrides,
  } satisfies ProductionIdentityPort;
}

function createController(port: ProductionIdentityPort, pairingApi?: PairingApi) {
  return new DefaultIdentityRelationshipController({
    identityStore: port,
    ...(pairingApi
      ? { operationIdGenerator: { createOperationId: () => pairingOperationId } }
      : {}),
    ...(pairingApi ? { pairingApi } : {}),
  });
}

describe('DefaultIdentityRelationshipController', () => {
  it.each([
    { expected: { status: 'needsIdentity' }, inspection: { kind: 'absent' } as const },
    {
      expected: { status: 'registering', identity, operationId },
      inspection: { kind: 'pendingRegistration', identity, operationId } as const,
    },
    {
      expected: { status: 'unpaired', identity },
      inspection: { kind: 'unpaired', identity } as const,
    },
    {
      expected: {
        status: 'outgoingPending',
        identity,
        request: {
          expiresAtMs,
          method: 'm2y-id',
          peer: { m2yId: targetM2yId, routeId: targetDeviceId },
          requestId,
        },
      },
      inspection: {
        kind: 'outgoingPending',
        identity,
        request: {
          expiresAtMs,
          method: 'm2y-id',
          peer: { m2yId: targetM2yId, routeId: targetDeviceId },
          requestId,
        },
      } as const,
    },
    {
      expected: {
        status: 'incomingReview',
        identity,
        request: incomingInspection().request,
      },
      inspection: incomingInspection(),
    },
    {
      expected: {
        status: 'awaitingSafetyVerification',
        identity,
        localConfirmed: false,
        remoteConfirmed: false,
        request: incomingInspection().request,
        safetyNumber,
      },
      inspection: awaitingInspection(),
    },
  ])('reports the stored identity as $inspection.kind', async ({ expected, inspection }) => {
    const controller = createController(createPort({ inspectIdentity: async () => inspection }));

    await controller.inspect();

    expect(controller.getState()).toEqual(expected);
  });

  it('fails closed and stays retryable when the native store cannot be read', async () => {
    const controller = createController(
      createPort({
        inspectIdentity: async () => {
          throw new Error('native boundary rejected');
        },
      }),
    );

    await controller.inspect();

    expect(controller.getState()).toEqual({
      status: 'fatal',
      code: 'identity-store-unreadable',
      retryable: true,
    });
  });

  it('creates an identity and stops at registering instead of claiming a relationship', async () => {
    const port = createPort();
    const controller = createController(port);
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getState().status));

    await controller.inspect();
    await controller.createIdentity('用户');

    expect(port.prepareIdentity).toHaveBeenCalledWith('用户');
    expect(controller.getState()).toEqual({
      status: 'registering',
      identity,
      operationId,
    });
    expect(seen).toEqual(['inspecting', 'needsIdentity', 'creatingIdentity', 'registering']);
  });

  it('配置真实端点时完成服务端注册并提交 native receipt', async () => {
    const port = createPort();
    const api = createPairingApi();
    const controller = createController(port, api);

    await controller.inspect();
    await controller.createIdentity('用户');

    expect(api.registerIdentity).toHaveBeenCalledWith(registration);
    expect(port.commitRegistration).toHaveBeenCalledWith(operationId, 'receipt-registered');
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('重启发现待注册身份时复用原 operation 完成注册', async () => {
    const port = createPort({
      inspectIdentity: async () => ({ kind: 'pendingRegistration', identity, operationId }),
    });
    const api = createPairingApi();
    const controller = createController(port, api);

    await controller.inspect();

    expect(port.prepareIdentity).toHaveBeenCalledWith(null);
    expect(api.registerIdentity).toHaveBeenCalledWith(registration);
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('网络失败不提交 receipt，显式重试后从 native 待办恢复', async () => {
    const port = createPort({
      inspectIdentity: jest
        .fn<ReturnType<ProductionIdentityPort['inspectIdentity']>, []>()
        .mockResolvedValueOnce({ kind: 'absent' })
        .mockResolvedValue({ kind: 'pendingRegistration', identity, operationId }),
    });
    const api = createPairingApi();
    api.registerIdentity
      .mockResolvedValueOnce({
        ok: false,
        failure: { kind: 'client', code: 'pairing-network-unavailable' },
      })
      .mockResolvedValueOnce(registrationSuccess());
    const controller = createController(port, api);

    await controller.inspect();
    await controller.createIdentity(null);
    expect(controller.getState()).toEqual({
      status: 'networkFailed',
      identity,
      retryFrom: 'registering',
    });
    expect(port.commitRegistration).not.toHaveBeenCalled();

    await controller.retry();

    expect(api.registerIdentity).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('拒绝与本机身份不匹配的服务端 receipt', async () => {
    const port = createPort();
    const api = createPairingApi();
    api.registerIdentity.mockResolvedValueOnce({
      ...registrationSuccess(),
      value: {
        ...registrationSuccess().value,
        m2yId: 'M2Y-2345-6789-ABCD-EFGJ',
      },
    });
    const controller = createController(port, api);

    await controller.inspect();
    await controller.createIdentity(null);

    expect(port.commitRegistration).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      code: 'identity-registration-receipt-invalid',
    });
  });

  it('ignores identity creation once an identity already exists', async () => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const controller = createController(port);

    await controller.inspect();
    await controller.createIdentity(null);

    expect(port.prepareIdentity).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('serialises overlapping commands so one tap cannot generate two identities', async () => {
    const port = createPort();
    const controller = createController(port);
    await controller.inspect();

    await Promise.all([controller.createIdentity(null), controller.createIdentity(null)]);

    expect(port.prepareIdentity).toHaveBeenCalledTimes(1);
  });

  it('fails closed when identity generation rejects', async () => {
    const controller = createController(
      createPort({
        prepareIdentity: async () => {
          throw new Error('keystore unavailable');
        },
      }),
    );

    await controller.inspect();
    await controller.createIdentity(null);

    expect(controller.getState()).toEqual({
      status: 'fatal',
      code: 'identity-creation-failed',
      retryable: true,
    });
  });

  it('re-inspects after a reset and leaves the encrypted workspace to its own owner', async () => {
    const responses: IdentityInspection[] = [
      { kind: 'pendingRegistration', identity, operationId: 'operation-1' },
      { kind: 'absent' },
    ];
    const port = createPort({
      inspectIdentity: jest.fn(async () => responses.shift() ?? ({ kind: 'absent' } as const)),
    });
    const controller = createController(port);

    await controller.inspect();
    expect(controller.getState().status).toBe('registering');
    await controller.resetLocalData();

    expect(port.resetIdentity).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'needsIdentity' });
    expect(Object.keys(port)).toEqual([
      'acknowledgePairingPacket',
      'commitRegistration',
      'consumePairingRequestEvent',
      'inspectIdentity',
      'listPendingPairingPackets',
      'listPendingPairingResponses',
      'prepareIdentity',
      'preparePairingPacket',
      'preparePairingResponse',
      'resetIdentity',
    ]);
  });

  it('requires recovery when the reset itself fails', async () => {
    const controller = createController(
      createPort({
        resetIdentity: async () => {
          throw new Error('alias delete failed');
        },
      }),
    );

    await controller.resetLocalData();

    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      code: 'identity-reset-failed',
    });
  });

  it('discards a failed state when a retry re-reads the store', async () => {
    let attempts = 0;
    const controller = createController(
      createPort({
        inspectIdentity: jest.fn(async (): Promise<IdentityInspection> => {
          attempts += 1;
          if (attempts === 1) throw new Error('transient native failure');
          return { kind: 'unpaired', identity };
        }),
      }),
    );

    await controller.inspect();
    expect(controller.getState().status).toBe('fatal');
    await controller.retry();

    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('从用户输入的 M2Y-ID 生成原生密文、提交并等待对方确认', async () => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const api = createPairingApi();
    const controller = createController(port, api);

    await controller.inspect();
    const result = await controller.startM2yPairing(`  ${targetM2yId.toLowerCase()}  `);

    expect(result).toEqual({ ok: true });
    expect(api.preparePairRequest).toHaveBeenCalledWith({
      m2yId: targetM2yId,
      method: 'm2y-id',
      operationId: pairingOperationId,
    });
    expect(port.preparePairingPacket).toHaveBeenCalledWith(requestId, expiresAtMs, targetBundle());
    expect(api.submitPairRequest).toHaveBeenCalledWith(requestId, {
      operationId: pairingOperationId,
      packet: 'p'.repeat(64),
    });
    expect(port.acknowledgePairingPacket).toHaveBeenCalledWith(
      pairingOperationId,
      pairingOperationId,
    );
    expect(controller.getState()).toEqual({
      status: 'outgoingPending',
      identity,
      request: {
        expiresAtMs,
        method: 'm2y-id',
        peer: { m2yId: targetM2yId, routeId: targetDeviceId },
        requestId,
      },
    });
  });

  it.each([
    ['not-an-id', 'm2y-id-invalid'],
    [identity.m2yId, 'self-pairing-not-allowed'],
  ] as const)('不为无效或本机 M2Y-ID 创建服务端请求：%s', async (input, reason) => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const api = createPairingApi();
    const controller = createController(port, api);
    await controller.inspect();

    await expect(controller.startM2yPairing(input)).resolves.toEqual({ ok: false, reason });

    expect(api.preparePairRequest).not.toHaveBeenCalled();
    expect(port.preparePairingPacket).not.toHaveBeenCalled();
  });

  it('目标不可用时停留在未配对状态并给页面稳定原因', async () => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const api = createPairingApi();
    api.preparePairRequest.mockResolvedValueOnce({
      ok: false,
      failure: { kind: 'server', code: 'pairing-target-unavailable', httpStatus: 404 },
    });
    const controller = createController(port, api);
    await controller.inspect();

    await expect(controller.startM2yPairing(targetM2yId)).resolves.toEqual({
      ok: false,
      reason: 'pairing-target-unavailable',
    });

    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
    expect(port.preparePairingPacket).not.toHaveBeenCalled();
  });

  it('提交中断后重启路径原样重传 native outbox，不重新生成密文', async () => {
    const packet = pairingPacket();
    const listPendingPairingPackets = jest
      .fn<ReturnType<ProductionIdentityPort['listPendingPairingPackets']>, []>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...packet, createdAtMs: 1_800_000_000_000, retryCount: 0 }]);
    const port = createPort({
      inspectIdentity: async () => ({ kind: 'unpaired', identity }),
      listPendingPairingPackets,
    });
    const api = createPairingApi();
    api.submitPairRequest
      .mockResolvedValueOnce({
        ok: false,
        failure: { kind: 'client', code: 'pairing-network-unavailable' },
      })
      .mockResolvedValueOnce(pairingSubmissionSuccess());
    const controller = createController(port, api);
    await controller.inspect();

    await controller.startM2yPairing(targetM2yId);
    expect(controller.getState()).toMatchObject({ status: 'networkFailed', retryFrom: 'unpaired' });
    expect(port.acknowledgePairingPacket).not.toHaveBeenCalled();

    await controller.retry();

    expect(port.preparePairingPacket).toHaveBeenCalledTimes(1);
    expect(api.submitPairRequest).toHaveBeenNthCalledWith(2, requestId, {
      operationId: pairingOperationId,
      packet: 'p'.repeat(64),
    });
    expect(port.acknowledgePairingPacket).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('outgoingPending');
  });

  it('将轮询收到的首包交给原生解密，并仅发布已持久化的待审核请求', async () => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const controller = createController(port);
    await controller.inspect();

    await expect(controller.applyEvents([incomingEvent])).resolves.toEqual({ ok: true });

    expect(port.consumePairingRequestEvent).toHaveBeenCalledWith(
      incomingEvent.eventId,
      incomingEvent.requestId,
      incomingEvent.packet,
    );
    expect(controller.getState()).toEqual({
      status: 'incomingReview',
      identity,
      request: incomingInspection().request,
    });
  });

  it('接受请求后提交加密响应，并只在服务端回执后展示安全码', async () => {
    const port = createPort({ inspectIdentity: async () => incomingInspection() });
    const api = createPairingApi();
    const controller = createController(port, api);
    await controller.inspect();

    await expect(controller.respondToPairingRequest(requestId, 'accept')).resolves.toEqual({
      ok: true,
    });

    expect(api.respondToPairRequest).toHaveBeenCalledWith(requestId, {
      action: 'accept',
      operationId: pairingOperationId,
      packet: 'r'.repeat(64),
    });
    expect(port.acknowledgePairingPacket).toHaveBeenCalledWith(
      pairingOperationId,
      pairingOperationId,
    );
    expect(controller.getState()).toEqual({
      status: 'awaitingSafetyVerification',
      identity,
      localConfirmed: false,
      remoteConfirmed: false,
      request: incomingInspection().request,
      safetyNumber,
    });
  });

  it('拒绝请求后提交加密响应，并保留明确的拒绝结果', async () => {
    const port = createPort({
      inspectIdentity: async () => incomingInspection(),
      preparePairingResponse: jest.fn(async () => ({
        action: 'reject' as const,
        operationId: pairingOperationId,
        packet: 'r'.repeat(64),
        requestId,
      })),
    });
    const api = createPairingApi();
    const controller = createController(port, api);
    await controller.inspect();

    await expect(controller.respondToPairingRequest(requestId, 'reject')).resolves.toEqual({
      ok: true,
    });
    expect(controller.getState()).toEqual({ status: 'rejected', identity, requestId });
  });

  it('重启后从原生 outbox 原样补交接受响应，不重新生成密文', async () => {
    const port = createPort({
      inspectIdentity: async () => awaitingInspection(),
      listPendingPairingResponses: jest.fn(async () => [
        {
          action: 'accept' as const,
          createdAtMs: 1_800_000_000_000,
          operationId: pairingOperationId,
          packet: 'r'.repeat(64),
          requestId,
          retryCount: 1,
          safetyNumber,
        },
      ]),
    });
    const api = createPairingApi();
    const controller = createController(port, api);

    await controller.inspect();

    expect(port.preparePairingResponse).not.toHaveBeenCalled();
    expect(api.respondToPairRequest).toHaveBeenCalledWith(requestId, {
      action: 'accept',
      operationId: pairingOperationId,
      packet: 'r'.repeat(64),
    });
    expect(port.acknowledgePairingPacket).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ status: 'awaitingSafetyVerification' });
  });

  it('缺少密文或收到尚未实现的事件时不推进游标对应的应用状态', async () => {
    const port = createPort({ inspectIdentity: async () => ({ kind: 'unpaired', identity }) });
    const controller = createController(port);
    await controller.inspect();

    const eventWithoutPacket: PairingEvent = {
      cursor: 1,
      eventId: incomingEvent.eventId,
      requestId,
      status: 'pending',
      type: 'pair-request',
    };
    await expect(controller.applyEvents([eventWithoutPacket])).resolves.toEqual({
      ok: false,
      reason: 'pairing-event-apply-failed',
    });

    expect(port.consumePairingRequestEvent).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });

  it('原生拒绝非法首包时保持未配对，允许轮询安全重试', async () => {
    const port = createPort({
      consumePairingRequestEvent: jest.fn(async () => {
        throw new Error('pairing-request-invalid');
      }),
      inspectIdentity: async () => ({ kind: 'unpaired', identity }),
    });
    const controller = createController(port);
    await controller.inspect();

    await expect(controller.applyEvents([incomingEvent])).resolves.toEqual({
      ok: false,
      reason: 'pairing-event-apply-failed',
    });
    expect(controller.getState()).toEqual({ status: 'unpaired', identity });
  });
});

function createPairingApi() {
  return {
    registerIdentity: jest.fn<
      ReturnType<PairingApi['registerIdentity']>,
      Parameters<PairingApi['registerIdentity']>
    >(async () => registrationSuccess()),
    readIdentityStatus: unexpected,
    replenishPreKeys: unexpected,
    createInvitation: unexpected,
    preparePairRequest: jest.fn<
      ReturnType<PairingApi['preparePairRequest']>,
      Parameters<PairingApi['preparePairRequest']>
    >(async () => ({
      ok: true,
      value: {
        expiresAtMs,
        method: 'm2y-id',
        requestId,
        status: 'prepared',
        targetBundle: targetBundle(),
      },
    })),
    submitPairRequest: jest.fn<
      ReturnType<PairingApi['submitPairRequest']>,
      Parameters<PairingApi['submitPairRequest']>
    >(async () => pairingSubmissionSuccess()),
    readEvents: unexpected,
    respondToPairRequest: jest.fn<
      ReturnType<PairingApi['respondToPairRequest']>,
      Parameters<PairingApi['respondToPairRequest']>
    >(async (_requestId, input) => ({
      ok: true,
      value: {
        eventCursor: 2,
        operationId: input.operationId,
        requestId,
        status: input.action === 'accept' ? 'accepted' : 'rejected',
      },
    })),
    verifyPairRequest: unexpected,
    cancelPairRequest: unexpected,
  } satisfies PairingApi;
}

function targetBundle() {
  return {
    deviceId: targetDeviceId,
    identityPublicKey: 'h'.repeat(32),
    kyberPreKeyId: 22,
    kyberPreKeyPublic: 'i'.repeat(256),
    kyberPreKeySignature: 'j'.repeat(32),
    m2yId: targetM2yId,
    oneTimePreKey: { id: 23, publicKey: 'k'.repeat(32) },
    registrationId: 20,
    signedPreKeyId: 21,
    signedPreKeyPublic: 'l'.repeat(32),
    signedPreKeySignature: 'm'.repeat(32),
    stableIdentityId: targetStableIdentityId,
  } as const;
}

function pairingPacket() {
  return {
    expiresAtMs,
    operationId: pairingOperationId,
    packet: 'p'.repeat(64),
    requestId,
    targetDeviceId,
    targetM2yId,
    targetStableIdentityId,
  } as const;
}

function pairingSubmissionSuccess() {
  return {
    ok: true,
    value: {
      eventCursor: 1,
      operationId: pairingOperationId,
      requestId,
      status: 'pending',
    },
  } as const;
}

function registrationSuccess(): Readonly<{
  ok: true;
  value: IdentityRegistrationReceipt;
}> {
  return {
    ok: true,
    value: {
      deviceId: identity.deviceId,
      m2yId: identity.m2yId,
      receiptId: 'receipt-registered',
      registeredAtMs: 1_800_000_000_000,
      status: 'registered',
    },
  };
}

function unexpected<T>(): Promise<PairingApiResult<T>> {
  return Promise.reject(new Error('unexpected pairing API call'));
}
