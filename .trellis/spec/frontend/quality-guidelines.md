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

## Required Code Practices

- Keep TypeScript `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` enabled.
- Do not add `@ts-ignore`, broad `any`, or ESLint suppressions to bypass an integration failure.
- Motion uses shared tokens and respects system Reduce Motion.
- Logs never contain plaintext messages, keys, safety numbers, tokens, or decrypted files.
- Do not create placeholder cryptography or always-green migration tests.
