import type { WorkspaceCommandOutcome, WorkspaceSession } from '@/application/workspace/contracts';

import type {
  DatabaseKeyGenerator,
  DatabaseKeyStore,
  DatabaseDeleteResult,
  DatabaseOpenResult,
  EncryptedDatabaseManager,
  EnvelopeReadResult,
  KeyReadResult,
  LocalCryptoDataResetter,
  SecureWriteResult,
} from './contracts';
import { parseDatabaseHexKey } from './contracts';
import { DefaultSecureWorkspaceController } from './controller';

const key = createTestKey();

function createSession(): WorkspaceSession {
  return {
    initialSnapshot: { messages: [], sharedItems: [] },
    execute: jest.fn<Promise<WorkspaceCommandOutcome>, []>(),
    loadSnapshot: jest.fn(async () => ({ messages: [], sharedItems: [] })),
    close: jest.fn(async () => undefined),
  };
}

function createHarness({
  envelope = { kind: 'absent' },
  keyRead = { kind: 'present', key },
  databasePresent = false,
}: {
  envelope?: EnvelopeReadResult;
  keyRead?: KeyReadResult;
  databasePresent?: boolean;
} = {}) {
  const session = createSession();
  const keyStore: DatabaseKeyStore = {
    readEnvelope: jest.fn(async () => envelope),
    writeEnvelope: jest.fn(async (): Promise<SecureWriteResult> => ({ ok: true })),
    readKey: jest.fn(async () => keyRead),
    writeKey: jest.fn(async (): Promise<SecureWriteResult> => ({ ok: true })),
    deleteKey: jest.fn(async (): Promise<SecureWriteResult> => ({ ok: true })),
    deleteEnvelope: jest.fn(async (): Promise<SecureWriteResult> => ({ ok: true })),
    canUseStrongBiometric: jest.fn(async () => true),
  };
  const databaseManager: EncryptedDatabaseManager = {
    databaseExists: jest.fn(async () => ({
      kind: databasePresent ? ('present' as const) : ('absent' as const),
    })),
    open: jest.fn(async (): Promise<DatabaseOpenResult> => ({ ok: true, session })),
    deleteDatabase: jest.fn(async (): Promise<DatabaseDeleteResult> => ({ ok: true })),
  };
  const keyGenerator: DatabaseKeyGenerator = {
    generateDatabaseKey: jest.fn(async () => key),
  };
  const localCryptoDataResetter: LocalCryptoDataResetter = {
    resetLocalCryptoData: jest.fn(async () => ({ ok: true as const })),
  };
  const controller = new DefaultSecureWorkspaceController({
    keyStore,
    databaseManager,
    keyGenerator,
    localCryptoDataResetter,
    platformSupported: true,
  });
  return { controller, databaseManager, keyStore, localCryptoDataResetter, session };
}

function createTestKey() {
  const value = parseDatabaseHexKey('ab'.repeat(32));
  if (!value) throw new Error('Test key must be valid');
  return value;
}

describe('DefaultSecureWorkspaceController', () => {
  it('provisions first-run storage before exposing a ready session', async () => {
    const { controller, keyStore } = createHarness();

    await controller.inspect();
    expect(controller.getState()).toEqual({
      status: 'setupRequired',
      strongBiometricAvailable: true,
    });

    await controller.setup('device');
    expect(controller.getState()).toMatchObject({ status: 'ready', mode: 'device' });
    expect(keyStore.writeEnvelope).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lifecycle: 'provisioning' }),
    );
    expect(keyStore.writeEnvelope).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lifecycle: 'ready' }),
    );
  });

  it('never treats an existing database without an envelope as first run', async () => {
    const { controller, databaseManager } = createHarness({ databasePresent: true });

    await controller.inspect();

    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      reason: 'database-without-envelope',
    });
    expect(databaseManager.open).not.toHaveBeenCalled();
  });

  it('offers destructive recovery for a malformed envelope even when the database is absent', async () => {
    const { controller, keyStore } = createHarness({ envelope: { kind: 'malformed' } });

    await controller.inspect();

    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      reason: 'envelope-invalid',
    });
    expect(keyStore.canUseStrongBiometric).not.toHaveBeenCalled();
  });

  it('keeps authentication cancellation locked', async () => {
    const { controller } = createHarness({
      databasePresent: true,
      envelope: {
        kind: 'present',
        envelope: {
          version: 1,
          databaseName: 'm2y-workspace-v1.db',
          protection: 'strong-biometric',
          lifecycle: 'ready',
        },
      },
      keyRead: { kind: 'authentication-cancelled' },
    });

    await controller.inspect();
    expect(controller.getState()).toEqual({ status: 'locked', mode: 'strong-biometric' });
    await controller.unlock();
    expect(controller.getState()).toEqual({
      status: 'locked',
      mode: 'strong-biometric',
      reason: 'authentication-cancelled',
    });
  });

  it('remains fail-closed when destructive reset is incomplete', async () => {
    const { controller, databaseManager } = createHarness({ databasePresent: true });
    await controller.inspect();
    jest.mocked(databaseManager.deleteDatabase).mockResolvedValueOnce({
      ok: false,
      reason: 'storage-unavailable',
    });

    await controller.resetLocalData();

    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      reason: 'reset-failed',
    });
  });

  it('keeps workspace data and remains fail-closed when native crypto cleanup fails', async () => {
    const { controller, databaseManager, localCryptoDataResetter } = createHarness({
      databasePresent: true,
    });
    await controller.inspect();
    jest.mocked(localCryptoDataResetter.resetLocalCryptoData).mockResolvedValueOnce({
      ok: false,
      reason: 'crypto-cleanup-failed',
    });

    await controller.resetLocalData();

    expect(controller.getState()).toEqual({
      status: 'recoveryRequired',
      reason: 'reset-failed',
    });
    expect(databaseManager.deleteDatabase).not.toHaveBeenCalled();
  });

  it('closes a biometric session before returning to locked on background', async () => {
    const { controller, session } = createHarness();
    await controller.inspect();
    await controller.setup('strong-biometric');

    await controller.handleAppBackground();

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'locked', mode: 'strong-biometric' });
  });
});
