import type {
  ProductionIdentityInspection,
  ProductionIdentityRegistration,
} from './M2YCryptoProductionContract';
import { toIdentityDraft, toIdentityInspection } from './production-identity-mapping';

const deviceId = '1ab9957e-2c7f-4ec6-80b2-26941a506ca4';
const m2yId = 'M2Y-2345-6789-ABCD-EFGH';
const stableIdentityId = '839c065c-b7ad-43ea-99ba-a3338037178a';

const summary = { deviceId, m2yId, revision: 1, schemaVersion: 1 as const, stableIdentityId };

describe('toIdentityInspection', () => {
  it('maps an absent identity without inventing a summary', () => {
    expect(toIdentityInspection({ schemaVersion: 1, status: 'absent' })).toEqual({
      kind: 'absent',
    });
  });

  it('keeps the operation id of a registration the server has not receipted', () => {
    const value: ProductionIdentityInspection = {
      ...summary,
      operationId: '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2',
      status: 'pendingRegistration',
    };

    expect(toIdentityInspection(value)).toEqual({
      kind: 'pendingRegistration',
      identity: { deviceId, m2yId, stableIdentityId },
      operationId: '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2',
    });
  });

  it('drops storage bookkeeping and preserves an optional display name', () => {
    const value: ProductionIdentityInspection = {
      ...summary,
      displayName: '用户',
      registeredAtMs: 1_800_000_000_000,
      status: 'unpaired',
    };

    expect(toIdentityInspection(value)).toEqual({
      kind: 'unpaired',
      identity: { deviceId, displayName: '用户', m2yId, stableIdentityId },
    });
  });

  it('把已获回执的首包恢复为用户可见的等待确认状态', () => {
    expect(
      toIdentityInspection({
        ...summary,
        expiresAtMs: 1_800_000_600_000,
        method: 'm2y-id',
        registeredAtMs: 1_800_000_000_000,
        requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
        status: 'outgoingPending',
        targetDeviceId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
        targetM2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
        targetStableIdentityId: '59e5c303-bba8-46d0-a19c-26a6514938a7',
      }),
    ).toEqual({
      kind: 'outgoingPending',
      identity: { deviceId, m2yId, stableIdentityId },
      request: {
        expiresAtMs: 1_800_000_600_000,
        method: 'm2y-id',
        peer: {
          m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
          routeId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
        },
        requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
      },
    });
  });

  it('把原生已解密并持久化的请求恢复为待用户审核状态', () => {
    expect(
      toIdentityInspection({
        ...summary,
        expiresAtMs: 1_800_000_600_000,
        method: 'm2y-id',
        peerDeviceId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
        peerM2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
        peerStableIdentityId: '59e5c303-bba8-46d0-a19c-26a6514938a7',
        registeredAtMs: 1_800_000_000_000,
        requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
        status: 'incomingReview',
      }),
    ).toEqual({
      kind: 'incomingReview',
      identity: { deviceId, m2yId, stableIdentityId },
      request: {
        expiresAtMs: 1_800_000_600_000,
        method: 'm2y-id',
        peer: {
          m2yId: 'M2Y-JKLM-NPQR-STUV-WXYZ',
          routeId: 'b64a01a1-546a-47f8-8920-52e9444fe850',
        },
        requestId: '9d923119-0e58-4cfa-a191-5397585790bc',
      },
    });
  });
});

describe('toIdentityDraft', () => {
  it('把公开注册包交给应用端口，但身份摘要仍不携带密钥字段', () => {
    const registration: ProductionIdentityRegistration = {
      authPublicKey: 'a'.repeat(64),
      deviceId,
      identityPublicKey: 'b'.repeat(32),
      kyberPreKeyId: 1,
      kyberPreKeyPublic: 'c'.repeat(256),
      kyberPreKeySignature: 'd'.repeat(32),
      m2yId,
      oneTimePreKeys: [{ id: 1, publicKey: 'e'.repeat(32) }],
      operationId: '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2',
      registrationId: 4242,
      schemaVersion: 1,
      signedPreKeyId: 1,
      signedPreKeyPublic: 'f'.repeat(32),
      signedPreKeySignature: 'g'.repeat(32),
      stableIdentityId,
    };

    const draft = toIdentityDraft(registration);

    expect(draft).toEqual({
      identity: { deviceId, m2yId, stableIdentityId },
      operationId: '2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2',
      registration,
    });
    expect(Object.keys(draft.identity)).toEqual(['deviceId', 'm2yId', 'stableIdentityId']);
  });
});
