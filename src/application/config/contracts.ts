export type AppVariant = 'development' | 'preview' | 'production';

/**
 * A pairing endpoint is only `configured` when it can actually be called. The three variants ship
 * reserved `.invalid` hosts until real domains exist, so `placeholder` is a normal runtime state,
 * not an error: callers must refuse to open a connection instead of pretending one would succeed.
 */
export type PairingEndpoint =
  | Readonly<{ kind: 'configured'; baseUrl: string; transport: 'https' | 'local-http' }>
  | Readonly<{ kind: 'placeholder'; host: string }>;

export type PublicRuntimeConfig = Readonly<{
  pairingEndpoint: PairingEndpoint;
  variant: AppVariant;
}>;

export type PublicConfigCode =
  | 'public-config-absent'
  | 'variant-invalid'
  | 'api-base-url-invalid'
  | 'api-base-url-insecure'
  | 'dev-server-url-invalid'
  | 'dev-server-url-forbidden';

export type PublicConfigResult =
  | Readonly<{ ok: true; config: PublicRuntimeConfig }>
  | Readonly<{ ok: false; code: PublicConfigCode }>;

export interface PublicConfigReader {
  readPublicConfig(): PublicConfigResult;
}
