import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type {
  WorkspaceCommand,
  WorkspaceCommands,
  WorkspaceSession,
  WorkspaceSnapshot,
} from '@/application/workspace/contracts';

type WorkspaceValue = Readonly<{
  state: WorkspaceSnapshot;
  commands: WorkspaceCommands;
  busy: boolean;
}>;

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({
  children,
  session,
}: PropsWithChildren<{ session: WorkspaceSession }>) {
  const [state, setState] = useState(session.initialSnapshot);
  const [busy, setBusy] = useState(false);

  const execute = useCallback(
    async (command: WorkspaceCommand) => {
      setBusy(true);
      try {
        const outcome = await session.execute(command);
        setState(outcome.snapshot);
        return outcome.result;
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const commands = useMemo<WorkspaceCommands>(
    () => ({
      sendMessage: (body) => execute({ type: 'send-message', body }),
      saveMessageToSpace: (input) => execute({ type: 'save-message-to-space', ...input }),
      updateSharedItem: (input) => execute({ type: 'update-shared-item', ...input }),
      changeSharedItemStatus: (itemId, status) =>
        execute({ type: 'change-shared-item-status', itemId, status }),
      deleteSharedItem: (itemId) => execute({ type: 'delete-shared-item', itemId }),
    }),
    [execute],
  );
  const value = useMemo(() => ({ state, commands, busy }), [busy, commands, state]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return value;
}
