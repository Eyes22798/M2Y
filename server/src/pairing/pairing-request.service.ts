import { Injectable } from '@nestjs/common';

import type {
  PairingPacketOperationDto,
  PreparePairRequestDto,
  RespondPairRequestDto,
} from './pair-request.dto';
import {
  type PairingEvent,
  type PairRequestMutation,
  PairingRequestRepository,
  type PreparedPairRequest,
} from '../persistence/pairing-request.repository';

const PAIR_REQUEST_LIFETIME_MS = 10 * 60_000;

export type PreparePairRequestResponse = PreparedPairRequest &
  Readonly<{ schemaVersion: 1; status: 'prepared' }>;

export type PairRequestMutationResponse = PairRequestMutation & Readonly<{ schemaVersion: 1 }>;

export type PairingEventsResponse = Readonly<{
  events: readonly PairingEvent[];
  nextCursor: number;
  schemaVersion: 1;
}>;

@Injectable()
export class PairingRequestService {
  constructor(private readonly repository: PairingRequestRepository) {}

  prepare(
    deviceId: string,
    bodyHash: string,
    input: PreparePairRequestDto,
  ): PreparePairRequestResponse {
    const nowMs = Date.now();
    const prepared = this.repository.prepare(
      deviceId,
      input,
      bodyHash,
      nowMs,
      nowMs + PAIR_REQUEST_LIFETIME_MS,
    );
    return Object.freeze({ ...prepared, schemaVersion: 1, status: 'prepared' });
  }

  submit(
    deviceId: string,
    requestId: string,
    bodyHash: string,
    input: PairingPacketOperationDto,
  ): PairRequestMutationResponse {
    return this.withSchema(
      this.repository.submit(
        deviceId,
        requestId,
        input.operationId,
        bodyHash,
        input.packet,
        Date.now(),
      ),
    );
  }

  respond(
    deviceId: string,
    requestId: string,
    bodyHash: string,
    input: RespondPairRequestDto,
  ): PairRequestMutationResponse {
    return this.withSchema(
      this.repository.respond(
        deviceId,
        requestId,
        input.operationId,
        bodyHash,
        input.action,
        input.packet,
        Date.now(),
      ),
    );
  }

  cancel(
    deviceId: string,
    requestId: string,
    bodyHash: string,
    input: PairingPacketOperationDto,
  ): PairRequestMutationResponse {
    return this.withSchema(
      this.repository.cancel(
        deviceId,
        requestId,
        input.operationId,
        bodyHash,
        input.packet,
        Date.now(),
      ),
    );
  }

  verify(
    deviceId: string,
    requestId: string,
    bodyHash: string,
    input: PairingPacketOperationDto,
  ): PairRequestMutationResponse {
    return this.withSchema(
      this.repository.verify(
        deviceId,
        requestId,
        input.operationId,
        bodyHash,
        input.packet,
        Date.now(),
      ),
    );
  }

  events(deviceId: string, afterCursor: number): PairingEventsResponse {
    const events = this.repository.listEvents(deviceId, afterCursor, Date.now());
    return Object.freeze({
      events,
      nextCursor: events.at(-1)?.cursor ?? afterCursor,
      schemaVersion: 1,
    });
  }

  private withSchema(result: PairRequestMutation): PairRequestMutationResponse {
    return Object.freeze({ ...result, schemaVersion: 1 });
  }
}
