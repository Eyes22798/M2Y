import type { SQLiteDatabase } from 'expo-sqlite';

import { demoWorkspaceSnapshot } from '@/application/workspace/demo-workspace';

import { withKeyedWriteTransaction } from './keyed-transaction';

export class InconsistentInitialDataError extends Error {
  constructor() {
    super('Encrypted workspace initialization state is inconsistent');
  }
}

type SeedDependencies = Readonly<{
  installationId: string;
  createdAtMs: number;
}>;

export async function seedInitialData(
  database: SQLiteDatabase,
  dependencies: SeedDependencies,
): Promise<void> {
  await withKeyedWriteTransaction(database, async (transaction) => {
    const counts = await transaction.getFirstAsync<{
      profiles: number;
      messages: number;
      items: number;
    }>(`SELECT
        (SELECT count(*) FROM installation_profile) AS profiles,
        (SELECT count(*) FROM messages) AS messages,
        (SELECT count(*) FROM shared_items) AS items`);
    if (!counts) throw new InconsistentInitialDataError();
    if (counts.profiles === 1) return;
    if (counts.profiles !== 0 || counts.messages !== 0 || counts.items !== 0) {
      throw new InconsistentInitialDataError();
    }

    await transaction.runAsync(
      'INSERT INTO installation_profile(singleton_id, installation_id, display_name, created_at_ms) VALUES (1, ?, NULL, ?)',
      dependencies.installationId,
      dependencies.createdAtMs,
    );
    for (const message of demoWorkspaceSnapshot.messages) {
      await transaction.runAsync(
        'INSERT INTO messages(id, author, body, created_at_ms) VALUES (?, ?, ?, ?)',
        message.id,
        message.author,
        message.body,
        message.createdAtMs,
      );
    }
    for (const item of demoWorkspaceSnapshot.sharedItems) {
      await transaction.runAsync(
        `INSERT INTO shared_items(
          id, kind, title, detail, status, pinned, source_message_id, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.kind,
        item.title,
        item.detail,
        item.status,
        item.pinned ? 1 : 0,
        item.sourceMessageId ?? null,
        item.updatedAtMs,
      );
    }
  });
}
