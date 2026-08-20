import type { SQLiteDatabase } from 'expo-sqlite';

import { withKeyedWriteTransaction } from './keyed-transaction';

describe('withKeyedWriteTransaction', () => {
  it('runs the task and commit on the same already-keyed connection', async () => {
    const database = {
      execAsync: jest.fn(async () => undefined),
      runAsync: jest.fn(async () => ({ changes: 1 })),
    } as unknown as SQLiteDatabase;

    await withKeyedWriteTransaction(database, async (transaction) => {
      expect(transaction).toBe(database);
      await transaction.runAsync('INSERT INTO example(value) VALUES (?)', 'value');
    });

    expect(database.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE');
    expect(database.execAsync).toHaveBeenNthCalledWith(2, 'COMMIT');
  });

  it('rolls back on the same connection and preserves the original failure', async () => {
    const failure = new Error('redacted test failure');
    const database = {
      execAsync: jest.fn(async () => undefined),
    } as unknown as SQLiteDatabase;

    await expect(
      withKeyedWriteTransaction(database, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(database.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE');
    expect(database.execAsync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
  });
});
