import type { WorkspaceSession } from '@/application/workspace/contracts';

export const workspaceDatabaseName = 'm2y-workspace-v1.db' as const;

declare const databaseHexKeyBrand: unique symbol;
export type DatabaseHexKey = string & { readonly [databaseHexKeyBrand]: true };

export type ProtectionMode = 'device' | 'strong-biometric';

export type KeyEnvelopeV1 = Readonly<{
  version: 1;
  databaseName: typeof workspaceDatabaseName;
  protection: ProtectionMode;
  lifecycle: 'provisioning' | 'ready';
}>;

export type EnvelopeReadResult =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'present'; envelope: KeyEnvelopeV1 }>
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'unavailable' }>;

export type KeyReadResult =
  | Readonly<{ kind: 'present'; key: DatabaseHexKey }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'authentication-cancelled' }>
  | Readonly<{ kind: 'authentication-unavailable' }>
  | Readonly<{ kind: 'unavailable' }>;

export type SecureWriteResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason: 'storage-unavailable' | 'authentication-cancelled' | 'authentication-unavailable';
    }>;

export type DatabasePresenceResult =
  Readonly<{ kind: 'present' }> | Readonly<{ kind: 'absent' }> | Readonly<{ kind: 'unavailable' }>;

export type RecoveryReason =
  | 'database-without-envelope'
  | 'database-missing'
  | 'envelope-invalid'
  | 'initialization-incomplete'
  | 'key-missing-or-invalidated'
  | 'database-unreadable'
  | 'reset-failed';

export type FatalStorageCode =
  | 'unsupported-platform'
  | 'storage-unavailable'
  | 'envelope-invalid'
  | 'database-open-failed'
  | 'migration-failed'
  | 'initial-data-inconsistent'
  | 'integrity-failed'
  | 'data-corrupt'
  | 'close-failed';

export type DatabaseOpenResult =
  | Readonly<{ ok: true; session: WorkspaceSession }>
  | Readonly<{ ok: false; kind: 'recovery'; reason: RecoveryReason }>
  | Readonly<{ ok: false; kind: 'fatal'; code: FatalStorageCode; retryable: boolean }>;

export type DatabaseDeleteResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'storage-unavailable' }>;

export type UnlockFailureCode = 'authentication-cancelled' | 'authentication-unavailable';

export type SecureWorkspaceState =
  | Readonly<{ status: 'checking' }>
  | Readonly<{ status: 'setupRequired'; strongBiometricAvailable: boolean }>
  | Readonly<{ status: 'locked'; mode: 'strong-biometric'; reason?: UnlockFailureCode }>
  | Readonly<{ status: 'opening'; mode: ProtectionMode }>
  | Readonly<{ status: 'ready'; mode: ProtectionMode; session: WorkspaceSession }>
  | Readonly<{ status: 'recoveryRequired'; reason: RecoveryReason }>
  | Readonly<{ status: 'fatal'; code: FatalStorageCode; retryable: boolean }>;

export type SecureWorkspaceEvent =
  | Readonly<{ type: 'check' }>
  | Readonly<{ type: 'require-setup'; strongBiometricAvailable: boolean }>
  | Readonly<{ type: 'lock'; reason?: UnlockFailureCode }>
  | Readonly<{ type: 'open'; mode: ProtectionMode }>
  | Readonly<{ type: 'become-ready'; mode: ProtectionMode; session: WorkspaceSession }>
  | Readonly<{ type: 'require-recovery'; reason: RecoveryReason }>
  | Readonly<{ type: 'fail'; code: FatalStorageCode; retryable: boolean }>;

export interface DatabaseKeyStore {
  readEnvelope(): Promise<EnvelopeReadResult>;
  writeEnvelope(envelope: KeyEnvelopeV1): Promise<SecureWriteResult>;
  readKey(mode: ProtectionMode): Promise<KeyReadResult>;
  writeKey(mode: ProtectionMode, key: DatabaseHexKey): Promise<SecureWriteResult>;
  deleteKey(): Promise<SecureWriteResult>;
  deleteEnvelope(): Promise<SecureWriteResult>;
  canUseStrongBiometric(): Promise<boolean>;
}

export interface EncryptedDatabaseManager {
  databaseExists(): Promise<DatabasePresenceResult>;
  open(key: DatabaseHexKey): Promise<DatabaseOpenResult>;
  deleteDatabase(): Promise<DatabaseDeleteResult>;
}

export interface DatabaseKeyGenerator {
  generateDatabaseKey(): Promise<DatabaseHexKey>;
}

export type LocalCryptoDataResetResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'crypto-cleanup-failed' }>;

export interface LocalCryptoDataResetter {
  resetLocalCryptoData(): Promise<LocalCryptoDataResetResult>;
}

export interface SecureWorkspaceController {
  getState(): SecureWorkspaceState;
  subscribe(listener: () => void): () => void;
  inspect(): Promise<void>;
  setup(mode: ProtectionMode): Promise<void>;
  unlock(): Promise<void>;
  resetLocalData(): Promise<void>;
  retry(): Promise<void>;
  handleAppBackground(): Promise<void>;
}

export function parseDatabaseHexKey(value: string): DatabaseHexKey | null {
  return /^[0-9a-f]{64}$/.test(value) ? (value as DatabaseHexKey) : null;
}
