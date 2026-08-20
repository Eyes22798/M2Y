import type { SecureWorkspaceEvent, SecureWorkspaceState } from './contracts';

export const initialSecureWorkspaceState: SecureWorkspaceState = { status: 'checking' };

export function secureWorkspaceReducer(
  state: SecureWorkspaceState,
  event: SecureWorkspaceEvent,
): SecureWorkspaceState {
  switch (event.type) {
    case 'check':
      return { status: 'checking' };
    case 'require-setup':
      return {
        status: 'setupRequired',
        strongBiometricAvailable: event.strongBiometricAvailable,
      };
    case 'lock':
      return event.reason
        ? { status: 'locked', mode: 'strong-biometric', reason: event.reason }
        : { status: 'locked', mode: 'strong-biometric' };
    case 'open':
      return { status: 'opening', mode: event.mode };
    case 'become-ready':
      if (state.status !== 'opening') return invalidTransition();
      return { status: 'ready', mode: event.mode, session: event.session };
    case 'require-recovery':
      return { status: 'recoveryRequired', reason: event.reason };
    case 'fail':
      return { status: 'fatal', code: event.code, retryable: event.retryable };
    default:
      return assertNever(event);
  }
}

function invalidTransition(): never {
  throw new Error('Invalid secure workspace state transition');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled secure workspace event: ${String(value)}`);
}
