import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('health endpoint', () => {
  let application: INestApplication;

  beforeAll(async () => {
    process.env.M2Y_SERVER_DATABASE_PATH = ':memory:';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    application = module.createNestApplication();
    await application.init();
  });

  afterAll(async () => {
    await application.close();
    delete process.env.M2Y_SERVER_DATABASE_PATH;
  });

  it('reports the migrated persistent boundary as ready', async () => {
    await request(application.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ database: 'ready', schemaVersion: 1, status: 'ok' });
  });
});
