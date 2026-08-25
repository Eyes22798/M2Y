import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { DeviceAuthService, type VerifiedDeviceRequest } from './device-auth.service';
import type { HeaderBag } from './device-auth-headers';

export const AUTHENTICATED_DEVICE_ID = Symbol('AUTHENTICATED_DEVICE_ID');
export const AUTHENTICATED_DEVICE_REQUEST = Symbol('AUTHENTICATED_DEVICE_REQUEST');

export type SignedHttpRequest = Readonly<{
  headers: HeaderBag;
  method: string;
  originalUrl?: string;
  rawBody?: Buffer;
  url: string;
}> & {
  [AUTHENTICATED_DEVICE_ID]?: string;
  [AUTHENTICATED_DEVICE_REQUEST]?: VerifiedDeviceRequest;
};

@Injectable()
export class DeviceSignatureGuard implements CanActivate {
  constructor(private readonly deviceAuthService: DeviceAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SignedHttpRequest>();
    const verified = this.deviceAuthService.verifyRegisteredRequest({
      body: request.rawBody ?? Buffer.alloc(0),
      headers: request.headers,
      method: request.method,
      requestTarget: request.originalUrl ?? request.url,
    });
    request[AUTHENTICATED_DEVICE_ID] = verified.deviceId;
    request[AUTHENTICATED_DEVICE_REQUEST] = verified;
    return true;
  }
}
