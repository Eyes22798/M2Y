import { ExpoPublicConfigReader } from './ExpoPublicConfigReader';

const expoConfig: { extra?: unknown } = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return expoConfig;
    },
  },
}));

describe('ExpoPublicConfigReader', () => {
  it('validates the public extra block it reads from the Expo config', () => {
    expoConfig.extra = { apiBaseUrl: 'https://pair.m2y.example', router: {}, variant: 'preview' };

    expect(new ExpoPublicConfigReader().readPublicConfig()).toEqual({
      ok: true,
      config: {
        pairingEndpoint: {
          kind: 'configured',
          baseUrl: 'https://pair.m2y.example',
          transport: 'https',
        },
        variant: 'preview',
      },
    });
  });

  it('fails closed when the binary carries no public config', () => {
    expoConfig.extra = undefined;

    expect(new ExpoPublicConfigReader().readPublicConfig()).toEqual({
      ok: false,
      code: 'public-config-absent',
    });
  });
});
