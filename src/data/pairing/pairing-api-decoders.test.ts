import {
  decodeIdentityServerStatus,
  decodePairingEvents,
  decodePairingInvitation,
  decodePairRequestMutation,
  decodePreparedPairRequest,
  decodeServerFailure,
} from './pairing-api-decoders';

const deviceId = '1ab9957e-2c7f-4ec6-80b2-26941a506ca4';
const stableIdentityId = '839c065c-b7ad-43ea-99ba-a3338037178a';
const operationId = '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2';
const requestId = '9d923119-0e58-4cfa-a191-5397585790bc';
const eventId = '1eaa06a5-36aa-41ad-973d-c4ba08cf69e7';
const pairId = '8075bfbf-d8dc-49ed-b889-bf14ec5581e7';
const m2yId = 'M2Y-2345-6789-ABCD-EFGH';
const expiresAtMs = 1_800_000_600_000;

describe('pairing API strict decoders', () => {
  it('decodes identity status and rejects unknown keys', () => {
    const status = {
      deviceId,
      m2yId,
      oneTimePreKeyCount: 12,
      registeredAtMs: 1_800_000_000_000,
      schemaVersion: 1,
      stableIdentityId,
      status: 'registered',
    };

    expect(decodeIdentityServerStatus(status)).toEqual({
      deviceId,
      m2yId,
      oneTimePreKeyCount: 12,
      registeredAtMs: 1_800_000_000_000,
      stableIdentityId,
      status: 'registered',
    });
    expect(
      decodeIdentityServerStatus({ ...status, displayName: 'must stay encrypted' }),
    ).toBeNull();
  });

  it('validates both invitation variants including the QR deep-link binding', () => {
    const ticket = 'a'.repeat(43);
    expect(
      decodePairingInvitation({
        deepLink: `m2y://pair?ticket=${ticket}`,
        expiresAtMs,
        inviteId: requestId,
        kind: 'qr-ticket',
        operationId,
        schemaVersion: 1,
        ticket,
      }),
    ).toEqual({
      deepLink: `m2y://pair?ticket=${ticket}`,
      expiresAtMs,
      inviteId: requestId,
      kind: 'qr-ticket',
      operationId,
      ticket,
    });
    expect(
      decodePairingInvitation({
        code: '23456789',
        expiresAtMs,
        inviteId: requestId,
        kind: 'handshake-code',
        operationId,
        schemaVersion: 1,
      }),
    ).toEqual({
      code: '23456789',
      expiresAtMs,
      inviteId: requestId,
      kind: 'handshake-code',
      operationId,
    });
    expect(
      decodePairingInvitation({
        deepLink: 'm2y://pair?ticket=different',
        expiresAtMs,
        inviteId: requestId,
        kind: 'qr-ticket',
        operationId,
        schemaVersion: 1,
        ticket,
      }),
    ).toBeNull();
  });

  it('decodes the complete leased public bundle and fails closed on private material', () => {
    const prepared = {
      expiresAtMs,
      method: 'm2y-id',
      requestId,
      schemaVersion: 1,
      status: 'prepared',
      targetBundle: {
        deviceId,
        identityPublicKey: 'a'.repeat(32),
        kyberPreKeyId: 2,
        kyberPreKeyPublic: 'b'.repeat(256),
        kyberPreKeySignature: 'c'.repeat(32),
        m2yId,
        oneTimePreKey: { id: 3, publicKey: 'd'.repeat(32) },
        registrationId: 4,
        signedPreKeyId: 5,
        signedPreKeyPublic: 'e'.repeat(32),
        signedPreKeySignature: 'f'.repeat(32),
      },
    };

    expect(decodePreparedPairRequest(prepared)).toEqual({
      expiresAtMs,
      method: 'm2y-id',
      requestId,
      status: 'prepared',
      targetBundle: prepared.targetBundle,
    });
    expect(
      decodePreparedPairRequest({
        ...prepared,
        targetBundle: { ...prepared.targetBundle, privateIdentityKey: 'secret' },
      }),
    ).toBeNull();
  });

  it('requires pairId only for active mutation results', () => {
    const base = { eventCursor: 7, operationId, requestId, schemaVersion: 1 };
    expect(decodePairRequestMutation({ ...base, pairId, status: 'active' })).toEqual({
      eventCursor: 7,
      operationId,
      pairId,
      requestId,
      status: 'active',
    });
    expect(decodePairRequestMutation({ ...base, status: 'active' })).toBeNull();
    expect(decodePairRequestMutation({ ...base, pairId, status: 'verifying' })).toBeNull();
  });

  it('requires ordered event cursors and strict opaque packet fields', () => {
    const first = {
      cursor: 7,
      eventId,
      packet: 'p'.repeat(32),
      requestId,
      status: 'pending',
      type: 'pair-request',
    };
    const second = {
      cursor: 8,
      eventId: pairId,
      requestId,
      status: 'expired',
      type: 'pair-expired',
    };
    expect(
      decodePairingEvents({ events: [first, second], nextCursor: 8, schemaVersion: 1 }),
    ).toEqual({
      events: [first, second],
      nextCursor: 8,
    });
    expect(
      decodePairingEvents({ events: [second, first], nextCursor: 7, schemaVersion: 1 }),
    ).toBeNull();
    expect(
      decodePairingEvents({
        events: [{ ...first, packet: 'raw message with spaces' }],
        nextCursor: 7,
        schemaVersion: 1,
      }),
    ).toBeNull();
  });

  it('accepts only fixture-backed public failures', () => {
    expect(decodeServerFailure({ code: 'rate-limited', schemaVersion: 1 })).toEqual({
      code: 'rate-limited',
      schemaVersion: 1,
    });
    expect(
      decodeServerFailure({ code: 'SQLITE_CONSTRAINT private-key', schemaVersion: 1 }),
    ).toBeNull();
  });
});
