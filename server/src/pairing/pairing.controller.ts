import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  AUTHENTICATED_DEVICE_ID,
  AUTHENTICATED_DEVICE_REQUEST,
  DeviceSignatureGuard,
  type SignedHttpRequest,
} from '../auth/device-signature.guard';
import { PairingServiceError } from '../http/pairing-service-error';
import { CreateInviteDto } from './create-invite.dto';
import {
  PairingPacketOperationDto,
  PreparePairRequestDto,
  RespondPairRequestDto,
} from './pair-request.dto';
import { type CreateInviteResponse, PairingInvitationService } from './pairing-invitation.service';
import {
  type PairingEventsResponse,
  type PairRequestMutationResponse,
  PairingRequestService,
  type PreparePairRequestResponse,
} from './pairing-request.service';

@Controller('v1/pair')
@UseGuards(DeviceSignatureGuard)
export class PairingController {
  constructor(
    private readonly invitationService: PairingInvitationService,
    private readonly requestService: PairingRequestService,
  ) {}

  @Post('invites')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  createInvite(
    @Body() input: CreateInviteDto,
    @Req() request: SignedHttpRequest,
  ): CreateInviteResponse {
    const deviceId = request[AUTHENTICATED_DEVICE_ID];
    if (deviceId === undefined) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return this.invitationService.create(deviceId, input);
  }

  @Post('requests/prepare')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  prepareRequest(
    @Body() input: PreparePairRequestDto,
    @Req() request: SignedHttpRequest,
  ): PreparePairRequestResponse {
    const authenticated = this.authenticatedRequest(request);
    return this.requestService.prepare(authenticated.deviceId, authenticated.bodyHash, input);
  }

  @Post('requests/:requestId/submit')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submitRequest(
    @Body() input: PairingPacketOperationDto,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Req() request: SignedHttpRequest,
  ): PairRequestMutationResponse {
    const authenticated = this.authenticatedRequest(request);
    return this.requestService.submit(
      authenticated.deviceId,
      requestId,
      authenticated.bodyHash,
      input,
    );
  }

  @Get('events')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  events(
    @Query('after') after: string | undefined,
    @Req() request: SignedHttpRequest,
  ): PairingEventsResponse {
    const cursor = parseCursor(after);
    const deviceId = request[AUTHENTICATED_DEVICE_ID];
    if (deviceId === undefined) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return this.requestService.events(deviceId, cursor);
  }

  @Post('requests/:requestId/respond')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  respondToRequest(
    @Body() input: RespondPairRequestDto,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Req() request: SignedHttpRequest,
  ): PairRequestMutationResponse {
    const authenticated = this.authenticatedRequest(request);
    return this.requestService.respond(
      authenticated.deviceId,
      requestId,
      authenticated.bodyHash,
      input,
    );
  }

  @Post('requests/:requestId/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verifyRequest(
    @Body() input: PairingPacketOperationDto,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Req() request: SignedHttpRequest,
  ): PairRequestMutationResponse {
    const authenticated = this.authenticatedRequest(request);
    return this.requestService.verify(
      authenticated.deviceId,
      requestId,
      authenticated.bodyHash,
      input,
    );
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancelRequest(
    @Body() input: PairingPacketOperationDto,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Req() request: SignedHttpRequest,
  ): PairRequestMutationResponse {
    const authenticated = this.authenticatedRequest(request);
    return this.requestService.cancel(
      authenticated.deviceId,
      requestId,
      authenticated.bodyHash,
      input,
    );
  }

  private authenticatedRequest(request: SignedHttpRequest) {
    const authenticated = request[AUTHENTICATED_DEVICE_REQUEST];
    if (authenticated === undefined) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return authenticated;
  }
}

function parseCursor(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^\d{1,16}$/u.test(value)) {
    throw new PairingServiceError('request-invalid');
  }
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new PairingServiceError('request-invalid');
  }
  return cursor;
}
