import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { IdentityRepository } from '../persistence/identity.repository';
import { PairingInviteRepository } from '../persistence/pairing-invite.repository';
import { PairingRequestRepository } from '../persistence/pairing-request.repository';
import { PairingInvitationService } from './pairing-invitation.service';
import { PairingController } from './pairing.controller';
import { PairingRequestService } from './pairing-request.service';

@Module({
  controllers: [PairingController],
  imports: [AuthModule],
  providers: [
    IdentityRepository,
    PairingInvitationService,
    PairingInviteRepository,
    PairingRequestRepository,
    PairingRequestService,
  ],
})
export class PairingModule {}
