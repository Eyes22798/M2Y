import type { DeviceRequestSignature, DeviceRequestSigner } from '@/application/pairing/contracts';

export class M2YCryptoDeviceRequestSigner implements DeviceRequestSigner {
  async signDeviceRequest(canonicalRequest: string): Promise<DeviceRequestSignature> {
    // 原生模块按调用加载，避免仅构造 Web/Jest runtime 就触发 Android module 解析。
    const { signM2YDeviceRequest } = await import('./M2YCryptoProductionAdapter');
    const signed = await signM2YDeviceRequest(canonicalRequest);
    return {
      deviceId: signed.deviceId,
      publicKeyId: signed.publicKeyId,
      signature: signed.signature,
    };
  }
}
