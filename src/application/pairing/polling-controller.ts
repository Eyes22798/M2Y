import type {
  PairingApi,
  PairingApiResult,
  PairingCursorReadResult,
  PairingCursorStore,
  PairingCursorWriteResult,
  PairingEventApplyResult,
  PairingEventConsumer,
  PairingEvents,
  PairingPollingController,
  PairingPollingFailureCode,
  PairingPollingState,
} from './contracts';

const DEFAULT_SUCCESS_INTERVAL_MS = 1_500;
const DEFAULT_FAILURE_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;

type WaitForDelay = (delayMs: number, signal: AbortSignal) => Promise<void>;

type PairingPollingDependencies = Readonly<{
  api: PairingApi;
  cursorStore: PairingCursorStore;
  eventConsumer: PairingEventConsumer;
  failureBackoffMs?: readonly number[];
  successIntervalMs?: number;
  waitForDelay?: WaitForDelay;
}>;

/**
 * 轮询只推进已经被事件消费者处理并成功写入持久游标的事件。
 * 切到后台或停止时会中断当前 HTTP 请求和等待，不会在后台继续重试。
 */
export class DefaultPairingPollingController implements PairingPollingController {
  private state: PairingPollingState = { status: 'stopped' };
  private readonly listeners = new Set<() => void>();
  private readonly failureBackoffMs: readonly number[];
  private readonly successIntervalMs: number;
  private readonly waitForDelay: WaitForDelay;
  private started = false;
  private foreground = false;
  private cursor: number | null = null;
  private consecutiveFailures = 0;
  private generation = 0;
  private activeAbortController: AbortController | null = null;
  private pollInFlight = false;
  private pendingPollGeneration: number | null = null;

  constructor(private readonly dependencies: PairingPollingDependencies) {
    this.failureBackoffMs = validatedDelays(
      dependencies.failureBackoffMs ?? DEFAULT_FAILURE_BACKOFF_MS,
      'pairing-polling-backoff-invalid',
    );
    this.successIntervalMs = validatedDelay(
      dependencies.successIntervalMs ?? DEFAULT_SUCCESS_INTERVAL_MS,
      'pairing-polling-interval-invalid',
    );
    this.waitForDelay = dependencies.waitForDelay ?? waitForAbortableDelay;
  }

  getState(): PairingPollingState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(foreground: boolean): Promise<void> {
    if (this.started) {
      this.setForeground(foreground);
      return;
    }

    this.started = true;
    this.foreground = foreground;
    this.consecutiveFailures = 0;
    const generation = ++this.generation;
    this.transition({ status: 'initializing' });

    let result: PairingCursorReadResult;
    try {
      result = await this.dependencies.cursorStore.readCursor();
    } catch {
      if (this.isCurrent(generation)) this.fail('pairing-cursor-unavailable');
      return;
    }
    if (!this.isCurrent(generation)) return;
    if (!result.ok) {
      this.fail(result.reason);
      return;
    }

    this.cursor = result.cursor;
    if (!this.foreground) {
      this.transition({ status: 'paused', cursor: result.cursor });
      return;
    }
    this.requestPoll(generation);
  }

  setForeground(foreground: boolean): void {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    if (!this.started || this.cursor === null) return;

    this.cancelActiveWork();
    const generation = ++this.generation;
    this.pendingPollGeneration = null;
    if (!foreground) {
      this.transition({ status: 'paused', cursor: this.cursor });
      return;
    }
    this.requestPoll(generation);
  }

  stop(): void {
    if (!this.started && this.state.status === 'stopped') return;
    this.started = false;
    this.foreground = false;
    this.cursor = null;
    this.consecutiveFailures = 0;
    this.generation += 1;
    this.pendingPollGeneration = null;
    this.cancelActiveWork();
    this.transition({ status: 'stopped' });
  }

  private requestPoll(generation: number): void {
    if (!this.canPoll(generation) || this.cursor === null) return;
    if (this.pollInFlight) {
      this.pendingPollGeneration = generation;
      return;
    }

    this.pollInFlight = true;
    void this.poll(generation).finally(() => {
      this.pollInFlight = false;
      const pending = this.pendingPollGeneration;
      this.pendingPollGeneration = null;
      if (pending !== null && this.canPoll(pending)) this.requestPoll(pending);
    });
  }

  private async poll(generation: number): Promise<void> {
    if (!this.canPoll(generation) || this.cursor === null) {
      return;
    }

    const cursor = this.cursor;
    const controller = new AbortController();
    this.activeAbortController = controller;
    this.transition({
      status: 'polling',
      cursor,
      consecutiveFailures: this.consecutiveFailures,
    });

    let result: PairingApiResult<PairingEvents>;
    try {
      result = await this.dependencies.api.readEvents(cursor, controller.signal);
    } catch {
      if (this.activeAbortController === controller) this.activeAbortController = null;
      if (controller.signal.aborted || !this.canPoll(generation)) return;
      this.consecutiveFailures += 1;
      this.scheduleNext(this.failureDelay(), generation);
      return;
    }
    if (this.activeAbortController === controller) this.activeAbortController = null;
    if (controller.signal.aborted || !this.canPoll(generation)) return;

    if (!result.ok) {
      this.consecutiveFailures += 1;
      this.scheduleNext(this.failureDelay(), generation);
      return;
    }

    let applied: PairingEventApplyResult;
    try {
      applied = await this.dependencies.eventConsumer.applyEvents(result.value.events);
    } catch {
      if (this.canPoll(generation)) this.fail('pairing-event-apply-failed');
      return;
    }
    if (!this.canPoll(generation)) return;
    if (!applied.ok) {
      this.fail(applied.reason);
      return;
    }

    let persisted: PairingCursorWriteResult;
    try {
      persisted = await this.dependencies.cursorStore.writeCursor(result.value.nextCursor);
    } catch {
      if (this.canPoll(generation)) this.fail('pairing-cursor-unavailable');
      return;
    }
    if (!this.canPoll(generation)) return;
    if (!persisted.ok) {
      this.fail(persisted.reason);
      return;
    }

    this.cursor = result.value.nextCursor;
    this.consecutiveFailures = 0;
    this.scheduleNext(this.successIntervalMs, generation);
  }

  private scheduleNext(delayMs: number, generation: number): void {
    if (!this.canPoll(generation) || this.cursor === null) return;

    const cursor = this.cursor;
    const controller = new AbortController();
    this.activeAbortController = controller;
    this.transition({
      status: 'waiting',
      cursor,
      consecutiveFailures: this.consecutiveFailures,
      delayMs,
    });
    void this.waitForDelay(delayMs, controller.signal).then(() => {
      if (this.activeAbortController === controller) this.activeAbortController = null;
      if (!controller.signal.aborted && this.canPoll(generation)) this.requestPoll(generation);
    });
  }

  private failureDelay(): number {
    const index = Math.min(this.consecutiveFailures - 1, this.failureBackoffMs.length - 1);
    return (
      this.failureBackoffMs[index] ?? this.failureBackoffMs[this.failureBackoffMs.length - 1] ?? 1
    );
  }

  private fail(code: PairingPollingFailureCode): void {
    this.started = false;
    this.foreground = false;
    this.generation += 1;
    this.pendingPollGeneration = null;
    this.cancelActiveWork();
    this.transition({ status: 'failed', code });
  }

  private canPoll(generation: number): boolean {
    return this.started && this.foreground && this.generation === generation;
  }

  private isCurrent(generation: number): boolean {
    return this.started && this.generation === generation;
  }

  private cancelActiveWork(): void {
    this.activeAbortController?.abort();
    this.activeAbortController = null;
  }

  private transition(state: PairingPollingState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

function validatedDelays(delays: readonly number[], message: string): readonly number[] {
  if (delays.length === 0 || delays.some((delay) => !isValidDelay(delay))) {
    throw new Error(message);
  }
  return [...delays];
}

function validatedDelay(delay: number, message: string): number {
  if (!isValidDelay(delay)) throw new Error(message);
  return delay;
}

function isValidDelay(delay: number): boolean {
  return Number.isSafeInteger(delay) && delay > 0;
}

function waitForAbortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(finish, delayMs);
    signal.addEventListener('abort', finish, { once: true });

    function finish() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}
