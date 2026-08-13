import type { Message } from '@/domain/message/types';
import type {
  PreviewSharedItemKind,
  SharedItem,
  SharedItemStatus,
} from '@/domain/shared-item/types';

export type PreviewWorkspaceState = Readonly<{
  messages: readonly Message[];
  sharedItems: readonly SharedItem[];
  nextMessageSequence: number;
  nextItemSequence: number;
}>;

export type PreviewWorkspaceAction =
  | Readonly<{ type: 'send-message'; body: string }>
  | Readonly<{
      type: 'save-message-to-space';
      messageId: string;
      kind: PreviewSharedItemKind;
      title: string;
      detail: string;
    }>
  | Readonly<{
      type: 'update-shared-item';
      itemId: string;
      title: string;
      detail: string;
    }>
  | Readonly<{
      type: 'change-shared-item-status';
      itemId: string;
      status: SharedItemStatus;
    }>
  | Readonly<{ type: 'delete-shared-item'; itemId: string }>;

export type CommandResult =
  | Readonly<{ ok: true; id: string }>
  | Readonly<{
      ok: false;
      reason: 'blank-message' | 'blank-title' | 'message-not-found' | 'item-not-found';
    }>
  | Readonly<{ ok: false; reason: 'duplicate-item'; existingItemId: string }>;

export type PreviewWorkspaceCommands = Readonly<{
  sendMessage: (body: string) => CommandResult;
  saveMessageToSpace: (input: {
    messageId: string;
    kind: PreviewSharedItemKind;
    title: string;
    detail: string;
  }) => CommandResult;
  updateSharedItem: (input: { itemId: string; title: string; detail: string }) => CommandResult;
  changeSharedItemStatus: (itemId: string, status: SharedItemStatus) => CommandResult;
  deleteSharedItem: (itemId: string) => CommandResult;
}>;
