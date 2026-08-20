import { AppState, type AppStateStatus } from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import type {
  ProtectionMode,
  SecureWorkspaceController,
  SecureWorkspaceState,
} from '@/application/secure-workspace/contracts';

type SecureWorkspaceValue = Readonly<{
  state: SecureWorkspaceState;
  setup: (mode: ProtectionMode) => Promise<void>;
  unlock: () => Promise<void>;
  resetLocalData: () => Promise<void>;
  retry: () => Promise<void>;
}>;

const SecureWorkspaceContext = createContext<SecureWorkspaceValue | null>(null);

export function SecureWorkspaceProvider({
  children,
  controller,
}: PropsWithChildren<{ controller: SecureWorkspaceController }>) {
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  );

  useEffect(() => {
    void controller.inspect();
  }, [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') void controller.handleAppBackground();
    });
    return () => subscription.remove();
  }, [controller]);

  const value = useMemo<SecureWorkspaceValue>(
    () => ({
      state,
      setup: (mode) => controller.setup(mode),
      unlock: () => controller.unlock(),
      resetLocalData: () => controller.resetLocalData(),
      retry: () => controller.retry(),
    }),
    [controller, state],
  );
  return (
    <SecureWorkspaceContext.Provider value={value}>{children}</SecureWorkspaceContext.Provider>
  );
}

export function useSecureWorkspace(): SecureWorkspaceValue {
  const value = useContext(SecureWorkspaceContext);
  if (!value) throw new Error('useSecureWorkspace must be used within SecureWorkspaceProvider');
  return value;
}
