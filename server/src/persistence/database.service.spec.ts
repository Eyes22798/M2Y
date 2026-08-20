import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ServerConfig } from '../bootstrap/server-config';
import { DatabaseService } from './database.service';
import { LATEST_SCHEMA_VERSION } from './migrations';
import { ServiceMetadataRepository } from './service-metadata.repository';

describe('DatabaseService', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'm2y-server-'));
  const databasePath = join(temporaryDirectory, 'pairing.sqlite');
  const config: ServerConfig = Object.freeze({
    databasePath,
    host: '127.0.0.1',
    port: 3100,
  });

  afterAll(() => {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it('runs idempotent migrations and preserves repository data after restart', () => {
    const firstDatabase = new DatabaseService(config);
    firstDatabase.onModuleInit();
    const firstRepository = new ServiceMetadataRepository(firstDatabase);
    firstRepository.write('restart-probe', 'persisted');
    expect(firstDatabase.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    firstDatabase.onApplicationShutdown();

    const reopenedDatabase = new DatabaseService(config);
    reopenedDatabase.onModuleInit();
    const reopenedRepository = new ServiceMetadataRepository(reopenedDatabase);

    expect(reopenedDatabase.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(reopenedRepository.read('restart-probe')).toBe('persisted');
    reopenedDatabase.onApplicationShutdown();
  });

  it('enforces foreign keys in the baseline schema', () => {
    const database = new DatabaseService({ ...config, databasePath: ':memory:' });
    database.onModuleInit();

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO devices(
             device_id, m2y_id, auth_public_key, registration_id, identity_public_key,
             signed_prekey_public, signed_prekey_signature, kyber_prekey_public,
             kyber_prekey_signature, status, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'device',
          'missing',
          'public',
          1,
          'identity',
          'signed',
          'signature',
          'kyber',
          'signature',
          'active',
          1,
        ),
    ).toThrow();

    database.onApplicationShutdown();
  });
});
