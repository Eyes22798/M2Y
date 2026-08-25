import { readServerConfig } from './server-config';

describe('readServerConfig', () => {
  const inviteHashKey = Buffer.alloc(32, 0x31).toString('base64url');

  it('uses a private local default', () => {
    const config = readServerConfig({ M2Y_SERVER_INVITE_HASH_KEY: inviteHashKey });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3100);
    expect(config.databasePath).toContain('pairing.sqlite');
  });

  it.each(['0', '65536', 'invalid', ' 3100'])('rejects invalid port %s', (port) => {
    expect(() =>
      readServerConfig({ M2Y_SERVER_INVITE_HASH_KEY: inviteHashKey, M2Y_SERVER_PORT: port }),
    ).toThrow('server-config-invalid-port');
  });

  it('preserves the explicit in-memory path for tests', () => {
    expect(readServerConfig({ M2Y_SERVER_DATABASE_PATH: ':memory:' }).databasePath).toBe(
      ':memory:',
    );
  });

  it('requires a durable invitation hashing key outside in-memory tests', () => {
    expect(() => readServerConfig({})).toThrow('server-config-invalid-invite-hash-key');
    expect(() => readServerConfig({ M2Y_SERVER_INVITE_HASH_KEY: 'short' })).toThrow(
      'server-config-invalid-invite-hash-key',
    );
  });
});
