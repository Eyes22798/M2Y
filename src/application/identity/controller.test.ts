import type { IdentitySummary } from '@/domain/identity/types';

import type { IdentityInspection, ProductionIdentityPort } from './contracts';
import { DefaultIdentityRelationshipController } from './controller';

const identity: IdentitySummary = {
  deviceId: '1ab9957e-2c7f-4ec6-80b2-26941a506ca4',
  m2yId: 'M2Y-2345-6789-ABCD-EFGH',
  stableIdentityId: '839c065c-b7ad-43ea-99ba-a3338037178a',
};

function createPort(overrides: Partial<ProductionIdentityPort> = {}) {
  return {
    inspectIdentity: jest.fn(async (): Promise<IdentityInspection> => ({ kind: 'absent' })),
    prepareIdentity: jest.fn(async () => ({ identity, operationId: 'operation-1' })),
    resetIdentity: jest.fn(async () => undefined),
    ...overrides,
  } satisfies ProductionIdentityPort;
}

function createController(port: ProductionIdentityPort) {
  return new DefaultIdentityRelationshipController({ identityStore: port });
}

describe('DefaultIdentityRelationshipController', () => {
  it.each([
    { expected: { status: 'needsIdentity' }, inspection: { kind: 'absent' } as const },
    {
      expected: { status: 'registering', identity, operationId: 'operation-1' },
      inspection: { kind: 'pendingRegistration', identity, operationId: 'operation-1' } as const,
    },
    {
      expected: { status: 'unpaired', identity },
      inspection: { kind: 'unpaired', identity } as const,
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
      operationId: 'operation-1',
    });
    expect(seen).toEqual(['inspecting', 'needsIdentity', 'creatingIdentity', 'registering']);
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
    expect(Object.keys(port)).toEqual(['inspectIdentity', 'prepareIdentity', 'resetIdentity']);
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
});
