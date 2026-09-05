import {
  identityRelationshipReducer,
  initialIdentityRelationshipState,
} from '@/domain/identity/state-machine';
import type {
  IdentityRelationshipEvent,
  IdentityRelationshipState,
  PairingRequestSummary,
} from '@/domain/identity/types';
import type {
  PairingApiFailure,
  PairingEvent,
  PairingEventApplyResult,
  PreparedPairRequest,
} from '@/application/pairing/contracts';
import { isM2yId, normalizeM2yIdInput } from '@/domain/identity/m2y-id';

import type {
  IdentityControllerDependencies,
  IdentityDraft,
  IdentityInspection,
  IdentityRelationshipController,
  PendingPairingPacket,
  PendingPairingResponse,
  PairingResponseAction,
  PreparedPairingPacket,
  PreparedPairingResponse,
  RespondToPairingRequestResult,
  StartM2yPairingResult,
} from './contracts';

/**
 * 串行驱动身份状态机，避免双击向单线程 native executor 提交两次身份或首包操作。
 * 所有可见状态都以 native 持久化和服务端回执为前提，不做乐观发布。
 */
export class DefaultIdentityRelationshipController implements IdentityRelationshipController {
  private state: IdentityRelationshipState = initialIdentityRelationshipState;
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;

  constructor(private readonly dependencies: IdentityControllerDependencies) {}

  getState(): IdentityRelationshipState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inspect(): Promise<void> {
    return this.runExclusive(() => this.inspectAndResumePendingWork());
  }

  retry(): Promise<void> {
    return this.runExclusive(() => this.inspectAndResumePendingWork());
  }

  applyEvents(events: readonly PairingEvent[]): Promise<PairingEventApplyResult> {
    if (events.length === 0) return Promise.resolve({ ok: true });
    return this.runExclusiveResult(() => this.applyEventsInternal(events), {
      ok: false,
      reason: 'pairing-event-apply-failed',
    });
  }

  startM2yPairing(rawM2yId: string): Promise<StartM2yPairingResult> {
    const m2yId = normalizeM2yIdInput(rawM2yId);
    if (!isM2yId(m2yId)) {
      return Promise.resolve({ ok: false, reason: 'm2y-id-invalid' });
    }
    return this.runExclusiveResult(() => this.startM2yPairingInternal(m2yId), {
      ok: false,
      reason: 'pairing-operation-busy',
    });
  }

  respondToPairingRequest(
    requestId: string,
    action: PairingResponseAction,
  ): Promise<RespondToPairingRequestResult> {
    return this.runExclusiveResult(() => this.respondToPairingRequestInternal(requestId, action), {
      ok: false,
      reason: 'pairing-operation-busy',
    });
  }

  createIdentity(displayName: string | null): Promise<void> {
    return this.runExclusive(async () => {
      if (this.state.status !== 'needsIdentity') return;
      this.transition({ type: 'identityCreationStarted' });

      let draft;
      try {
        draft = await this.dependencies.identityStore.prepareIdentity(displayName);
      } catch {
        this.transition({ type: 'fatal', code: 'identity-creation-failed', retryable: true });
        return;
      }
      this.transition({
        type: 'identityPrepared',
        identity: draft.identity,
        operationId: draft.operationId,
      });
      await this.registerDraft(draft);
    });
  }

  /** 只清除密码学身份；加密工作区由 secure workspace controller 独立管理，不随配对失败删除。 */
  resetLocalData(): Promise<void> {
    return this.runExclusive(async () => {
      this.transition({ type: 'inspectStarted' });
      try {
        await this.dependencies.identityStore.resetIdentity();
      } catch {
        this.transition({ type: 'recoveryRequired', code: 'identity-reset-failed' });
        return;
      }
      await this.inspectInternal();
    });
  }

  private async inspectInternal(): Promise<void> {
    this.transition({ type: 'inspectStarted' });

    let inspection: IdentityInspection;
    try {
      inspection = await this.dependencies.identityStore.inspectIdentity();
    } catch {
      this.transition({ type: 'fatal', code: 'identity-store-unreadable', retryable: true });
      return;
    }

    switch (inspection.kind) {
      case 'absent':
        this.transition({ type: 'inspectAbsent' });
        return;
      case 'pendingRegistration':
        this.transition({
          type: 'inspectPendingRegistration',
          identity: inspection.identity,
          operationId: inspection.operationId,
        });
        return;
      case 'unpaired':
        this.transition({ type: 'inspectUnpaired', identity: inspection.identity });
        return;
      case 'outgoingPending':
        this.transition({
          type: 'inspectOutgoingPending',
          identity: inspection.identity,
          request: inspection.request,
        });
        return;
      case 'incomingReview':
        this.transition({
          type: 'inspectIncomingReview',
          identity: inspection.identity,
          request: inspection.request,
        });
        return;
      case 'awaitingSafetyVerification':
        this.transition({
          type: 'inspectAwaitingSafetyVerification',
          identity: inspection.identity,
          request: inspection.request,
          safetyNumber: inspection.safetyNumber,
        });
        return;
      default:
        return assertNever(inspection);
    }
  }

  private async inspectAndResumePendingWork(): Promise<void> {
    await this.inspectInternal();
    if (!this.dependencies.pairingApi) return;

    if (this.state.status === 'unpaired' || this.state.status === 'awaitingSafetyVerification') {
      const resumedResponse = await this.resumePairingResponseOutbox();
      if (!resumedResponse && this.state.status === 'unpaired') {
        await this.resumePairingOutbox();
      }
      return;
    }
    if (this.state.status !== 'registering') return;

    let draft: IdentityDraft;
    try {
      draft = await this.dependencies.identityStore.prepareIdentity(null);
    } catch {
      this.transition({
        type: 'fatal',
        code: 'identity-registration-resume-failed',
        retryable: true,
      });
      return;
    }
    if (
      draft.operationId !== this.state.operationId ||
      draft.identity.deviceId !== this.state.identity.deviceId ||
      draft.identity.m2yId !== this.state.identity.m2yId ||
      draft.identity.stableIdentityId !== this.state.identity.stableIdentityId
    ) {
      this.transition({ type: 'recoveryRequired', code: 'identity-registration-binding-invalid' });
      return;
    }
    await this.registerDraft(draft);
  }

  private async startM2yPairingInternal(m2yId: string): Promise<StartM2yPairingResult> {
    if (this.state.status !== 'unpaired') {
      return { ok: false, reason: 'pairing-operation-busy' };
    }
    const localIdentity = this.state.identity;
    if (m2yId === localIdentity.m2yId) {
      return { ok: false, reason: 'self-pairing-not-allowed' };
    }

    const api = this.dependencies.pairingApi;
    const operationIdGenerator = this.dependencies.operationIdGenerator;
    if (!api || !operationIdGenerator) {
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }

    let preparedResult;
    try {
      preparedResult = await api.preparePairRequest({
        m2yId,
        method: 'm2y-id',
        operationId: operationIdGenerator.createOperationId(),
      });
    } catch {
      this.transition({ type: 'networkFailed', retryFrom: 'unpaired' });
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }
    if (!preparedResult.ok) {
      if (preparedResult.failure.kind === 'server') {
        if (
          preparedResult.failure.code === 'pairing-target-unavailable' ||
          preparedResult.failure.code === 'identity-prekey-unavailable' ||
          preparedResult.failure.code === 'pairing-relationship-conflict'
        ) {
          return { ok: false, reason: 'pairing-target-unavailable' };
        }
      }
      this.handlePairingTransportFailure(preparedResult.failure, 'unpaired');
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }

    const prepared = preparedResult.value;
    if (
      prepared.method !== 'm2y-id' ||
      prepared.targetBundle.m2yId !== m2yId ||
      prepared.targetBundle.deviceId === localIdentity.deviceId ||
      prepared.targetBundle.stableIdentityId === localIdentity.stableIdentityId
    ) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-target-binding-invalid' });
      return { ok: false, reason: 'pairing-target-unavailable' };
    }

    let packet: PreparedPairingPacket;
    try {
      packet = await this.dependencies.identityStore.preparePairingPacket(
        prepared.requestId,
        prepared.expiresAtMs,
        prepared.targetBundle,
      );
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-packet-prepare-failed', retryable: true });
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }
    if (!packetMatchesPreparedRequest(packet, prepared)) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-packet-binding-invalid' });
      return { ok: false, reason: 'pairing-target-unavailable' };
    }

    return (await this.submitAndCommitPairingPacket(packet))
      ? { ok: true }
      : { ok: false, reason: 'pairing-transport-unavailable' };
  }

  private async respondToPairingRequestInternal(
    requestId: string,
    action: PairingResponseAction,
  ): Promise<RespondToPairingRequestResult> {
    if (this.state.status !== 'incomingReview' || this.state.request.requestId !== requestId) {
      return { ok: false, reason: 'pairing-operation-busy' };
    }
    if (!this.dependencies.pairingApi) {
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }

    let response: PreparedPairingResponse;
    try {
      response = await this.dependencies.identityStore.preparePairingResponse(requestId, action);
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-response-prepare-failed', retryable: true });
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }
    if (response.requestId !== requestId || response.action !== action) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-response-binding-invalid' });
      return { ok: false, reason: 'pairing-transport-unavailable' };
    }
    return (await this.submitAndCommitPairingResponse(response, true))
      ? { ok: true }
      : { ok: false, reason: 'pairing-transport-unavailable' };
  }

  private async applyEventsInternal(
    events: readonly PairingEvent[],
  ): Promise<PairingEventApplyResult> {
    for (const event of events) {
      if (event.type !== 'pair-request' || event.packet === undefined) {
        return { ok: false, reason: 'pairing-event-apply-failed' };
      }

      let inspection: IdentityInspection;
      try {
        inspection = await this.dependencies.identityStore.consumePairingRequestEvent(
          event.eventId,
          event.requestId,
          event.packet,
        );
      } catch {
        return { ok: false, reason: 'pairing-event-apply-failed' };
      }
      if (
        inspection.kind !== 'incomingReview' ||
        inspection.request.requestId !== event.requestId
      ) {
        return { ok: false, reason: 'pairing-event-apply-failed' };
      }
      if (
        this.state.status !== 'unpaired' &&
        !(
          this.state.status === 'incomingReview' &&
          this.state.request.requestId === inspection.request.requestId
        )
      ) {
        return { ok: false, reason: 'pairing-event-apply-failed' };
      }
      this.transition({ type: 'incomingRequestCommitted', request: inspection.request });
    }
    return { ok: true };
  }

  private async resumePairingOutbox(): Promise<void> {
    let packets: readonly PendingPairingPacket[];
    try {
      packets = await this.dependencies.identityStore.listPendingPairingPackets();
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-outbox-unreadable', retryable: true });
      return;
    }
    if (packets.length === 0) return;
    if (packets.length !== 1) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-outbox-conflict' });
      return;
    }
    const packet = packets[0];
    if (packet) await this.submitAndCommitPairingPacket(packet);
  }

  private async resumePairingResponseOutbox(): Promise<boolean> {
    let responses: readonly PendingPairingResponse[];
    try {
      responses = await this.dependencies.identityStore.listPendingPairingResponses();
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-outbox-unreadable', retryable: true });
      return true;
    }
    if (responses.length === 0) return false;
    if (responses.length !== 1) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-outbox-conflict' });
      return true;
    }
    const response = responses[0];
    if (response) await this.submitAndCommitPairingResponse(response, false);
    return true;
  }

  private async submitAndCommitPairingPacket(packet: PreparedPairingPacket): Promise<boolean> {
    const api = this.dependencies.pairingApi;
    if (!api) return false;

    let submitted;
    try {
      submitted = await api.submitPairRequest(packet.requestId, {
        operationId: packet.operationId,
        packet: packet.packet,
      });
    } catch {
      this.transition({ type: 'networkFailed', retryFrom: 'unpaired' });
      return false;
    }
    if (!submitted.ok) {
      this.handlePairingTransportFailure(submitted.failure, 'unpaired');
      return false;
    }
    if (
      submitted.value.operationId !== packet.operationId ||
      submitted.value.requestId !== packet.requestId ||
      submitted.value.status !== 'pending'
    ) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-submit-receipt-invalid' });
      return false;
    }

    try {
      await this.dependencies.identityStore.acknowledgePairingPacket(
        packet.operationId,
        submitted.value.operationId,
      );
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-submit-commit-failed', retryable: true });
      return false;
    }
    this.transition({
      type: 'pairRequestPrepared',
      request: pairingRequestOf(packet),
    });
    return true;
  }

  private async submitAndCommitPairingResponse(
    response: PreparedPairingResponse,
    publishOutcome: boolean,
  ): Promise<boolean> {
    const api = this.dependencies.pairingApi;
    if (!api) return false;

    let submitted;
    try {
      submitted = await api.respondToPairRequest(response.requestId, {
        action: response.action,
        operationId: response.operationId,
        packet: response.packet,
      });
    } catch {
      this.transition({ type: 'networkFailed', retryFrom: 'incomingReview' });
      return false;
    }
    if (!submitted.ok) {
      this.handlePairingTransportFailure(submitted.failure, 'incomingReview');
      return false;
    }
    const expectedStatus = response.action === 'accept' ? 'accepted' : 'rejected';
    if (
      submitted.value.operationId !== response.operationId ||
      submitted.value.requestId !== response.requestId ||
      submitted.value.status !== expectedStatus
    ) {
      this.transition({ type: 'recoveryRequired', code: 'pairing-response-receipt-invalid' });
      return false;
    }

    try {
      await this.dependencies.identityStore.acknowledgePairingPacket(
        response.operationId,
        submitted.value.operationId,
      );
    } catch {
      this.transition({ type: 'fatal', code: 'pairing-response-commit-failed', retryable: true });
      return false;
    }
    if (publishOutcome) {
      this.transition(
        response.action === 'accept'
          ? { type: 'pairRequestAccepted', safetyNumber: response.safetyNumber }
          : { type: 'requestRejected' },
      );
    }
    return true;
  }

  private async registerDraft(draft: IdentityDraft): Promise<void> {
    const api = this.dependencies.pairingApi;
    if (!api) return;

    let registered;
    try {
      registered = await api.registerIdentity(draft.registration);
    } catch {
      this.transition({ type: 'networkFailed', retryFrom: 'registering' });
      return;
    }
    if (!registered.ok) {
      this.handleRegistrationFailure(registered.failure);
      return;
    }
    if (
      registered.value.deviceId !== draft.registration.deviceId ||
      registered.value.m2yId !== draft.registration.m2yId
    ) {
      this.transition({ type: 'recoveryRequired', code: 'identity-registration-receipt-invalid' });
      return;
    }

    let inspection: IdentityInspection;
    try {
      inspection = await this.dependencies.identityStore.commitRegistration(
        draft.operationId,
        registered.value.receiptId,
      );
    } catch {
      this.transition({
        type: 'fatal',
        code: 'identity-registration-commit-failed',
        retryable: true,
      });
      return;
    }
    if (inspection.kind !== 'unpaired') {
      this.transition({ type: 'recoveryRequired', code: 'identity-registration-commit-invalid' });
      return;
    }
    this.transition({ type: 'registrationCommitted', identity: inspection.identity });
  }

  private handleRegistrationFailure(failure: PairingApiFailure): void {
    if (
      (failure.kind === 'client' &&
        (failure.code === 'pairing-network-unavailable' || failure.code === 'pairing-timeout')) ||
      (failure.kind === 'server' && (failure.httpStatus === 429 || failure.httpStatus >= 500))
    ) {
      this.transition({ type: 'networkFailed', retryFrom: 'registering' });
      return;
    }
    this.transition({
      type: 'fatal',
      code: failure.code,
      retryable: failure.kind === 'client' && failure.code === 'pairing-signing-failed',
    });
  }

  private handlePairingTransportFailure(
    failure: PairingApiFailure,
    retryFrom: 'unpaired' | 'outgoingPending' | 'incomingReview',
  ): void {
    if (isRetryableTransportFailure(failure)) {
      this.transition({ type: 'networkFailed', retryFrom });
      return;
    }
    this.transition({
      type: 'fatal',
      code: failure.code,
      retryable: failure.kind === 'client' && failure.code === 'pairing-signing-failed',
    });
  }

  private transition(event: IdentityRelationshipEvent): void {
    this.state = identityRelationshipReducer(this.state, event);
    for (const listener of this.listeners) listener();
  }

  private runExclusive(operation: () => Promise<void>): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const promise = operation().finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }

  private runExclusiveResult<T>(operation: () => Promise<T>, busyResult: T): Promise<T> {
    if (this.inFlight) return Promise.resolve(busyResult);
    const result = operation();
    let lock: Promise<void>;
    const completed = result.finally(() => {
      if (this.inFlight === lock) this.inFlight = null;
    });
    lock = completed.then(() => undefined);
    this.inFlight = lock;
    return completed;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled identity inspection: ${JSON.stringify(value)}`);
}

function isRetryableTransportFailure(failure: PairingApiFailure): boolean {
  return (
    (failure.kind === 'client' &&
      (failure.code === 'pairing-network-unavailable' || failure.code === 'pairing-timeout')) ||
    (failure.kind === 'server' && (failure.httpStatus === 429 || failure.httpStatus >= 500))
  );
}

function packetMatchesPreparedRequest(
  packet: PreparedPairingPacket,
  prepared: PreparedPairRequest,
): boolean {
  return (
    packet.requestId === prepared.requestId &&
    packet.expiresAtMs === prepared.expiresAtMs &&
    packet.targetDeviceId === prepared.targetBundle.deviceId &&
    packet.targetM2yId === prepared.targetBundle.m2yId &&
    packet.targetStableIdentityId === prepared.targetBundle.stableIdentityId
  );
}

function pairingRequestOf(packet: PreparedPairingPacket): PairingRequestSummary {
  return {
    expiresAtMs: packet.expiresAtMs,
    method: 'm2y-id' as const,
    peer: { m2yId: packet.targetM2yId, routeId: packet.targetDeviceId },
    requestId: packet.requestId,
  };
}
