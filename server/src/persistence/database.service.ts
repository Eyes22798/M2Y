import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { SERVER_CONFIG, type ServerConfig } from '../bootstrap/server-config';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

@Injectable()
export class DatabaseService implements OnApplicationShutdown, OnModuleInit {
  private database: Database.Database | undefined;

  constructor(@Inject(SERVER_CONFIG) private readonly config: ServerConfig) {}

  get connection(): Database.Database {
    if (this.database === undefined) {
      throw new Error('database-not-ready');
    }

    return this.database;
  }

  get schemaVersion(): number {
    const row = this.connection
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null };
    return row.version ?? 0;
  }

  onApplicationShutdown(): void {
    this.database?.close();
    this.database = undefined;
  }

  onModuleInit(): void {
    if (this.database !== undefined) {
      return;
    }

    if (this.config.databasePath !== ':memory:') {
      mkdirSync(dirname(this.config.databasePath), { recursive: true });
    }

    const database = new Database(this.config.databasePath);
    try {
      database.pragma('foreign_keys = ON');
      database.pragma('journal_mode = WAL');
      database.pragma('busy_timeout = 5000');
      this.applyMigrations(database);
      this.database = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  private applyMigrations(database: Database.Database): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at_ms INTEGER NOT NULL
      ) STRICT;
    `);

    const appliedRows = database.prepare('SELECT version FROM schema_migrations').all() as {
      version: number;
    }[];
    const applied = new Set(appliedRows.map((row) => row.version));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      database.transaction(() => {
        database.exec(migration.sql);
        database
          .prepare('INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)')
          .run(migration.version, Date.now());
      })();
    }

    const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
      version: number | null;
    };
    if (row.version !== LATEST_SCHEMA_VERSION) {
      throw new Error('database-schema-version-mismatch');
    }
  }
}
