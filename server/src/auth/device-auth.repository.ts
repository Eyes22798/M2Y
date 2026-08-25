import { Injectable } from '@nestjs/common';
import { PairingServiceError } from '../http/pairing-service-error';
import { DatabaseService } from '../persistence/database.service';
import { isSqliteConstraintError } from '../persistence/sqlite-error';

@Injectable()
export class DeviceAuthRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  findPublicKey(deviceId: string): string | undefined {
    const row = this.databaseService.connection
      .prepare(
        `SELECT auth_public_key
         FROM devices
         WHERE device_id = ? AND status = 'active'`,
      )
      .get(deviceId) as { auth_public_key: string } | undefined;
    return row?.auth_public_key;
  }

  consumeNonce(deviceId: string, nonceHash: string, expiresAtMs: number, nowMs: number): void {
    try {
      this.databaseService.connection.transaction(() => {
        this.databaseService.connection
          .prepare('DELETE FROM request_nonces WHERE expires_at_ms <= ?')
          .run(nowMs);
        this.databaseService.connection
          .prepare(
            `INSERT INTO request_nonces(device_id, nonce_hash, expires_at_ms)
             VALUES (?, ?, ?)`,
          )
          .run(deviceId, nonceHash, expiresAtMs);
      })();
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw new PairingServiceError('device-auth-nonce-replayed');
      }
      throw error;
    }
  }
}
