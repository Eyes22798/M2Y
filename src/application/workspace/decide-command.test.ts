import { applyWorkspaceMutation, decideWorkspaceCommand } from './decide-command';

const snapshot = {
  messages: [
    {
      id: 'message-1',
      author: 'other' as const,
      body: '周六去看电影吗？',
      createdAtMs: 1_777_777_000_000,
      savedItemIds: [],
    },
    {
      id: 'message-2',
      author: 'self' as const,
      body: '好呀。',
      createdAtMs: 1_777_777_100_000,
      savedItemIds: ['item-1'],
    },
  ],
  sharedItems: [
    {
      id: 'item-1',
      kind: 'agreement' as const,
      title: '电影',
      detail: '本地草稿',
      status: 'waiting' as const,
      pinned: false,
      sourceMessageId: 'message-2',
      updatedAtMs: 1_777_777_200_000,
    },
  ],
};
const context = {
  nowMs: 1_777_777_777_777,
  createId: (scope: 'message' | 'item') => `${scope}-generated`,
};

describe('decideWorkspaceCommand', () => {
  it('normalizes and plans a message without mutating the snapshot', () => {
    const decision = decideWorkspaceCommand(
      snapshot,
      { type: 'send-message', body: '  明天见。  ' },
      context,
    );

    expect(decision).toMatchObject({
      ok: true,
      result: { ok: true, id: 'message-generated' },
      mutation: {
        type: 'insert-message',
        message: { body: '明天见。', createdAtMs: context.nowMs },
      },
    });
    expect(snapshot.messages).toHaveLength(2);
  });

  it('rejects duplicates without planning a mutation', () => {
    expect(
      decideWorkspaceCommand(
        snapshot,
        {
          type: 'save-message-to-space',
          messageId: 'message-2',
          kind: 'agreement',
          title: '重复约定',
          detail: '',
        },
        context,
      ),
    ).toEqual({
      ok: false,
      result: { ok: false, reason: 'duplicate-item', existingItemId: 'item-1' },
    });
  });

  it('applies insert and delete projections atomically', () => {
    const saveDecision = decideWorkspaceCommand(
      snapshot,
      {
        type: 'save-message-to-space',
        messageId: 'message-1',
        kind: 'note',
        title: ' 周末计划 ',
        detail: ' 一起看电影 ',
      },
      context,
    );
    if (!saveDecision.ok) throw new Error('Expected save decision');

    const saved = applyWorkspaceMutation(snapshot, saveDecision.mutation);
    expect(saved.sharedItems[0]).toMatchObject({
      id: 'item-generated',
      title: '周末计划',
      detail: '一起看电影',
    });
    expect(saved.messages[0]?.savedItemIds).toContain('item-generated');

    const deleted = applyWorkspaceMutation(saved, {
      type: 'delete-shared-item',
      itemId: 'item-generated',
    });
    expect(deleted.sharedItems.some((item) => item.id === 'item-generated')).toBe(false);
    expect(deleted.messages[0]?.savedItemIds).not.toContain('item-generated');
  });
});
