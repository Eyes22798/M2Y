import {
  type DeviceRequestSigner,
  type IdentityRegistrationReceipt,
  type IdentityRegistrationRequest,
  type IdentityServerStatus,
  type PairingApi,
  type PairingApiResult,
  type PairingEvents,
  type PairingInvitation,
  type PairingInvitationRequest,
  type PairingPacketRequest,
  type PairingResponseRequest,
  type PairRequestMutation,
  type PreKeyReplenishmentReceipt,
  type PreKeyReplenishmentRequest,
  type PreparedPairRequest,
  type PreparePairRequest,
} from '@/application/pairing/contracts';

import {
  decodeIdentityRegistrationReceipt,
  decodeIdentityServerStatus,
  decodePairingEvents,
  decodePairingInvitation,
  decodePairRequestMutation,
  decodePreKeyReplenishmentReceipt,
  decodePreparedPairRequest,
  decodeServerFailure,
} from './pairing-api-decoders';

const requestVersion = 'M2Y-REQUEST-V1';
const defaultTimeoutMs = 10_000;
const defaultMaximumAttempts = 2;

type JsonDecoder<T> = (value: unknown) => T | null;

export type PairingHttpRequest = Readonly<{
  body?: string;
  headers: Readonly<Record<string, string>>;
  method: 'GET' | 'POST';
  signal: AbortSignal;
}>;

export type PairingHttpResponse = Readonly<{
  json(): Promise<unknown>;
  status: number;
}>;

export type PairingFetch = (
  url: string,
  request: PairingHttpRequest,
) => Promise<PairingHttpResponse>;

export type PairingApiClientDependencies = Readonly<{
  baseUrl: string;
  createNonce(): Promise<string>;
  fetch: PairingFetch;
  hashBody(body: string): Promise<string>;
  maximumAttempts?: number;
  nowMs(): number;
  signer: DeviceRequestSigner;
  timeoutMs?: number;
}>;

export class PairingApiClient implements PairingApi {
  private readonly maximumAttempts: number;
  private readonly timeoutMs: number;

  constructor(private readonly dependencies: PairingApiClientDependencies) {
    this.maximumAttempts = dependencies.maximumAttempts ?? defaultMaximumAttempts;
    this.timeoutMs = dependencies.timeoutMs ?? defaultTimeoutMs;
  }

  registerIdentity(
    input: IdentityRegistrationRequest,
  ): Promise<PairingApiResult<IdentityRegistrationReceipt>> {
    return this.post(
      '/v1/identity/register',
      input,
      decodeIdentityRegistrationReceipt,
      input.deviceId,
    );
  }

  readIdentityStatus(): Promise<PairingApiResult<IdentityServerStatus>> {
    return this.send('GET', '/v1/identity/status', undefined, decodeIdentityServerStatus);
  }

  replenishPreKeys(
    input: PreKeyReplenishmentRequest,
  ): Promise<PairingApiResult<PreKeyReplenishmentReceipt>> {
    return this.post('/v1/identity/prekeys/replenish', input, decodePreKeyReplenishmentReceipt);
  }

  createInvitation(input: PairingInvitationRequest): Promise<PairingApiResult<PairingInvitation>> {
    return this.post('/v1/pair/invites', input, decodePairingInvitation);
  }

  preparePairRequest(input: PreparePairRequest): Promise<PairingApiResult<PreparedPairRequest>> {
    return this.post('/v1/pair/requests/prepare', input, decodePreparedPairRequest);
  }

  submitPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>> {
    return this.post(
      `/v1/pair/requests/${encodeURIComponent(requestId)}/submit`,
      input,
      decodePairRequestMutation,
    );
  }

  readEvents(afterCursor: number): Promise<PairingApiResult<PairingEvents>> {
    return this.send(
      'GET',
      `/v1/pair/events?after=${encodeURIComponent(String(afterCursor))}`,
      undefined,
      decodePairingEvents,
    );
  }

  respondToPairRequest(
    requestId: string,
    input: PairingResponseRequest,
  ): Promise<PairingApiResult<PairRequestMutation>> {
    return this.post(
      `/v1/pair/requests/${encodeURIComponent(requestId)}/respond`,
      input,
      decodePairRequestMutation,
    );
  }

  verifyPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>> {
    return this.post(
      `/v1/pair/requests/${encodeURIComponent(requestId)}/verify`,
      input,
      decodePairRequestMutation,
    );
  }

  cancelPairRequest(
    requestId: string,
    input: PairingPacketRequest,
  ): Promise<PairingApiResult<PairRequestMutation>> {
    return this.post(
      `/v1/pair/requests/${encodeURIComponent(requestId)}/cancel`,
      input,
      decodePairRequestMutation,
    );
  }

  private post<T>(
    requestTarget: string,
    body: unknown,
    decode: JsonDecoder<T>,
    expectedDeviceId?: string,
  ): Promise<PairingApiResult<T>> {
    return this.send('POST', requestTarget, body, decode, expectedDeviceId);
  }

  private async send<T>(
    method: 'GET' | 'POST',
    requestTarget: string,
    body: unknown,
    decode: JsonDecoder<T>,
    expectedDeviceId?: string,
  ): Promise<PairingApiResult<T>> {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    let bodyHash: string;
    try {
      bodyHash = await this.dependencies.hashBody(bodyText);
    } catch {
      return clientFailure('pairing-signing-failed');
    }

    let lastTransportCode: 'pairing-network-unavailable' | 'pairing-timeout' =
      'pairing-network-unavailable';
    for (let attempt = 0; attempt < this.maximumAttempts; attempt += 1) {
      let nonce: string;
      let signature;
      const timestamp = this.dependencies.nowMs();
      try {
        nonce = await this.dependencies.createNonce();
        signature = await this.dependencies.signer.signDeviceRequest(
          canonicalDeviceRequest({ bodyHash, method, nonce, requestTarget, timestamp }),
        );
      } catch {
        return clientFailure('pairing-signing-failed');
      }
      if (expectedDeviceId !== undefined && signature.deviceId !== expectedDeviceId) {
        return clientFailure('pairing-signature-device-mismatch');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: PairingHttpResponse;
      try {
        response = await this.dependencies.fetch(`${this.dependencies.baseUrl}${requestTarget}`, {
          ...(body === undefined ? {} : { body: bodyText }),
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            'x-m2y-device-id': signature.deviceId,
            'x-m2y-key-id': signature.publicKeyId,
            'x-m2y-nonce': nonce,
            'x-m2y-signature': signature.signature,
            'x-m2y-timestamp': String(timestamp),
          },
          method,
          signal: controller.signal,
        });
      } catch {
        lastTransportCode = controller.signal.aborted
          ? 'pairing-timeout'
          : 'pairing-network-unavailable';
        clearTimeout(timeout);
        continue;
      }
      clearTimeout(timeout);

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        if (isRetryableStatus(response.status) && attempt + 1 < this.maximumAttempts) continue;
        return clientFailure('pairing-response-invalid');
      }

      if (response.status === 200) {
        const decoded = decode(responseBody);
        return decoded === null ? clientFailure('pairing-response-invalid') : success(decoded);
      }
      if (isRetryableStatus(response.status) && attempt + 1 < this.maximumAttempts) continue;
      const failure = decodeServerFailure(responseBody);
      return failure === null
        ? clientFailure('pairing-response-invalid')
        : {
            ok: false,
            failure: { kind: 'server', code: failure.code, httpStatus: response.status },
          };
    }
    return clientFailure(lastTransportCode);
  }
}

export function canonicalDeviceRequest(
  input: Readonly<{
    bodyHash: string;
    method: string;
    nonce: string;
    requestTarget: string;
    timestamp: number;
  }>,
): string {
  const method = input.method.toUpperCase();
  if (
    !/^[A-Z]+$/u.test(method) ||
    !Number.isSafeInteger(input.timestamp) ||
    input.timestamp <= 0 ||
    input.nonce.length < 16 ||
    input.nonce.length > 128 ||
    !/^[A-Za-z0-9_-]+$/u.test(input.nonce) ||
    !/^[0-9a-fA-F]{64}$/u.test(input.bodyHash)
  ) {
    throw new Error('pairing-canonical-input-invalid');
  }
  return [
    requestVersion,
    method,
    canonicalRequestTarget(input.requestTarget),
    String(input.timestamp),
    input.nonce,
    input.bodyHash.toLowerCase(),
  ].join('\n');
}

export function canonicalRequestTarget(requestTarget: string): string {
  if (!requestTarget.startsWith('/') || requestTarget.includes('#')) {
    throw new Error('pairing-request-target-invalid');
  }
  const parsed = new URL(requestTarget, 'https://m2y.invalid');
  const sorted = [...parsed.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    },
  );
  const query = sorted
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return query.length === 0 ? parsed.pathname : `${parsed.pathname}?${query}`;
}

function success<T>(value: T): PairingApiResult<T> {
  return { ok: true, value };
}

function clientFailure(
  code:
    | 'pairing-network-unavailable'
    | 'pairing-response-invalid'
    | 'pairing-signature-device-mismatch'
    | 'pairing-signing-failed'
    | 'pairing-timeout',
): PairingApiResult<never> {
  return { ok: false, failure: { kind: 'client', code } };
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}
