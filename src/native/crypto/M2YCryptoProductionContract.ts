import {
  hasExactNativeKeys,
  invalidNativeResponse,
  isBoundedString,
  isNativeRecord,
  isPositiveSafeInteger,
  isUuidV4,
  type NativeRecord,
} from './strict-native-decoder';

const M2Y_ID_PATTERN =
  /^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export type ProductionIdentityAbsent = Readonly<{
  schemaVersion: 1;
  status: 'absent';
}>;

export type ProductionIdentitySummary = Readonly<{
  deviceId: string;
  displayName?: string;
  m2yId: string;
  revision: number;
  schemaVersion: 1;
  stableIdentityId: string;
}>;

export type ProductionIdentityPendingRegistration = ProductionIdentitySummary &
  Readonly<{
    operationId: string;
    status: 'pendingRegistration';
  }>;

export type ProductionIdentityUnpaired = ProductionIdentitySummary &
  Readonly<{
    registeredAtMs: number;
    status: 'unpaired';
  }>;

export type ProductionIdentityInspection =
  ProductionIdentityAbsent | ProductionIdentityPendingRegistration | ProductionIdentityUnpaired;

export type ProductionOneTimePreKey = Readonly<{
  id: number;
  publicKey: string;
}>;

export type ProductionIdentityRegistration = Readonly<{
  authPublicKey: string;
  deviceId: string;
  identityPublicKey: string;
  kyberPreKeyId: number;
  kyberPreKeyPublic: string;
  kyberPreKeySignature: string;
  m2yId: string;
  oneTimePreKeys: readonly ProductionOneTimePreKey[];
  operationId: string;
  registrationId: number;
  schemaVersion: 1;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  stableIdentityId: string;
}>;

export type ProductionDeviceSignature = Readonly<{
  deviceId: string;
  publicKeyId: 'device-auth-v1';
  schemaVersion: 1;
  signature: string;
}>;

export type ProductionIdentityReset = Readonly<{
  schemaVersion: 1;
  status: 'reset';
}>;

function isM2yId(value: unknown): value is string {
  return typeof value === 'string' && M2Y_ID_PATTERN.test(value);
}

function isBase64Url(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return isBoundedString(value, minimumLength, maximumLength) && BASE64_URL_PATTERN.test(value);
}

function isEpochMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1_577_836_800_000;
}

function hasIdentitySummary(value: NativeRecord): boolean {
  return (
    value.schemaVersion === 1 &&
    isUuidV4(value.deviceId) &&
    isUuidV4(value.stableIdentityId) &&
    isM2yId(value.m2yId) &&
    isPositiveSafeInteger(value.revision) &&
    (value.displayName === undefined || isBoundedString(value.displayName, 1, 64))
  );
}

function identityKeys(value: NativeRecord, additional: readonly string[]): readonly string[] {
  return [
    'deviceId',
    ...(value.displayName === undefined ? [] : ['displayName']),
    'm2yId',
    'revision',
    'schemaVersion',
    'stableIdentityId',
    ...additional,
  ];
}

export function decodeProductionIdentityInspection(value: unknown): ProductionIdentityInspection {
  if (!isNativeRecord(value)) return invalidNativeResponse();
  if (
    hasExactNativeKeys(value, ['schemaVersion', 'status']) &&
    value.schemaVersion === 1 &&
    value.status === 'absent'
  ) {
    return { schemaVersion: 1, status: 'absent' };
  }
  if (!hasIdentitySummary(value)) return invalidNativeResponse();

  const summary = {
    deviceId: value.deviceId as string,
    ...(value.displayName === undefined ? {} : { displayName: value.displayName as string }),
    m2yId: value.m2yId as string,
    revision: value.revision as number,
    schemaVersion: 1 as const,
    stableIdentityId: value.stableIdentityId as string,
  };

  if (
    value.status === 'pendingRegistration' &&
    hasExactNativeKeys(value, identityKeys(value, ['operationId', 'status'])) &&
    isUuidV4(value.operationId)
  ) {
    return { ...summary, operationId: value.operationId, status: 'pendingRegistration' };
  }
  if (
    value.status === 'unpaired' &&
    hasExactNativeKeys(value, identityKeys(value, ['registeredAtMs', 'status'])) &&
    isEpochMs(value.registeredAtMs)
  ) {
    return { ...summary, registeredAtMs: value.registeredAtMs, status: 'unpaired' };
  }
  return invalidNativeResponse();
}

export function decodeProductionIdentityRegistration(
  value: unknown,
): ProductionIdentityRegistration {
  const keys = [
    'authPublicKey',
    'deviceId',
    'identityPublicKey',
    'kyberPreKeyId',
    'kyberPreKeyPublic',
    'kyberPreKeySignature',
    'm2yId',
    'oneTimePreKeys',
    'operationId',
    'registrationId',
    'schemaVersion',
    'signedPreKeyId',
    'signedPreKeyPublic',
    'signedPreKeySignature',
    'stableIdentityId',
  ] as const;
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, keys) ||
    value.schemaVersion !== 1 ||
    !isUuidV4(value.deviceId) ||
    !isUuidV4(value.stableIdentityId) ||
    !isUuidV4(value.operationId) ||
    !isM2yId(value.m2yId) ||
    !isPositiveSafeInteger(value.registrationId) ||
    !isPositiveSafeInteger(value.signedPreKeyId) ||
    !isPositiveSafeInteger(value.kyberPreKeyId) ||
    !isBase64Url(value.authPublicKey, 64, 512) ||
    !isBase64Url(value.identityPublicKey, 32, 256) ||
    !isBase64Url(value.signedPreKeyPublic, 32, 256) ||
    !isBase64Url(value.signedPreKeySignature, 32, 256) ||
    !isBase64Url(value.kyberPreKeyPublic, 256, 4096) ||
    !isBase64Url(value.kyberPreKeySignature, 32, 256) ||
    !Array.isArray(value.oneTimePreKeys) ||
    value.oneTimePreKeys.length !== 16
  ) {
    return invalidNativeResponse();
  }

  const oneTimePreKeys = value.oneTimePreKeys.map((item) => {
    if (
      !isNativeRecord(item) ||
      !hasExactNativeKeys(item, ['id', 'publicKey']) ||
      !isPositiveSafeInteger(item.id) ||
      !isBase64Url(item.publicKey, 32, 256)
    ) {
      return invalidNativeResponse();
    }
    return { id: item.id, publicKey: item.publicKey };
  });
  if (new Set(oneTimePreKeys.map(({ id }) => id)).size !== oneTimePreKeys.length) {
    return invalidNativeResponse();
  }

  return {
    authPublicKey: value.authPublicKey,
    deviceId: value.deviceId,
    identityPublicKey: value.identityPublicKey,
    kyberPreKeyId: value.kyberPreKeyId,
    kyberPreKeyPublic: value.kyberPreKeyPublic,
    kyberPreKeySignature: value.kyberPreKeySignature,
    m2yId: value.m2yId,
    oneTimePreKeys,
    operationId: value.operationId,
    registrationId: value.registrationId,
    schemaVersion: 1,
    signedPreKeyId: value.signedPreKeyId,
    signedPreKeyPublic: value.signedPreKeyPublic,
    signedPreKeySignature: value.signedPreKeySignature,
    stableIdentityId: value.stableIdentityId,
  };
}

export function decodeProductionDeviceSignature(value: unknown): ProductionDeviceSignature {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['deviceId', 'publicKeyId', 'schemaVersion', 'signature']) ||
    !isUuidV4(value.deviceId) ||
    value.publicKeyId !== 'device-auth-v1' ||
    value.schemaVersion !== 1 ||
    !isBase64Url(value.signature, 64, 256)
  ) {
    return invalidNativeResponse();
  }
  return {
    deviceId: value.deviceId,
    publicKeyId: 'device-auth-v1',
    schemaVersion: 1,
    signature: value.signature,
  };
}

export function decodeProductionIdentityReset(value: unknown): ProductionIdentityReset {
  if (
    !isNativeRecord(value) ||
    !hasExactNativeKeys(value, ['schemaVersion', 'status']) ||
    value.schemaVersion !== 1 ||
    value.status !== 'reset'
  ) {
    return invalidNativeResponse();
  }
  return { schemaVersion: 1, status: 'reset' };
}
