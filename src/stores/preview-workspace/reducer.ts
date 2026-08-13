import type { Message } from '@/domain/message/types';
import type { SharedItem } from '@/domain/shared-item/types';

import type { PreviewWorkspaceAction, PreviewWorkspaceState } from './types';

export function previewWorkspaceReducer(
  state: PreviewWorkspaceState,
  action: PreviewWorkspaceAction,
): PreviewWorkspaceState {
  switch (action.type) {
    case 'send-message': {
      const body = action.body.trim();
      if (!body) return state;

      const message: Message = {
        id: `message-${state.nextMessageSequence}`,
        author: 'self',
        body,
        createdAtLabel: '现在',
        savedItemIds: [],
      };

      return {
        ...state,
        messages: [...state.messages, message],
        nextMessageSequence: state.nextMessageSequence + 1,
      };
    }

    case 'save-message-to-space': {
      const sourceMessage = state.messages.find((message) => message.id === action.messageId);
      const title = action.title.trim();
      if (!sourceMessage || !title) return state;

      const duplicate = state.sharedItems.find(
        (item) => item.sourceMessageId === action.messageId && item.kind === action.kind,
      );
      if (duplicate) return state;

      const itemId = `item-${state.nextItemSequence}`;
      const sharedItem: SharedItem = {
        id: itemId,
        kind: action.kind,
        title,
        detail: action.detail.trim(),
        status: action.kind === 'agreement' ? 'waiting' : 'active',
        pinned: false,
        sourceMessageId: action.messageId,
        updatedAtLabel: '刚刚',
      };

      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId
            ? { ...message, savedItemIds: [...message.savedItemIds, itemId] }
            : message,
        ),
        sharedItems: [sharedItem, ...state.sharedItems],
        nextItemSequence: state.nextItemSequence + 1,
      };
    }

    case 'update-shared-item': {
      const title = action.title.trim();
      if (!title || !state.sharedItems.some((item) => item.id === action.itemId)) return state;

      return {
        ...state,
        sharedItems: state.sharedItems.map((item) =>
          item.id === action.itemId
            ? {
                ...item,
                title,
                detail: action.detail.trim(),
                updatedAtLabel: '刚刚',
              }
            : item,
        ),
      };
    }

    case 'change-shared-item-status':
      if (!state.sharedItems.some((item) => item.id === action.itemId)) return state;
      return {
        ...state,
        sharedItems: state.sharedItems.map((item) =>
          item.id === action.itemId
            ? { ...item, status: action.status, updatedAtLabel: '刚刚' }
            : item,
        ),
      };

    case 'delete-shared-item':
      if (!state.sharedItems.some((item) => item.id === action.itemId)) return state;
      return {
        ...state,
        messages: state.messages.map((message) => ({
          ...message,
          savedItemIds: message.savedItemIds.filter((id) => id !== action.itemId),
        })),
        sharedItems: state.sharedItems.filter((item) => item.id !== action.itemId),
      };

    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled preview workspace action: ${JSON.stringify(value)}`);
}
