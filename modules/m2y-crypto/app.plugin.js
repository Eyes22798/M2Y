const {
  CodeGenerator,
  createRunOncePlugin,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const PACKAGING_EXCLUDES_KEY = 'android.packagingOptions.excludes';
const LIBSIGNAL_PACKAGING_EXCLUDES = [
  'libsignal_jni*.dylib',
  'signal_jni*.dll',
  '**/libsignal_jni_testing.so',
];
const SIGNAL_MAVEN_REPOSITORY =
  "    maven { url 'https://storage.googleapis.com/build-artifacts.signal.org/libraries/maven/' }";
const LIBSIGNAL_DESUGARING_OPTIONS = `    compileOptions {
        coreLibraryDesugaringEnabled true
    }`;
const LIBSIGNAL_DESUGARING_DEPENDENCY =
  "    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:1.1.6'";

function mergeCommaSeparatedValues(currentValue, requiredValues) {
  const values = new Set(
    String(currentValue ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

  for (const requiredValue of requiredValues) {
    values.add(requiredValue);
  }

  return [...values].join(',');
}

function withSignalMavenRepository(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('m2y-crypto requires a Groovy Android project build file.');
    }

    const result = CodeGenerator.mergeContents({
      src: gradleConfig.modResults.contents,
      newSrc: SIGNAL_MAVEN_REPOSITORY,
      tag: 'm2y-crypto-signal-maven',
      anchor: /maven\s*\{\s*url\s*['"]https:\/\/www\.jitpack\.io['"]\s*\}/,
      offset: 1,
      comment: '//',
    });

    gradleConfig.modResults.contents = result.contents;
    return gradleConfig;
  });
}

function withLibsignalDesugaring(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('m2y-crypto requires a Groovy Android app build file.');
    }

    const compileOptionsResult = CodeGenerator.mergeContents({
      src: gradleConfig.modResults.contents,
      newSrc: LIBSIGNAL_DESUGARING_OPTIONS,
      tag: 'm2y-crypto-libsignal-desugaring-options',
      anchor: /compileSdk rootProject\.ext\.compileSdkVersion/,
      offset: 1,
      comment: '//',
    });
    const dependencyResult = CodeGenerator.mergeContents({
      src: compileOptionsResult.contents,
      newSrc: LIBSIGNAL_DESUGARING_DEPENDENCY,
      tag: 'm2y-crypto-libsignal-desugaring-dependency',
      anchor: /dependencies\s*\{/,
      offset: 1,
      comment: '//',
    });

    gradleConfig.modResults.contents = dependencyResult.contents;
    return gradleConfig;
  });
}

function withM2YCryptoAndroid(config) {
  const configWithRepository = withSignalMavenRepository(config);
  const configWithDesugaring = withLibsignalDesugaring(configWithRepository);

  return withGradleProperties(configWithDesugaring, (gradleConfig) => {
    const existing = gradleConfig.modResults.find(
      (item) => item.type === 'property' && item.key === PACKAGING_EXCLUDES_KEY,
    );

    if (existing) {
      existing.value = mergeCommaSeparatedValues(existing.value, LIBSIGNAL_PACKAGING_EXCLUDES);
    } else {
      gradleConfig.modResults.push({
        type: 'comment',
        value: 'Exclude non-Android and testing libsignal native artifacts.',
      });
      gradleConfig.modResults.push({
        type: 'property',
        key: PACKAGING_EXCLUDES_KEY,
        value: LIBSIGNAL_PACKAGING_EXCLUDES.join(','),
      });
    }

    return gradleConfig;
  });
}

module.exports = createRunOncePlugin(withM2YCryptoAndroid, 'm2y-crypto', '0.1.0');
