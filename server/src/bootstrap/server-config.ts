import { resolve } from 'node:path';

export const SERVER_CONFIG = Symbol('SERVER_CONFIG');

export type ServerConfig = Readonly<{
  databasePath: string;
  host: string;
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
    port: readPort(environment.M2Y_SERVER_PORT),
  });
}
