import type { PairingErrorCode } from '../contracts/pairing-error-codes';

const ERROR_STATUS = Object.freeze({
  'request-invalid': 400,
  'request-body-required': 400,
  'request-body-too-large': 413,
  'route-not-found': 404,
  'rate-limited': 429,
  'device-auth-headers-invalid': 401,
  'device-auth-key-id-invalid': 401,
  'device-auth-timestamp-invalid': 401,
  'device-auth-timestamp-outside-window': 401,
  'device-auth-nonce-invalid': 401,
  'device-auth-signature-invalid': 401,
  'device-auth-device-unknown': 401,
  'device-auth-nonce-replayed': 409,
  'identity-registration-idempotency-conflict': 409,
  'identity-m2y-id-collision': 409,
  'identity-stable-id-collision': 409,
  'identity-device-id-collision': 409,
  'identity-not-found': 404,
  'identity-prekey-conflict': 409,
  'identity-prekey-unavailable': 409,
  'pairing-invite-idempotency-conflict': 409,
  'pairing-target-unavailable': 404,
  'pairing-relationship-conflict': 409,
  'pairing-request-unavailable': 404,
  'pairing-request-forbidden': 403,
  'pairing-request-idempotency-conflict': 409,
  'pairing-request-state-conflict': 409,
  'internal-error': 500,
} satisfies Readonly<Record<PairingErrorCode, number>>);

/** A public failure that carries only a fixture-backed code, never raw exception text. */
export class PairingServiceError extends Error {
  readonly code: PairingErrorCode;
  readonly status: number;

  constructor(code: PairingErrorCode) {
    super(code);
    this.code = code;
    this.name = 'PairingServiceError';
    this.status = ERROR_STATUS[code];
  }
}
