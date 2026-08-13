import type { PreviewWorkspaceState } from './types';

export const initialPreviewWorkspaceState: PreviewWorkspaceState = {
  messages: [
    {
      id: 'message-1',
      author: 'other',
      body: '周六去看电影吗？',
      createdAtLabel: '19:28',
      savedItemIds: [],
    },
    {
      id: 'message-2',
      author: 'self',
      body: '好呀，订了 19:30 的票。',
      createdAtLabel: '19:29',
      savedItemIds: ['item-1'],
    },
    {
      id: 'message-3',
      author: 'other',
      body: '记得提前把路线发我。',
      createdAtLabel: '19:30',
      savedItemIds: ['item-2'],
    },
  ],
  sharedItems: [
    {
      id: 'item-1',
      kind: 'agreement',
      title: '电影 · 周六 19:30',
      detail: '本地约定草稿 · 尚未获得对方确认',
      status: 'waiting',
      pinned: true,
      sourceMessageId: 'message-2',
      updatedAtLabel: '刚刚',
    },
    {
      id: 'item-2',
      kind: 'task',
      title: '出发前发送路线',
      detail: '待办 · 当前设备预览',
      status: 'active',
      pinned: false,
      sourceMessageId: 'message-3',
      updatedAtLabel: '刚刚',
    },
  ],
  nextMessageSequence: 4,
  nextItemSequence: 3,
};
