import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { IdentityRepository } from '../persistence/identity.repository';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  controllers: [IdentityController],
  imports: [AuthModule],
  providers: [IdentityRepository, IdentityService],
})
export class IdentityModule {}
