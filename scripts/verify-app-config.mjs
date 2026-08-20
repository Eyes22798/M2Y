import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const variants = ['development', 'preview', 'production'];
const expectedIdentifiers = new Map([
  ['development', 'com.m2y.app.dev'],
  ['preview', 'com.m2y.app.preview'],
  ['production', 'com.m2y.app'],
]);

const configs = variants.map((variant) => {
  const result = spawnSync(
    process.execPath,
    [require.resolve('expo/bin/cli'), 'config', '--type', 'public', '--json'],
    {
      cwd: process.cwd(),
      env: { ...process.env, APP_VARIANT: variant },
      encoding: 'utf8',
      shell: false,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Unable to load ${variant} config:\n${result.stderr}`);
  }

  return { variant, config: JSON.parse(result.stdout) };
});

for (const { variant, config } of configs) {
  const expectedIdentifier = expectedIdentifiers.get(variant);
  if (
    config.android?.package !== expectedIdentifier ||
    config.ios?.bundleIdentifier !== expectedIdentifier
  ) {
    throw new Error(`${variant} does not use the expected native identifiers.`);
  }

  if (config.extra?.variant !== variant || typeof config.extra?.apiBaseUrl !== 'string') {
    throw new Error(`${variant} public extra is incomplete.`);
  }

  if (config.android?.allowBackup !== false) {
    throw new Error(`${variant} must disable Android application backup.`);
  }

  const pluginNames = config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  if (pluginNames.includes('expo-screen-capture')) {
    throw new Error('expo-screen-capture must remain a runtime-only dependency on SDK 56.');
  }

  for (const requiredPlugin of [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    'expo-local-authentication',
    './modules/m2y-crypto/app.plugin.js',
  ]) {
    if (!pluginNames.includes(requiredPlugin)) {
      throw new Error(`${variant} is missing required plugin ${requiredPlugin}.`);
    }
  }

  const sqlitePlugin = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite',
  );
  if (
    !sqlitePlugin ||
    sqlitePlugin[1]?.enableFTS !== true ||
    sqlitePlugin[1]?.useSQLCipher !== true
  ) {
    throw new Error(`${variant} must enable both FTS and SQLCipher in expo-sqlite.`);
  }

  const secureStorePlugin = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
  );
  if (!secureStorePlugin || secureStorePlugin[1]?.configureAndroidBackup !== false) {
    throw new Error(`${variant} must not configure Android backup for SecureStore.`);
  }
}

const uniqueIdentifiers = new Set(configs.map(({ config }) => config.android.package));
if (uniqueIdentifiers.size !== variants.length) {
  throw new Error('Native identifiers must be unique for all three variants.');
}

process.stdout.write('Verified development, preview, and production public config.\n');
