import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytesAsync,
} from 'expo-crypto';

import type { DeviceRequestSigner } from '@/application/pairing/contracts';

import { PairingApiClient } from './PairingApiClient';

export function createExpoPairingApiClient(
  baseUrl: string,
  signer: DeviceRequestSigner,
): PairingApiClient {
  return new PairingApiClient({
    baseUrl,
    createNonce: async () => {
      const bytes = await getRandomBytesAsync(18);
      return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    },
    fetch: (url, request) => fetch(url, request),
    hashBody: (body) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, body, { encoding: CryptoEncoding.HEX }),
    nowMs: Date.now,
    signer,
  });
}
