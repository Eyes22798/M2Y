import * as SecureStore from 'expo-secure-store';

import {
  parseDatabaseHexKey,
  workspaceDatabaseName,
  type DatabaseHexKey,
  type DatabaseKeyStore,
  type EnvelopeReadResult,
  type KeyEnvelopeV1,
  type KeyReadResult,
  type ProtectionMode,
  type SecureWriteResult,
} from '@/application/secure-workspace/contracts';

const envelopeKey = 'm2y.storage.envelope.v1';
const databaseKey = 'm2y.storage.database-key.v1';
const envelopeService = 'm2y.storage.envelope-service.v1';
const deviceKeyService = 'm2y.storage.database-key.device.v1';
const biometricKeyService = 'm2y.storage.database-key.biometric.v1';
const authenticationPrompt = '解锁 M2Y 本地加密空间';

export class ExpoDatabaseKeyStore implements DatabaseKeyStore {
  async readEnvelope(): Promise<EnvelopeReadResult> {
    if (!(await isSecureStoreAvailable())) return { kind: 'unavailable' };

    let value: string | null;
    try {
      value = await SecureStore.getItemAsync(envelopeKey, envelopeOptions);
    } catch {
      return { kind: 'unavailable' };
    }
    if (value === null) return { kind: 'absent' };

    try {
      const decoded: unknown = JSON.parse(value);
      return isKeyEnvelope(decoded)
        ? { kind: 'present', envelope: decoded }
        : { kind: 'malformed' };
    } catch {
      return { kind: 'malformed' };
    }
  }

  async writeEnvelope(envelope: KeyEnvelopeV1): Promise<SecureWriteResult> {
    if (!(await isSecureStoreAvailable())) return unavailable();
    try {
      await SecureStore.setItemAsync(envelopeKey, JSON.stringify(envelope), envelopeOptions);
      return { ok: true };
    } catch {
      return unavailable();
    }
  }

  async readKey(mode: ProtectionMode): Promise<KeyReadResult> {
    if (!(await isSecureStoreAvailable())) return { kind: 'unavailable' };
    try {
      const value = await SecureStore.getItemAsync(databaseKey, keyOptions(mode));
      if (value === null) return { kind: 'missing' };
      const key = parseDatabaseHexKey(value);
      return key ? { kind: 'present', key } : { kind: 'missing' };
    } catch (error: unknown) {
      return classifyReadFailure(error, mode);
    }
  }

  async writeKey(mode: ProtectionMode, key: DatabaseHexKey): Promise<SecureWriteResult> {
    if (!(await isSecureStoreAvailable())) return unavailable();
    try {
      await SecureStore.setItemAsync(databaseKey, key, keyOptions(mode));
      return { ok: true };
    } catch (error: unknown) {
      return classifyWriteFailure(error, mode);
    }
  }

  async deleteKey(): Promise<SecureWriteResult> {
    if (!(await isSecureStoreAvailable())) return unavailable();

    let failed = false;
    for (const service of [deviceKeyService, biometricKeyService]) {
      try {
        await SecureStore.deleteItemAsync(databaseKey, { keychainService: service });
      } catch {
        failed = true;
      }
    }
    return failed ? unavailable() : { ok: true };
  }

  async deleteEnvelope(): Promise<SecureWriteResult> {
    if (!(await isSecureStoreAvailable())) return unavailable();
    try {
      await SecureStore.deleteItemAsync(envelopeKey, envelopeOptions);
      return { ok: true };
    } catch {
      return unavailable();
    }
  }

  async canUseStrongBiometric(): Promise<boolean> {
    if (!(await isSecureStoreAvailable())) return false;
    try {
      return SecureStore.canUseBiometricAuthentication();
    } catch {
      return false;
    }
  }
}

const envelopeOptions: SecureStore.SecureStoreOptions = {
  keychainService: envelopeService,
  requireAuthentication: false,
};

function keyOptions(mode: ProtectionMode): SecureStore.SecureStoreOptions {
  return mode === 'strong-biometric'
    ? {
        keychainService: biometricKeyService,
        requireAuthentication: true,
        authenticationPrompt,
      }
    : { keychainService: deviceKeyService, requireAuthentication: false };
}

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function isKeyEnvelope(value: unknown): value is KeyEnvelopeV1 {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    value.databaseName === workspaceDatabaseName &&
    (value.protection === 'device' || value.protection === 'strong-biometric') &&
    (value.lifecycle === 'provisioning' || value.lifecycle === 'ready')
  );
}

function classifyReadFailure(error: unknown, mode: ProtectionMode): KeyReadResult {
  if (mode !== 'strong-biometric') return { kind: 'unavailable' };
  return hasCancellationSignal(error)
    ? { kind: 'authentication-cancelled' }
    : { kind: 'authentication-unavailable' };
}

function classifyWriteFailure(error: unknown, mode: ProtectionMode): SecureWriteResult {
  if (mode !== 'strong-biometric') return unavailable();
  return hasCancellationSignal(error)
    ? { ok: false, reason: 'authentication-cancelled' }
    : { ok: false, reason: 'authentication-unavailable' };
}

function hasCancellationSignal(error: unknown): boolean {
  if (!isRecord(error) || typeof error.message !== 'string') return false;
  const message = error.message.toLowerCase();
  return message.includes('user canceled') || message.includes('user cancelled');
}

function unavailable(): SecureWriteResult {
  return { ok: false, reason: 'storage-unavailable' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
