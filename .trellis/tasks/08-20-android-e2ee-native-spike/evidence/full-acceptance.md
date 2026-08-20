# Android E2EE native Spike — full acceptance evidence

Date: 2026-08-20

## Result

The implementation, API 37.1 x86_64 emulator sequence, and the complete physical
ARM64 sequence pass. The official libsignal 0.101.0 artifacts build and run on
both target ABIs. The final physical run used the exact ARM64-only APK audited
below and ended with the encrypted checkpoint, Keystore alias, and synthetic
temporary file cleaned.

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

## realme RMX3888 ARM64 physical sequence

| Step | Result | Evidence |
|---|---|---|
| Final APK install and ABI check | PASS; Android API 36, only `arm64-v8a` | host install/audit record |
| Gate 1 native load | PASS; libsignal 0.101.0 | `arm64-gate1-pass.jpg` and final run |
| Fresh PQXDH + encrypted checkpoint | PASS; revision 1 | `arm64-fresh-resume-negative-pass.jpg` |
| Android Settings force-stop and process restart | PASS | final screenshot contains no Fresh React result card while the native checkpoint is rediscovered |
| Resume after restart | PASS; revision 2, checkpoint reopened, both directions decrypted, fingerprint stable | `arm64-full-acceptance-pass.jpg` |
| Negative and AtomicFile rollback | PASS; revision 3 | `arm64-full-acceptance-pass.jpg` |
| 1,000 messages + attachment-key wrap + synthetic 100 MB native stream | PASS; revision 4 | `arm64-full-acceptance-pass.jpg` |
| Cleanup | PASS; checkpoint and Keystore key cleaned | `arm64-full-acceptance-pass.jpg` |

Physical performance: 495.9 ms total, 0.462 ms p50, 0.635 ms p95, and
9,723,904 byte observed process-memory delta. The 100 MB temporary file was
deleted by the native probe. The final evidence file is 1,109,477 bytes with
SHA-256
`B39340AF09F0F750303E0C86B73DA901D3CD82118F2C26C12E5593480A056675`.

The screenshot state is also process-restart evidence: after the user performed
Android Settings force-stop and reopened the route, page-local Fresh output was
absent, while the native checkpoint independently enabled Resume and produced a
revision-2 reopen result. Resume was therefore not inferred from a same-process
button sequence.
