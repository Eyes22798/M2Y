import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';

import type { PreviewSharedItemKind, SharedItemStatus } from '@/domain/shared-item/types';

import { initialPreviewWorkspaceState } from './fixture';
import { previewWorkspaceReducer } from './reducer';
import type { CommandResult, PreviewWorkspaceCommands, PreviewWorkspaceState } from './types';

type PreviewWorkspaceValue = Readonly<{
  state: PreviewWorkspaceState;
  commands: PreviewWorkspaceCommands;
}>;

const PreviewWorkspaceContext = createContext<PreviewWorkspaceValue | null>(null);

export function PreviewWorkspaceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(previewWorkspaceReducer, initialPreviewWorkspaceState);

  const sendMessage = useCallback(
    (body: string): CommandResult => {
      const trimmedBody = body.trim();
      if (!trimmedBody) return { ok: false, reason: 'blank-message' };

      const id = `message-${state.nextMessageSequence}`;
      dispatch({ type: 'send-message', body: trimmedBody });
      return { ok: true, id };
    },
    [state.nextMessageSequence],
  );

  const saveMessageToSpace = useCallback(
    (input: {
      messageId: string;
      kind: PreviewSharedItemKind;
      title: string;
      detail: string;
    }): CommandResult => {
      const snapshot = state;
      if (!input.title.trim()) return { ok: false, reason: 'blank-title' };
      if (!snapshot.messages.some((message) => message.id === input.messageId)) {
        return { ok: false, reason: 'message-not-found' };
      }

      const duplicate = snapshot.sharedItems.find(
        (item) => item.sourceMessageId === input.messageId && item.kind === input.kind,
      );
      if (duplicate) {
        return { ok: false, reason: 'duplicate-item', existingItemId: duplicate.id };
      }

      const id = `item-${snapshot.nextItemSequence}`;
      dispatch({ type: 'save-message-to-space', ...input });
      return { ok: true, id };
    },
    [state],
  );

  const updateSharedItem = useCallback(
    (input: { itemId: string; title: string; detail: string }): CommandResult => {
      if (!input.title.trim()) return { ok: false, reason: 'blank-title' };
      if (!state.sharedItems.some((item) => item.id === input.itemId)) {
        return { ok: false, reason: 'item-not-found' };
      }

      dispatch({ type: 'update-shared-item', ...input });
      return { ok: true, id: input.itemId };
    },
    [state.sharedItems],
  );

  const changeSharedItemStatus = useCallback(
    (itemId: string, status: SharedItemStatus): CommandResult => {
      if (!state.sharedItems.some((item) => item.id === itemId)) {
        return { ok: false, reason: 'item-not-found' };
      }

      dispatch({ type: 'change-shared-item-status', itemId, status });
      return { ok: true, id: itemId };
    },
    [state.sharedItems],
  );

  const deleteSharedItem = useCallback(
    (itemId: string): CommandResult => {
      if (!state.sharedItems.some((item) => item.id === itemId)) {
        return { ok: false, reason: 'item-not-found' };
      }

      dispatch({ type: 'delete-shared-item', itemId });
      return { ok: true, id: itemId };
    },
    [state.sharedItems],
  );

  const commands = useMemo<PreviewWorkspaceCommands>(
    () => ({
      sendMessage,
      saveMessageToSpace,
      updateSharedItem,
      changeSharedItemStatus,
      deleteSharedItem,
    }),
    [changeSharedItemStatus, deleteSharedItem, saveMessageToSpace, sendMessage, updateSharedItem],
  );
  const value = useMemo(() => ({ state, commands }), [commands, state]);

  return (
    <PreviewWorkspaceContext.Provider value={value}>{children}</PreviewWorkspaceContext.Provider>
  );
}

export function usePreviewWorkspace() {
  const value = useContext(PreviewWorkspaceContext);
  if (!value) {
    throw new Error('usePreviewWorkspace must be used within PreviewWorkspaceProvider');
  }
  return value;
}
