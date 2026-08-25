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
});

describe('toIdentityDraft', () => {
  it('reports only the identifiers and never the prepared key material', () => {
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
    });
    expect(JSON.stringify(draft)).not.toContain('a'.repeat(64));
  });
});
