# Android E2EE native Spike — full acceptance evidence

Date: 2026-08-20

## Result

The implementation and x86_64 Android acceptance sequence pass. The official
libsignal 0.101.0 artifacts also build and load on ARM64, but the latest APK has
not yet completed the full sequence on the physical ARM64 phone because only the
x86_64 emulator is currently visible to ADB. This evidence therefore does not
claim the physical-device row is complete.

## Automated gates

| Gate | Result |
|---|---|
| TypeScript | `pnpm typecheck` PASS |
| ESLint | `pnpm lint` PASS |
| Prettier | `pnpm format:check` PASS |
| Dependency boundaries | `pnpm deps:check` PASS; 87 modules / 139 dependencies |
| Jest | PASS; 17 suites / 56 tests |
| Strict typed adapter | PASS; 14 tests |
| Native JVM | PASS; 6 tests |
| Android instrumentation | PASS; 5 tests on API 37.1 x86_64 |
| Public config | `pnpm config:check` PASS |
| Expo Doctor | PASS; 21/21 checks |
| Production Android export | PASS; Hermes bundle about 4.4 MB |
| Clean CNG reproduction | `pnpm prebuild:android` PASS |
| ARM64 package command | `pnpm build:android:debug:arm64` PASS; 517 Gradle tasks |

Native tests cover protocol round-trip and resume semantics, serialized store
reopen and copy isolation, strict snapshot versions/fields, Android Keystore
AES-256-GCM checkpointing, bad tag/truncation/missing alias failures, AtomicFile
rollback, and wrong-run cleanup.

## API 37.1 x86_64 emulator sequence

| Step | Result | Evidence |
|---|---|---|
| Fresh PQXDH + first/reply messages + fingerprint equality | PASS | `x86_64-fresh-checkpoint-pass.png` |
| Encrypted checkpoint written | PASS; 14,660 bytes; known plaintext probes absent | fresh evidence plus host inspection |
| Real process force-stop and restart | PASS | `x86_64-force-stop-checkpoint-discovered.png` |
| Resume from the committed checkpoint | PASS | `x86_64-resume-pass.png` |
| Out-of-order/duplicate/corrupt/identity-change/rollback checks | PASS | `x86_64-negative-rollback-pass.png` |
| 1,000 bidirectional messages and attachment boundary | PASS | `x86_64-performance-pass.png`, `x86_64-performance-metrics.png` |
| Cleanup | PASS | checkpoint/key/test temp files removed |

Performance evidence: 2,228.2 ms total, 0.946 ms p50, 6.216 ms p95, and
-180,224 byte observed process-memory delta for 1,000 alternating messages. A
32-byte attachment content key was wrapped through the established session. A
synthetic 100 MB native stream was processed via a temporary file and deleted;
the file body did not cross the JavaScript bridge.

No plaintext, keys, fingerprints, protocol records, ciphertext payloads, native
exception text, or run internals are returned through the typed bridge. A
targeted emulator logcat scan reported zero sensitive-pattern hits.

## Final ARM64-only APK

| Item | Value |
|---|---|
| Artifact | repository root `app-debug.apk` |
| Bytes | 107,964,658 |
| SHA-256 | `09B914D82A1B042A1D507A4FD963B257CBED4FA33D26536AF0F91C2138667D8B` |
| Native ABI | only `arm64-v8a` |
| Native entries | 28; includes one `lib/arm64-v8a/libsignal_jni.so` |
| Non-ARM native entries | 0 |
| Forbidden testing/desktop native payloads | 0 |
| Delta from 98,564,714-byte pre-libsignal ARM64 baseline | +9,399,944 bytes, about 9.54% |

`assets/acknowledgments/libsignal-testing.md` is a license acknowledgment, not a
native testing library. No `libsignal` testing SO, DLL, or dylib is packaged.

## Physical-device status

The realme RMX3888 ARM64 phone previously passed Gate 1 with libsignal 0.101.0
loaded by the Development Build; see `arm64-gate1-pass.jpg`. At final acceptance
time ADB lists only `emulator-5554`, so the latest ARM64 APK still needs this
physical sequence: fresh → force-stop → resume → negative → performance →
cleanup. Until that row passes, the task remains in progress.
