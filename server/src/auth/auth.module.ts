import { Module } from '@nestjs/common';

import { DeviceAuthRepository } from './device-auth.repository';
import { DeviceAuthService } from './device-auth.service';
import { DeviceSignatureGuard } from './device-signature.guard';

@Module({
  exports: [DeviceAuthService, DeviceSignatureGuard],
  providers: [DeviceAuthRepository, DeviceAuthService, DeviceSignatureGuard],
})
export class AuthModule {}
