import type { AppVariant, PairingEndpoint, PublicConfigResult } from './contracts';

const appVariants: readonly AppVariant[] = ['development', 'preview', 'production'];
const reservedPlaceholderSuffix = '.invalid';
const loopbackHosts: readonly string[] = ['127.0.0.1', 'localhost'];
const maximumBaseUrlLength = 512;
const lowestOverridePort = 1024;
const highestOverridePort = 65_535;

type NormalizedBaseUrl = Readonly<{
  hostname: string;
  origin: string;
  port: number | null;
  protocol: string;
}>;

/**
 * Public config is read from `expoConfig.extra`, which Expo also uses for its own keys (`router`,
 * `eas`). Unknown keys are therefore tolerated, but every key M2Y owns is validated strictly and a
 * base URL may not carry credentials, a path prefix, a query or a fragment.
 */
export function parsePublicRuntimeConfig(raw: unknown): PublicConfigResult {
  if (!isRecord(raw)) return { ok: false, code: 'public-config-absent' };

  const variant = raw.variant;
  if (!isAppVariant(variant)) return { ok: false, code: 'variant-invalid' };

  const apiBaseUrl = normalizeBaseUrl(raw.apiBaseUrl);
  if (!apiBaseUrl) return { ok: false, code: 'api-base-url-invalid' };
  if (apiBaseUrl.protocol !== 'https:') return { ok: false, code: 'api-base-url-insecure' };

  if (raw.devServerUrl !== undefined) {
    if (variant !== 'development') return { ok: false, code: 'dev-server-url-forbidden' };
    const override = normalizeBaseUrl(raw.devServerUrl);
    if (!override || !isLoopbackHttpOverride(override)) {
      return { ok: false, code: 'dev-server-url-invalid' };
    }
    return {
      ok: true,
      config: {
        pairingEndpoint: { kind: 'configured', baseUrl: override.origin, transport: 'local-http' },
        variant,
      },
    };
  }

  return { ok: true, config: { pairingEndpoint: classifyEndpoint(apiBaseUrl), variant } };
}

function classifyEndpoint(url: NormalizedBaseUrl): PairingEndpoint {
  return url.hostname.endsWith(reservedPlaceholderSuffix)
    ? { kind: 'placeholder', host: url.hostname }
    : { kind: 'configured', baseUrl: url.origin, transport: 'https' };
}

function isAppVariant(value: unknown): value is AppVariant {
  return typeof value === 'string' && appVariants.includes(value as AppVariant);
}

function isLoopbackHttpOverride(url: NormalizedBaseUrl): boolean {
  return (
    url.protocol === 'http:' &&
    loopbackHosts.includes(url.hostname) &&
    url.port !== null &&
    url.port >= lowestOverridePort &&
    url.port <= highestOverridePort
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: unknown): NormalizedBaseUrl | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumBaseUrlLength) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.search !== '' || url.hash !== '') return null;
  if (url.pathname !== '/' || url.hostname === '') return null;
  return {
    hostname: url.hostname,
    origin: `${url.protocol}//${url.host}`,
    port: url.port === '' ? null : Number.parseInt(url.port, 10),
    protocol: url.protocol,
  };
}
