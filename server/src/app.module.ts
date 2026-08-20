import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health/health.controller';
import { PersistenceModule } from './persistence/persistence.module';

@Module({
  controllers: [HealthController],
  imports: [
    PersistenceModule,
    ThrottlerModule.forRoot([
      {
        limit: 120,
        ttl: 60_000,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
