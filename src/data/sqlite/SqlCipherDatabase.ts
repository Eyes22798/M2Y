import { File } from 'expo-file-system';
import {
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import {
  workspaceDatabaseName,
  type DatabaseHexKey,
  type DatabaseOpenResult,
  type DatabasePresenceResult,
  type EncryptedDatabaseManager,
} from '@/application/secure-workspace/contracts';

import { migrateDatabase, UnsupportedDatabaseVersionError } from './migrations';
import { CorruptWorkspaceDataError } from './row-decoders';
import { InconsistentInitialDataError, seedInitialData } from './seed';
import { SqliteWorkspaceSession } from './SqliteWorkspaceSession';

type SqlCipherRuntime = Readonly<{
  nowMs: () => number;
  createId: (scope: 'installation' | 'message' | 'item') => string;
}>;

export class SqlCipherDatabase implements EncryptedDatabaseManager {
  constructor(
    private readonly runtime: SqlCipherRuntime,
    private readonly databaseName: string = workspaceDatabaseName,
  ) {}

  async databaseExists(): Promise<DatabasePresenceResult> {
    try {
      return new File(toFileUri(defaultDatabaseDirectory), this.databaseName).exists
        ? { kind: 'present' }
        : { kind: 'absent' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  async open(key: DatabaseHexKey): Promise<DatabaseOpenResult> {
    const presence = await this.databaseExists();
    if (presence.kind === 'unavailable') {
      return { ok: false, kind: 'fatal', code: 'storage-unavailable', retryable: true };
    }

    let database: SQLiteDatabase;
    try {
      database = await openDatabaseAsync(this.databaseName, { useNewConnection: true });
    } catch {
      return { ok: false, kind: 'fatal', code: 'database-open-failed', retryable: true };
    }

    let phase: 'key' | 'migration' | 'snapshot' = 'key';
    try {
      await keyAndVerifyDatabase(database, key);
      phase = 'migration';
      const migrated = await migrateDatabase(database);
      await seedInitialData(database, {
        installationId: this.runtime.createId('installation'),
        createdAtMs: this.runtime.nowMs(),
      });
      if (migrated) await verifyCipherIntegrity(database);

      phase = 'snapshot';
      const session = await SqliteWorkspaceSession.create(database, {
        nowMs: this.runtime.nowMs,
        createId: (scope) => this.runtime.createId(scope),
      });
      return { ok: true, session };
    } catch (error: unknown) {
      await closeSilently(database);
      if (phase === 'key') {
        return presence.kind === 'present'
          ? { ok: false, kind: 'recovery', reason: 'database-unreadable' }
          : { ok: false, kind: 'fatal', code: 'database-open-failed', retryable: true };
      }
      if (error instanceof CorruptWorkspaceDataError) {
        return { ok: false, kind: 'fatal', code: 'integrity-failed', retryable: false };
      }
      if (error instanceof InconsistentInitialDataError) {
        return {
          ok: false,
          kind: 'fatal',
          code: 'initial-data-inconsistent',
          retryable: false,
        };
      }
      if (phase === 'migration' || error instanceof UnsupportedDatabaseVersionError) {
        return { ok: false, kind: 'fatal', code: 'migration-failed', retryable: true };
      }
      return { ok: false, kind: 'fatal', code: 'data-corrupt', retryable: false };
    }
  }

  async deleteDatabase() {
    const presence = await this.databaseExists();
    if (presence.kind === 'unavailable') {
      return { ok: false, reason: 'storage-unavailable' } as const;
    }
    if (presence.kind === 'absent') return { ok: true } as const;
    try {
      await deleteDatabaseAsync(this.databaseName);
      return { ok: true } as const;
    } catch {
      return { ok: false, reason: 'storage-unavailable' } as const;
    }
  }
}

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export async function keyAndVerifyDatabase(
  database: SQLiteDatabase,
  key: DatabaseHexKey,
): Promise<void> {
  await database.execAsync(`PRAGMA key = "x'${key}'"`);
  const schemaRead = await database.getFirstAsync<{ count: number }>(
    'SELECT count(*) AS count FROM sqlite_master',
  );
  if (!schemaRead || !Number.isInteger(schemaRead.count)) throw new Error('Database key rejected');

  const version = await database.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!version || typeof version.cipher_version !== 'string' || !version.cipher_version) {
    throw new Error('SQLCipher is unavailable');
  }
  const status = await database.getFirstAsync<{ cipher_status: number }>('PRAGMA cipher_status');
  if (status && status.cipher_status !== 1) throw new Error('SQLCipher connection is inactive');
  await database.execAsync('PRAGMA foreign_keys = ON');
}

async function verifyCipherIntegrity(database: SQLiteDatabase): Promise<void> {
  const errors = await database.getAllAsync<Record<string, unknown>>(
    'PRAGMA cipher_integrity_check',
  );
  if (errors.length > 0) throw new CorruptWorkspaceDataError();
}

async function closeSilently(database: SQLiteDatabase): Promise<void> {
  try {
    await database.closeAsync();
  } catch {
    // The caller already returns a stable redacted failure code.
  }
}
