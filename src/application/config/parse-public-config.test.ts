import { parsePublicRuntimeConfig } from './parse-public-config';

describe('parsePublicRuntimeConfig', () => {
  it('reports the shipped reserved hosts as placeholders instead of endpoints', () => {
    for (const [variant, apiBaseUrl] of [
      ['development', 'https://api.dev.m2y.invalid'],
      ['preview', 'https://api.preview.m2y.invalid'],
      ['production', 'https://api.m2y.invalid'],
    ] as const) {
      // `router` is injected by expo-router and must be tolerated alongside the keys M2Y owns.
      expect(parsePublicRuntimeConfig({ apiBaseUrl, router: {}, variant })).toEqual({
        ok: true,
        config: {
          pairingEndpoint: { kind: 'placeholder', host: new URL(apiBaseUrl).hostname },
          variant,
        },
      });
    }
  });

  it('accepts a real HTTPS host as a configured endpoint without a trailing slash', () => {
    expect(
      parsePublicRuntimeConfig({ apiBaseUrl: 'https://pair.m2y.example/', variant: 'production' }),
    ).toEqual({
      ok: true,
      config: {
        pairingEndpoint: {
          kind: 'configured',
          baseUrl: 'https://pair.m2y.example',
          transport: 'https',
        },
        variant: 'production',
      },
    });
  });

  it.each([
    { label: 'absent config', raw: undefined, code: 'public-config-absent' },
    { label: 'an array', raw: [], code: 'public-config-absent' },
    {
      label: 'an unknown variant',
      raw: { apiBaseUrl: 'https://a.example', variant: 'staging' },
      code: 'variant-invalid',
    },
    { label: 'a missing base url', raw: { variant: 'production' }, code: 'api-base-url-invalid' },
    {
      label: 'a credentialed base url',
      raw: base('https://u:p@a.example'),
      code: 'api-base-url-invalid',
    },
    { label: 'a path prefix', raw: base('https://a.example/v1'), code: 'api-base-url-invalid' },
    { label: 'a query string', raw: base('https://a.example/?k=v'), code: 'api-base-url-invalid' },
    { label: 'a fragment', raw: base('https://a.example/#f'), code: 'api-base-url-invalid' },
    { label: 'a non-http scheme', raw: base('ftp://a.example'), code: 'api-base-url-invalid' },
    {
      label: 'an over-long url',
      raw: base(`https://${'a'.repeat(520)}.example`),
      code: 'api-base-url-invalid',
    },
    { label: 'cleartext HTTP', raw: base('http://a.example'), code: 'api-base-url-insecure' },
  ])('rejects $label', ({ code, raw }) => {
    expect(parsePublicRuntimeConfig(raw)).toEqual({ ok: false, code });
  });

  it.each(['http://127.0.0.1:8081', 'http://localhost:8081'])(
    'lets an explicit development override at %s replace the placeholder',
    (devServerUrl) => {
      expect(
        parsePublicRuntimeConfig({
          apiBaseUrl: 'https://api.dev.m2y.invalid',
          devServerUrl,
          variant: 'development',
        }),
      ).toEqual({
        ok: true,
        config: {
          pairingEndpoint: { kind: 'configured', baseUrl: devServerUrl, transport: 'local-http' },
          variant: 'development',
        },
      });
    },
  );

  it.each([
    { label: 'a missing port', devServerUrl: 'http://127.0.0.1' },
    { label: 'a privileged port', devServerUrl: 'http://127.0.0.1:80' },
    { label: 'a non-loopback host', devServerUrl: 'http://10.0.2.2:8081' },
    { label: 'an HTTPS loopback', devServerUrl: 'https://127.0.0.1:8443' },
    { label: 'a null override', devServerUrl: null },
  ])('rejects a development override with $label', ({ devServerUrl }) => {
    expect(
      parsePublicRuntimeConfig({
        apiBaseUrl: 'https://api.dev.m2y.invalid',
        devServerUrl,
        variant: 'development',
      }),
    ).toEqual({ ok: false, code: 'dev-server-url-invalid' });
  });

  it.each(['preview', 'production'] as const)('forbids a development override in %s', (variant) => {
    expect(
      parsePublicRuntimeConfig({
        apiBaseUrl: 'https://api.m2y.invalid',
        devServerUrl: 'http://127.0.0.1:8081',
        variant,
      }),
    ).toEqual({ ok: false, code: 'dev-server-url-forbidden' });
  });
});

function base(apiBaseUrl: string) {
  return { apiBaseUrl, variant: 'production' as const };
}
