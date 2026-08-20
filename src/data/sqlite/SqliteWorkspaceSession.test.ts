import type { SQLiteDatabase } from 'expo-sqlite';

import { SqliteWorkspaceSession } from './SqliteWorkspaceSession';

function emptyRows() {
  return jest.fn(async () => []);
}

describe('SqliteWorkspaceSession', () => {
  it('keeps the last committed snapshot when a mutation transaction fails', async () => {
    const transaction = {
      getAllAsync: emptyRows(),
      runAsync: jest.fn(async () => {
        throw new Error('redacted test write failure');
      }),
      execAsync: jest.fn(async () => undefined),
    };
    const database = {
      ...transaction,
      closeAsync: jest.fn(async () => undefined),
    } as unknown as SQLiteDatabase;
    const session = await SqliteWorkspaceSession.create(database, {
      nowMs: () => 1_777_777_777_000,
      createId: () => 'message-test',
    });

    const outcome = await session.execute({ type: 'send-message', body: 'persist me' });

    expect(outcome).toEqual({
      result: { ok: false, reason: 'write-failed' },
      snapshot: session.initialSnapshot,
    });
    expect(outcome.snapshot.messages).toHaveLength(0);
    expect(transaction.runAsync).toHaveBeenCalledTimes(1);
    expect(transaction.execAsync).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rejects new commands after close has been requested', async () => {
    const database = {
      getAllAsync: emptyRows(),
      closeAsync: jest.fn(async () => undefined),
    } as unknown as SQLiteDatabase;
    const session = await SqliteWorkspaceSession.create(database, {
      nowMs: () => 1_777_777_777_000,
      createId: () => 'message-test',
    });

    await session.close();
    const outcome = await session.execute({ type: 'send-message', body: 'too late' });

    expect(outcome.result).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(database.closeAsync).toHaveBeenCalledTimes(1);
  });
});
