import { Global, Module } from '@nestjs/common';

import { SERVER_CONFIG, readServerConfig } from '../bootstrap/server-config';
import { DatabaseService } from './database.service';
import { ServiceMetadataRepository } from './service-metadata.repository';

@Global()
@Module({
  exports: [DatabaseService, ServiceMetadataRepository, SERVER_CONFIG],
  providers: [
    {
      provide: SERVER_CONFIG,
      useFactory: readServerConfig,
    },
    DatabaseService,
    ServiceMetadataRepository,
  ],
})
export class PersistenceModule {}
