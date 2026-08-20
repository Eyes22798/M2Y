import type { SQLiteDatabase } from 'expo-sqlite';

import { withKeyedWriteTransaction } from './keyed-transaction';
import { currentSchemaVersion, schemaV1Sql } from './schema-v1';

export class UnsupportedDatabaseVersionError extends Error {
  constructor() {
    super('Unsupported database schema version');
  }
}

export async function migrateDatabase(database: SQLiteDatabase): Promise<boolean> {
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version;
  if (!Number.isInteger(version) || version === undefined || version < 0) {
    throw new UnsupportedDatabaseVersionError();
  }
  if (version > currentSchemaVersion) throw new UnsupportedDatabaseVersionError();
  if (version === currentSchemaVersion) return false;

  await withKeyedWriteTransaction(database, async (transaction) => {
    if (version === 0) {
      await transaction.execAsync(schemaV1Sql);
      await transaction.execAsync(`PRAGMA user_version = ${currentSchemaVersion}`);
      return;
    }
    throw new UnsupportedDatabaseVersionError();
  });
  return true;
}
