import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from '../persistence/database.service';

type HealthResponse = Readonly<{
  database: 'ready';
  schemaVersion: number;
  status: 'ok';
}>;

@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  getHealth(): HealthResponse {
    return Object.freeze({
      database: 'ready',
      schemaVersion: this.databaseService.schemaVersion,
      status: 'ok',
    });
  }
}
