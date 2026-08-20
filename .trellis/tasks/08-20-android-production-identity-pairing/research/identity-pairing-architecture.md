# Android production identity/pairing architecture research

Date: 2026-08-20

## Repository evidence

- `app/(auth)/create-identity.tsx`, `pair.tsx`, and `verify-safety-number.tsx` all render `AuthPlaceholderScreen`; no production identity state is wired.
- `app/index.tsx` redirects to `/chat` unconditionally. `SecureWorkspaceGate` protects SQLCipher access but does not require an E2EE identity or active relationship.
- SQLCipher schema v1 contains only `installation_profile`, `messages`, and `shared_items`. `installation_id` is intentionally not M2Y-ID or an E2EE identity.
- The Spike native store is a JSON snapshot with two synthetic persona and an AtomicFile envelope keyed by `m2y.e2ee.spike.checkpoint-key.v1`. It proves feasibility but cannot be renamed into a production single-user store.
- The completed go/no-go explicitly requires a production identity lifecycle, pre-key service, QR/handshake transcript, safety-number UX, and a replacement for the Spike checkpoint before product claims.
- `server/README.md` is only a privacy boundary. There is no server runtime, package, migration or test harness.
- Root is a single Expo package with Node `>=24 <25`, pnpm `10.33.0`, and no `pnpm-workspace.yaml`.
- Docker/PostgreSQL is not installed on the current Windows development host.
- Current host versions observed during planning: Node `v24.14.1`, pnpm `10.33.0`, default Java `17.0.20`.

## Product evidence

- PRD 3.1 requires local identity creation, no mandatory phone/email, M2Y-ID, QR/M2Y-ID/10-minute handshake pairing, mutual confirmation, safety-number comparison, one active relationship, and minimum server routing metadata.
- The Figma/PRD gap report requires explicit create-identity, request waiting/reject/cancel/expire, camera-permission fallback, safety mismatch, identity-change and device states.
- The parent roadmap deliberately places ordinary ciphertext sync after identity/pairing and places PIN/recovery/device replacement later. This task must keep those boundaries visible.

## Server organization decision

Use an independent NestJS standard application under `server/`, registered through a pnpm workspace, rather than converting the Expo root into a Nest CLI monorepo.

Reasoning:

- Nest documents that standard mode keeps a self-contained application and that framework features are independent of organization mode.
- Nest's monorepo conversion expects canonical Nest source/test layout and warns that non-canonical projects can be moved unreliably. The current root is an Expo Router application, so conversion would risk relocating unrelated client code.
- A pnpm workspace lets root and server keep separate package/tsconfig/test boundaries without duplicating the repository or changing the Expo entry point.

Sources:

- Nest workspaces and standard/monorepo behavior: https://docs.nestjs.com/cli/monorepo
- Nest CLI organization overview: https://docs.nestjs.com/cli/overview

## Server persistence decision

Use exact `better-sqlite3` with explicit migrations and repository ports for this identity/pairing milestone.

Reasoning:

- The current machine has no Docker/PostgreSQL, while the task requires durable two-install acceptance now.
- Pairing traffic is small and transaction-oriented; SQLite can enforce unique M2Y-ID, one-time ticket consumption, pre-key lease and unique active relationship on one reference server.
- Node's built-in `node:sqlite` is still release-candidate/active-development across Node 24 documentation, and the current host is Node 24.14.1. Avoid making a still-evolving built-in API a production boundary.
- `better-sqlite3` current release metadata reports Node `>=22`; its official CI builds Node 24. The implementation must pin the exact resolved version and validate install/build before building service modules.
- Child 2 must reassess PostgreSQL/queue requirements before adding general envelope traffic; repository ports and migrations keep that migration possible.

Sources:

- Node 24 SQLite status/API: https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html
- better-sqlite3 releases: https://github.com/WiseLibs/better-sqlite3/releases
- better-sqlite3 Node build matrix: https://github.com/WiseLibs/better-sqlite3/blob/master/.github/workflows/build.yml

Registry snapshot during planning:

- `@nestjs/core` `11.2.1`, Node `>=20`
- `@nestjs/platform-express` `11.2.1`
- `@nestjs/throttler` `6.5.0`
- `better-sqlite3` `13.0.3`, Node `>=22`

Final implementation must exact-pin the versions written to `server/package.json` and preserve them in `pnpm-lock.yaml`.

## Server safety patterns

- Enable global strict DTO validation; reject unknown fields and enforce maximum lengths.
- Apply global and route-specific rate limits to registration, identifier lookup, invitation creation and request preparation.
- Use prepared statements and explicit transactions; never enable ORM/schema auto-sync in production.
- Server logs contain request ID, route template, status/error code, duration and redacted counters only.

Sources:

- Nest validation: https://docs.nestjs.com/techniques/validation
- Nest rate limiting: https://docs.nestjs.com/security/rate-limiting
- Nest database integrations and production schema warning: https://docs.nestjs.com/techniques/database

## Native production store decision

Do not add a second Android SQLCipher distribution and do not reuse the full Spike AtomicFile snapshot.

Use Android platform SQLite for indexes/transactions and encrypt every secret record value with an application Keystore AES-GCM key. Metadata is limited to record kind/key/revision; identity keys, prekeys and sessions remain ciphertext at rest. One serialized executor loads a working protocol store, runs a native operation, writes changed encrypted records plus a pairing transport outbox entry in one SQLite transaction, and only then returns an opaque packet.

This design:

- satisfies synchronous `SignalProtocolStore` callbacks;
- provides transaction space for pairing outbox/replay tombstones;
- avoids exposing protocol records to Expo SQLite/JavaScript;
- avoids duplicate SQLCipher native-library risk;
- leaves a path for child 2 to extend the native transaction boundary around message outbox/inbox.

## Device API authentication decision

Generate a separate Android Keystore P-256 signing key per installation. The libsignal identity key remains dedicated to E2EE identity/fingerprint.

Each HTTP request signs a canonical tuple of method, path, timestamp, random nonce and exact body hash. The server stores only the device authentication public key, verifies the signature/time window, and records nonce use for replay protection. This avoids phone/password accounts and long-lived bearer secrets while keeping the E2EE private key native-only.

## Pairing transcript decision

All discovery methods resolve to one server-issued request ID and leased target pre-key bundle:

1. QR uses a 10-minute opaque invitation ticket/deep link.
2. M2Y-ID uses exact, authenticated, rate-limited resolution.
3. Handshake code uses an 8-character one-time code valid for 10 minutes.
4. Initiator native code builds the first encrypted pre-key pairing packet and commits it to its pairing outbox.
5. Receiver native code decrypts into an isolated candidate store and exposes only sanitized peer summary plus formatted safety number.
6. Receiver accepts/rejects. Acceptance creates the encrypted response; rejection commits replay protection without trusting the candidate.
7. Both clients explicitly confirm matching safety numbers. Only reciprocal verification makes the unique relationship active.

The server observes pair membership/routing status and opaque packets but never display name, safety number or protocol secrets.

## UI dependency notes

- Use `pnpm exec expo install` for SDK-56-compatible `expo-camera`, `expo-clipboard`, and `react-native-svg`; never install the registry latest Expo package directly.
- QR rendering may use exact-pinned `react-native-qrcode-svg` after license/package review.
- Camera denial must route to M2Y-ID/handshake input; it cannot dead-end pairing.
- Physical acceptance can use one ARM64 phone plus the existing x86_64 emulator. Both can access a host pairing server through per-device `adb reverse` and a development-only localhost HTTP config; preview/production stay HTTPS-only.

## Blocking decision inventory

No unresolved product decision blocks final planning:

- Android first: previously approved.
- AGPLv3 acceptance: previously approved.
- Three pairing methods and 10-minute handshake validity: PRD-defined.
- One active mobile device/one relationship: PRD-defined and parent-approved.
- Recovery, device replacement, unpairing, general sync and iOS: explicitly deferred by the parent roadmap.
