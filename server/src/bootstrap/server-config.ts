import { resolve } from 'node:path';

export const SERVER_CONFIG = Symbol('SERVER_CONFIG');

export type ServerConfig = Readonly<{
  databasePath: string;
  host: string;
  inviteHashKey: Buffer;
  port: number;
}>;

const DEFAULT_PORT = 3100;

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  if (!/^\d{1,5}$/.test(value)) {
    throw new Error('server-config-invalid-port');
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('server-config-invalid-port');
  }

  return port;
}

function readNonEmpty(value: string | undefined, fallback: string, code: string): string {
  const candidate = value ?? fallback;
  if (candidate.trim().length === 0 || candidate.includes('\0')) {
    throw new Error(code);
  }

  return candidate;
}

function readInviteHashKey(value: string | undefined, databasePath: string): Buffer {
  if (value === undefined && databasePath === ':memory:') {
    return Buffer.alloc(32, 0x54);
  }
  if (value === undefined || !/^[A-Za-z0-9_-]{43,128}$/u.test(value)) {
    throw new Error('server-config-invalid-invite-hash-key');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length < 32 || decoded.length > 96) {
    throw new Error('server-config-invalid-invite-hash-key');
  }
  return decoded;
}

export function readServerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ServerConfig {
  const databasePath = readNonEmpty(
    environment.M2Y_SERVER_DATABASE_PATH,
    resolve(process.cwd(), '.data', 'pairing.sqlite'),
    'server-config-invalid-database-path',
  );

  return Object.freeze({
    databasePath: databasePath === ':memory:' ? databasePath : resolve(databasePath),
    host: readNonEmpty(environment.M2Y_SERVER_HOST, '127.0.0.1', 'server-config-invalid-host'),
    inviteHashKey: readInviteHashKey(environment.M2Y_SERVER_INVITE_HASH_KEY, databasePath),
    port: readPort(environment.M2Y_SERVER_PORT),
  });
}
