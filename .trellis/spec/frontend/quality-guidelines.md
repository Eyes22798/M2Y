# Frontend Quality Guidelines

## Scenario: Expo SDK 56 Development Build Baseline

### 1. Scope / Trigger

- Trigger: changing dependencies, Expo config plugins, environment variants, CI, or Android native build commands.
- M2Y requires a Development Build because it uses SQLCipher, secure storage, local authentication, keyboard controller, screen capture, and other native modules.

### 2. Signatures

```powershell
pnpm install --frozen-lockfile
$env:APP_VARIANT='development'
pnpm exec expo prebuild --clean --no-install --platform android
pnpm build:android:debug:arm64
```

The `-p android` argument is required when invoking the wrapper from repository root. Without it Gradle searches the root for `settings.gradle` and fails before project configuration.

### 3. Contracts

- Node: major 24; package manager: `pnpm@10.33.0`.
- Windows requires `.npmrc` `node-linker=hoisted`. React Native CMake/Prefab paths can still exceed the reliable Ninja path length with pnpm's isolated layout, even when virtual-store directory names are shortened.
- `scripts/build-android-debug.mjs` owns the cross-platform Gradle invocation and defaults `NODE_ENV` to `development`.
- A trusted HTTPS `GRADLE_DISTRIBUTION_URL` may override the generated wrapper URL when the official Gradle distribution endpoint is unreachable; do not hard-code a regional mirror in CNG output.
- Variants: `development`, `preview`, `production`; default is development.
- Native identifiers: `com.m2y.app.dev`, `com.m2y.app.preview`, `com.m2y.app`.
- Config plugins: `expo-router`, `expo-sqlite`, `expo-secure-store`, `expo-local-authentication`.
- `expo-sqlite` requires `enableFTS: true` and `useSQLCipher: true`.
- `expo-screen-capture` is runtime-only on SDK 56 and must not be listed as a config plugin.
- Public `extra` contains only `variant` and `apiBaseUrl`; no secrets.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Variant is omitted or unknown | App config resolves to `development` |
| Two variants share an identifier | `pnpm config:check` fails |
| Screen Capture appears in plugins | `pnpm config:check` fails |
| FTS or SQLCipher is disabled | `pnpm config:check` fails |
| Gradle wrapper is run from root without `-p android` | Treat as command error, not code/build failure |
| Official Gradle distribution endpoint times out | Set a trusted HTTPS `GRADLE_DISTRIBUTION_URL`; the build script updates only generated CNG output |
| CMake reports object paths near 250 characters or `build.ninja still dirty` | Verify pnpm uses the hoisted linker, force reinstall dependencies, and regenerate native directories |
| No Android device is connected | APK build may pass; record install/launch smoke as pending |

### 5. Good/Base/Bad Cases

- Good: use `pnpm exec expo install <native-package>` and retain the SDK-compatible version it selects.
- Good: use `pnpm build:android:debug:arm64` for a fast physical-device APK, or pass `-PreactNativeArchitectures=x86_64` through `build:android:debug` for an emulator.
- Base: retain SDK 56 template dependencies such as `@expo/ui` without building a global UI kit around them.
- Bad: manually install latest native packages, list `expo-screen-capture` as a plugin, or claim prebuild alone proves native compilation.

### 6. Tests Required

- `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm deps:check`.
- `pnpm test --ci`.
- `pnpm config:check` loads all three public configs and asserts plugins/options/identifiers.
- `pnpm exec expo-doctor` must pass all checks.
- `pnpm exec expo export --platform android` validates bundling.
- Android acceptance requires `:app:assembleDebug` and a located `app-debug.apk`; prebuild is not sufficient.

### 7. Wrong vs Correct

#### Wrong

```powershell
node scripts/build-android-debug.mjs
```

#### Correct

```powershell
pnpm build:android:debug:arm64
```

## Scenario: Official libsignal Android Module Build

### 1. Scope / Trigger

- Trigger: changing `modules/m2y-crypto`, its config plugin, the pinned libsignal version, Android Java/Kotlin settings, desugaring, packaging exclusions, or ABI build commands.
- The module is an Android-first technical boundary. Production identity, pairing, sync, and iOS support require separate specifications.

### 2. Signatures

```powershell
$env:JAVA_HOME='<installed JDK 21>'
$env:M2Y_JAVA_17_HOME='<installed JDK 17>'
$env:ANDROID_HOME='<Android SDK>'
pnpm prebuild:android
pnpm build:android:debug:arm64
```

```text
modules/m2y-crypto/android/build.gradle
  -> org.signal:libsignal-client:0.101.0
  -> org.signal:libsignal-android:0.101.0

modules/m2y-crypto/app.plugin.js
  -> Signal-owned Maven repository
  -> app coreLibraryDesugaringEnabled + desugar_jdk_libs:1.1.6
  -> desktop/testing native-resource exclusions
```

### 3. Contracts

- Keep both Signal artifacts on one exact version; floating/ranged versions are forbidden.
- Gradle runs on JDK 21 because the upstream classes use Java class-file version 65. Set `M2Y_JAVA_17_HOME` so React Native's included build can still select a compatible JDK 17 toolchain. The two paths must be different installed JDK roots and neither may contain a comma.
- React Native `0.85.3` pins Foojay toolchain resolver `0.5.0`, which is incompatible with Gradle 9 when obsolete vendor metadata is parsed. Keep the pnpm patch that upgrades only the resolver convention to `1.0.0`; re-audit and remove it when React Native ships the fix.
- Persist Maven, desugaring, and packaging configuration through `modules/m2y-crypto/app.plugin.js`; never depend on hand-edited generated `android/` files.
- Use the Signal-owned publication endpoint referenced by the pinned upstream release. A network mirror may replace only the Gradle distribution URL, not artifact provenance or coordinates.
- Keep `modules/*/android/build/` ignored. Test reports and compiled module outputs are generated artifacts, not source or task evidence.
- The JavaScript boundary returns strict redacted codes and aggregate metrics only. Keys, plaintext, fingerprints, protocol records, ciphertext payloads, and raw native exceptions remain native.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Gradle runs on JDK 17 against libsignal 0.101.0 | Class-file version 65 failure; set JDK 21, do not downgrade verification |
| React Native included build sees only JDK 21 | Expose the installed JDK 17 through `M2Y_JAVA_17_HOME` / Gradle installation paths |
| Gradle 9 fails while evaluating Foojay vendor metadata | Verify the tracked `@react-native/gradle-plugin` pnpm patch applies resolver `1.0.0`; do not hand-edit `node_modules` |
| Desugaring is absent after clean prebuild | Fail config/build verification; fix the config plugin |
| Signal artifacts have different or floating versions | Fail review/config verification |
| ARM64 APK contains another native ABI or testing/desktop JNI | Fail package audit and do not distribute the artifact |
| Checkpoint exists but its Keystore alias/tag/version is invalid | Fail closed with a stable redacted code; never replace the persona silently |

### 5. Good / Base / Bad Cases

- Good: clean prebuild reproduces the repository, desugaring and packaging rules; ARM64 and x86_64 builds/tests pass from pinned official artifacts.
- Base: use a trusted HTTPS Gradle distribution mirror when the wrapper host is unavailable while leaving Signal artifact origin unchanged.
- Bad: manually patch generated Gradle files, bundle multiple ABIs into a file advertised as ARM64-only, or return native cryptographic state through JavaScript for easier testing.

### 6. Tests Required

- Run format, typecheck, lint, dependency, Jest adapter, config, Expo Doctor and production Android export gates.
- Run `:m2y-crypto:testDebugUnitTest` for store serialization/copy and protocol semantics.
- Run `:m2y-crypto:connectedDebugAndroidTest` for Keystore AES-GCM, AtomicFile rollback, authentication/tag/version failures and cleanup.
- Run a clean prebuild followed by both x86_64 and ARM64 debug builds. Audit the final APK entries and SHA-256; only the requested ABI and production `libsignal_jni.so` may be present.
- Run `pnpm install --frozen-lockfile` and inspect the installed React Native settings plugin when changing the patch or lockfile; the resolver must remain `1.0.0` until upstream is fixed.
- A physical ARM64 runtime row is required before closing an Android acceptance task; an emulator or successful package inspection is not a substitute.

### 7. Wrong vs Correct

#### Wrong

```powershell
# Uses the default JDK and relies on manual changes under generated android/.
android\gradlew.bat :app:assembleDebug
```

#### Correct

```powershell
$env:JAVA_HOME='<installed JDK 21>'
$env:M2Y_JAVA_17_HOME='<installed JDK 17>'
pnpm prebuild:android
pnpm build:android:debug:arm64
```

## Required Code Practices

- Keep TypeScript `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` enabled.
- Do not add `@ts-ignore`, broad `any`, or ESLint suppressions to bypass an integration failure.
- Motion uses shared tokens and respects system Reduce Motion.
- Logs never contain plaintext messages, keys, safety numbers, tokens, or decrypted files.
- Do not create placeholder cryptography or always-green migration tests.
