# Gate 1 evidence — native dependency and load

## Baseline before libsignal

Captured before the first clean prebuild that includes `m2y-crypto`:

| Item | Value |
|---|---|
| APK | `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` |
| ABI | `arm64-v8a` |
| Bytes | `98,564,714` |
| SHA-256 | `C3FD056CA3236FACE86E9AC28AE185113AFE594DAFC7FE680C86BE7E4AE90DD7` |
| Built at | `2026-08-20T12:01:27.4199770+08:00` |

No pre-libsignal x86_64-only APK was retained, so the report must not invent an
exact x86_64 delta. A new x86_64 build is still required for ABI/JNI validation.

## Toolchain snapshot

| Item | Value |
|---|---|
| Node | `24.14.1` |
| pnpm | `10.33.0` |
| Expo | `56.0.20` |
| React Native | `0.85.3` |
| Android Gradle Plugin | `8.12.0` |
| React Native Kotlin plugin | `2.1.20` |
| Gradle | `9.3.1` (embedded Kotlin `2.2.21`) |
| Gradle JVM | Microsoft OpenJDK `21.0.12.1` (local project toolchain) |
| React Native included-build JDK | Microsoft OpenJDK `17.0.20` via `org.gradle.java.installations.paths` |
| compile / target / min SDK | `36 / 36 / 24` |
| NDK | `27.1.12297006` |

libsignal `0.101.0` is built with Java 21 and Kotlin 2.2.20. The first compile on
JDK 17 failed on class-file version 65 as expected. The project build script now
runs Gradle with a local Microsoft OpenJDK 21 while explicitly exposing the
installed JDK 17 to React Native's included build. The local module compiles on
the Java 21 toolchain and emits JVM 17 bytecode. The upstream AAR also declares
core-library desugaring with `com.android.tools:desugar_jdk_libs:1.1.6`; the
config plugin persists that generated-app setting across clean prebuilds.

## Static Gate 1 checks

- Expo autolinking resolves `m2y-crypto` at `modules/m2y-crypto` with no duplicates.
- The module and config plugin pin both official Signal artifacts to `0.101.0`.
- TypeScript, ESLint, public config validation, and the strict adapter contract
  tests pass before native build.
- Clean-prebuild reproducibility, both ABI-specific builds, APK contents and the
  x86_64 runtime load pass. Physical arm64 runtime evidence remains pending.

The first dependency-resolution attempt proved that Expo resolves local-module
dependencies from the consuming app project; a repository declared only inside
`modules/m2y-crypto/android/build.gradle` was not consulted. The config plugin
now injects the Signal Maven repository into the generated root
`allprojects.repositories` block. This changes repository visibility only;
artifact coordinates remain pinned in the local module.

The documented vanity host `build-artifacts.signal.org` timed out from the
current network. The v0.101.0 official publication script points to the same
Signal-owned bucket at
`https://storage.googleapis.com/build-artifacts.signal.org/libraries/maven/`;
both required POMs returned HTTP 200 there. The plugin uses that authoritative
bucket endpoint so the artifact origin and coordinates are unchanged.

## Official artifact integrity

The two artifacts were fetched from Signal's publication bucket and verified
against their Gradle metadata before seeding the local Gradle cache:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `org.signal:libsignal-client:0.101.0` JAR | 148,150,784 | `40C8EDAA7E178A8B1610AC6C2C20F2F936C53791949468F77EA4B1AF3A64A68F` |
| `org.signal:libsignal-android:0.101.0` AAR | 195,212,272 | `7034A7AE986153C2261775F43BE88EDBE8D46CF364B4BC0DF08A63FC9A1E389A` |

## Build evidence

| ABI | Result | APK bytes | Native audit |
|---|---|---:|---|
| `x86_64` | PASS | 110,424,950 | Only `x86_64`; contains `lib/x86_64/libsignal_jni.so`; no test, DLL or dylib payloads |
| `arm64-v8a` | PASS | 107,964,658 | Only `arm64-v8a`; contains `lib/arm64-v8a/libsignal_jni.so`; no 32-bit/x86/testing JNI/DLL/dylib native payloads |

The final retained user-facing artifacts are
`android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` and the repository
root `app-debug.apk`, SHA-256
`09B914D82A1B042A1D507A4FD963B257CBED4FA33D26536AF0F91C2138667D8B`.
`aapt` independently reports `native-code: 'arm64-v8a'`.

Relative to the retained pre-libsignal arm64 baseline, the final debug APK grows by
9,399,944 bytes (about 9.54%). An exact x86_64 delta is intentionally not
reported because no pre-libsignal x86_64 baseline was retained.

## Runtime evidence

| Target | ABI / page size | Result | Evidence |
|---|---|---|---|
| API 37.1 emulator | `x86_64` / 16 KiB | PASS | `x86_64-gate1-pass.png`: `PASS · native-load-verified`, libsignal `0.101.0`, ABI `x86_64`, capability `signal-pqxdh-double-ratchet` |
| realme RMX3888, Android 16/API 36 | `arm64-v8a` | PASS | User-captured `arm64-gate1-pass.jpg`: `PASS · native-load-verified`, libsignal `0.101.0`, ABI `arm64-v8a`, capability `signal-pqxdh-double-ratchet` |

The ARM64 evidence file is 356,795 bytes with SHA-256
`13271D11F3E031A881069E02249E5F40AF02F6BC5E4F75BF9602BC8E64294E56`.
Both runtime rows now pass, so Gate 1 is closed and protocol implementation may
begin.

## Latest host-side recheck

Before the manual LAN fallback completed the physical run, the Gate 1
TypeScript typecheck, ESLint run, public config
validation and six strict adapter tests were rerun and all passed. Android SDK
Platform-Tools `37.0.1` was then tested from a checksum-verified isolated local
copy. It improves enumeration from a missing device to
`(no serial number) offline`, but the transport still cannot execute commands.
ADB tracing identifies Windows error 31 while reading the USB device serial;
this is a host/device USB transport failure, not a libsignal or application
failure. The LAN Metro endpoint at `192.168.1.83:8081` provided the successful
manual physical-device fallback while both devices were on the same network.
