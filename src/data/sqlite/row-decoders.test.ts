import { CorruptWorkspaceDataError, decodeWorkspaceSnapshot } from './row-decoders';

const messageRows = [{ id: 'message-1', author: 'other', body: '你好', created_at_ms: 100 }];
const itemRow = {
  id: 'item-1',
  kind: 'note',
  title: '记录',
  detail: '内容',
  status: 'active',
  pinned: 0,
  source_message_id: 'message-1',
  updated_at_ms: 200,
};
const itemRows = [itemRow];

describe('decodeWorkspaceSnapshot', () => {
  it('decodes rows and derives message save links', () => {
    const snapshot = decodeWorkspaceSnapshot(messageRows, itemRows);
    expect(snapshot.messages[0]?.savedItemIds).toEqual(['item-1']);
    expect(snapshot.sharedItems[0]).toMatchObject({
      kind: 'note',
      pinned: false,
      sourceMessageId: 'message-1',
    });
  });

  it('rejects unknown enums without dropping the row', () => {
    expect(() =>
      decodeWorkspaceSnapshot(messageRows, [{ ...itemRow, kind: 'future-kind' }]),
    ).toThrow(CorruptWorkspaceDataError);
  });

  it('rejects orphaned source relationships', () => {
    expect(() =>
      decodeWorkspaceSnapshot(messageRows, [{ ...itemRow, source_message_id: 'missing-message' }]),
    ).toThrow(CorruptWorkspaceDataError);
  });
});
