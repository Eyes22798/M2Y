import type { SQLiteDatabase } from 'expo-sqlite';

import {
  type WorkspaceCommand,
  type WorkspaceCommandOutcome,
  type WorkspaceMutation,
  type WorkspaceSession,
  type WorkspaceSnapshot,
} from '@/application/workspace/contracts';
import { decideWorkspaceCommand as planWorkspaceCommand } from '@/application/workspace/decide-command';

import { decodeWorkspaceSnapshot, type MessageRow, type SharedItemRow } from './row-decoders';
import { withKeyedWriteTransaction } from './keyed-transaction';

type SessionDependencies = Readonly<{
  nowMs: () => number;
  createId: (scope: 'message' | 'item') => string;
}>;

export class SqliteWorkspaceSession implements WorkspaceSession {
  readonly initialSnapshot: WorkspaceSnapshot;
  private snapshot: WorkspaceSnapshot;
  private tail: Promise<void> = Promise.resolve();
  private closeRequested = false;
  private closed = false;

  private constructor(
    private readonly database: SQLiteDatabase,
    private readonly dependencies: SessionDependencies,
    snapshot: WorkspaceSnapshot,
  ) {
    this.snapshot = snapshot;
    this.initialSnapshot = snapshot;
  }

  static async create(database: SQLiteDatabase, dependencies: SessionDependencies) {
    const snapshot = await loadWorkspaceSnapshot(database);
    return new SqliteWorkspaceSession(database, dependencies, snapshot);
  }

  execute(command: WorkspaceCommand): Promise<WorkspaceCommandOutcome> {
    if (this.closeRequested) {
      return Promise.resolve({
        result: { ok: false, reason: 'storage-unavailable' },
        snapshot: this.snapshot,
      });
    }

    return this.enqueue(async () => {
      if (this.closed) {
        return {
          result: { ok: false, reason: 'storage-unavailable' },
          snapshot: this.snapshot,
        };
      }

      let outcome: WorkspaceCommandOutcome | undefined;
      try {
        await withKeyedWriteTransaction(this.database, async (transaction) => {
          const current = await loadWorkspaceSnapshot(transaction);
          const decision = planWorkspaceCommand(current, command, {
            nowMs: this.dependencies.nowMs(),
            createId: this.dependencies.createId,
          });
          if (!decision.ok) {
            outcome = { result: decision.result, snapshot: current };
            return;
          }

          await applyMutation(transaction, decision.mutation);
          const committed = await loadWorkspaceSnapshot(transaction);
          outcome = { result: decision.result, snapshot: committed };
        });
      } catch {
        return { result: { ok: false, reason: 'write-failed' }, snapshot: this.snapshot };
      }

      if (!outcome) {
        return { result: { ok: false, reason: 'write-failed' }, snapshot: this.snapshot };
      }
      this.snapshot = outcome.snapshot;
      return outcome;
    });
  }

  loadSnapshot(): Promise<WorkspaceSnapshot> {
    return this.enqueue(async () => {
      if (this.closed) throw new Error('Workspace session is closed');
      this.snapshot = await loadWorkspaceSnapshot(this.database);
      return this.snapshot;
    });
  }

  close(): Promise<void> {
    if (this.closeRequested) return this.tail;
    this.closeRequested = true;
    return this.enqueue(async () => {
      if (this.closed) return;
      await this.database.closeAsync();
      this.closed = true;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export async function loadWorkspaceSnapshot(database: SQLiteDatabase): Promise<WorkspaceSnapshot> {
  const [messages, items] = await Promise.all([
    database.getAllAsync<MessageRow>(
      'SELECT id, author, body, created_at_ms FROM messages ORDER BY created_at_ms, id',
    ),
    database.getAllAsync<SharedItemRow>(
      `SELECT id, kind, title, detail, status, pinned, source_message_id, updated_at_ms
       FROM shared_items ORDER BY updated_at_ms DESC, id`,
    ),
  ]);
  return decodeWorkspaceSnapshot(messages, items);
}

async function applyMutation(database: SQLiteDatabase, mutation: WorkspaceMutation): Promise<void> {
  switch (mutation.type) {
    case 'insert-message':
      await expectOneChange(
        database.runAsync(
          'INSERT INTO messages(id, author, body, created_at_ms) VALUES (?, ?, ?, ?)',
          mutation.message.id,
          mutation.message.author,
          mutation.message.body,
          mutation.message.createdAtMs,
        ),
      );
      return;
    case 'insert-shared-item':
      await expectOneChange(
        database.runAsync(
          `INSERT INTO shared_items(
            id, kind, title, detail, status, pinned, source_message_id, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          mutation.item.id,
          mutation.item.kind,
          mutation.item.title,
          mutation.item.detail,
          mutation.item.status,
          mutation.item.pinned ? 1 : 0,
          mutation.item.sourceMessageId ?? null,
          mutation.item.updatedAtMs,
        ),
      );
      return;
    case 'update-shared-item':
      await expectOneChange(
        database.runAsync(
          'UPDATE shared_items SET title = ?, detail = ?, status = ?, updated_at_ms = ? WHERE id = ?',
          mutation.title,
          mutation.detail,
          mutation.status,
          mutation.updatedAtMs,
          mutation.itemId,
        ),
      );
      return;
    case 'change-shared-item-status':
      await expectOneChange(
        database.runAsync(
          'UPDATE shared_items SET status = ?, updated_at_ms = ? WHERE id = ?',
          mutation.status,
          mutation.updatedAtMs,
          mutation.itemId,
        ),
      );
      return;
    case 'delete-shared-item':
      await expectOneChange(
        database.runAsync('DELETE FROM shared_items WHERE id = ?', mutation.itemId),
      );
      return;
    default:
      return assertNever(mutation);
  }
}

async function expectOneChange(result: Promise<Readonly<{ changes: number }>>): Promise<void> {
  if ((await result).changes !== 1) throw new Error('Workspace mutation did not affect one row');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace mutation: ${String(value)}`);
}
