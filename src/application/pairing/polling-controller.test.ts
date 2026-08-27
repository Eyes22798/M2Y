import type {
  PairingApi,
  PairingApiResult,
  PairingCursorStore,
  PairingEvent,
  PairingEventConsumer,
  PairingEvents,
} from './contracts';
import { DefaultPairingPollingController } from './polling-controller';

const event: PairingEvent = {
  cursor: 8,
  eventId: '90efe361-ef2d-4e13-824b-2d3851024b73',
  requestId: '691573a8-6b7d-47cb-9a74-d5f72d3d1ecb',
  status: 'pending',
  type: 'pair-request',
};

describe('DefaultPairingPollingController', () => {
  it('只在事件应用成功后持久化并推进游标', async () => {
    const delays = createDelayHarness();
    const api = createApi(async () => successEvents([event], 8));
    const cursorStore = createCursorStore(7);
    const eventConsumer = createEventConsumer();
    const controller = new DefaultPairingPollingController({
      api,
      cursorStore,
      eventConsumer,
      waitForDelay: delays.waitForDelay,
    });

    await controller.start(true);
    await settle();

    expect(api.readEvents).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(eventConsumer.applyEvents).toHaveBeenCalledWith([event]);
    expect(cursorStore.writeCursor).toHaveBeenCalledWith(8);
    expect(controller.getState()).toEqual({
      status: 'waiting',
      cursor: 8,
      consecutiveFailures: 0,
      delayMs: 1_500,
    });
    controller.stop();
  });

  it('进入后台会取消在途请求，回到前台后从原游标恢复', async () => {
    let attempts = 0;
    let firstSignal: AbortSignal | undefined;
    const api = createApi((cursor, signal) => {
      attempts += 1;
      if (attempts === 1) {
        firstSignal = signal;
        return new Promise((resolve) => {
          signal?.addEventListener('abort', () => resolve(networkFailure()), { once: true });
        });
      }
      return Promise.resolve(successEvents([], cursor));
    });
    const cursorStore = createCursorStore(4);
    const controller = new DefaultPairingPollingController({
      api,
      cursorStore,
      eventConsumer: createEventConsumer(),
      waitForDelay: createDelayHarness().waitForDelay,
    });

    await controller.start(true);
    await settle();
    controller.setForeground(false);
    await settle();

    expect(firstSignal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ status: 'paused', cursor: 4 });
    expect(cursorStore.writeCursor).not.toHaveBeenCalled();

    controller.setForeground(true);
    await settle();

    expect(api.readEvents).toHaveBeenLastCalledWith(4, expect.any(AbortSignal));
    expect(attempts).toBe(2);
    controller.stop();
  });

  it('快速后台再前台时不会让旧事件提交与新轮询重叠', async () => {
    let apiAttempts = 0;
    const api = createApi(async (cursor) => {
      apiAttempts += 1;
      return apiAttempts === 1 ? successEvents([event], 8) : successEvents([], cursor);
    });
    let releaseFirstApply: () => void = () => undefined;
    let markFirstApplyStarted: () => void = () => undefined;
    const firstApplyStarted = new Promise<void>((resolve) => {
      markFirstApplyStarted = resolve;
    });
    let applyAttempts = 0;
    const applyEvents = jest.fn<
      ReturnType<PairingEventConsumer['applyEvents']>,
      Parameters<PairingEventConsumer['applyEvents']>
    >(async () => {
      applyAttempts += 1;
      if (applyAttempts !== 1) return { ok: true };
      markFirstApplyStarted();
      await new Promise<void>((resolve) => {
        releaseFirstApply = resolve;
      });
      return { ok: true };
    });
    const eventConsumer: PairingEventConsumer = {
      applyEvents,
    };
    const cursorStore = createCursorStore(4);
    const controller = new DefaultPairingPollingController({
      api,
      cursorStore,
      eventConsumer,
      waitForDelay: createDelayHarness().waitForDelay,
    });

    await controller.start(true);
    await firstApplyStarted;
    controller.setForeground(false);
    controller.setForeground(true);
    await settle();

    expect(api.readEvents).toHaveBeenCalledTimes(1);
    releaseFirstApply();
    await settle();

    expect(api.readEvents).toHaveBeenCalledTimes(2);
    expect(api.readEvents).toHaveBeenLastCalledWith(4, expect.any(AbortSignal));
    expect(cursorStore.writeCursor).toHaveBeenCalledTimes(1);
    expect(cursorStore.writeCursor).toHaveBeenCalledWith(4);
    controller.stop();
  });

  it('网络失败使用有上限的退避并保持同一游标', async () => {
    const delays = createDelayHarness();
    const api = createApi(async () => networkFailure());
    const controller = new DefaultPairingPollingController({
      api,
      cursorStore: createCursorStore(3),
      eventConsumer: createEventConsumer(),
      failureBackoffMs: [100, 200],
      waitForDelay: delays.waitForDelay,
    });

    await controller.start(true);
    await settle();
    expect(controller.getState()).toEqual({
      status: 'waiting',
      cursor: 3,
      consecutiveFailures: 1,
      delayMs: 100,
    });

    delays.releaseNext();
    await settle();
    expect(controller.getState()).toEqual({
      status: 'waiting',
      cursor: 3,
      consecutiveFailures: 2,
      delayMs: 200,
    });

    delays.releaseNext();
    await settle();
    expect(controller.getState()).toEqual({
      status: 'waiting',
      cursor: 3,
      consecutiveFailures: 3,
      delayMs: 200,
    });
    expect(api.readEvents).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it('事件应用失败时不写游标并进入稳定失败状态', async () => {
    const cursorStore = createCursorStore(0);
    const controller = new DefaultPairingPollingController({
      api: createApi(async () => successEvents([event], 8)),
      cursorStore,
      eventConsumer: createEventConsumer({ ok: false, reason: 'pairing-event-apply-failed' }),
      waitForDelay: createDelayHarness().waitForDelay,
    });

    await controller.start(true);
    await settle();

    expect(cursorStore.writeCursor).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      status: 'failed',
      code: 'pairing-event-apply-failed',
    });
  });

  it('游标读取或写入失败时保持 fail-closed', async () => {
    const unreadableStore = createCursorStore(0);
    unreadableStore.readCursor.mockResolvedValue({
      ok: false,
      reason: 'pairing-cursor-invalid',
    });
    const unreadableApi = createApi(async () => successEvents([], 0));
    const unreadable = new DefaultPairingPollingController({
      api: unreadableApi,
      cursorStore: unreadableStore,
      eventConsumer: createEventConsumer(),
    });

    await unreadable.start(true);

    expect(unreadableApi.readEvents).not.toHaveBeenCalled();
    expect(unreadable.getState()).toEqual({
      status: 'failed',
      code: 'pairing-cursor-invalid',
    });

    const unwritableStore = createCursorStore(0);
    unwritableStore.writeCursor.mockResolvedValue({
      ok: false,
      reason: 'pairing-cursor-unavailable',
    });
    const unwritable = new DefaultPairingPollingController({
      api: createApi(async () => successEvents([], 1)),
      cursorStore: unwritableStore,
      eventConsumer: createEventConsumer(),
    });

    await unwritable.start(true);
    await settle();

    expect(unwritable.getState()).toEqual({
      status: 'failed',
      code: 'pairing-cursor-unavailable',
    });
  });
});

function createApi(
  readEvents: (
    afterCursor: number,
    signal?: AbortSignal,
  ) => Promise<PairingApiResult<PairingEvents>>,
) {
  return {
    registerIdentity: unexpected,
    readIdentityStatus: unexpected,
    replenishPreKeys: unexpected,
    createInvitation: unexpected,
    preparePairRequest: unexpected,
    submitPairRequest: unexpected,
    readEvents: jest.fn(readEvents),
    respondToPairRequest: unexpected,
    verifyPairRequest: unexpected,
    cancelPairRequest: unexpected,
  } satisfies PairingApi;
}

function createCursorStore(cursor: number) {
  const readCursor = jest.fn<
    ReturnType<PairingCursorStore['readCursor']>,
    Parameters<PairingCursorStore['readCursor']>
  >(async () => ({ ok: true, cursor }));
  const writeCursor = jest.fn<
    ReturnType<PairingCursorStore['writeCursor']>,
    Parameters<PairingCursorStore['writeCursor']>
  >(async () => ({ ok: true }));
  return {
    readCursor,
    writeCursor,
  } satisfies PairingCursorStore;
}

function createEventConsumer(
  result: Awaited<ReturnType<PairingEventConsumer['applyEvents']>> = { ok: true },
) {
  return {
    applyEvents: jest.fn(async () => result),
  } satisfies PairingEventConsumer;
}

function createDelayHarness() {
  const pending: (() => void)[] = [];
  return {
    waitForDelay: jest.fn(
      (_delayMs: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve();
          if (signal.aborted) {
            finish();
            return;
          }
          signal.addEventListener('abort', finish, { once: true });
          pending.push(finish);
        }),
    ),
    releaseNext() {
      pending.shift()?.();
    },
  };
}

function successEvents(events: readonly PairingEvent[], nextCursor: number) {
  return Promise.resolve({ ok: true, value: { events, nextCursor } } as const);
}

function networkFailure() {
  return {
    ok: false,
    failure: { kind: 'client', code: 'pairing-network-unavailable' },
  } as const;
}

function unexpected<T>(): Promise<PairingApiResult<T>> {
  return Promise.reject(new Error('unexpected pairing API call'));
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}
