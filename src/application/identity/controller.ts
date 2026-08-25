import {
  identityRelationshipReducer,
  initialIdentityRelationshipState,
} from '@/domain/identity/state-machine';
import type { IdentityRelationshipEvent, IdentityRelationshipState } from '@/domain/identity/types';

import type {
  IdentityInspection,
  IdentityRelationshipController,
  ProductionIdentityPort,
} from './contracts';

type ControllerDependencies = Readonly<{
  identityStore: ProductionIdentityPort;
}>;

/**
 * Drives the identity state machine from the native production store.
 *
 * Two properties matter more than the flow itself. Commands are serialised, so a double tap cannot
 * start two identity generations against the same single-threaded native executor. And no state is
 * reported optimistically: every status change follows a native call that already returned, which is
 * why a rejection lands on a fail-closed state instead of leaving the previous one on screen.
 */
export class DefaultIdentityRelationshipController implements IdentityRelationshipController {
  private state: IdentityRelationshipState = initialIdentityRelationshipState;
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;

  constructor(private readonly dependencies: ControllerDependencies) {}

  getState(): IdentityRelationshipState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inspect(): Promise<void> {
    return this.runExclusive(() => this.inspectInternal());
  }

  retry(): Promise<void> {
    return this.runExclusive(() => this.inspectInternal());
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
    });
  }

  /**
   * Clears the cryptographic identity only. The encrypted workspace database is owned by the secure
   * workspace controller and is deliberately left untouched: losing a half-finished registration must
   * not cost the user notes and tasks that were never part of it.
   */
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
      default:
        return assertNever(inspection);
    }
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
}

function assertNever(value: never): never {
  throw new Error(`Unhandled identity inspection: ${JSON.stringify(value)}`);
}
