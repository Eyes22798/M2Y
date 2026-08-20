import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database.service';

@Injectable()
export class ServiceMetadataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  read(key: string): string | undefined {
    const row = this.databaseService.connection
      .prepare('SELECT metadata_value FROM service_metadata WHERE metadata_key = ?')
      .get(key) as { metadata_value: string } | undefined;
    return row?.metadata_value;
  }

  write(key: string, value: string): void {
    this.databaseService.connection
      .prepare(
        `INSERT INTO service_metadata(metadata_key, metadata_value, updated_at_ms)
         VALUES (?, ?, ?)
         ON CONFLICT(metadata_key) DO UPDATE SET
           metadata_value = excluded.metadata_value,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(key, value, Date.now());
  }
}
