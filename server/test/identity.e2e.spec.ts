import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { PairingServiceError } from '../src/http/pairing-service-error';
import { PairingInvitationService } from '../src/pairing/pairing-invitation.service';
import { DatabaseService } from '../src/persistence/database.service';
import { IdentityRepository } from '../src/persistence/identity.repository';
import { generateSigningKey, registrationBody, signedHeaders } from './support/signed-identity';

describe('identity registration and device authentication', () => {
  let application: INestApplication;
  let databaseService: DatabaseService;
  let identityRepository: IdentityRepository;
  let pairingInvitationService: PairingInvitationService;

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
    databaseService = application.get(DatabaseService);
    identityRepository = application.get(IdentityRepository);
    pairingInvitationService = application.get(PairingInvitationService);
  });

  afterAll(async () => {
    await application.close();
    delete process.env.M2Y_SERVER_DATABASE_PATH;
  });

  it('registers a self-signed device, retries idempotently and serves signed status', async () => {
    const signingKey = generateSigningKey();
    const body = registrationBody(signingKey.publicKey, 'M2Y-2345-6789-ABCD-EFGH');
    const bodyText = JSON.stringify(body);

    const first = await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(bodyText, body.deviceId, signingKey.privateKey))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(200);
    expect(first.body).toEqual({
      deviceId: body.deviceId,
      m2yId: body.m2yId,
      receiptId: expect.any(String),
      registeredAtMs: expect.any(Number),
      schemaVersion: 1,
      status: 'registered',
    });

    const retry = await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(bodyText, body.deviceId, signingKey.privateKey))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(200);
    expect(retry.body).toEqual(first.body);

    const status = await request(application.getHttpServer())
      .get('/v1/identity/status')
      .set(signedHeaders('', body.deviceId, signingKey.privateKey, '/v1/identity/status', 'GET'))
      .expect(200);
    expect(status.body).toEqual({
      deviceId: body.deviceId,
      m2yId: body.m2yId,
      oneTimePreKeyCount: 16,
      registeredAtMs: first.body.registeredAtMs,
      schemaVersion: 1,
      stableIdentityId: body.stableIdentityId,
      status: 'registered',
    });

    const firstLease = identityRepository.leasePublicBundle(
      body.deviceId,
      randomUUID(),
      Date.now(),
      Date.now() + 600_000,
    );
    const leaseRequestId = randomUUID();
    const idempotentLease = identityRepository.leasePublicBundle(
      body.deviceId,
      leaseRequestId,
      Date.now(),
      Date.now() + 600_000,
    );
    const repeatedLease = identityRepository.leasePublicBundle(
      body.deviceId,
      leaseRequestId,
      Date.now(),
      Date.now() + 600_000,
    );
    expect(repeatedLease).toEqual(idempotentLease);
    expect(idempotentLease.oneTimePreKey.id).not.toBe(firstLease.oneTimePreKey.id);

    const replenishBody = Object.freeze({
      oneTimePreKeys: [
        { id: 101, publicKey: 'X'.repeat(44) },
        { id: 102, publicKey: 'Y'.repeat(44) },
      ],
      operationId: randomUUID(),
    });
    const replenishText = JSON.stringify(replenishBody);
    const replenished = await request(application.getHttpServer())
      .post('/v1/identity/prekeys/replenish')
      .set(
        signedHeaders(
          replenishText,
          body.deviceId,
          signingKey.privateKey,
          '/v1/identity/prekeys/replenish',
        ),
      )
      .set('content-type', 'application/json')
      .send(replenishText)
      .expect(200);
    expect(replenished.body).toEqual({
      addedCount: 2,
      operationId: replenishBody.operationId,
      schemaVersion: 1,
      status: 'replenished',
    });
    await request(application.getHttpServer())
      .post('/v1/identity/prekeys/replenish')
      .set(
        signedHeaders(
          replenishText,
          body.deviceId,
          signingKey.privateKey,
          '/v1/identity/prekeys/replenish',
        ),
      )
      .set('content-type', 'application/json')
      .send(replenishText)
      .expect(200)
      .expect(replenished.body);
  });

  it('rejects nonce replay even when registration would otherwise be idempotent', async () => {
    const signingKey = generateSigningKey();
    const body = registrationBody(signingKey.publicKey, 'M2Y-JKLM-NPQR-STUV-WXYZ');
    const bodyText = JSON.stringify(body);
    const nonce = randomBytes(18).toString('base64url');
    const headers = signedHeaders(
      bodyText,
      body.deviceId,
      signingKey.privateKey,
      undefined,
      undefined,
      nonce,
    );

    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(headers)
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(200);
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(headers)
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(409)
      .expect({ code: 'device-auth-nonce-replayed', schemaVersion: 1 });
  });

  it('returns a stable collision without exposing the existing identity', async () => {
    const firstKey = generateSigningKey();
    const secondKey = generateSigningKey();
    const firstBody = registrationBody(firstKey.publicKey, 'M2Y-BCDE-FGHJ-KLMN-PQRS');
    const secondBody = registrationBody(secondKey.publicKey, firstBody.m2yId);
    const firstText = JSON.stringify(firstBody);
    const secondText = JSON.stringify(secondBody);

    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(firstText, firstBody.deviceId, firstKey.privateKey))
      .set('content-type', 'application/json')
      .send(firstText)
      .expect(200);
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(secondText, secondBody.deviceId, secondKey.privateKey))
      .set('content-type', 'application/json')
      .send(secondText)
      .expect(409)
      .expect({ code: 'identity-m2y-id-collision', schemaVersion: 1 });
  });

  it('rejects invalid signatures and unknown DTO fields with stable responses', async () => {
    const signingKey = generateSigningKey();
    const wrongKey = generateSigningKey();
    const body = registrationBody(signingKey.publicKey, 'M2Y-TUVW-XYZ2-3456-789A');
    const bodyText = JSON.stringify(body);

    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(bodyText, body.deviceId, wrongKey.privateKey))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(401)
      .expect({ code: 'device-auth-signature-invalid', schemaVersion: 1 });

    const extendedText = JSON.stringify({ ...body, privateIdentityKey: 'must-never-be-accepted' });
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(extendedText, body.deviceId, signingKey.privateKey))
      .set('content-type', 'application/json')
      .send(extendedText)
      .expect(400)
      .expect({ code: 'request-invalid', schemaVersion: 1 });
  });

  it('creates deterministic one-time QR tickets and expiring handshake codes without storing plaintext', async () => {
    const signingKey = generateSigningKey();
    const identity = registrationBody(signingKey.publicKey, 'M2Y-ABCE-FGHJ-KLMN-PQRT');
    const identityText = JSON.stringify(identity);
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(identityText, identity.deviceId, signingKey.privateKey))
      .set('content-type', 'application/json')
      .send(identityText)
      .expect(200);

    const qrInput = Object.freeze({ kind: 'qr-ticket', operationId: randomUUID() });
    const qrText = JSON.stringify(qrInput);
    const qrHeaders = () =>
      signedHeaders(qrText, identity.deviceId, signingKey.privateKey, '/v1/pair/invites');
    const qr = await request(application.getHttpServer())
      .post('/v1/pair/invites')
      .set(qrHeaders())
      .set('content-type', 'application/json')
      .send(qrText)
      .expect(200);
    const qrRetry = await request(application.getHttpServer())
      .post('/v1/pair/invites')
      .set(qrHeaders())
      .set('content-type', 'application/json')
      .send(qrText)
      .expect(200);
    expect(qrRetry.body).toEqual(qr.body);
    expect(qr.body).toEqual({
      deepLink: `m2y://pair?ticket=${String(qr.body.ticket)}`,
      expiresAtMs: expect.any(Number),
      inviteId: expect.any(String),
      kind: 'qr-ticket',
      operationId: qrInput.operationId,
      schemaVersion: 1,
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    });

    const qrStored = databaseService.connection
      .prepare('SELECT ticket_hash FROM pair_invites WHERE invite_id = ?')
      .get(qr.body.inviteId) as { ticket_hash: string };
    expect(qrStored.ticket_hash).not.toContain(qr.body.ticket as string);
    expect(pairingInvitationService.consume('qr-ticket', qr.body.ticket as string)).toBe(
      identity.deviceId,
    );
    expect(() => pairingInvitationService.consume('qr-ticket', qr.body.ticket as string)).toThrow(
      new PairingServiceError('pairing-target-unavailable'),
    );

    const codeInput = Object.freeze({ kind: 'handshake-code', operationId: randomUUID() });
    const codeText = JSON.stringify(codeInput);
    const code = await request(application.getHttpServer())
      .post('/v1/pair/invites')
      .set(signedHeaders(codeText, identity.deviceId, signingKey.privateKey, '/v1/pair/invites'))
      .set('content-type', 'application/json')
      .send(codeText)
      .expect(200);
    expect(code.body.code).toEqual(expect.stringMatching(/^[23456789A-HJ-NP-Z]{8}$/u));
    const codeStored = databaseService.connection
      .prepare('SELECT code_hash FROM pair_invites WHERE invite_id = ?')
      .get(code.body.inviteId) as { code_hash: string };
    expect(codeStored.code_hash).not.toContain(code.body.code as string);
    expect(() =>
      pairingInvitationService.consume(
        'handshake-code',
        code.body.code as string,
        (code.body.expiresAtMs as number) + 1,
      ),
    ).toThrow(new PairingServiceError('pairing-target-unavailable'));
  });
});
