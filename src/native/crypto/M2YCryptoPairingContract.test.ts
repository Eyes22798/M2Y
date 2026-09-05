import {
  decodeProductionPairingAcknowledgement,
  decodeProductionPairingActivation,
  decodeProductionPairingConfirmation,
  decodeProductionPairingDecision,
  decodeProductionPairingOutbox,
  decodeProductionPreparedPairingPacket,
  decodeProductionPreparedPairingResponse,
  decodeProductionPairingSweep,
} from './M2YCryptoPairingContract';

const requestId = '2d1f5c1e-9b0a-4d7f-8c3b-1a2b3c4d5e6f';
const operationId = 'f7a6b86d-680a-4cb5-8c9d-a043d37ff121';
const otherOperationId = '0b9c8d7e-6f5a-4b3c-9d8e-7f6a5b4c3d2e';
const createdAtMs = 1_800_000_000_000;
const expiresAtMs = 1_800_000_600_000;
const targetDeviceId = '8a1bf6aa-4a7a-4bed-9a43-835e74bf2241';
const targetStableIdentityId = 'a73b209e-4866-4c08-a7dd-08a7389d3c46';
const targetM2yId = 'M2Y-JKLM-NPQR-STUV-WXYZ';
const packet = 'p'.repeat(64);

const outboxItem = {
  createdAtMs,
  decision: 'accept',
  operationId,
  packet,
  packetType: 'pair-response',
  requestId,
  retryCount: 0,
};

const invalid = 'm2y-crypto-invalid-native-response';

describe('pairing native contracts', () => {
  it('accepts every status a local decision can settle into', () => {
    for (const status of ['accepted', 'cancelled', 'mismatch', 'rejected'] as const) {
      expect(
        decodeProductionPairingDecision({ operationId, requestId, schemaVersion: 1, status }),
      ).toEqual({ operationId, requestId, schemaVersion: 1, status });
    }
  });

  it('accepts a confirmation only while the candidate is still accepted', () => {
    expect(
      decodeProductionPairingConfirmation({
        operationId,
        requestId,
        schemaVersion: 1,
        status: 'accepted',
      }),
    ).toEqual({ operationId, requestId, schemaVersion: 1, status: 'accepted' });
    expect(() =>
      decodeProductionPairingConfirmation({
        operationId,
        requestId,
        schemaVersion: 1,
        status: 'rejected',
      }),
    ).toThrow(invalid);
  });

  it('accepts each activation outcome the native store can report', () => {
    for (const decision of [
      'activate',
      'alreadyActive',
      'peerIdentityChanged',
      'relationshipConflict',
    ] as const) {
      expect(decodeProductionPairingActivation({ decision, requestId, schemaVersion: 1 })).toEqual({
        decision,
        requestId,
        schemaVersion: 1,
      });
    }
  });

  it('accepts an acknowledgement and a sweep whose counters are all zero', () => {
    expect(
      decodeProductionPairingAcknowledgement({
        operationId,
        schemaVersion: 1,
        status: 'acknowledged',
      }),
    ).toEqual({ operationId, schemaVersion: 1, status: 'acknowledged' });
    expect(
      decodeProductionPairingSweep({
        expiredCandidates: 0,
        removedInboxMarkers: 0,
        removedTombstones: 0,
        schemaVersion: 1,
      }),
    ).toEqual({
      expiredCandidates: 0,
      removedInboxMarkers: 0,
      removedTombstones: 0,
      schemaVersion: 1,
    });
  });

  it('只接受 native 已提交并绑定目标身份的真实首包', () => {
    const prepared = {
      expiresAtMs,
      operationId,
      packet,
      requestId,
      schemaVersion: 1,
      status: 'committed',
      targetDeviceId,
      targetM2yId,
      targetStableIdentityId,
    } as const;

    expect(decodeProductionPreparedPairingPacket(prepared)).toEqual(prepared);
    expect(() =>
      decodeProductionPreparedPairingPacket({ ...prepared, privateSession: 'secret' }),
    ).toThrow(invalid);
    expect(() => decodeProductionPreparedPairingPacket({ ...prepared, packet: 'short' })).toThrow(
      invalid,
    );
  });

  it('严格解码接受与拒绝响应，并只允许接受结果携带安全码', () => {
    const safetyNumber = Array.from({ length: 12 }, (_, index) => String(index).padStart(5, '0'));
    const accepted = {
      operationId,
      packet,
      requestId,
      safetyNumber,
      schemaVersion: 1,
      status: 'accepted',
    } as const;
    const rejected = {
      operationId,
      packet,
      requestId,
      schemaVersion: 1,
      status: 'rejected',
    } as const;

    expect(decodeProductionPreparedPairingResponse(accepted)).toEqual(accepted);
    expect(decodeProductionPreparedPairingResponse(rejected)).toEqual(rejected);
    expect(() => decodeProductionPreparedPairingResponse({ ...rejected, safetyNumber })).toThrow(
      invalid,
    );
    expect(() =>
      decodeProductionPreparedPairingResponse({ ...accepted, safetyNumber: safetyNumber.slice(1) }),
    ).toThrow(invalid);
  });

  it('accepts an empty outbox and preserves the native order of a populated one', () => {
    expect(decodeProductionPairingOutbox({ items: [], schemaVersion: 1 })).toEqual({
      items: [],
      schemaVersion: 1,
    });

    const verify = {
      createdAtMs,
      decision: 'confirm',
      operationId: otherOperationId,
      packetType: 'pair-verify',
      requestId,
      retryCount: 3,
    };
    expect(
      decodeProductionPairingOutbox({ items: [outboxItem, verify], schemaVersion: 1 }),
    ).toEqual({ items: [outboxItem, verify], schemaVersion: 1 });

    const request = {
      createdAtMs,
      decision: 'submit',
      expiresAtMs,
      operationId: otherOperationId,
      packet,
      packetType: 'pair-request',
      requestId,
      retryCount: 0,
      targetDeviceId,
      targetM2yId,
      targetStableIdentityId,
    } as const;
    expect(decodeProductionPairingOutbox({ items: [request], schemaVersion: 1 })).toEqual({
      items: [request],
      schemaVersion: 1,
    });
  });

  it.each([
    { operationId, requestId, schemaVersion: 1, status: 'pendingLocalReview' },
    { operationId, requestId, schemaVersion: 1, status: 'expired' },
    { operationId, requestId, schemaVersion: 2, status: 'accepted' },
    { operationId, requestId, safetyNumber: '12345', schemaVersion: 1, status: 'accepted' },
    { operationId, schemaVersion: 1, status: 'accepted' },
    { operationId, requestId: 'not-a-uuid', schemaVersion: 1, status: 'accepted' },
  ])('fails closed for a decision that is unreachable, widened or malformed', (value) => {
    expect(() => decodeProductionPairingDecision(value)).toThrow(invalid);
  });

  it.each([
    { decision: 'activated', requestId, schemaVersion: 1 },
    { decision: 'activate', peerIdentityKey: 'BXk3', requestId, schemaVersion: 1 },
    { decision: 'activate', requestId, schemaVersion: 1, status: 'accepted' },
    { decision: 'activate', requestId: '', schemaVersion: 1 },
  ])('fails closed for an activation outcome it does not recognise', (value) => {
    expect(() => decodeProductionPairingActivation(value)).toThrow(invalid);
  });

  it.each([
    { items: [{ ...outboxItem, packetType: 'pair-verify' }], schemaVersion: 1 },
    { items: [{ ...outboxItem, decision: 'confirm' }], schemaVersion: 1 },
    { items: [{ ...outboxItem, decision: 'expire' }], schemaVersion: 1 },
    { items: [{ ...outboxItem, packetType: 'pair-invite' }], schemaVersion: 1 },
    { items: [{ ...outboxItem, retryCount: -1 }], schemaVersion: 1 },
    { items: [{ ...outboxItem, createdAtMs: 0 }], schemaVersion: 1 },
    { items: [{ ...outboxItem, payload: 'AAAA' }], schemaVersion: 1 },
    {
      items: [{ ...outboxItem, decision: 'submit', packetType: 'pair-request' }],
      schemaVersion: 1,
    },
    { items: [{ ...outboxItem, packet: 'short' }], schemaVersion: 1 },
    { items: [outboxItem, outboxItem], schemaVersion: 1 },
    { items: {}, schemaVersion: 1 },
    { items: [], schemaVersion: 1, total: 0 },
  ])('fails closed for outbox work no native intent could produce', (value) => {
    expect(() => decodeProductionPairingOutbox(value)).toThrow(invalid);
  });

  it.each([
    { operationId, schemaVersion: 1, status: 'delivered' },
    { operationId, receiptId: 'receipt_pairing_1', schemaVersion: 1, status: 'acknowledged' },
    { schemaVersion: 1, status: 'acknowledged' },
  ])('fails closed for an acknowledgement that is not exactly the documented one', (value) => {
    expect(() => decodeProductionPairingAcknowledgement(value)).toThrow(invalid);
  });

  it.each([
    { expiredCandidates: -1, removedInboxMarkers: 0, removedTombstones: 0, schemaVersion: 1 },
    { expiredCandidates: 1.5, removedInboxMarkers: 0, removedTombstones: 0, schemaVersion: 1 },
    { expiredCandidates: 0, removedInboxMarkers: 0, schemaVersion: 1 },
    {
      expiredCandidates: 0,
      removedCandidates: 0,
      removedInboxMarkers: 0,
      removedTombstones: 0,
      schemaVersion: 1,
    },
  ])('fails closed for a sweep report with impossible counters', (value) => {
    expect(() => decodeProductionPairingSweep(value)).toThrow(invalid);
  });

  it.each([null, undefined, [], 'accepted', 7])(
    'fails closed for anything that is not a native record',
    (value) => {
      expect(() => decodeProductionPairingDecision(value)).toThrow(invalid);
      expect(() => decodeProductionPairingOutbox(value)).toThrow(invalid);
      expect(() => decodeProductionPairingSweep(value)).toThrow(invalid);
    },
  );
});
