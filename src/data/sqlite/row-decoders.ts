import type { Message, MessageAuthor } from '@/domain/message/types';
import {
  previewSharedItemKinds,
  sharedItemStatuses,
  type PreviewSharedItemKind,
  type SharedItem,
  type SharedItemStatus,
} from '@/domain/shared-item/types';
import type { WorkspaceSnapshot } from '@/application/workspace/contracts';

export type MessageRow = Readonly<{
  id: unknown;
  author: unknown;
  body: unknown;
  created_at_ms: unknown;
}>;

export type SharedItemRow = Readonly<{
  id: unknown;
  kind: unknown;
  title: unknown;
  detail: unknown;
  status: unknown;
  pinned: unknown;
  source_message_id: unknown;
  updated_at_ms: unknown;
}>;

export class CorruptWorkspaceDataError extends Error {
  constructor() {
    super('Encrypted workspace contains invalid data');
  }
}

export function decodeWorkspaceSnapshot(
  messageRows: readonly MessageRow[],
  itemRows: readonly SharedItemRow[],
): WorkspaceSnapshot {
  const items = itemRows.map(decodeSharedItem);
  const savedIdsByMessage = new Map<string, string[]>();
  for (const item of items) {
    if (!item.sourceMessageId) continue;
    const current = savedIdsByMessage.get(item.sourceMessageId) ?? [];
    current.push(item.id);
    savedIdsByMessage.set(item.sourceMessageId, current);
  }

  const messages = messageRows.map((row) => decodeMessage(row, savedIdsByMessage));
  const messageIds = new Set(messages.map((message) => message.id));
  if (items.some((item) => item.sourceMessageId && !messageIds.has(item.sourceMessageId))) {
    throw new CorruptWorkspaceDataError();
  }
  return { messages, sharedItems: items };
}

function decodeMessage(row: MessageRow, savedIdsByMessage: ReadonlyMap<string, string[]>): Message {
  if (
    typeof row.id !== 'string' ||
    !isMessageAuthor(row.author) ||
    typeof row.body !== 'string' ||
    !row.body.trim() ||
    !isTimestamp(row.created_at_ms)
  ) {
    throw new CorruptWorkspaceDataError();
  }
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    createdAtMs: row.created_at_ms,
    savedItemIds: savedIdsByMessage.get(row.id) ?? [],
  };
}

function decodeSharedItem(row: SharedItemRow): SharedItem {
  if (
    typeof row.id !== 'string' ||
    !isPreviewSharedItemKind(row.kind) ||
    typeof row.title !== 'string' ||
    !row.title.trim() ||
    typeof row.detail !== 'string' ||
    !isSharedItemStatus(row.status) ||
    (row.pinned !== 0 && row.pinned !== 1) ||
    (row.source_message_id !== null && typeof row.source_message_id !== 'string') ||
    !isTimestamp(row.updated_at_ms)
  ) {
    throw new CorruptWorkspaceDataError();
  }

  const base = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    status: row.status,
    pinned: row.pinned === 1,
    updatedAtMs: row.updated_at_ms,
  } satisfies Omit<SharedItem, 'sourceMessageId'>;
  return row.source_message_id === null
    ? base
    : { ...base, sourceMessageId: row.source_message_id };
}

function isMessageAuthor(value: unknown): value is MessageAuthor {
  return value === 'self' || value === 'other';
}

function isPreviewSharedItemKind(value: unknown): value is PreviewSharedItemKind {
  return typeof value === 'string' && (previewSharedItemKinds as readonly string[]).includes(value);
}

function isSharedItemStatus(value: unknown): value is SharedItemStatus {
  return typeof value === 'string' && (sharedItemStatuses as readonly string[]).includes(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
