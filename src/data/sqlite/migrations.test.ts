import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase, UnsupportedDatabaseVersionError } from './migrations';

function createDatabase(version: number) {
  const database = {
    getFirstAsync: jest.fn(async () => ({ user_version: version })),
    execAsync: jest.fn(async () => undefined),
  } as unknown as SQLiteDatabase;
  return database;
}

describe('migrateDatabase', () => {
  it('creates schema v1 and updates user_version in one exclusive transaction', async () => {
    const database = createDatabase(0);

    await expect(migrateDatabase(database)).resolves.toBe(true);

    expect(database.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE');
    expect(database.execAsync).toHaveBeenNthCalledWith(3, 'PRAGMA user_version = 1');
    expect(database.execAsync).toHaveBeenNthCalledWith(4, 'COMMIT');
  });

  it('leaves schema v1 unchanged', async () => {
    const database = createDatabase(1);
    await expect(migrateDatabase(database)).resolves.toBe(false);
    expect(database.execAsync).not.toHaveBeenCalled();
  });

  it('fails closed for a newer schema', async () => {
    const database = createDatabase(2);
    await expect(migrateDatabase(database)).rejects.toBeInstanceOf(UnsupportedDatabaseVersionError);
  });
});
