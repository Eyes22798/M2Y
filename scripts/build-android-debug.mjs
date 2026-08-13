import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDirectory = path.join(repositoryRoot, 'android');
const wrapperProperties = path.join(
  androidDirectory,
  'gradle',
  'wrapper',
  'gradle-wrapper.properties',
);
const gradleWrapper = path.join(androidDirectory, 'gradle', 'wrapper', 'gradle-wrapper.jar');
const javaExecutable = path.join(
  process.env.JAVA_HOME ?? '',
  'bin',
  process.platform === 'win32' ? 'java.exe' : 'java',
);
const command = process.env.JAVA_HOME ? javaExecutable : 'java';

const distributionUrlOverride = process.env.GRADLE_DISTRIBUTION_URL;

if (distributionUrlOverride) {
  const parsedUrl = new URL(distributionUrlOverride);

  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error('GRADLE_DISTRIBUTION_URL must be an HTTPS URL without credentials.');
  }

  const properties = readFileSync(wrapperProperties, 'utf8');
  if (!/^distributionUrl=.*$/m.test(properties)) {
    throw new Error('Could not find distributionUrl in gradle-wrapper.properties.');
  }

  const escapedUrl = distributionUrlOverride.replaceAll(':', '\\:');
  const updatedProperties = properties.replace(
    /^distributionUrl=.*$/m,
    `distributionUrl=${escapedUrl}`,
  );

  if (updatedProperties !== properties) {
    writeFileSync(wrapperProperties, updatedProperties, 'utf8');
  }
}

const result = spawnSync(
  command,
  [
    '-Dorg.gradle.appname=gradlew',
    '-classpath',
    gradleWrapper,
    'org.gradle.wrapper.GradleWrapperMain',
    '-p',
    androidDirectory,
    ':app:assembleDebug',
    ...process.argv.slice(2),
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
