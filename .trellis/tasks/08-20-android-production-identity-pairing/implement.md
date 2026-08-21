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
- [ ] Add strict public config reader and development-only local server override; preserve HTTPS-only preview/production rules.
- [ ] Add `IdentityRelationshipProvider` and gate under `SecureWorkspaceGate.ready`; main private screens mount only when relationship is active.
- [ ] Preserve existing SQLCipher workspace data across the no-identity upgrade path and remove unconditional `/chat` entry behavior.
- [ ] Add stable error taxonomy shared through explicit client/server fixture files, not duplicated ad hoc strings.

## C. Gate 2 — Production native identity and transaction store

- [x] Split production native packages/classes/API from all Spike harness code.
- [x] Implement native SQLite schema/migration, per-secret Keystore AES-GCM record encryption and single executor.
- [x] Implement one production identity, stable ID, device ID, libsignal prekeys and P-256 device-auth signing key.
- [ ] Implement working-copy protocol transactions, candidate isolation, pairing inbox/outbox, replay tombstones and active relationship uniqueness.
- [x] Add strict Expo Module production DTOs and TypeScript decoders; forbid keys/raw records/native exception strings.
- [x] Extend unified local reset so SQLCipher, production identity, device-auth key and dev acceptance materials are all cleaned or the app remains fail-closed.
- [ ] Add JVM/instrumentation tests for restart, corrupt records, missing keys, signing, rollback, replay and cleanup.

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

Native Gradle unit/instrumentation targets and server acceptance commands must be added to this list using the exact generated task names once Gate 1/2 establishes them.

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
