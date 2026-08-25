import { PairingServiceError } from '../http/pairing-service-error';

const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type HeaderBag = Readonly<Record<string, string | readonly string[] | undefined>>;

export type DeviceAuthHeaders = Readonly<{
  deviceId: string;
  keyId: 'device-auth-v1';
  nonce: string;
  signature: string;
  timestamp: number;
}>;

export function parseDeviceAuthHeaders(headers: HeaderBag): DeviceAuthHeaders {
  const deviceId = singleHeader(headers, 'x-m2y-device-id');
  const keyId = singleHeader(headers, 'x-m2y-key-id');
  const timestampText = singleHeader(headers, 'x-m2y-timestamp');
  const nonce = singleHeader(headers, 'x-m2y-nonce');
  const signature = singleHeader(headers, 'x-m2y-signature');

  if (!UUID_V4_PATTERN.test(deviceId)) {
    throw new PairingServiceError('device-auth-headers-invalid');
  }
  if (keyId !== 'device-auth-v1') {
    throw new PairingServiceError('device-auth-key-id-invalid');
  }
  if (!/^\d{1,16}$/u.test(timestampText)) {
    throw new PairingServiceError('device-auth-timestamp-invalid');
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new PairingServiceError('device-auth-timestamp-invalid');
  }
  if (nonce.length < 16 || nonce.length > 128 || !BASE64_URL_PATTERN.test(nonce)) {
    throw new PairingServiceError('device-auth-nonce-invalid');
  }
  if (signature.length < 64 || signature.length > 256 || !BASE64_URL_PATTERN.test(signature)) {
    throw new PairingServiceError('device-auth-signature-invalid');
  }

  return Object.freeze({ deviceId, keyId: 'device-auth-v1', nonce, signature, timestamp });
}

function singleHeader(headers: HeaderBag, name: string): string {
  const value = headers[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PairingServiceError('device-auth-headers-invalid');
  }
  return value;
}
