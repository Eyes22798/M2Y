import type { Message } from '@/domain/message/types';
import type {
  PreviewSharedItemKind,
  SharedItem,
  SharedItemStatus,
} from '@/domain/shared-item/types';

export type WorkspaceSnapshot = Readonly<{
  messages: readonly Message[];
  sharedItems: readonly SharedItem[];
}>;

export type WorkspaceCommand =
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
      status: SharedItemStatus;
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
      reason:
        | 'blank-message'
        | 'blank-title'
        | 'message-not-found'
        | 'item-not-found'
        | 'storage-unavailable'
        | 'write-failed';
    }>
  | Readonly<{ ok: false; reason: 'duplicate-item'; existingItemId: string }>;

export type WorkspaceMutation =
  | Readonly<{ type: 'insert-message'; message: Message }>
  | Readonly<{ type: 'insert-shared-item'; item: SharedItem }>
  | Readonly<{
      type: 'update-shared-item';
      itemId: string;
      title: string;
      detail: string;
      status: SharedItemStatus;
      updatedAtMs: number;
    }>
  | Readonly<{
      type: 'change-shared-item-status';
      itemId: string;
      status: SharedItemStatus;
      updatedAtMs: number;
    }>
  | Readonly<{ type: 'delete-shared-item'; itemId: string }>;

export type WorkspaceDecision =
  | Readonly<{
      ok: true;
      result: Extract<CommandResult, { ok: true }>;
      mutation: WorkspaceMutation;
    }>
  | Readonly<{ ok: false; result: Exclude<CommandResult, { ok: true }> }>;

export type WorkspaceCommandContext = Readonly<{
  nowMs: number;
  createId: (scope: 'message' | 'item') => string;
}>;

export type WorkspaceCommandOutcome = Readonly<{
  result: CommandResult;
  snapshot: WorkspaceSnapshot;
}>;

export interface WorkspaceSession {
  readonly initialSnapshot: WorkspaceSnapshot;
  execute(command: WorkspaceCommand): Promise<WorkspaceCommandOutcome>;
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  close(): Promise<void>;
}

export type WorkspaceCommands = Readonly<{
  sendMessage: (body: string) => Promise<CommandResult>;
  saveMessageToSpace: (input: {
    messageId: string;
    kind: PreviewSharedItemKind;
    title: string;
    detail: string;
  }) => Promise<CommandResult>;
  updateSharedItem: (input: {
    itemId: string;
    title: string;
    detail: string;
    status: SharedItemStatus;
  }) => Promise<CommandResult>;
  changeSharedItemStatus: (itemId: string, status: SharedItemStatus) => Promise<CommandResult>;
  deleteSharedItem: (itemId: string) => Promise<CommandResult>;
}>;
