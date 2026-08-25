import { Injectable } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';

import { PairingServiceError } from '../http/pairing-service-error';
import { canonicalRequest, sha256Base64Url, sha256Hex } from './canonical-request';
import { DeviceAuthRepository } from './device-auth.repository';
import { type HeaderBag, parseDeviceAuthHeaders } from './device-auth-headers';

const ALLOWED_CLOCK_SKEW_MS = 5 * 60_000;

export type VerifiedDeviceRequest = Readonly<{
  bodyHash: string;
  deviceId: string;
  nonceExpiresAtMs: number;
  nonceHash: string;
}>;

@Injectable()
export class DeviceAuthService {
  constructor(private readonly repository: DeviceAuthRepository) {}

  verifyRegisteredRequest(
    input: Readonly<{
      body: Uint8Array;
      headers: HeaderBag;
      method: string;
      nowMs?: number;
      requestTarget: string;
    }>,
  ): VerifiedDeviceRequest {
    const headers = parseDeviceAuthHeaders(input.headers);
    const publicKey = this.repository.findPublicKey(headers.deviceId);
    if (publicKey === undefined) {
      throw new PairingServiceError('device-auth-device-unknown');
    }

    const verified = this.verifyWithPublicKey({ ...input, headers: input.headers, publicKey });
    this.repository.consumeNonce(
      verified.deviceId,
      verified.nonceHash,
      verified.nonceExpiresAtMs,
      input.nowMs ?? Date.now(),
    );
    return verified;
  }

  verifySelfSignedRequest(
    input: Readonly<{
      body: Uint8Array;
      deviceId: string;
      headers: HeaderBag;
      method: string;
      nowMs?: number;
      publicKey: string;
      requestTarget: string;
    }>,
  ): VerifiedDeviceRequest {
    const headers = parseDeviceAuthHeaders(input.headers);
    if (headers.deviceId !== input.deviceId) {
      throw new PairingServiceError('device-auth-headers-invalid');
    }
    return this.verifyWithPublicKey(input);
  }

  private verifyWithPublicKey(
    input: Readonly<{
      body: Uint8Array;
      headers: HeaderBag;
      method: string;
      nowMs?: number;
      publicKey: string;
      requestTarget: string;
    }>,
  ): VerifiedDeviceRequest {
    const headers = parseDeviceAuthHeaders(input.headers);
    const nowMs = input.nowMs ?? Date.now();
    if (Math.abs(nowMs - headers.timestamp) > ALLOWED_CLOCK_SKEW_MS) {
      throw new PairingServiceError('device-auth-timestamp-outside-window');
    }

    const canonical = canonicalRequest({
      body: input.body,
      method: input.method,
      nonce: headers.nonce,
      requestTarget: input.requestTarget,
      timestamp: headers.timestamp,
    });
    if (!verifyP256(input.publicKey, canonical, headers.signature)) {
      throw new PairingServiceError('device-auth-signature-invalid');
    }

    return Object.freeze({
      bodyHash: sha256Hex(input.body),
      deviceId: headers.deviceId,
      nonceExpiresAtMs: nowMs + ALLOWED_CLOCK_SKEW_MS,
      nonceHash: sha256Base64Url(headers.nonce),
    });
  }
}

function verifyP256(
  publicKeyBase64Url: string,
  canonical: string,
  signatureBase64Url: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      format: 'der',
      key: Buffer.from(publicKeyBase64Url, 'base64url'),
      type: 'spki',
    });
    if (
      publicKey.asymmetricKeyType !== 'ec' ||
      publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      return false;
    }
    return verify(
      'sha256',
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(signatureBase64Url, 'base64url'),
    );
  } catch {
    return false;
  }
}
