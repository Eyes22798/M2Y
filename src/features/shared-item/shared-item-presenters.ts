import type { AppIconName } from '@/design/primitives/AppIcon';
import type {
  PreviewSharedItemKind,
  SharedItemKind,
  SharedItemStatus,
} from '@/domain/shared-item/types';

export const previewKindOptions: readonly {
  kind: PreviewSharedItemKind;
  icon: AppIconName;
  label: string;
  description: string;
}[] = [
  { kind: 'note', icon: 'note', label: '笔记', description: '保留重要内容' },
  { kind: 'task', icon: 'task', label: '待办', description: '记住下一步' },
  { kind: 'agreement', icon: 'handshake', label: '约定草稿', description: '等待未来确认' },
];

export const sharedItemKindLabels: Record<SharedItemKind, string> = {
  note: '笔记',
  task: '待办',
  agreement: '约定草稿',
  file: '文件',
  event: '时间',
};

export const editableStatusOptions: readonly {
  status: SharedItemStatus;
  label: string;
}[] = [
  { status: 'active', label: '进行中' },
  { status: 'waiting', label: '本地草稿' },
  { status: 'done', label: '已完成' },
  { status: 'archived', label: '已归档' },
];

export function getKindIcon(kind: SharedItemKind): AppIconName {
  switch (kind) {
    case 'note':
      return 'note';
    case 'task':
      return 'task';
    case 'agreement':
      return 'handshake';
    case 'file':
      return 'note';
    case 'event':
      return 'waiting';
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported shared item kind: ${String(value)}`);
}
