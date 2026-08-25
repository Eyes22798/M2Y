import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBytes,
  type KeyObject,
} from 'node:crypto';

import { canonicalRequest } from '../../src/auth/canonical-request';

export type RegistrationBody = Readonly<{
  authPublicKey: string;
  deviceId: string;
  identityPublicKey: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  m2yId: string;
  oneTimePreKeys: readonly Readonly<{ id: number; publicKey: string }>[];
  operationId: string;
  registrationId: number;
  schemaVersion: 1;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  stableIdentityId: string;
}>;

export function generateSigningKey(): Readonly<{ privateKey: KeyObject; publicKey: string }> {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
  });
}

export function registrationBody(authPublicKey: string, m2yId: string): RegistrationBody {
  return Object.freeze({
    authPublicKey,
    deviceId: randomUUID(),
    identityPublicKey: 'A'.repeat(44),
    kyberPreKeyId: 1,
    kyberPreKeyPublic: 'K'.repeat(512),
    kyberPreKeySignature: 'S'.repeat(86),
    m2yId,
    oneTimePreKeys: Array.from({ length: 16 }, (_, index) =>
      Object.freeze({ id: index + 1, publicKey: 'P'.repeat(44) }),
    ),
    operationId: randomUUID(),
    registrationId: 1234,
    schemaVersion: 1,
    signedPreKeyId: 1,
    signedPreKeyPublic: 'Q'.repeat(44),
    signedPreKeySignature: 'R'.repeat(86),
    stableIdentityId: randomUUID(),
  });
}

export function signedHeaders(
  bodyText: string,
  deviceId: string,
  privateKey: KeyObject,
  requestTarget = '/v1/identity/register',
  method = 'POST',
  nonce = randomBytes(18).toString('base64url'),
): Readonly<Record<string, string>> {
  const timestamp = Date.now();
  const canonical = canonicalRequest({
    body: Buffer.from(bodyText, 'utf8'),
    method,
    nonce,
    requestTarget,
    timestamp,
  });
  return Object.freeze({
    'x-m2y-device-id': deviceId,
    'x-m2y-key-id': 'device-auth-v1',
    'x-m2y-nonce': nonce,
    'x-m2y-signature': signBytes('sha256', Buffer.from(canonical, 'utf8'), privateKey).toString(
      'base64url',
    ),
    'x-m2y-timestamp': String(timestamp),
  });
}
