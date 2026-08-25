import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { sha256Base64Url } from '../auth/canonical-request';
import { PairingServiceError } from '../http/pairing-service-error';
import type { PairingMethod, PreparePairRequestDto } from '../pairing/pair-request.dto';
import { DatabaseService } from './database.service';
import { IdentityRepository, type LeasedPublicBundle } from './identity.repository';
import { PairingInviteRepository } from './pairing-invite.repository';

export type PreparedPairRequest = Readonly<{
  expiresAtMs: number;
  method: PairingMethod;
  requestId: string;
  targetBundle: LeasedPublicBundle;
}>;

export type PairRequestMutation = Readonly<{
  eventCursor: number;
  operationId: string;
  pairId?: string;
  requestId: string;
  status: PairRequestStatus;
}>;

export type PairingEvent = Readonly<{
  cursor: number;
  eventId: string;
  packet?: string;
  requestId: string;
  status: PairRequestStatus;
  type: PairEventType;
}>;

type PairRequestStatus =
  | 'accepted'
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'pending'
  | 'prepared'
  | 'rejected'
  | 'verifying';

type PairEventType =
  'pair-cancel' | 'pair-expired' | 'pair-request' | 'pair-response' | 'pair-verify';

type PairRequestRow = Readonly<{
  expires_at_ms: number;
  method: PairingMethod;
  pair_id: string | null;
  request_id: string;
  requester_device_id: string;
  status: PairRequestStatus;
  target_device_id: string;
  target_verified_at_ms: number | null;
  requester_verified_at_ms: number | null;
}>;

type OperationRow = Readonly<{
  body_hash: string;
  device_id: string;
  event_cursor: number;
  operation_kind: string;
  request_id: string;
  result_status: PairRequestStatus;
}>;

@Injectable()
export class PairingRequestRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityRepository: IdentityRepository,
    private readonly inviteRepository: PairingInviteRepository,
  ) {}

  prepare(
    requesterDeviceId: string,
    input: PreparePairRequestDto,
    bodyHash: string,
    nowMs: number,
    expiresAtMs: number,
  ): PreparedPairRequest {
    const transaction = this.databaseService.connection.transaction(() => {
      const existing = this.databaseService.connection
        .prepare(
          `SELECT request_id, requester_device_id, target_device_id, method,
                  expires_at_ms, prepare_body_hash
           FROM pair_requests
           WHERE prepare_operation_id = ?`,
        )
        .get(input.operationId) as
        | {
            expires_at_ms: number;
            method: PairingMethod;
            prepare_body_hash: string;
            request_id: string;
            requester_device_id: string;
            target_device_id: string;
          }
        | undefined;
      if (existing !== undefined) {
        if (
          existing.requester_device_id !== requesterDeviceId ||
          existing.method !== input.method ||
          existing.prepare_body_hash !== bodyHash
        ) {
          throw new PairingServiceError('pairing-request-idempotency-conflict');
        }
        return Object.freeze({
          expiresAtMs: existing.expires_at_ms,
          method: existing.method,
          requestId: existing.request_id,
          targetBundle: this.identityRepository.leasePublicBundleInCurrentTransaction(
            existing.target_device_id,
            existing.request_id,
            nowMs,
            existing.expires_at_ms,
          ),
        });
      }

      const targetDeviceId = this.resolveTarget(input, nowMs);
      if (targetDeviceId === requesterDeviceId) {
        throw new PairingServiceError('pairing-target-unavailable');
      }
      this.assertNoActiveRelationship(requesterDeviceId, targetDeviceId);
      const requestId = randomUUID();
      const targetBundle = this.identityRepository.leasePublicBundleInCurrentTransaction(
        targetDeviceId,
        requestId,
        nowMs,
        expiresAtMs,
      );
      this.databaseService.connection
        .prepare(
          `INSERT INTO pair_requests(
             request_id, requester_device_id, target_device_id, method, status, expires_at_ms,
             request_packet, response_packet, requester_verified_at_ms, target_verified_at_ms,
             version, created_at_ms, prepare_operation_id, prepare_body_hash, pair_id
           ) VALUES (?, ?, ?, ?, 'prepared', ?, NULL, NULL, NULL, NULL, 1, ?, ?, ?, NULL)`,
        )
        .run(
          requestId,
          requesterDeviceId,
          targetDeviceId,
          input.method,
          expiresAtMs,
          nowMs,
          input.operationId,
          bodyHash,
        );
      return Object.freeze({
        expiresAtMs,
        method: input.method,
        requestId,
        targetBundle,
      });
    });
    return transaction.immediate();
  }

  submit(
    requesterDeviceId: string,
    requestId: string,
    operationId: string,
    bodyHash: string,
    packet: string,
    nowMs: number,
  ): PairRequestMutation {
    return this.mutate(operationId, requesterDeviceId, requestId, 'submit', bodyHash, nowMs, () => {
      const request = this.requireRequest(requestId, nowMs);
      this.assertActor(request.requester_device_id, requesterDeviceId);
      this.assertState(request.status, ['prepared']);
      const consumedPreKey = this.databaseService.connection
        .prepare(
          `UPDATE one_time_prekeys
           SET consumed_at_ms = ?
           WHERE device_id = ? AND lease_request_id = ? AND consumed_at_ms IS NULL`,
        )
        .run(nowMs, request.target_device_id, requestId);
      if (consumedPreKey.changes !== 1) {
        throw new PairingServiceError('pairing-request-state-conflict');
      }
      this.databaseService.connection
        .prepare(
          `UPDATE pair_requests SET request_packet = ?, status = 'pending' WHERE request_id = ?`,
        )
        .run(packet, requestId);
      return this.createEvent(
        request.target_device_id,
        requestId,
        'pair-request',
        packet,
        'pending',
        operationId,
        nowMs,
      );
    });
  }

  respond(
    targetDeviceId: string,
    requestId: string,
    operationId: string,
    bodyHash: string,
    action: 'accept' | 'reject',
    packet: string,
    nowMs: number,
  ): PairRequestMutation {
    return this.mutate(
      operationId,
      targetDeviceId,
      requestId,
      `respond:${action}`,
      bodyHash,
      nowMs,
      () => {
        const request = this.requireRequest(requestId, nowMs);
        this.assertActor(request.target_device_id, targetDeviceId);
        this.assertState(request.status, ['pending']);
        const status: PairRequestStatus = action === 'accept' ? 'accepted' : 'rejected';
        this.databaseService.connection
          .prepare('UPDATE pair_requests SET response_packet = ?, status = ? WHERE request_id = ?')
          .run(packet, status, requestId);
        return this.createEvent(
          request.requester_device_id,
          requestId,
          'pair-response',
          packet,
          status,
          operationId,
          nowMs,
        );
      },
    );
  }

  cancel(
    requesterDeviceId: string,
    requestId: string,
    operationId: string,
    bodyHash: string,
    packet: string,
    nowMs: number,
  ): PairRequestMutation {
    return this.mutate(operationId, requesterDeviceId, requestId, 'cancel', bodyHash, nowMs, () => {
      const request = this.requireRequest(requestId, nowMs);
      this.assertActor(request.requester_device_id, requesterDeviceId);
      this.assertState(request.status, ['prepared', 'pending', 'accepted', 'verifying']);
      this.databaseService.connection
        .prepare(`UPDATE pair_requests SET status = 'cancelled' WHERE request_id = ?`)
        .run(requestId);
      return this.createEvent(
        request.target_device_id,
        requestId,
        'pair-cancel',
        packet,
        'cancelled',
        operationId,
        nowMs,
      );
    });
  }

  verify(
    deviceId: string,
    requestId: string,
    operationId: string,
    bodyHash: string,
    packet: string,
    nowMs: number,
  ): PairRequestMutation {
    return this.mutate(operationId, deviceId, requestId, 'verify', bodyHash, nowMs, () => {
      const request = this.requireRequest(requestId, nowMs);
      const isRequester = request.requester_device_id === deviceId;
      const isTarget = request.target_device_id === deviceId;
      if (!isRequester && !isTarget) {
        throw new PairingServiceError('pairing-request-forbidden');
      }
      this.assertState(request.status, ['accepted', 'verifying']);
      if (
        (isRequester && request.requester_verified_at_ms !== null) ||
        (isTarget && request.target_verified_at_ms !== null)
      ) {
        throw new PairingServiceError('pairing-request-state-conflict');
      }
      const timestampColumn = isRequester ? 'requester_verified_at_ms' : 'target_verified_at_ms';
      this.databaseService.connection
        .prepare(`UPDATE pair_requests SET ${timestampColumn} = ? WHERE request_id = ?`)
        .run(nowMs, requestId);

      const refreshed = this.requireRequest(requestId, nowMs);
      const bothVerified =
        refreshed.requester_verified_at_ms !== null && refreshed.target_verified_at_ms !== null;
      let status: PairRequestStatus = 'verifying';
      let pairId: string | undefined;
      if (bothVerified) {
        this.assertNoActiveRelationship(refreshed.requester_device_id, refreshed.target_device_id);
        pairId = randomUUID();
        const insertMember = this.databaseService.connection.prepare(
          `INSERT INTO active_relationship_members(device_id, pair_id, activated_at_ms)
           VALUES (?, ?, ?)`,
        );
        insertMember.run(refreshed.requester_device_id, pairId, nowMs);
        insertMember.run(refreshed.target_device_id, pairId, nowMs);
        this.databaseService.connection
          .prepare(`UPDATE pair_requests SET status = 'active', pair_id = ? WHERE request_id = ?`)
          .run(pairId, requestId);
        status = 'active';
      } else {
        this.databaseService.connection
          .prepare(`UPDATE pair_requests SET status = 'verifying' WHERE request_id = ?`)
          .run(requestId);
      }
      const peerDeviceId = isRequester ? request.target_device_id : request.requester_device_id;
      const event = this.createEvent(
        peerDeviceId,
        requestId,
        'pair-verify',
        packet,
        status,
        operationId,
        nowMs,
      );
      return pairId === undefined ? event : Object.freeze({ ...event, pairId });
    });
  }

  listEvents(deviceId: string, afterCursor: number, nowMs: number): readonly PairingEvent[] {
    const transaction = this.databaseService.connection.transaction(() => {
      this.expireRequests(nowMs);
      const rows = this.databaseService.connection
        .prepare(
          `SELECT event_cursor, event_id, request_id, event_type, packet, request_status
           FROM pair_events
           WHERE device_id = ? AND event_cursor > ?
           ORDER BY event_cursor ASC
           LIMIT 100`,
        )
        .all(deviceId, afterCursor) as EventRow[];
      return Object.freeze(rows.map(eventFromRow));
    });
    return transaction.immediate();
  }

  private mutate(
    operationId: string,
    deviceId: string,
    requestId: string,
    operationKind: string,
    bodyHash: string,
    nowMs: number,
    mutation: () => PairRequestMutation,
  ): PairRequestMutation {
    const transaction = this.databaseService.connection.transaction(() => {
      const existing = this.findOperation(operationId);
      if (existing !== undefined) {
        if (
          existing.device_id !== deviceId ||
          existing.request_id !== requestId ||
          existing.operation_kind !== operationKind ||
          existing.body_hash !== bodyHash
        ) {
          throw new PairingServiceError('pairing-request-idempotency-conflict');
        }
        const pair = this.findRequest(requestId);
        return Object.freeze({
          eventCursor: existing.event_cursor,
          operationId,
          ...(existing.result_status === 'active' && pair.pair_id !== null
            ? { pairId: pair.pair_id }
            : {}),
          requestId,
          status: existing.result_status,
        });
      }
      const result = mutation();
      this.databaseService.connection
        .prepare(
          `INSERT INTO pair_request_operations(
             operation_id, device_id, request_id, operation_kind, body_hash,
             result_status, event_cursor, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          operationId,
          deviceId,
          requestId,
          operationKind,
          bodyHash,
          result.status,
          result.eventCursor,
          nowMs,
        );
      return result;
    });
    return transaction.immediate();
  }

  private createEvent(
    deviceId: string,
    requestId: string,
    eventType: PairEventType,
    packet: string | null,
    requestStatus: PairRequestStatus,
    operationId: string | null,
    nowMs: number,
  ): PairRequestMutation {
    const result = this.databaseService.connection
      .prepare(
        `INSERT INTO pair_events(
           event_id, device_id, request_id, event_type, packet,
           request_status, operation_id, created_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), deviceId, requestId, eventType, packet, requestStatus, operationId, nowMs);
    return Object.freeze({
      eventCursor: Number(result.lastInsertRowid),
      operationId: operationId ?? randomUUID(),
      requestId,
      status: requestStatus,
    });
  }

  private expireRequests(nowMs: number): void {
    const expired = this.databaseService.connection
      .prepare(
        `SELECT request_id, requester_device_id, target_device_id
         FROM pair_requests
         WHERE expires_at_ms <= ? AND status IN ('prepared', 'pending', 'accepted', 'verifying')`,
      )
      .all(nowMs) as {
      request_id: string;
      requester_device_id: string;
      target_device_id: string;
    }[];
    for (const request of expired) {
      this.databaseService.connection
        .prepare(`UPDATE pair_requests SET status = 'expired' WHERE request_id = ?`)
        .run(request.request_id);
      this.createEvent(
        request.requester_device_id,
        request.request_id,
        'pair-expired',
        null,
        'expired',
        null,
        nowMs,
      );
      this.createEvent(
        request.target_device_id,
        request.request_id,
        'pair-expired',
        null,
        'expired',
        null,
        nowMs,
      );
    }
  }

  private findOperation(operationId: string): OperationRow | undefined {
    return this.databaseService.connection
      .prepare(
        `SELECT device_id, request_id, operation_kind, body_hash, result_status, event_cursor
         FROM pair_request_operations
         WHERE operation_id = ?`,
      )
      .get(operationId) as OperationRow | undefined;
  }

  private requireRequest(requestId: string, nowMs: number): PairRequestRow {
    const row = this.findRequest(requestId);
    if (
      row.expires_at_ms <= nowMs &&
      ['prepared', 'pending', 'accepted', 'verifying'].includes(row.status)
    ) {
      this.databaseService.connection
        .prepare(`UPDATE pair_requests SET status = 'expired' WHERE request_id = ?`)
        .run(requestId);
      throw new PairingServiceError('pairing-request-state-conflict');
    }
    return row;
  }

  private findRequest(requestId: string): PairRequestRow {
    const row = this.databaseService.connection
      .prepare(
        `SELECT request_id, requester_device_id, target_device_id, method, status,
                expires_at_ms, requester_verified_at_ms, target_verified_at_ms, pair_id
         FROM pair_requests
         WHERE request_id = ?`,
      )
      .get(requestId) as PairRequestRow | undefined;
    if (row === undefined) {
      throw new PairingServiceError('pairing-request-unavailable');
    }
    return row;
  }

  private resolveTarget(input: PreparePairRequestDto, nowMs: number): string {
    switch (input.method) {
      case 'm2y-id': {
        if (input.m2yId === undefined || input.ticket !== undefined || input.code !== undefined) {
          throw new PairingServiceError('request-invalid');
        }
        const deviceId = this.identityRepository.findDeviceIdByM2yId(input.m2yId);
        if (deviceId === undefined) {
          throw new PairingServiceError('pairing-target-unavailable');
        }
        return deviceId;
      }
      case 'qr-ticket':
        if (input.ticket === undefined || input.m2yId !== undefined || input.code !== undefined) {
          throw new PairingServiceError('request-invalid');
        }
        return this.inviteRepository.consumeInCurrentTransaction(
          'qr-ticket',
          sha256Base64Url(input.ticket),
          nowMs,
        ).targetDeviceId;
      case 'handshake-code':
        if (input.code === undefined || input.m2yId !== undefined || input.ticket !== undefined) {
          throw new PairingServiceError('request-invalid');
        }
        return this.inviteRepository.consumeInCurrentTransaction(
          'handshake-code',
          sha256Base64Url(input.code),
          nowMs,
        ).targetDeviceId;
      default:
        throw new PairingServiceError('request-invalid');
    }
  }

  private assertNoActiveRelationship(firstDeviceId: string, secondDeviceId: string): void {
    const row = this.databaseService.connection
      .prepare(
        `SELECT 1 AS found
         FROM active_relationship_members
         WHERE device_id IN (?, ?)
         LIMIT 1`,
      )
      .get(firstDeviceId, secondDeviceId) as { found: 1 } | undefined;
    if (row !== undefined) {
      throw new PairingServiceError('pairing-relationship-conflict');
    }
  }

  private assertActor(expectedDeviceId: string, actualDeviceId: string): void {
    if (expectedDeviceId !== actualDeviceId) {
      throw new PairingServiceError('pairing-request-forbidden');
    }
  }

  private assertState(actual: PairRequestStatus, expected: readonly PairRequestStatus[]): void {
    if (!expected.includes(actual)) {
      throw new PairingServiceError('pairing-request-state-conflict');
    }
  }
}

type EventRow = Readonly<{
  event_cursor: number;
  event_id: string;
  event_type: PairEventType;
  packet: string | null;
  request_id: string;
  request_status: PairRequestStatus;
}>;

function eventFromRow(row: EventRow): PairingEvent {
  return Object.freeze({
    cursor: row.event_cursor,
    eventId: row.event_id,
    ...(row.packet === null ? {} : { packet: row.packet }),
    requestId: row.request_id,
    status: row.request_status,
    type: row.event_type,
  });
}
