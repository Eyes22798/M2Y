import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { sha256Base64Url } from '../auth/canonical-request';
import { SERVER_CONFIG, type ServerConfig } from '../bootstrap/server-config';
import { PairingInviteRepository } from '../persistence/pairing-invite.repository';
import type { CreateInviteDto, PairingInviteKind } from './create-invite.dto';

const INVITE_LIFETIME_MS = 10 * 60_000;
const HANDSHAKE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export type CreateInviteResponse =
  | Readonly<{
      deepLink: string;
      expiresAtMs: number;
      inviteId: string;
      kind: 'qr-ticket';
      operationId: string;
      schemaVersion: 1;
      ticket: string;
    }>
  | Readonly<{
      code: string;
      expiresAtMs: number;
      inviteId: string;
      kind: 'handshake-code';
      operationId: string;
      schemaVersion: 1;
    }>;

@Injectable()
export class PairingInvitationService {
  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    private readonly repository: PairingInviteRepository,
  ) {}

  create(targetDeviceId: string, input: CreateInviteDto): CreateInviteResponse {
    const secret = this.deriveSecret(targetDeviceId, input.operationId, input.kind);
    const nowMs = Date.now();
    const record = this.repository.create(
      targetDeviceId,
      input.operationId,
      input.kind,
      sha256Base64Url(secret),
      nowMs,
      nowMs + INVITE_LIFETIME_MS,
    );
    if (input.kind === 'qr-ticket') {
      return Object.freeze({
        deepLink: `m2y://pair?ticket=${secret}`,
        expiresAtMs: record.expiresAtMs,
        inviteId: record.inviteId,
        kind: input.kind,
        operationId: record.operationId,
        schemaVersion: 1,
        ticket: secret,
      });
    }
    return Object.freeze({
      code: secret,
      expiresAtMs: record.expiresAtMs,
      inviteId: record.inviteId,
      kind: input.kind,
      operationId: record.operationId,
      schemaVersion: 1,
    });
  }

  consume(kind: PairingInviteKind, secret: string, nowMs = Date.now()): string {
    return this.repository.consume(kind, sha256Base64Url(secret), nowMs).targetDeviceId;
  }

  private deriveSecret(
    targetDeviceId: string,
    operationId: string,
    kind: PairingInviteKind,
  ): string {
    const digest = createHmac('sha256', this.config.inviteHashKey)
      .update(`M2Y-INVITE-V1\n${kind}\n${targetDeviceId}\n${operationId}`, 'utf8')
      .digest();
    if (kind === 'qr-ticket') {
      return digest.toString('base64url');
    }
    return [...digest.subarray(0, 8)].map((value) => HANDSHAKE_ALPHABET[value & 31]).join('');
  }
}
