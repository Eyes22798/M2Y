/** Stable public failures shared with the pairing service through the versioned fixture. */
export const PAIRING_ERROR_CODES = [
  'request-invalid',
  'request-body-required',
  'request-body-too-large',
  'route-not-found',
  'rate-limited',
  'device-auth-headers-invalid',
  'device-auth-key-id-invalid',
  'device-auth-timestamp-invalid',
  'device-auth-timestamp-outside-window',
  'device-auth-nonce-invalid',
  'device-auth-signature-invalid',
  'device-auth-device-unknown',
  'device-auth-nonce-replayed',
  'identity-registration-idempotency-conflict',
  'identity-m2y-id-collision',
  'identity-stable-id-collision',
  'identity-device-id-collision',
  'identity-not-found',
  'identity-prekey-conflict',
  'identity-prekey-unavailable',
  'pairing-invite-idempotency-conflict',
  'pairing-target-unavailable',
  'pairing-relationship-conflict',
  'pairing-request-unavailable',
  'pairing-request-forbidden',
  'pairing-request-idempotency-conflict',
  'pairing-request-state-conflict',
  'internal-error',
] as const;

export type PairingErrorCode = (typeof PAIRING_ERROR_CODES)[number];

const pairingErrorCodeSet: ReadonlySet<string> = new Set(PAIRING_ERROR_CODES);

export function isPairingErrorCode(value: unknown): value is PairingErrorCode {
  return typeof value === 'string' && pairingErrorCodeSet.has(value);
}
