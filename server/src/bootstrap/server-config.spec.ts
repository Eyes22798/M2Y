import { readServerConfig } from './server-config';

describe('readServerConfig', () => {
  it('uses a private local default', () => {
    const config = readServerConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3100);
    expect(config.databasePath).toContain('pairing.sqlite');
  });

  it.each(['0', '65536', 'invalid', ' 3100'])('rejects invalid port %s', (port) => {
    expect(() => readServerConfig({ M2Y_SERVER_PORT: port })).toThrow('server-config-invalid-port');
  });

  it('preserves the explicit in-memory path for tests', () => {
    expect(readServerConfig({ M2Y_SERVER_DATABASE_PATH: ':memory:' }).databasePath).toBe(
      ':memory:',
    );
  });
});
