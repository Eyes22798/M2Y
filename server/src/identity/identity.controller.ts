import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBody,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { HeaderBag } from '../auth/device-auth-headers';
import {
  AUTHENTICATED_DEVICE_ID,
  AUTHENTICATED_DEVICE_REQUEST,
  DeviceSignatureGuard,
  type SignedHttpRequest,
} from '../auth/device-signature.guard';
import { PairingServiceError } from '../http/pairing-service-error';
import {
  type IdentityStatusResponse,
  IdentityService,
  type RegisterIdentityResponse,
  type ReplenishPreKeysResponse,
} from './identity.service';
import { RegisterIdentityDto } from './register-identity.dto';
import { ReplenishPreKeysDto } from './replenish-prekeys.dto';

@Controller('v1/identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(
    @Body() input: RegisterIdentityDto,
    @Headers() headers: HeaderBag,
    @RawBody() rawBody: Buffer | undefined,
  ): RegisterIdentityResponse {
    return this.identityService.register(input, headers, rawBody);
  }

  @Get('status')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(DeviceSignatureGuard)
  status(@Req() request: SignedHttpRequest): IdentityStatusResponse {
    const deviceId = request[AUTHENTICATED_DEVICE_ID];
    if (deviceId === undefined) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return this.identityService.status(deviceId);
  }

  @Post('prekeys/replenish')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseGuards(DeviceSignatureGuard)
  replenishPreKeys(
    @Body() input: ReplenishPreKeysDto,
    @Req() request: SignedHttpRequest,
  ): ReplenishPreKeysResponse {
    const authenticated = request[AUTHENTICATED_DEVICE_REQUEST];
    if (authenticated === undefined) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return this.identityService.replenishPreKeys(
      authenticated.deviceId,
      authenticated.bodyHash,
      input,
    );
  }
}
