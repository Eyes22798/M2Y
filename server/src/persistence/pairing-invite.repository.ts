import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PairingServiceError } from '../http/pairing-service-error';
import type { PairingInviteKind } from '../pairing/create-invite.dto';
import { DatabaseService } from './database.service';

export type PairingInviteRecord = Readonly<{
  expiresAtMs: number;
  inviteId: string;
  kind: PairingInviteKind;
  operationId: string;
  targetDeviceId: string;
}>;

@Injectable()
export class PairingInviteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  create(
    targetDeviceId: string,
    operationId: string,
    kind: PairingInviteKind,
    secretHash: string,
    nowMs: number,
    expiresAtMs: number,
  ): PairingInviteRecord {
    const transaction = this.databaseService.connection.transaction(() => {
      const existing = this.databaseService.connection
        .prepare(
          `SELECT invite_id, target_device_id, operation_id, invite_kind, expires_at_ms
           FROM pair_invites
           WHERE operation_id = ?`,
        )
        .get(operationId) as InviteRow | undefined;
      if (existing !== undefined) {
        if (existing.target_device_id !== targetDeviceId || existing.invite_kind !== kind) {
          throw new PairingServiceError('pairing-invite-idempotency-conflict');
        }
        return inviteFromRow(existing);
      }

      const target = this.databaseService.connection
        .prepare(`SELECT 1 AS found FROM devices WHERE device_id = ? AND status = 'active'`)
        .get(targetDeviceId) as { found: 1 } | undefined;
      if (target === undefined) {
        throw new PairingServiceError('identity-not-found');
      }
      const relationship = this.databaseService.connection
        .prepare('SELECT 1 AS found FROM active_relationship_members WHERE device_id = ?')
        .get(targetDeviceId) as { found: 1 } | undefined;
      if (relationship !== undefined) {
        throw new PairingServiceError('pairing-relationship-conflict');
      }

      const inviteId = randomUUID();
      this.databaseService.connection
        .prepare(
          `INSERT INTO pair_invites(
             invite_id, target_device_id, code_hash, expires_at_ms, consumed_at_ms,
             created_at_ms, operation_id, invite_kind, ticket_hash
           ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
          inviteId,
          targetDeviceId,
          kind === 'handshake-code' ? secretHash : null,
          expiresAtMs,
          nowMs,
          operationId,
          kind,
          kind === 'qr-ticket' ? secretHash : null,
        );
      return Object.freeze({ expiresAtMs, inviteId, kind, operationId, targetDeviceId });
    });
    return transaction.immediate();
  }

  consume(kind: PairingInviteKind, secretHash: string, nowMs: number): PairingInviteRecord {
    const transaction = this.databaseService.connection.transaction(() =>
      this.consumeInCurrentTransaction(kind, secretHash, nowMs),
    );
    return transaction.immediate();
  }

  /** Called by pairing prepare while it owns the surrounding IMMEDIATE transaction. */
  consumeInCurrentTransaction(
    kind: PairingInviteKind,
    secretHash: string,
    nowMs: number,
  ): PairingInviteRecord {
    const hashColumn = kind === 'qr-ticket' ? 'ticket_hash' : 'code_hash';
    const row = this.databaseService.connection
      .prepare(
        `SELECT invite_id, target_device_id, operation_id, invite_kind, expires_at_ms
           FROM pair_invites
           WHERE ${hashColumn} = ?
             AND invite_kind = ?
             AND consumed_at_ms IS NULL
             AND expires_at_ms > ?`,
      )
      .get(secretHash, kind, nowMs) as InviteRow | undefined;
    if (row === undefined) {
      throw new PairingServiceError('pairing-target-unavailable');
    }
    const update = this.databaseService.connection
      .prepare(
        `UPDATE pair_invites
           SET consumed_at_ms = ?
           WHERE invite_id = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`,
      )
      .run(nowMs, row.invite_id, nowMs);
    if (update.changes !== 1) {
      throw new PairingServiceError('pairing-target-unavailable');
    }
    return inviteFromRow(row);
  }
}

type InviteRow = Readonly<{
  expires_at_ms: number;
  invite_id: string;
  invite_kind: PairingInviteKind;
  operation_id: string;
  target_device_id: string;
}>;

function inviteFromRow(row: InviteRow): PairingInviteRecord {
  return Object.freeze({
    expiresAtMs: row.expires_at_ms,
    inviteId: row.invite_id,
    kind: row.invite_kind,
    operationId: row.operation_id,
    targetDeviceId: row.target_device_id,
  });
}
