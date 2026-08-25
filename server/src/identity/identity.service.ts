import { Injectable } from '@nestjs/common';

import { DeviceAuthService } from '../auth/device-auth.service';
import type { HeaderBag } from '../auth/device-auth-headers';
import { PairingServiceError } from '../http/pairing-service-error';
import { IdentityRepository } from '../persistence/identity.repository';
import type { RegisterIdentityDto } from './register-identity.dto';
import type { ReplenishPreKeysDto } from './replenish-prekeys.dto';

export type RegisterIdentityResponse = Readonly<{
  deviceId: string;
  m2yId: string;
  receiptId: string;
  registeredAtMs: number;
  schemaVersion: 1;
  status: 'registered';
}>;

export type IdentityStatusResponse = Readonly<{
  deviceId: string;
  m2yId: string;
  oneTimePreKeyCount: number;
  registeredAtMs: number;
  schemaVersion: 1;
  stableIdentityId: string;
  status: 'registered';
}>;

export type ReplenishPreKeysResponse = Readonly<{
  addedCount: number;
  operationId: string;
  schemaVersion: 1;
  status: 'replenished';
}>;

@Injectable()
export class IdentityService {
  constructor(
    private readonly deviceAuthService: DeviceAuthService,
    private readonly identityRepository: IdentityRepository,
  ) {}

  register(
    input: RegisterIdentityDto,
    headers: HeaderBag,
    rawBody: Buffer | undefined,
  ): RegisterIdentityResponse {
    if (rawBody === undefined || rawBody.length === 0) {
      throw new PairingServiceError('request-body-required');
    }
    if (rawBody.length > 32 * 1024) {
      throw new PairingServiceError('request-body-too-large');
    }
    const nowMs = Date.now();
    const authentication = this.deviceAuthService.verifySelfSignedRequest({
      body: rawBody,
      deviceId: input.deviceId,
      headers,
      method: 'POST',
      nowMs,
      publicKey: input.authPublicKey,
      requestTarget: '/v1/identity/register',
    });
    const receipt = this.identityRepository.register(input, authentication, nowMs);
    return Object.freeze({ ...receipt, schemaVersion: 1, status: 'registered' });
  }

  status(deviceId: string): IdentityStatusResponse {
    const status = this.identityRepository.status(deviceId);
    return Object.freeze({ ...status, schemaVersion: 1, status: 'registered' });
  }

  replenishPreKeys(
    deviceId: string,
    bodyHash: string,
    input: ReplenishPreKeysDto,
  ): ReplenishPreKeysResponse {
    const result = this.identityRepository.replenishPreKeys(
      deviceId,
      input.operationId,
      bodyHash,
      input.oneTimePreKeys,
      Date.now(),
    );
    return Object.freeze({ ...result, schemaVersion: 1, status: 'replenished' });
  }
}
