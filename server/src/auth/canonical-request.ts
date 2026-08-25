import { createHash } from 'node:crypto';

import { PairingServiceError } from '../http/pairing-service-error';

const REQUEST_VERSION = 'M2Y-REQUEST-V1';

export function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function canonicalRequest(
  input: Readonly<{
    body: Uint8Array;
    method: string;
    nonce: string;
    requestTarget: string;
    timestamp: number;
  }>,
): string {
  const method = input.method.toUpperCase();
  if (!/^[A-Z]+$/u.test(method)) {
    throw new PairingServiceError('request-invalid');
  }

  return [
    REQUEST_VERSION,
    method,
    canonicalRequestTarget(input.requestTarget),
    String(input.timestamp),
    input.nonce,
    sha256Hex(input.body),
  ].join('\n');
}

export function canonicalRequestTarget(requestTarget: string): string {
  if (!requestTarget.startsWith('/') || requestTarget.includes('#')) {
    throw new PairingServiceError('request-invalid');
  }

  let parsed: URL;
  try {
    parsed = new URL(requestTarget, 'http://m2y.invalid');
  } catch {
    throw new PairingServiceError('request-invalid');
  }

  const sorted = [...parsed.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    },
  );
  const query = sorted
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return query.length === 0 ? parsed.pathname : `${parsed.pathname}?${query}`;
}
