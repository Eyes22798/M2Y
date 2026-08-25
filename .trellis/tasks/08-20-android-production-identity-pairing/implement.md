# Android 生产身份、配对与安全号码实施计划

## A. Gate 1 — Workspace and minimal persistent pairing service

- [x] Add `pnpm-workspace.yaml` without relocating the Expo root package.
- [x] Replace `server/README.md`-only boundary with a NestJS standard app; exact-pin Nest, validation, throttling, test and `better-sqlite3` dependencies.
- [x] Add server config validation, health endpoint, structured redacted logger and process lifecycle.
- [x] Add explicit SQLite migration runner/repository boundary and migration tests; verify persistence after server restart.
- [x] Add root/server format, typecheck, lint, test and build scripts without weakening existing client gates.
- [x] Stop with no-go/replan if Node 24 Windows dependency install/build cannot be reproduced; do not fall back to in-memory production storage. Gate passed on Node 24/Windows with `better-sqlite3 13.0.3`.

## B. Client domain, configuration and navigation contracts

- [x] Add framework-free identity/pairing types, state machine, commands, results and exhaustive tests.
- [x] Add strict public config reader and development-only local server override; preserve HTTPS-only preview/production rules.
- [x] Add `IdentityRelationshipProvider` and gate under `SecureWorkspaceGate.ready`; main private screens mount only when relationship is active.
- [x] Preserve existing SQLCipher workspace data across the no-identity upgrade path and remove unconditional `/chat` entry behavior.
- [ ] Add stable error taxonomy shared through explicit client/server fixture files, not duplicated ad hoc strings.

### Deviations recorded while implementing B2–B4

1. **Workspace access is granted while no pairing transport exists.** The literal rule "private screens mount only when the relationship is active" cannot ship on its own yet: `commitIdentityRegistration` requires a server-issued receipt and section D is unimplemented, so a strict gate would trap every install in `registering` and destroy the only working local loop (`Chat → Space`). `src/application/identity/workspace-access.ts` therefore grants access when the public config exposes no usable pairing endpoint — a runtime-verifiable fact, not a build flag — and blocks otherwise. Both branches are implemented and tested (`workspace-access.test.ts`, `IdentityRelationshipGate.test.tsx`), so configuring a real HTTPS endpoint engages blocking with no code change. All three shipped variants use reserved `.invalid` hosts today.
2. **`WorkspaceProvider` nesting order differs from design §2.** The design places `WorkspaceProvider` after the identity gate; `SecureWorkspaceGate` keeps owning it instead. The session snapshot is already decrypted inside `controller.open()`, so moving the provider inward adds no protection while splitting ownership of the same controller across two gates.

## C. Gate 2 — Production native identity and transaction store

- [x] Split production native packages/classes/API from all Spike harness code.
- [x] Implement native SQLite schema/migration, per-secret Keystore AES-GCM record encryption and single executor.
- [x] Implement one production identity, stable ID, device ID, libsignal prekeys and P-256 device-auth signing key.
- [x] Implement working-copy protocol transactions, candidate isolation, pairing inbox/outbox, replay tombstones and active relationship uniqueness.
- [x] Add strict Expo Module production DTOs and TypeScript decoders; forbid keys/raw records/native exception strings.
- [x] Extend unified local reset so SQLCipher, production identity, device-auth key and dev acceptance materials are all cleaned or the app remains fail-closed.
- [x] Add JVM/instrumentation tests for restart, corrupt records, missing keys, signing, rollback, replay and cleanup.

### Deviations and verification gaps recorded while implementing C4/C7

1. **C4 is the persistence protocol only; no packet is opened or produced.** `PairingTransactionStore` commits candidates, decisions, tombstones, the outbox and the single active relationship, and decides everything through the JVM-tested `PairingProtocolRules`. Real packet encrypt/decrypt, the libsignal session store over `secret_records` and safety-number generation stay in sections D/E: they need a server-leased peer bundle that cannot be exercised anywhere today, so `pairing_candidates.safety_display_ciphertext` is still written as NULL and no safety number crosses any boundary yet.
2. **`stagePeerCandidate` is package-private and has no production caller.** Staging an inbound candidate is the one pairing action that requires an already-decrypted peer packet, so exposing it over the module boundary before the protocol engine exists would let a caller inject an unauthenticated peer identity. It is exercised only by the instrumentation suite; `M2YCryptoModule.kt` deliberately exposes the other six calls and not this one.
3. **The outbox acknowledgement receipt is validated but not stored.** Schema v1 has no column for it, and adding one would need a migration whose `onUpgrade` currently throws. `ackPairingOutbox` therefore treats the receipt as proof of delivery (format-checked, `pairing-outbox-receipt-invalid` otherwise) rather than a persisted fact — the same choice `commitIdentityRegistration` already makes.
4. **Exactly-once intents rest on outbox rows, not on a unique index.** `pairing_outbox` has no unique constraint on `(request_id, packet_type)`; `committedIntentId` enforces it inside the same transaction and matches acknowledged rows too, so repeating a decision after its packet was delivered returns the first operation id instead of queueing a second packet. Both outbox queries order by `created_at_ms ASC, rowid ASC` so the transport gets a real insertion order even for rows written in the same millisecond.
5. **The pairing instrumentation tests now run, on an emulator only.** Resolved on 2026-08-25: `emulator` and `system-images;android-36;aosp_atd;arm64-v8a` were installed, AVD `m2y-atd-36` created, and `:m2y-crypto:connectedDebugAndroidTest` executed **21/21 green with 0 failures and 0 skips** — all 12 of `PairingTransactionStoreInstrumentedTest`, plus 5 `AndroidKeystoreCheckpointInstrumentedTest` and 3 `ProductionIdentityManagerInstrumentedTest`. The JVM half is separately green (`pnpm test:native:crypto`: 6 suites / 51 tests; pass `--rerun-tasks`, because Gradle reports `BUILD SUCCESSFUL` with exit 0 when it skips the task as `UP-TO-DATE`). What G6 still owes is unchanged: no CI job runs this suite, and nothing has been executed on a physical ARM64 device.
6. **The six new pairing calls stop at the native adapter, with no application-layer port.** `M2YCryptoProductionAdapter` decodes them through `M2YCryptoPairingContract`, but no `ProductionIdentityPort` method is added: nothing in `src/application` can act on a pairing decision until the `PairingApiClient` of section E exists to deliver the queued packets. This follows the existing precedent for `commitIdentityRegistration` and `signDeviceRequest`, which are also adapter-only for the same reason.

## D. Pairing service API and signed transport

- [ ] Implement device self-signed registration and exact M2Y-ID collision/retry semantics.
- [ ] Implement signature middleware/guard for canonical request, clock skew and nonce replay.
- [ ] Implement identities, public prekey bundles, one-time prekey lease/replenishment and stable public DTO validation.
- [ ] Implement invitation ticket/handshake-code creation, hashing, 10-minute expiry and one-time consumption.
- [ ] Implement pair prepare/submit/events/respond/verify/cancel state machine with idempotent operation IDs.
- [ ] Enforce both-member unique active relationship transactionally.
- [ ] Add route-specific rate limits, length/body limits and log/database sensitive-pattern tests.

## E. Pairing application controller and three discovery modes

- [ ] Implement signed `PairingApiClient`, exact JSON/body hashing, timeouts, retries and strict response decoding.
- [ ] Implement foreground-aware cancellable polling with bounded backoff and cursor persistence.
- [ ] Connect native committed pairing outbox to server delivery/ack without optimistic active state.
- [ ] Implement M2Y-ID formatting/copy/input and generic lookup failures.
- [ ] Install SDK-compatible camera/clipboard/SVG dependencies through Expo; implement QR display/scan/deep link and permission-denied fallback.
- [ ] Implement 8-character handshake-code display/input/countdown and expiry recovery.
- [ ] Unit/integration test all three methods converge to the same pending request state.

## F. Request review, safety number and Figma-aligned UI

- [ ] Replace `AuthPlaceholderScreen` usage with create identity, registration, method chooser and pairing state screens.
- [ ] Implement outgoing wait/cancel/retry and incoming accept/reject with clear target/requester summaries.
- [ ] Implement formatted safety number, copy, “号码一致” and “号码不一致”; both-side confirmation is mandatory.
- [ ] Implement paired success, identity-change banner/gate, recovery/fatal screens and accessible stable diagnostic codes.
- [ ] Reuse design tokens/patterns, keep keyboard actions visible, respect Reduce Motion and add accessibility labels.
- [ ] Capture/compare Android screenshots for the selected Figma states and document intentional PRD-required additions absent from Figma.

## G. Gate 3–5 integration and physical acceptance

- [ ] Start the persistent local pairing service and configure per-device `adb reverse` without exposing development HTTP rules to production.
- [ ] Run two-install M2Y-ID pairing first; inspect native/server committed state and restart both clients/server.
- [ ] Repeat full QR and handshake-code paths.
- [ ] Run reject, cancel, expiry, replay, corrupt packet, safety mismatch, second-relationship and identity-change scenarios.
- [ ] Run unified reset/cleanup and verify no orphaned local private records or sensitive logs.
- [ ] Run root/server automated gates, Expo Doctor/export, clean Android prebuild, native unit/instrumentation, x86_64 and ARM64 builds.
- [ ] Record APK ABI/hash/size delta, server DB schema/data-class audit and ARM64 screenshots under task evidence.
- [ ] Update README capability statements, third-party notices if required, parent PRD weighted score and progress snapshot.

## Validation commands

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci
pnpm --filter @m2y/server format:check
pnpm --filter @m2y/server typecheck
pnpm --filter @m2y/server lint
pnpm --filter @m2y/server test
pnpm --filter @m2y/server build
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android
pnpm prebuild:android
pnpm build:android:debug -- -PreactNativeArchitectures=x86_64
pnpm build:android:debug:arm64
```

Native Gradle targets, with the exact task names Gate 2 established. Both need
`JAVA_HOME` on JDK 21 and `ANDROID_HOME`/`ANDROID_SDK_ROOT` on the SDK root:

```powershell
pnpm test:native:crypto                                   # :m2y-crypto:testDebugUnitTest
cd android; ./gradlew :m2y-crypto:testDebugUnitTest --rerun-tasks
cd android; ./gradlew :m2y-crypto:connectedDebugAndroidTest
```

`pnpm test:native:crypto` prints `BUILD SUCCESSFUL` and exits 0 even when Gradle
skips the task as `UP-TO-DATE` and runs no test at all, so evidence must come
from `--rerun-tasks` plus the `tests`/`failures`/`errors` counts in
`modules/m2y-crypto/android/build/test-results/testDebugUnitTest/*.xml` and
`.../build/outputs/androidTest-results/connected/debug/*.xml`, never from the
exit code alone.

`connectedDebugAndroidTest` needs a running device. The headless AVD used on
2026-08-25 was `m2y-atd-36` on `system-images;android-36;aosp_atd;arm64-v8a`,
booted with `-no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`. An
emulator satisfies the suite but not G7's ARM64 physical-device evidence.

## Risk and rollback points

- Workspace/server package setup is one isolated commit before client/native product changes.
- Production native store is introduced beside, not instead of, the Spike harness; Spike evidence must stay runnable until the product store passes.
- Schema migrations land with downgrade/rollback notes before UI depends on them.
- QR/camera dependencies land after M2Y-ID path proves the common transcript.
- No public deployment or production-domain change is part of this task.

## Planning readiness

- [x] Product scope, out-of-scope boundaries and two-install acceptance are explicit.
- [x] Minimal pairing service is separated from the following general sync task.
- [x] Native/server/client data flow, persistence, authentication, state machine and rollback are specified.
- [x] Repository and official-source research is persisted under `research/`.
- [x] No blocking product decision remains.
- [x] User approves this latest detailed plan in a subsequent message.
- [x] After approval, run `task.py start 08-20-android-production-identity-pairing` and load `trellis-before-dev` before editing product code.
