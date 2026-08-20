import type { SQLiteDatabase } from 'expo-sqlite';

export async function withKeyedWriteTransaction<T>(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  await database.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await task(database);
    await database.execAsync('COMMIT');
    return result;
  } catch (error: unknown) {
    try {
      await database.execAsync('ROLLBACK');
    } catch {
      // Preserve the original stable failure path without exposing native error details.
    }
    throw error;
  }
}
