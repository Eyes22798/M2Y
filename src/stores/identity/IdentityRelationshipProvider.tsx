import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import {
  decideWorkspaceAccess,
  type WorkspaceAccess,
} from '@/application/identity/workspace-access';
import type { IdentityRelationshipState } from '@/domain/identity/types';

type IdentityRelationshipValue = Readonly<{
  access: WorkspaceAccess;
  state: IdentityRelationshipState;
  createIdentity: (displayName: string | null) => Promise<void>;
  resetLocalData: () => Promise<void>;
  retry: () => Promise<void>;
}>;

const IdentityRelationshipContext = createContext<IdentityRelationshipValue | null>(null);

export function IdentityRelationshipProvider({
  children,
  controller,
  publicConfig,
}: PropsWithChildren<{
  controller: IdentityRelationshipController;
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

  const value = useMemo<IdentityRelationshipValue>(
    () => ({
      access: decideWorkspaceAccess(state, publicConfig),
      state,
      createIdentity: (displayName) => controller.createIdentity(displayName),
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

export function useIdentityRelationship(): IdentityRelationshipValue {
  const value = useContext(IdentityRelationshipContext);
  if (!value) {
    throw new Error('useIdentityRelationship must be used within IdentityRelationshipProvider');
  }
  return value;
}
