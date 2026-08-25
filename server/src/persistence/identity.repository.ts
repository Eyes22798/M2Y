import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PairingServiceError } from '../http/pairing-service-error';
import type { RegisterIdentityDto } from '../identity/register-identity.dto';
import { DatabaseService } from './database.service';
import { isSqliteConstraintError } from './sqlite-error';

export type RegistrationReceipt = Readonly<{
  deviceId: string;
  m2yId: string;
  receiptId: string;
  registeredAtMs: number;
}>;

export type RegisteredIdentityStatus = Readonly<{
  deviceId: string;
  m2yId: string;
  oneTimePreKeyCount: number;
  registeredAtMs: number;
  stableIdentityId: string;
}>;

export type LeasedPublicBundle = Readonly<{
  deviceId: string;
  identityPublicKey: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  m2yId: string;
  oneTimePreKey: Readonly<{ id: number; publicKey: string }>;
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  stableIdentityId: string;
}>;

export type PreKeyReplenishment = Readonly<{
  addedCount: number;
  operationId: string;
}>;

type ExistingRegistration = Readonly<{
  body_hash: string;
  created_at_ms: number;
  device_id: string;
  m2y_id: string;
  receipt_id: string;
}>;

@Injectable()
export class IdentityRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  register(
    input: RegisterIdentityDto,
    authentication: Readonly<{
      bodyHash: string;
      nonceExpiresAtMs: number;
      nonceHash: string;
    }>,
    nowMs: number,
  ): RegistrationReceipt {
    const transaction = this.databaseService.connection.transaction(() => {
      const existing = this.findRegistration(input.operationId);
      if (existing !== undefined) {
        if (
          existing.body_hash !== authentication.bodyHash ||
          existing.device_id !== input.deviceId ||
          existing.m2y_id !== input.m2yId
        ) {
          throw new PairingServiceError('identity-registration-idempotency-conflict');
        }
        this.insertNonce(
          input.deviceId,
          authentication.nonceHash,
          authentication.nonceExpiresAtMs,
          nowMs,
        );
        return receiptFromRow(existing);
      }

      this.assertIdentifiersAvailable(input);
      this.databaseService.connection
        .prepare(
          `INSERT INTO identities(m2y_id, stable_identity_id, status, created_at_ms)
           VALUES (?, ?, 'active', ?)`,
        )
        .run(input.m2yId, input.stableIdentityId, nowMs);
      this.databaseService.connection
        .prepare(
          `INSERT INTO devices(
             device_id, m2y_id, auth_public_key, registration_id, identity_public_key,
             signed_prekey_public, signed_prekey_signature, kyber_prekey_public,
             kyber_prekey_signature, status, created_at_ms, signed_prekey_id, kyber_prekey_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          input.deviceId,
          input.m2yId,
          input.authPublicKey,
          input.registrationId,
          input.identityPublicKey,
          input.signedPreKeyPublic,
          input.signedPreKeySignature,
          input.kyberPreKeyPublic,
          input.kyberPreKeySignature,
          nowMs,
          input.signedPreKeyId,
          input.kyberPreKeyId,
        );

      const insertPreKey = this.databaseService.connection.prepare(
        `INSERT INTO one_time_prekeys(device_id, prekey_id, public_key)
         VALUES (?, ?, ?)`,
      );
      for (const preKey of input.oneTimePreKeys) {
        insertPreKey.run(input.deviceId, preKey.id, preKey.publicKey);
      }

      const receiptId = randomUUID();
      this.databaseService.connection
        .prepare(
          `INSERT INTO identity_registration_operations(
             operation_id, device_id, m2y_id, body_hash, receipt_id, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.operationId,
          input.deviceId,
          input.m2yId,
          authentication.bodyHash,
          receiptId,
          nowMs,
        );
      this.insertNonce(
        input.deviceId,
        authentication.nonceHash,
        authentication.nonceExpiresAtMs,
        nowMs,
      );
      return Object.freeze({
        deviceId: input.deviceId,
        m2yId: input.m2yId,
        receiptId,
        registeredAtMs: nowMs,
      });
    });

    return transaction.immediate();
  }

  status(deviceId: string): RegisteredIdentityStatus {
    const row = this.databaseService.connection
      .prepare(
        `SELECT
           d.device_id,
           d.m2y_id,
           i.stable_identity_id,
           i.created_at_ms,
           COUNT(p.prekey_id) AS one_time_prekey_count
         FROM devices d
         JOIN identities i ON i.m2y_id = d.m2y_id
         LEFT JOIN one_time_prekeys p
           ON p.device_id = d.device_id AND p.consumed_at_ms IS NULL
         WHERE d.device_id = ? AND d.status = 'active' AND i.status = 'active'
         GROUP BY d.device_id, d.m2y_id, i.stable_identity_id, i.created_at_ms`,
      )
      .get(deviceId) as
      | {
          created_at_ms: number;
          device_id: string;
          m2y_id: string;
          one_time_prekey_count: number;
          stable_identity_id: string;
        }
      | undefined;
    if (row === undefined) {
      throw new PairingServiceError('identity-not-found');
    }
    return Object.freeze({
      deviceId: row.device_id,
      m2yId: row.m2y_id,
      oneTimePreKeyCount: row.one_time_prekey_count,
      registeredAtMs: row.created_at_ms,
      stableIdentityId: row.stable_identity_id,
    });
  }

  findDeviceIdByM2yId(m2yId: string): string | undefined {
    const row = this.databaseService.connection
      .prepare(
        `SELECT d.device_id
         FROM devices d
         JOIN identities i ON i.m2y_id = d.m2y_id
         WHERE d.m2y_id = ? AND d.status = 'active' AND i.status = 'active'`,
      )
      .get(m2yId) as { device_id: string } | undefined;
    return row?.device_id;
  }

  leasePublicBundle(
    deviceId: string,
    leaseRequestId: string,
    nowMs: number,
    leaseExpiresAtMs: number,
  ): LeasedPublicBundle {
    const transaction = this.databaseService.connection.transaction(() =>
      this.leasePublicBundleInCurrentTransaction(deviceId, leaseRequestId, nowMs, leaseExpiresAtMs),
    );
    return transaction.immediate();
  }

  /** Called by pairing prepare while it owns the surrounding IMMEDIATE transaction. */
  leasePublicBundleInCurrentTransaction(
    deviceId: string,
    leaseRequestId: string,
    nowMs: number,
    leaseExpiresAtMs: number,
  ): LeasedPublicBundle {
    const device = this.databaseService.connection
      .prepare(
        `SELECT
             d.device_id, d.m2y_id, d.registration_id, d.identity_public_key,
             d.signed_prekey_id, d.signed_prekey_public, d.signed_prekey_signature,
             d.kyber_prekey_id, d.kyber_prekey_public, d.kyber_prekey_signature,
             i.stable_identity_id
           FROM devices d
           JOIN identities i ON i.m2y_id = d.m2y_id
           WHERE d.device_id = ? AND d.status = 'active' AND i.status = 'active'`,
      )
      .get(deviceId) as PublicDeviceRow | undefined;
    if (device === undefined) {
      throw new PairingServiceError('identity-not-found');
    }
    if (device.signed_prekey_id === null || device.kyber_prekey_id === null) {
      throw new PairingServiceError('internal-error');
    }
    const completeDevice = {
      ...device,
      kyber_prekey_id: device.kyber_prekey_id,
      signed_prekey_id: device.signed_prekey_id,
    };

    const preKey = this.databaseService.connection
      .prepare(
        `SELECT prekey_id, public_key
           FROM one_time_prekeys
           WHERE device_id = ?
             AND consumed_at_ms IS NULL
             AND (lease_request_id = ? OR lease_request_id IS NULL OR lease_expires_at_ms <= ?)
           ORDER BY CASE WHEN lease_request_id = ? THEN 0 ELSE 1 END, prekey_id
           LIMIT 1`,
      )
      .get(deviceId, leaseRequestId, nowMs, leaseRequestId) as
      { prekey_id: number; public_key: string } | undefined;
    if (preKey === undefined) {
      throw new PairingServiceError('identity-prekey-unavailable');
    }
    this.databaseService.connection
      .prepare(
        `UPDATE one_time_prekeys
           SET lease_request_id = ?, lease_expires_at_ms = ?
           WHERE device_id = ? AND prekey_id = ? AND consumed_at_ms IS NULL`,
      )
      .run(leaseRequestId, leaseExpiresAtMs, deviceId, preKey.prekey_id);

    return bundleFromRows(completeDevice, preKey);
  }

  replenishPreKeys(
    deviceId: string,
    operationId: string,
    bodyHash: string,
    oneTimePreKeys: readonly Readonly<{ id: number; publicKey: string }>[],
    nowMs: number,
  ): PreKeyReplenishment {
    const transaction = this.databaseService.connection.transaction(() => {
      const existing = this.databaseService.connection
        .prepare(
          `SELECT device_id, body_hash, added_count
           FROM prekey_replenishment_operations
           WHERE operation_id = ?`,
        )
        .get(operationId) as
        { added_count: number; body_hash: string; device_id: string } | undefined;
      if (existing !== undefined) {
        if (existing.device_id !== deviceId || existing.body_hash !== bodyHash) {
          throw new PairingServiceError('identity-registration-idempotency-conflict');
        }
        return Object.freeze({ addedCount: existing.added_count, operationId });
      }

      const device = this.databaseService.connection
        .prepare(`SELECT 1 AS found FROM devices WHERE device_id = ? AND status = 'active'`)
        .get(deviceId) as { found: 1 } | undefined;
      if (device === undefined) {
        throw new PairingServiceError('identity-not-found');
      }

      const findPreKey = this.databaseService.connection.prepare(
        `SELECT 1 AS found FROM one_time_prekeys WHERE device_id = ? AND prekey_id = ?`,
      );
      const insertPreKey = this.databaseService.connection.prepare(
        `INSERT INTO one_time_prekeys(device_id, prekey_id, public_key)
         VALUES (?, ?, ?)`,
      );
      for (const preKey of oneTimePreKeys) {
        if (findPreKey.get(deviceId, preKey.id) !== undefined) {
          throw new PairingServiceError('identity-prekey-conflict');
        }
        insertPreKey.run(deviceId, preKey.id, preKey.publicKey);
      }
      this.databaseService.connection
        .prepare(
          `INSERT INTO prekey_replenishment_operations(
             operation_id, device_id, body_hash, added_count, created_at_ms
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(operationId, deviceId, bodyHash, oneTimePreKeys.length, nowMs);
      return Object.freeze({ addedCount: oneTimePreKeys.length, operationId });
    });
    return transaction.immediate();
  }

  private assertIdentifiersAvailable(input: RegisterIdentityDto): void {
    if (this.exists('identities', 'm2y_id', input.m2yId)) {
      throw new PairingServiceError('identity-m2y-id-collision');
    }
    if (this.exists('identities', 'stable_identity_id', input.stableIdentityId)) {
      throw new PairingServiceError('identity-stable-id-collision');
    }
    if (this.exists('devices', 'device_id', input.deviceId)) {
      throw new PairingServiceError('identity-device-id-collision');
    }
  }

  private exists(table: 'devices' | 'identities', column: string, value: string): boolean {
    const row = this.databaseService.connection
      .prepare(`SELECT 1 AS found FROM ${table} WHERE ${column} = ?`)
      .get(value) as { found: 1 } | undefined;
    return row !== undefined;
  }

  private findRegistration(operationId: string): ExistingRegistration | undefined {
    return this.databaseService.connection
      .prepare(
        `SELECT device_id, m2y_id, body_hash, receipt_id, created_at_ms
         FROM identity_registration_operations
         WHERE operation_id = ?`,
      )
      .get(operationId) as ExistingRegistration | undefined;
  }

  private insertNonce(
    deviceId: string,
    nonceHash: string,
    expiresAtMs: number,
    nowMs: number,
  ): void {
    this.databaseService.connection
      .prepare('DELETE FROM request_nonces WHERE expires_at_ms <= ?')
      .run(nowMs);
    try {
      this.databaseService.connection
        .prepare(
          `INSERT INTO request_nonces(device_id, nonce_hash, expires_at_ms)
           VALUES (?, ?, ?)`,
        )
        .run(deviceId, nonceHash, expiresAtMs);
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new PairingServiceError('device-auth-nonce-replayed');
      }
      throw error;
    }
  }
}

type PublicDeviceRow = Readonly<{
  device_id: string;
  identity_public_key: string;
  kyber_prekey_id: number | null;
  kyber_prekey_public: string;
  kyber_prekey_signature: string;
  m2y_id: string;
  registration_id: number;
  signed_prekey_id: number | null;
  signed_prekey_public: string;
  signed_prekey_signature: string;
  stable_identity_id: string;
}>;

function bundleFromRows(
  device: PublicDeviceRow & Readonly<{ kyber_prekey_id: number; signed_prekey_id: number }>,
  preKey: Readonly<{ prekey_id: number; public_key: string }>,
): LeasedPublicBundle {
  return Object.freeze({
    deviceId: device.device_id,
    identityPublicKey: device.identity_public_key,
    kyberPreKeyId: device.kyber_prekey_id,
    kyberPreKeyPublic: device.kyber_prekey_public,
    kyberPreKeySignature: device.kyber_prekey_signature,
    m2yId: device.m2y_id,
    oneTimePreKey: Object.freeze({ id: preKey.prekey_id, publicKey: preKey.public_key }),
    registrationId: device.registration_id,
    signedPreKeyId: device.signed_prekey_id,
    signedPreKeyPublic: device.signed_prekey_public,
    signedPreKeySignature: device.signed_prekey_signature,
    stableIdentityId: device.stable_identity_id,
  });
}

function receiptFromRow(row: ExistingRegistration): RegistrationReceipt {
  return Object.freeze({
    deviceId: row.device_id,
    m2yId: row.m2y_id,
    receiptId: row.receipt_id,
    registeredAtMs: row.created_at_ms,
  });
}
