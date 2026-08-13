export const sharedItemKinds = ['task', 'note', 'file', 'agreement', 'event'] as const;
export const sharedItemStatuses = ['active', 'waiting', 'done', 'confirmed', 'archived'] as const;
export const previewSharedItemKinds = ['note', 'task', 'agreement'] as const;

export type SharedItemKind = (typeof sharedItemKinds)[number];
export type SharedItemStatus = (typeof sharedItemStatuses)[number];
export type PreviewSharedItemKind = (typeof previewSharedItemKinds)[number];

export type SharedItem = Readonly<{
  id: string;
  kind: SharedItemKind;
  title: string;
  detail: string;
  status: SharedItemStatus;
  pinned: boolean;
  sourceMessageId?: string;
  updatedAtLabel: string;
}>;
