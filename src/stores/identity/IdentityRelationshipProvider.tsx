import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type {
  IdentityRelationshipController,
  PairingResponseAction,
  RespondToPairingRequestResult,
  StartM2yPairingResult,
} from '@/application/identity/contracts';
import type { PairingPollingController } from '@/application/pairing/contracts';
import {
  decideWorkspaceAccess,
  type WorkspaceAccess,
} from '@/application/identity/workspace-access';
import type { IdentityRelationshipState } from '@/domain/identity/types';

type IdentityRelationshipValue = Readonly<{
  access: WorkspaceAccess;
  state: IdentityRelationshipState;
  createIdentity: (displayName: string | null) => Promise<void>;
  startM2yPairing: (m2yId: string) => Promise<StartM2yPairingResult>;
  respondToPairingRequest: (
    requestId: string,
    action: PairingResponseAction,
  ) => Promise<RespondToPairingRequestResult>;
  resetLocalData: () => Promise<void>;
  retry: () => Promise<void>;
}>;

const IdentityRelationshipContext = createContext<IdentityRelationshipValue | null>(null);

export function IdentityRelationshipProvider({
  children,
  controller,
  pollingController,
  publicConfig,
}: PropsWithChildren<{
  controller: IdentityRelationshipController;
  pollingController?: PairingPollingController;
  publicConfig: PublicConfigResult;
}>) {
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  );

  useEffect(() => {
    void controller.inspect();
  }, [controller]);

  const pollingEnabled = canPollFrom(state);
  useEffect(() => {
    if (!pollingController || !pollingEnabled) return;
    void pollingController.start(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      pollingController.setForeground(nextState === 'active');
    });
    return () => {
      subscription.remove();
      pollingController.stop();
    };
  }, [pollingController, pollingEnabled]);

  const value = useMemo<IdentityRelationshipValue>(
    () => ({
      access: decideWorkspaceAccess(state, publicConfig),
      state,
      createIdentity: (displayName) => controller.createIdentity(displayName),
      startM2yPairing: (m2yId) => controller.startM2yPairing(m2yId),
      respondToPairingRequest: (requestId, action) =>
        controller.respondToPairingRequest(requestId, action),
      resetLocalData: () => controller.resetLocalData(),
      retry: () => controller.retry(),
    }),
    [controller, publicConfig, state],
  );
  return (
    <IdentityRelationshipContext.Provider value={value}>
      {children}
    </IdentityRelationshipContext.Provider>
  );
}

function canPollFrom(state: IdentityRelationshipState): boolean {
  return (
    state.status === 'unpaired' ||
    state.status === 'outgoingPending' ||
    state.status === 'incomingReview' ||
    state.status === 'awaitingSafetyVerification' ||
    state.status === 'active'
  );
}

export function useIdentityRelationship(): IdentityRelationshipValue {
  const value = useContext(IdentityRelationshipContext);
  if (!value) {
    throw new Error('useIdentityRelationship must be used within IdentityRelationshipProvider');
  }
  return value;
}
