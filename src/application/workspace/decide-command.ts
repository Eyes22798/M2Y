import type { Message } from '@/domain/message/types';
import type { SharedItem } from '@/domain/shared-item/types';

import type {
  WorkspaceCommand,
  WorkspaceCommandContext,
  WorkspaceDecision,
  WorkspaceMutation,
  WorkspaceSnapshot,
} from './contracts';

export function decideWorkspaceCommand(
  snapshot: WorkspaceSnapshot,
  command: WorkspaceCommand,
  context: WorkspaceCommandContext,
): WorkspaceDecision {
  switch (command.type) {
    case 'send-message': {
      const body = command.body.trim();
      if (!body) return { ok: false, result: { ok: false, reason: 'blank-message' } };

      const message: Message = {
        id: context.createId('message'),
        author: 'self',
        body,
        createdAtMs: context.nowMs,
        savedItemIds: [],
      };
      return success(message.id, { type: 'insert-message', message });
    }

    case 'save-message-to-space': {
      const title = command.title.trim();
      if (!title) return { ok: false, result: { ok: false, reason: 'blank-title' } };
      if (!snapshot.messages.some((message) => message.id === command.messageId)) {
        return { ok: false, result: { ok: false, reason: 'message-not-found' } };
      }

      const duplicate = snapshot.sharedItems.find(
        (item) => item.sourceMessageId === command.messageId && item.kind === command.kind,
      );
      if (duplicate) {
        return {
          ok: false,
          result: { ok: false, reason: 'duplicate-item', existingItemId: duplicate.id },
        };
      }

      const item: SharedItem = {
        id: context.createId('item'),
        kind: command.kind,
        title,
        detail: command.detail.trim(),
        status: command.kind === 'agreement' ? 'waiting' : 'active',
        pinned: false,
        sourceMessageId: command.messageId,
        updatedAtMs: context.nowMs,
      };
      return success(item.id, { type: 'insert-shared-item', item });
    }

    case 'update-shared-item': {
      const title = command.title.trim();
      if (!title) return { ok: false, result: { ok: false, reason: 'blank-title' } };
      if (!snapshot.sharedItems.some((item) => item.id === command.itemId)) {
        return { ok: false, result: { ok: false, reason: 'item-not-found' } };
      }
      return success(command.itemId, {
        type: 'update-shared-item',
        itemId: command.itemId,
        title,
        detail: command.detail.trim(),
        status: command.status,
        updatedAtMs: context.nowMs,
      });
    }

    case 'change-shared-item-status':
      if (!snapshot.sharedItems.some((item) => item.id === command.itemId)) {
        return { ok: false, result: { ok: false, reason: 'item-not-found' } };
      }
      return success(command.itemId, {
        type: 'change-shared-item-status',
        itemId: command.itemId,
        status: command.status,
        updatedAtMs: context.nowMs,
      });

    case 'delete-shared-item':
      if (!snapshot.sharedItems.some((item) => item.id === command.itemId)) {
        return { ok: false, result: { ok: false, reason: 'item-not-found' } };
      }
      return success(command.itemId, { type: 'delete-shared-item', itemId: command.itemId });

    default:
      return assertNever(command);
  }
}

export function applyWorkspaceMutation(
  snapshot: WorkspaceSnapshot,
  mutation: WorkspaceMutation,
): WorkspaceSnapshot {
  switch (mutation.type) {
    case 'insert-message':
      return { ...snapshot, messages: [...snapshot.messages, mutation.message] };
    case 'insert-shared-item':
      return {
        messages: snapshot.messages.map((message) =>
          message.id === mutation.item.sourceMessageId
            ? { ...message, savedItemIds: [...message.savedItemIds, mutation.item.id] }
            : message,
        ),
        sharedItems: [mutation.item, ...snapshot.sharedItems],
      };
    case 'update-shared-item':
      return {
        ...snapshot,
        sharedItems: snapshot.sharedItems.map((item) =>
          item.id === mutation.itemId
            ? {
                ...item,
                title: mutation.title,
                detail: mutation.detail,
                status: mutation.status,
                updatedAtMs: mutation.updatedAtMs,
              }
            : item,
        ),
      };
    case 'change-shared-item-status':
      return {
        ...snapshot,
        sharedItems: snapshot.sharedItems.map((item) =>
          item.id === mutation.itemId
            ? { ...item, status: mutation.status, updatedAtMs: mutation.updatedAtMs }
            : item,
        ),
      };
    case 'delete-shared-item':
      return {
        messages: snapshot.messages.map((message) => ({
          ...message,
          savedItemIds: message.savedItemIds.filter((id) => id !== mutation.itemId),
        })),
        sharedItems: snapshot.sharedItems.filter((item) => item.id !== mutation.itemId),
      };
    default:
      return assertNever(mutation);
  }
}

function success(id: string, mutation: WorkspaceMutation): WorkspaceDecision {
  return { ok: true, result: { ok: true, id }, mutation };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace variant: ${String(value)}`);
}
