import type {
  DeviceRequestSigner,
  IdentityRegistrationRequest,
} from '@/application/pairing/contracts';

import {
  canonicalDeviceRequest,
  canonicalRequestTarget,
  PairingApiClient,
  type PairingFetch,
  type PairingHttpRequest,
} from './PairingApiClient';

const deviceId = '1ab9957e-2c7f-4ec6-80b2-26941a506ca4';
const stableIdentityId = '839c065c-b7ad-43ea-99ba-a3338037178a';
const operationId = '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2';
const receiptId = '9d923119-0e58-4cfa-a191-5397585790bc';
const m2yId = 'M2Y-2345-6789-ABCD-EFGH';
const timestamp = 1_800_000_000_000;
const bodyHash = 'f'.repeat(64);

const registration: IdentityRegistrationRequest = {
  authPublicKey: 'a'.repeat(64),
  deviceId,
  identityPublicKey: 'b'.repeat(32),
  kyberPreKeyId: 2,
  kyberPreKeyPublic: 'c'.repeat(256),
  kyberPreKeySignature: 'd'.repeat(64),
  m2yId,
  oneTimePreKeys: Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    publicKey: 'e'.repeat(32),
  })),
  operationId,
  registrationId: 1,
  schemaVersion: 1,
  signedPreKeyId: 1,
  signedPreKeyPublic: 'f'.repeat(32),
  signedPreKeySignature: 'g'.repeat(64),
  stableIdentityId,
};

describe('PairingApiClient canonical requests', () => {
  it('sorts the query and emits the exact device-auth transcript', () => {
    expect(canonicalRequestTarget('/v1/pair/events?z=two%20words&a=2&a=1')).toBe(
      '/v1/pair/events?a=1&a=2&z=two%20words',
    );
    expect(
      canonicalDeviceRequest({
        bodyHash: 'ABCDEF'.repeat(10) + 'ABCD',
        method: 'post',
        nonce: '0123456789abcdef',
        requestTarget: '/v1/pair/events?z=2&a=1',
        timestamp,
      }),
    ).toBe(
      `M2Y-REQUEST-V1\nPOST\n/v1/pair/events?a=1&z=2\n1800000000000\n0123456789abcdef\n${'abcdef'.repeat(10)}abcd`,
    );
  });

  it('signs and sends the exact same registration JSON bytes', async () => {
    const observedRequests: PairingHttpRequest[] = [];
    const observedCanonical: string[] = [];
    const observedHashInput: string[] = [];
    const client = createClient({
      fetch: async (_url, request) => {
        observedRequests.push(request);
        return jsonResponse(200, {
          deviceId,
          m2yId,
          receiptId,
          registeredAtMs: timestamp,
          schemaVersion: 1,
          status: 'registered',
        });
      },
      hashBody: async (body) => {
        observedHashInput.push(body);
        return bodyHash;
      },
      signer: signerThatRecords(observedCanonical),
    });

    const result = await client.registerIdentity(registration);
    const bodyText = JSON.stringify(registration);

    expect(result).toEqual({
      ok: true,
      value: { deviceId, m2yId, receiptId, registeredAtMs: timestamp, status: 'registered' },
    });
    expect(observedRequests).toHaveLength(1);
    expect(observedHashInput).toEqual([bodyText]);
    expect(observedRequests[0]?.body).toBe(bodyText);
    expect(observedRequests[0]?.headers).toEqual({
      'content-type': 'application/json',
      'x-m2y-device-id': deviceId,
      'x-m2y-key-id': 'device-auth-v1',
      'x-m2y-nonce': '0'.repeat(36),
      'x-m2y-signature': 's'.repeat(64),
      'x-m2y-timestamp': String(timestamp),
    });
    expect(observedCanonical).toEqual([
      `M2Y-REQUEST-V1\nPOST\n/v1/identity/register\n${timestamp}\n${'0'.repeat(36)}\n${bodyHash}`,
    ]);
  });

  it('retries a transport failure with the same body and fresh signed metadata', async () => {
    const requests: PairingHttpRequest[] = [];
    const canonicals: string[] = [];
    const nonces = ['1'.repeat(36), '2'.repeat(36)];
    let fetchAttempt = 0;
    let nowCall = 0;
    const client = createClient({
      createNonce: async () => nonces.shift() ?? '3'.repeat(36),
      fetch: async (_url, request) => {
        requests.push(request);
        fetchAttempt += 1;
        if (fetchAttempt === 1) throw new Error('offline detail must not escape');
        return jsonResponse(200, {
          deviceId,
          m2yId,
          receiptId,
          registeredAtMs: timestamp,
          schemaVersion: 1,
          status: 'registered',
        });
      },
      nowMs: () => timestamp + nowCall++,
      signer: signerThatRecords(canonicals),
    });

    const result = await client.registerIdentity(registration);

    expect(result.ok).toBe(true);
    expect(requests.map(({ body }) => body)).toEqual([
      JSON.stringify(registration),
      JSON.stringify(registration),
    ]);
    expect(canonicals).toHaveLength(2);
    expect(canonicals[0]).toContain(`\n${timestamp}\n${'1'.repeat(36)}\n`);
    expect(canonicals[1]).toContain(`\n${timestamp + 1}\n${'2'.repeat(36)}\n`);
  });

  it('maps a known server failure and rejects unknown response fields', async () => {
    const serverFailure = createClient({
      fetch: async () =>
        jsonResponse(409, {
          code: 'identity-m2y-id-collision',
          schemaVersion: 1,
        }),
      maximumAttempts: 1,
    });
    await expect(serverFailure.registerIdentity(registration)).resolves.toEqual({
      ok: false,
      failure: {
        code: 'identity-m2y-id-collision',
        httpStatus: 409,
        kind: 'server',
      },
    });

    const invalidResponse = createClient({
      fetch: async () =>
        jsonResponse(200, {
          deviceId,
          m2yId,
          nativeException: 'private-key-stack',
          receiptId,
          registeredAtMs: timestamp,
          schemaVersion: 1,
          status: 'registered',
        }),
    });
    const result = await invalidResponse.registerIdentity(registration);
    expect(result).toEqual({
      ok: false,
      failure: { code: 'pairing-response-invalid', kind: 'client' },
    });
    expect(JSON.stringify(result)).not.toContain('private-key-stack');
  });

  it('aborts each bounded attempt and returns a stable timeout value', async () => {
    let attempts = 0;
    const client = createClient({
      fetch: (_url, request) => {
        attempts += 1;
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('AbortError')));
        });
      },
      timeoutMs: 1,
    });

    await expect(client.registerIdentity(registration)).resolves.toEqual({
      ok: false,
      failure: { code: 'pairing-timeout', kind: 'client' },
    });
    expect(attempts).toBe(2);
  });

  it('外部取消会终止事件请求且不再发起下一次重试', async () => {
    let attempts = 0;
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const client = createClient({
      fetch: (_url, request) => {
        attempts += 1;
        markStarted();
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('AbortError')), {
            once: true,
          });
        });
      },
    });
    const controller = new AbortController();

    const pending = client.readEvents(7, controller.signal);
    await started;
    controller.abort();

    await expect(pending).resolves.toEqual({
      ok: false,
      failure: { code: 'pairing-network-unavailable', kind: 'client' },
    });
    expect(attempts).toBe(1);
  });

  it('fails closed when the native signer belongs to another device', async () => {
    let fetchCalled = false;
    const fetch: PairingFetch = async () => {
      fetchCalled = true;
      return jsonResponse(500, { code: 'internal-error', schemaVersion: 1 });
    };
    const client = createClient({
      fetch,
      signer: {
        signDeviceRequest: async () => ({
          deviceId: '2ab9957e-2c7f-4ec6-80b2-26941a506ca4',
          publicKeyId: 'device-auth-v1',
          signature: 's'.repeat(64),
        }),
      },
    });

    await expect(client.registerIdentity(registration)).resolves.toEqual({
      ok: false,
      failure: { code: 'pairing-signature-device-mismatch', kind: 'client' },
    });
    expect(fetchCalled).toBe(false);
  });
});

function createClient(
  overrides: Partial<{
    createNonce: () => Promise<string>;
    fetch: PairingFetch;
    hashBody: (body: string) => Promise<string>;
    maximumAttempts: number;
    nowMs: () => number;
    signer: DeviceRequestSigner;
    timeoutMs: number;
  }> = {},
): PairingApiClient {
  return new PairingApiClient({
    baseUrl: 'https://pairing.example.test',
    createNonce: overrides.createNonce ?? (async () => '0'.repeat(36)),
    fetch:
      overrides.fetch ??
      (async () => {
        throw new Error('unexpected fetch');
      }),
    hashBody: overrides.hashBody ?? (async () => bodyHash),
    ...(overrides.maximumAttempts === undefined
      ? {}
      : { maximumAttempts: overrides.maximumAttempts }),
    nowMs: overrides.nowMs ?? (() => timestamp),
    signer: overrides.signer ?? signerThatRecords([]),
    ...(overrides.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs }),
  });
}

function signerThatRecords(canonicals: string[]): DeviceRequestSigner {
  return {
    signDeviceRequest: async (canonicalRequest) => {
      canonicals.push(canonicalRequest);
      return {
        deviceId,
        publicKeyId: 'device-auth-v1',
        signature: 's'.repeat(64),
      };
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return { json: async () => body, status };
}
