import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID, type KeyObject } from 'node:crypto';
import request, { type Test as HttpTest } from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { DatabaseService } from '../src/persistence/database.service';
import {
  generateSigningKey,
  registrationBody,
  signedHeaders,
  type RegistrationBody,
} from './support/signed-identity';

type TestDevice = Readonly<{
  identity: RegistrationBody;
  privateKey: KeyObject;
}>;

describe('persistent pairing API', () => {
  let application: INestApplication;
  let databaseService: DatabaseService;

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
  });

  afterAll(async () => {
    await application.close();
    delete process.env.M2Y_SERVER_DATABASE_PATH;
  });

  it('runs M2Y-ID prepare, opaque packet relay, reciprocal verification and unique activation', async () => {
    const alice = await registerDevice('M2Y-2345-6789-ABCD-EFGH');
    const bob = await registerDevice('M2Y-JKLM-NPQR-STUV-WXYZ');
    const prepareBody = Object.freeze({
      m2yId: bob.identity.m2yId,
      method: 'm2y-id',
      operationId: randomUUID(),
    });
    const prepared = await signedPost(alice, '/v1/pair/requests/prepare', prepareBody).expect(200);
    expect(prepared.body).toEqual({
      expiresAtMs: expect.any(Number),
      method: 'm2y-id',
      requestId: expect.any(String),
      schemaVersion: 1,
      status: 'prepared',
      targetBundle: expect.objectContaining({
        deviceId: bob.identity.deviceId,
        m2yId: bob.identity.m2yId,
        oneTimePreKey: { id: 1, publicKey: 'P'.repeat(44) },
      }),
    });
    await signedPost(alice, '/v1/pair/requests/prepare', prepareBody)
      .expect(200)
      .expect(prepared.body);

    const requestId = prepared.body.requestId as string;
    const submitBody = Object.freeze({ operationId: randomUUID(), packet: 'A'.repeat(64) });
    const submitted = await signedPost(
      alice,
      `/v1/pair/requests/${requestId}/submit`,
      submitBody,
    ).expect(200);
    expect(submitted.body).toEqual({
      eventCursor: expect.any(Number),
      operationId: submitBody.operationId,
      requestId,
      schemaVersion: 1,
      status: 'pending',
    });
    await signedPost(alice, `/v1/pair/requests/${requestId}/submit`, submitBody)
      .expect(200)
      .expect(submitted.body);

    const bobEvents = await signedGet(bob, '/v1/pair/events?after=0').expect(200);
    expect(bobEvents.body.events).toEqual([
      expect.objectContaining({
        packet: submitBody.packet,
        requestId,
        status: 'pending',
        type: 'pair-request',
      }),
    ]);

    const responseBody = Object.freeze({
      action: 'accept',
      operationId: randomUUID(),
      packet: 'B'.repeat(64),
    });
    const accepted = await signedPost(
      bob,
      `/v1/pair/requests/${requestId}/respond`,
      responseBody,
    ).expect(200);
    expect(accepted.body).toEqual(expect.objectContaining({ status: 'accepted' }));
    const aliceEvents = await signedGet(alice, '/v1/pair/events?after=0').expect(200);
    expect(aliceEvents.body.events).toEqual([
      expect.objectContaining({
        packet: responseBody.packet,
        requestId,
        status: 'accepted',
        type: 'pair-response',
      }),
    ]);

    const aliceVerification = Object.freeze({
      operationId: randomUUID(),
      packet: 'C'.repeat(64),
    });
    const verifying = await signedPost(
      alice,
      `/v1/pair/requests/${requestId}/verify`,
      aliceVerification,
    ).expect(200);
    expect(verifying.body).toEqual(expect.objectContaining({ status: 'verifying' }));
    const bobVerification = Object.freeze({
      operationId: randomUUID(),
      packet: 'D'.repeat(64),
    });
    const activated = await signedPost(
      bob,
      `/v1/pair/requests/${requestId}/verify`,
      bobVerification,
    ).expect(200);
    expect(activated.body).toEqual(
      expect.objectContaining({ pairId: expect.any(String), status: 'active' }),
    );
    await signedPost(alice, `/v1/pair/requests/${requestId}/verify`, aliceVerification)
      .expect(200)
      .expect(verifying.body);
    await signedPost(bob, `/v1/pair/requests/${requestId}/verify`, bobVerification)
      .expect(200)
      .expect(activated.body);
    await signedPost(bob, `/v1/pair/requests/${requestId}/verify`, {
      ...bobVerification,
      packet: 'Z'.repeat(64),
    })
      .expect(409)
      .expect({ code: 'pairing-request-idempotency-conflict', schemaVersion: 1 });

    const members = databaseService.connection
      .prepare(
        `SELECT device_id, pair_id
         FROM active_relationship_members
         WHERE device_id IN (?, ?)
         ORDER BY device_id`,
      )
      .all(alice.identity.deviceId, bob.identity.deviceId) as {
      device_id: string;
      pair_id: string;
    }[];
    expect(members).toHaveLength(2);
    expect(new Set(members.map(({ pair_id }) => pair_id))).toEqual(
      new Set([activated.body.pairId as string]),
    );

    await signedPost(alice, '/v1/pair/invites', {
      kind: 'qr-ticket',
      operationId: randomUUID(),
    })
      .expect(409)
      .expect({ code: 'pairing-relationship-conflict', schemaVersion: 1 });
  });

  it('converges QR and handshake discovery, then handles cancel and reject without activation', async () => {
    const initiator = await registerDevice('M2Y-BCDE-FGHJ-KLMN-PQRS');
    const target = await registerDevice('M2Y-TUVW-XYZ2-3456-789A');

    const qr = await signedPost(target, '/v1/pair/invites', {
      kind: 'qr-ticket',
      operationId: randomUUID(),
    }).expect(200);
    const qrPrepared = await signedPost(initiator, '/v1/pair/requests/prepare', {
      method: 'qr-ticket',
      operationId: randomUUID(),
      ticket: qr.body.ticket,
    }).expect(200);
    expect(qrPrepared.body).toEqual(
      expect.objectContaining({ method: 'qr-ticket', status: 'prepared' }),
    );
    const cancelled = await signedPost(
      initiator,
      `/v1/pair/requests/${String(qrPrepared.body.requestId)}/cancel`,
      {
        operationId: randomUUID(),
        packet: 'E'.repeat(64),
      },
    ).expect(200);
    expect(cancelled.body).toEqual(expect.objectContaining({ status: 'cancelled' }));

    const code = await signedPost(target, '/v1/pair/invites', {
      kind: 'handshake-code',
      operationId: randomUUID(),
    }).expect(200);
    const codePrepared = await signedPost(initiator, '/v1/pair/requests/prepare', {
      code: code.body.code,
      method: 'handshake-code',
      operationId: randomUUID(),
    }).expect(200);
    expect(codePrepared.body).toEqual(
      expect.objectContaining({ method: 'handshake-code', status: 'prepared' }),
    );
    const requestId = String(codePrepared.body.requestId);
    await signedPost(initiator, `/v1/pair/requests/${requestId}/submit`, {
      operationId: randomUUID(),
      packet: 'F'.repeat(64),
    }).expect(200);
    const rejected = await signedPost(target, `/v1/pair/requests/${requestId}/respond`, {
      action: 'reject',
      operationId: randomUUID(),
      packet: 'G'.repeat(64),
    }).expect(200);
    expect(rejected.body).toEqual(expect.objectContaining({ status: 'rejected' }));

    const activeCount = databaseService.connection
      .prepare(
        `SELECT COUNT(*) AS count
         FROM active_relationship_members
         WHERE device_id IN (?, ?)`,
      )
      .get(initiator.identity.deviceId, target.identity.deviceId) as { count: number };
    expect(activeCount.count).toBe(0);

    const expiring = await signedPost(initiator, '/v1/pair/requests/prepare', {
      m2yId: target.identity.m2yId,
      method: 'm2y-id',
      operationId: randomUUID(),
    }).expect(200);
    const expiringRequestId = String(expiring.body.requestId);
    databaseService.connection
      .prepare('UPDATE pair_requests SET expires_at_ms = ? WHERE request_id = ?')
      .run(Date.now() - 1, expiringRequestId);
    const expiredEvents = await signedGet(target, '/v1/pair/events?after=0').expect(200);
    expect(expiredEvents.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: expiringRequestId,
          status: 'expired',
          type: 'pair-expired',
        }),
      ]),
    );
    await signedPost(initiator, `/v1/pair/requests/${expiringRequestId}/submit`, {
      operationId: randomUUID(),
      packet: 'H'.repeat(64),
    })
      .expect(409)
      .expect({ code: 'pairing-request-state-conflict', schemaVersion: 1 });
  });

  async function registerDevice(m2yId: string): Promise<TestDevice> {
    const signingKey = generateSigningKey();
    const identity = registrationBody(signingKey.publicKey, m2yId);
    const bodyText = JSON.stringify(identity);
    await request(application.getHttpServer())
      .post('/v1/identity/register')
      .set(signedHeaders(bodyText, identity.deviceId, signingKey.privateKey))
      .set('content-type', 'application/json')
      .send(bodyText)
      .expect(200);
    return Object.freeze({ identity, privateKey: signingKey.privateKey });
  }

  function signedPost(device: TestDevice, path: string, body: unknown): HttpTest {
    const bodyText = JSON.stringify(body);
    return request(application.getHttpServer())
      .post(path)
      .set(signedHeaders(bodyText, device.identity.deviceId, device.privateKey, path))
      .set('content-type', 'application/json')
      .send(bodyText);
  }

  function signedGet(device: TestDevice, path: string): HttpTest {
    return request(application.getHttpServer())
      .get(path)
      .set(signedHeaders('', device.identity.deviceId, device.privateKey, path, 'GET'));
  }
});
