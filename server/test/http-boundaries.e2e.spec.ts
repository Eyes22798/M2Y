import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID, type KeyObject } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import {
  generateSigningKey,
  registrationBody,
  signedHeaders,
  type RegistrationBody,
} from './support/signed-identity';

describe('HTTP pairing service boundaries', () => {
  let application: INestApplication;
  let identity: RegistrationBody;
  let privateKey: KeyObject;

  beforeAll(async () => {
    process.env.M2Y_SERVER_DATABASE_PATH = ':memory:';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const expressApplication = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      rawBody: true,
    });
    expressApplication.useBodyParser('json', { limit: '32kb' });
    configureApplication(expressApplication);
    await expressApplication.init();
    application = expressApplication;

    const signingKey = generateSigningKey();
    privateKey = signingKey.privateKey;
    identity = registrationBody(signingKey.publicKey, 'M2Y-CDEF-GHJK-MNPQ-RSTU');
    const bodyText = JSON.stringify(identity);
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(bodyText, identity.deviceId, privateKey))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(200);
  });

  afterAll(async () => {
    await application.close();
    delete process.env.M2Y_SERVER_DATABASE_PATH;
  });

  it('rejects oversized JSON before authentication with only a stable public code', async () => {
    await request(application.getHttpServer())
      .post('/v1/pair/requests/prepare')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ padding: 'A'.repeat(33 * 1024) }))
      .expect(413)
      .expect({ code: 'request-body-too-large', schemaVersion: 1 });
  });

  it('enforces the invitation route limit with a stable public response', async () => {
    for (let index = 0; index < 6; index += 1) {
      const bodyText = JSON.stringify({ kind: 'qr-ticket', operationId: randomUUID() });
      await request(application.getHttpServer())
        .post('/v1/pair/invites')
        .set(signedHeaders(bodyText, identity.deviceId, privateKey, '/v1/pair/invites'))
        .set('content-type', 'application/json')
        .send(bodyText)
        .expect(200);
    }

    const bodyText = JSON.stringify({ kind: 'qr-ticket', operationId: randomUUID() });
    await request(application.getHttpServer())
      .post('/v1/pair/invites')
      .set(signedHeaders(bodyText, identity.deviceId, privateKey, '/v1/pair/invites'))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(429)
      .expect({ code: 'rate-limited', schemaVersion: 1 });
  });
});
