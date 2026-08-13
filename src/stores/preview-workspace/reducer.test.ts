import { initialPreviewWorkspaceState } from './fixture';
import { previewWorkspaceReducer } from './reducer';

describe('previewWorkspaceReducer', () => {
  it('sends a trimmed local message', () => {
    const next = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'send-message',
      body: '  明天见。  ',
    });

    expect(next.messages.at(-1)).toMatchObject({ body: '明天见。', author: 'self' });
    expect(next.nextMessageSequence).toBe(5);
  });

  it('ignores blank messages', () => {
    const next = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'send-message',
      body: '   ',
    });
    expect(next).toBe(initialPreviewWorkspaceState);
  });

  it('saves a message and links both sides atomically', () => {
    const next = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'save-message-to-space',
      messageId: 'message-1',
      kind: 'note',
      title: '  周末计划  ',
      detail: '一起看电影',
    });

    expect(next.sharedItems[0]).toMatchObject({
      id: 'item-3',
      title: '周末计划',
      sourceMessageId: 'message-1',
    });
    expect(next.messages[0]?.savedItemIds).toContain('item-3');
  });

  it('does not duplicate the same source message and kind', () => {
    const next = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'save-message-to-space',
      messageId: 'message-2',
      kind: 'agreement',
      title: '重复约定',
      detail: '',
    });
    expect(next).toBe(initialPreviewWorkspaceState);
  });

  it('updates, changes status, and deletes a shared item', () => {
    const updated = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'update-shared-item',
      itemId: 'item-2',
      title: '发送最新路线',
      detail: '周六下午',
    });
    const completed = previewWorkspaceReducer(updated, {
      type: 'change-shared-item-status',
      itemId: 'item-2',
      status: 'done',
    });
    const deleted = previewWorkspaceReducer(completed, {
      type: 'delete-shared-item',
      itemId: 'item-2',
    });

    expect(updated.sharedItems.find((item) => item.id === 'item-2')).toMatchObject({
      title: '发送最新路线',
    });
    expect(completed.sharedItems.find((item) => item.id === 'item-2')?.status).toBe('done');
    expect(deleted.sharedItems.some((item) => item.id === 'item-2')).toBe(false);
    expect(deleted.messages.find((message) => message.id === 'message-3')?.savedItemIds).toEqual(
      [],
    );
  });

  it('keeps state unchanged for an unknown item id', () => {
    const next = previewWorkspaceReducer(initialPreviewWorkspaceState, {
      type: 'delete-shared-item',
      itemId: 'missing',
    });
    expect(next).toBe(initialPreviewWorkspaceState);
  });
});
