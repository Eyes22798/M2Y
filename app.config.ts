import type { ConfigContext, ExpoConfig } from 'expo/config';

const variants = {
  development: {
    name: 'M2Y Dev',
    identifier: 'com.m2y.app.dev',
    apiBaseUrl: 'https://api.dev.m2y.invalid',
  },
  preview: {
    name: 'M2Y Preview',
    identifier: 'com.m2y.app.preview',
    apiBaseUrl: 'https://api.preview.m2y.invalid',
  },
  production: {
    name: 'M2Y',
    identifier: 'com.m2y.app',
    apiBaseUrl: 'https://api.m2y.invalid',
  },
} as const;

export type AppVariant = keyof typeof variants;

function resolveVariant(value: string | undefined): AppVariant {
  if (value === 'preview' || value === 'production') {
    return value;
  }

  return 'development';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env.APP_VARIANT);
  const environment = variants[variant];

  return {
    ...config,
    name: environment.name,
    slug: 'm2y',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'm2y',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: environment.identifier,
      supportsTablet: false,
      icon: './assets/expo.icon',
    },
    android: {
      package: environment.identifier,
      adaptiveIcon: {
        backgroundColor: '#101417',
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: true,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-sqlite',
        {
          enableFTS: true,
          useSQLCipher: true,
        },
      ],
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
          faceIDPermission: '允许 M2Y 使用面容 ID 解锁你的私密协作空间。',
        },
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission: '允许 M2Y 使用面容 ID 确认你的身份。',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      variant,
      apiBaseUrl: environment.apiBaseUrl,
    },
  };
};
