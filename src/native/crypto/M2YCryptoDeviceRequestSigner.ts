import type { DeviceRequestSignature, DeviceRequestSigner } from '@/application/pairing/contracts';

import { signM2YDeviceRequest } from './M2YCryptoProductionAdapter';

export class M2YCryptoDeviceRequestSigner implements DeviceRequestSigner {
  async signDeviceRequest(canonicalRequest: string): Promise<DeviceRequestSignature> {
    const signed = await signM2YDeviceRequest(canonicalRequest);
    return {
      deviceId: signed.deviceId,
      publicKeyId: signed.publicKeyId,
      signature: signed.signature,
    };
  }
}
