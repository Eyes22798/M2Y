import type {
  IdentityRelationshipEvent,
  IdentityRelationshipState,
  IdentitySummary,
  PairingRequestSummary,
} from './types';

export const initialIdentityRelationshipState: IdentityRelationshipState = {
  status: 'inspecting',
};

export function identityRelationshipReducer(
  state: IdentityRelationshipState,
  event: IdentityRelationshipEvent,
): IdentityRelationshipState {
  if (event.type === 'recoveryRequired') {
    return { status: 'recoveryRequired', code: event.code };
  }
  if (event.type === 'fatal') {
    return { status: 'fatal', code: event.code, retryable: event.retryable };
  }

  switch (state.status) {
    case 'inspecting':
      return event.type === 'inspectAbsent' ? { status: 'needsIdentity' } : state;
    case 'needsIdentity':
      return event.type === 'identityCreationStarted' ? { status: 'creatingIdentity' } : state;
    case 'creatingIdentity':
      return event.type === 'identityPrepared'
        ? {
            status: 'registering',
            identity: event.identity,
            operationId: event.operationId,
          }
        : state;
    case 'registering':
      if (event.type === 'registrationCommitted') {
        return { status: 'unpaired', identity: event.identity };
      }
      return networkFailure(state.identity, event, state);
    case 'unpaired':
      if (event.type === 'pairRequestPrepared') {
        return { status: 'outgoingPending', identity: state.identity, request: event.request };
      }
      if (event.type === 'incomingRequestCommitted') {
        return { status: 'incomingReview', identity: state.identity, request: event.request };
      }
      return networkFailure(state.identity, event, state);
    case 'outgoingPending':
      return pendingTransition(state.identity, state.request, event, state);
    case 'incomingReview':
      return pendingTransition(state.identity, state.request, event, state);
    case 'awaitingSafetyVerification': {
      if (event.type === 'localSafetyConfirmed') {
        return { ...state, localConfirmed: true };
      }
      if (event.type === 'remoteSafetyConfirmed') {
        return { ...state, remoteConfirmed: true };
      }
      if (event.type === 'activationCommitted' && state.localConfirmed && state.remoteConfirmed) {
        return {
          status: 'active',
          identity: state.identity,
          relationship: event.relationship,
        };
      }
      return pendingTransition(state.identity, state.request, event, state);
    }
    case 'active':
      return event.type === 'identityChanged'
        ? { status: 'identityChanged', identity: state.identity, peer: event.peer }
        : state;
    case 'networkFailed':
    case 'rejected':
    case 'cancelled':
    case 'expired':
    case 'identityChanged':
    case 'recoveryRequired':
    case 'fatal':
      return state;
    default:
      return assertNever(state);
  }
}

function pendingTransition(
  identity: IdentitySummary,
  request: PairingRequestSummary,
  event: IdentityRelationshipEvent,
  unchanged: IdentityRelationshipState,
): IdentityRelationshipState {
  switch (event.type) {
    case 'pairRequestAccepted':
      return {
        status: 'awaitingSafetyVerification',
        identity,
        localConfirmed: false,
        remoteConfirmed: false,
        request,
        safetyNumber: event.safetyNumber,
      };
    case 'requestRejected':
      return { status: 'rejected', identity, requestId: request.requestId };
    case 'requestCancelled':
      return {
        status: 'cancelled',
        identity,
        reason: event.by,
        requestId: request.requestId,
      };
    case 'requestExpired':
      return { status: 'expired', identity, requestId: request.requestId };
    case 'safetyMismatch':
      return {
        status: 'cancelled',
        identity,
        reason: 'safety-mismatch',
        requestId: request.requestId,
      };
    case 'networkFailed':
      return { status: 'networkFailed', identity, retryFrom: event.retryFrom };
    case 'identityChanged':
      return { status: 'identityChanged', identity, peer: event.peer };
    default:
      return unchanged;
  }
}

function networkFailure(
  identity: IdentitySummary,
  event: IdentityRelationshipEvent,
  unchanged: IdentityRelationshipState,
): IdentityRelationshipState {
  return event.type === 'networkFailed'
    ? { status: 'networkFailed', identity, retryFrom: event.retryFrom }
    : unchanged;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled identity relationship state: ${JSON.stringify(value)}`);
}
