import type { SQLiteDatabase } from 'expo-sqlite';

import { parseDatabaseHexKey } from '@/application/secure-workspace/contracts';

import { keyAndVerifyDatabase, toFileUri } from './SqlCipherDatabase';

describe('toFileUri', () => {
  it('converts the native SQLite absolute directory into an Expo File URI', () => {
    expect(toFileUri('/data/user/0/com.m2y.app.dev/files/SQLite')).toBe(
      'file:///data/user/0/com.m2y.app.dev/files/SQLite',
    );
    expect(toFileUri('file:///data/user/0/com.m2y.app.dev/files/SQLite')).toBe(
      'file:///data/user/0/com.m2y.app.dev/files/SQLite',
    );
  });
});

describe('keyAndVerifyDatabase', () => {
  it('uses the validated raw key before the first schema read', async () => {
    const calls: string[] = [];
    const database = {
      execAsync: jest.fn(async (sql: string) => {
        calls.push(sql.startsWith('PRAGMA key') ? 'key' : sql);
      }),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('sqlite_master')) {
          calls.push('schema-read');
          return { count: 0 };
        }
        if (sql.includes('cipher_version')) return { cipher_version: '4.6.1' };
        if (sql.includes('cipher_status')) return null;
        return null;
      }),
    } as unknown as SQLiteDatabase;
    const key = parseDatabaseHexKey('ab'.repeat(32));
    if (!key) throw new Error('Test key must be valid');

    await keyAndVerifyDatabase(database, key);

    expect(calls.slice(0, 2)).toEqual(['key', 'schema-read']);
    expect(database.execAsync).toHaveBeenNthCalledWith(1, `PRAGMA key = "x'${key}'"`);
    expect(database.execAsync).toHaveBeenLastCalledWith('PRAGMA foreign_keys = ON');
  });

  it('fails when SQLCipher is not present', async () => {
    const database = {
      execAsync: jest.fn(async () => undefined),
      getFirstAsync: jest.fn(async (sql: string) =>
        sql.includes('sqlite_master') ? { count: 0 } : null,
      ),
    } as unknown as SQLiteDatabase;
    const key = parseDatabaseHexKey('cd'.repeat(32));
    if (!key) throw new Error('Test key must be valid');

    await expect(keyAndVerifyDatabase(database, key)).rejects.toThrow('SQLCipher is unavailable');
  });
});
