import type {
  DatabaseKeyGenerator,
  DatabaseKeyStore,
  EncryptedDatabaseManager,
  KeyEnvelopeV1,
  KeyReadResult,
  LocalCryptoDataResetter,
  ProtectionMode,
  SecureWorkspaceController,
  SecureWorkspaceEvent,
  SecureWorkspaceState,
} from './contracts';
import { workspaceDatabaseName } from './contracts';
import { initialSecureWorkspaceState, secureWorkspaceReducer } from './reducer';

type ControllerDependencies = Readonly<{
  keyStore: DatabaseKeyStore;
  databaseManager: EncryptedDatabaseManager;
  keyGenerator: DatabaseKeyGenerator;
  localCryptoDataResetter: LocalCryptoDataResetter;
  platformSupported: boolean;
}>;

export class DefaultSecureWorkspaceController implements SecureWorkspaceController {
  private state: SecureWorkspaceState = initialSecureWorkspaceState;
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;

  constructor(private readonly dependencies: ControllerDependencies) {}

  getState(): SecureWorkspaceState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  inspect(): Promise<void> {
    return this.runExclusive(() => this.inspectInternal());
  }

  setup(mode: ProtectionMode): Promise<void> {
    return this.runExclusive(() => this.setupInternal(mode));
  }

  unlock(): Promise<void> {
    return this.runExclusive(async () => {
      if (this.state.status !== 'locked') return;
      await this.openWithStoredKey('strong-biometric');
    });
  }

  resetLocalData(): Promise<void> {
    return this.runExclusive(() => this.resetInternal());
  }

  retry(): Promise<void> {
    return this.runExclusive(() => this.inspectInternal());
  }

  handleAppBackground(): Promise<void> {
    return this.runExclusive(async () => {
      if (this.state.status !== 'ready' || this.state.mode !== 'strong-biometric') return;
      const session = this.state.session;
      this.transition({ type: 'open', mode: 'strong-biometric' });
      try {
        await session.close();
        this.transition({ type: 'lock' });
      } catch {
        this.transition({ type: 'fail', code: 'close-failed', retryable: true });
      }
    });
  }

  private async inspectInternal(): Promise<void> {
    this.transition({ type: 'check' });
    if (!this.dependencies.platformSupported) {
      this.transition({ type: 'fail', code: 'unsupported-platform', retryable: false });
      return;
    }

    const [presence, envelopeResult] = await Promise.all([
      this.dependencies.databaseManager.databaseExists(),
      this.dependencies.keyStore.readEnvelope(),
    ]);
    if (presence.kind === 'unavailable' || envelopeResult.kind === 'unavailable') {
      this.transition({ type: 'fail', code: 'storage-unavailable', retryable: true });
      return;
    }
    if (envelopeResult.kind === 'malformed') {
      this.transition({ type: 'require-recovery', reason: 'envelope-invalid' });
      return;
    }
    if (envelopeResult.kind === 'absent') {
      if (presence.kind === 'present') {
        this.transition({ type: 'require-recovery', reason: 'database-without-envelope' });
        return;
      }
      await this.requireSetup();
      return;
    }

    const { envelope } = envelopeResult;
    if (envelope.lifecycle === 'provisioning') {
      this.transition({ type: 'require-recovery', reason: 'initialization-incomplete' });
      return;
    }
    if (presence.kind === 'absent') {
      this.transition({ type: 'require-recovery', reason: 'database-missing' });
      return;
    }
    if (envelope.protection === 'strong-biometric') {
      this.transition({ type: 'lock' });
      return;
    }
    await this.openWithStoredKey('device');
  }

  private async setupInternal(mode: ProtectionMode): Promise<void> {
    if (this.state.status !== 'setupRequired') return;
    if (mode === 'strong-biometric' && !this.state.strongBiometricAvailable) return;
    this.transition({ type: 'open', mode });

    const orphanDelete = await this.dependencies.keyStore.deleteKey();
    if (!orphanDelete.ok) {
      this.transition({ type: 'fail', code: 'storage-unavailable', retryable: true });
      return;
    }

    const provisioningEnvelope = createEnvelope(mode, 'provisioning');
    const envelopeWrite = await this.dependencies.keyStore.writeEnvelope(provisioningEnvelope);
    if (!envelopeWrite.ok) {
      this.transition({ type: 'fail', code: 'storage-unavailable', retryable: true });
      return;
    }

    let key;
    try {
      key = await this.dependencies.keyGenerator.generateDatabaseKey();
    } catch {
      this.transition({ type: 'require-recovery', reason: 'initialization-incomplete' });
      return;
    }

    const keyWrite = await this.dependencies.keyStore.writeKey(mode, key);
    if (!keyWrite.ok) {
      this.transition({ type: 'require-recovery', reason: 'initialization-incomplete' });
      return;
    }

    const opened = await this.dependencies.databaseManager.open(key);
    if (!opened.ok) {
      this.handleOpenFailure(opened);
      return;
    }

    const readyWrite = await this.dependencies.keyStore.writeEnvelope(
      createEnvelope(mode, 'ready'),
    );
    if (!readyWrite.ok) {
      await safeClose(opened.session);
      this.transition({ type: 'require-recovery', reason: 'initialization-incomplete' });
      return;
    }
    this.transition({ type: 'become-ready', mode, session: opened.session });
  }

  private async openWithStoredKey(mode: ProtectionMode): Promise<void> {
    this.transition({ type: 'open', mode });
    const keyResult = await this.dependencies.keyStore.readKey(mode);
    if (keyResult.kind !== 'present') {
      this.handleKeyReadFailure(keyResult, mode);
      return;
    }

    const opened = await this.dependencies.databaseManager.open(keyResult.key);
    if (!opened.ok) {
      this.handleOpenFailure(opened);
      return;
    }
    this.transition({ type: 'become-ready', mode, session: opened.session });
  }

  private async resetInternal(): Promise<void> {
    const activeSession = this.state.status === 'ready' ? this.state.session : null;
    this.transition({ type: 'check' });

    if (activeSession && !(await safeClose(activeSession))) {
      this.transition({ type: 'require-recovery', reason: 'reset-failed' });
      return;
    }
    const cryptoReset = await this.dependencies.localCryptoDataResetter.resetLocalCryptoData();
    if (!cryptoReset.ok) {
      this.transition({ type: 'require-recovery', reason: 'reset-failed' });
      return;
    }
    const databaseDelete = await this.dependencies.databaseManager.deleteDatabase();
    if (!databaseDelete.ok) {
      this.transition({ type: 'require-recovery', reason: 'reset-failed' });
      return;
    }
    const keyDelete = await this.dependencies.keyStore.deleteKey();
    if (!keyDelete.ok) {
      this.transition({ type: 'require-recovery', reason: 'reset-failed' });
      return;
    }
    const envelopeDelete = await this.dependencies.keyStore.deleteEnvelope();
    if (!envelopeDelete.ok) {
      this.transition({ type: 'require-recovery', reason: 'reset-failed' });
      return;
    }
    await this.requireSetup();
  }

  private handleKeyReadFailure(
    result: Exclude<KeyReadResult, { kind: 'present' }>,
    mode: ProtectionMode,
  ) {
    switch (result.kind) {
      case 'missing':
        this.transition({ type: 'require-recovery', reason: 'key-missing-or-invalidated' });
        return;
      case 'authentication-cancelled':
      case 'authentication-unavailable':
        if (mode === 'strong-biometric') {
          this.transition({ type: 'lock', reason: result.kind });
          return;
        }
        this.transition({ type: 'fail', code: 'storage-unavailable', retryable: true });
        return;
      case 'unavailable':
        this.transition({ type: 'fail', code: 'storage-unavailable', retryable: true });
        return;
      default:
        return assertNever(result);
    }
  }

  private handleOpenFailure(
    result: Exclude<Awaited<ReturnType<EncryptedDatabaseManager['open']>>, { ok: true }>,
  ) {
    if (result.kind === 'recovery') {
      this.transition({ type: 'require-recovery', reason: result.reason });
    } else {
      this.transition({ type: 'fail', code: result.code, retryable: result.retryable });
    }
  }

  private async requireSetup(): Promise<void> {
    const strongBiometricAvailable = await this.dependencies.keyStore.canUseStrongBiometric();
    this.transition({ type: 'require-setup', strongBiometricAvailable });
  }

  private transition(event: SecureWorkspaceEvent): void {
    this.state = secureWorkspaceReducer(this.state, event);
    for (const listener of this.listeners) listener();
  }

  private runExclusive(operation: () => Promise<void>): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const promise = operation().finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }
}

function createEnvelope(
  protection: ProtectionMode,
  lifecycle: KeyEnvelopeV1['lifecycle'],
): KeyEnvelopeV1 {
  return { version: 1, databaseName: workspaceDatabaseName, protection, lifecycle };
}

async function safeClose(session: { close(): Promise<void> }): Promise<boolean> {
  try {
    await session.close();
    return true;
  } catch {
    return false;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled secure result: ${String(value)}`);
}
