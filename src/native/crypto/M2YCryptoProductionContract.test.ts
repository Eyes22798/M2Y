import {
  decodeProductionDeviceSignature,
  decodeProductionIdentityInspection,
  decodeProductionIdentityRegistration,
  decodeProductionIdentityReset,
} from './M2YCryptoProductionContract';

const deviceId = '1ab9957e-2c7f-4ec6-80b2-26941a506ca4';
const stableIdentityId = '839c065c-b7ad-43ea-99ba-a3338037178a';
const operationId = 'f7a6b86d-680a-4cb5-8c9d-a043d37ff121';
const m2yId = 'M2Y-2345-6789-ABCD-EFGH';
const encoded = (length: number) => 'A'.repeat(length);

const registration = {
  authPublicKey: encoded(128),
  deviceId,
  identityPublicKey: encoded(44),
  kyberPreKeyId: 19,
  kyberPreKeyPublic: encoded(2048),
  kyberPreKeySignature: encoded(96),
  m2yId,
  oneTimePreKeys: Array.from({ length: 16 }, (_, index) => ({
    id: index + 100,
    publicKey: encoded(44),
  })),
  operationId,
  registrationId: 17,
  schemaVersion: 1,
  signedPreKeyId: 18,
  signedPreKeyPublic: encoded(44),
  signedPreKeySignature: encoded(96),
  stableIdentityId,
};

describe('production identity native contracts', () => {
  it('accepts exact absent, pending, and committed identity projections', () => {
    expect(decodeProductionIdentityInspection({ schemaVersion: 1, status: 'absent' })).toEqual({
      schemaVersion: 1,
      status: 'absent',
    });
    expect(
      decodeProductionIdentityInspection({
        deviceId,
        displayName: 'Alice',
        m2yId,
        operationId,
        revision: 1,
        schemaVersion: 1,
        stableIdentityId,
        status: 'pendingRegistration',
      }),
    ).toMatchObject({ operationId, status: 'pendingRegistration' });
    expect(
      decodeProductionIdentityInspection({
        deviceId,
        m2yId,
        registeredAtMs: 1_800_000_000_000,
        revision: 2,
        schemaVersion: 1,
        stableIdentityId,
        status: 'unpaired',
      }),
    ).toMatchObject({ registeredAtMs: 1_800_000_000_000, status: 'unpaired' });
  });

  it('accepts one exact public registration bundle', () => {
    expect(decodeProductionIdentityRegistration(registration)).toEqual(registration);
  });

  it('accepts only the documented signature and reset projections', () => {
    expect(
      decodeProductionDeviceSignature({
        deviceId,
        publicKeyId: 'device-auth-v1',
        schemaVersion: 1,
        signature: encoded(96),
      }),
    ).toMatchObject({ deviceId, publicKeyId: 'device-auth-v1' });
    expect(decodeProductionIdentityReset({ schemaVersion: 1, status: 'reset' })).toEqual({
      schemaVersion: 1,
      status: 'reset',
    });
  });

  it.each([
    { ...registration, privateKey: encoded(64) },
    { ...registration, oneTimePreKeys: registration.oneTimePreKeys.slice(0, 15) },
    {
      ...registration,
      oneTimePreKeys: registration.oneTimePreKeys.map((item, index) =>
        index === 1 ? { ...item, id: registration.oneTimePreKeys[0]?.id } : item,
      ),
    },
    { ...registration, kyberPreKeyPublic: 'not base64+' },
  ])('rejects expanded, incomplete, duplicate, or malformed registration material', (value) => {
    expect(() => decodeProductionIdentityRegistration(value)).toThrow(
      'm2y-crypto-invalid-native-response',
    );
  });

  it.each([
    { schemaVersion: 1, status: 'absent', secret: 'must-not-cross' },
    {
      deviceId,
      m2yId,
      operationId,
      revision: 1,
      schemaVersion: 1,
      stableIdentityId,
      status: 'unpaired',
    },
    {
      deviceId,
      m2yId,
      registeredAtMs: 1_800_000_000_000,
      revision: 2,
      schemaVersion: 1,
      stableIdentityId,
      status: 'unknown',
    },
  ])('fails closed for invalid identity projections', (value) => {
    expect(() => decodeProductionIdentityInspection(value)).toThrow(
      'm2y-crypto-invalid-native-response',
    );
  });
});
