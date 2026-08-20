# Android 生产身份、配对与安全号码技术设计

## 1. Architecture and trust boundaries

```text
SecureWorkspaceGate (SQLCipher ready)
  -> IdentityRelationshipProvider / Gate
    -> identity + pairing application controller
      -> ProductionCryptoAdapter (strict native DTO decoder)
        -> m2y-crypto production facade
          -> ProductionIdentityStore (native SQLite + Keystore AES-GCM)
          -> PairingProtocolEngine (libsignal 0.101.0)
          -> DeviceRequestSigner (Android Keystore P-256)
      -> PairingApiClient
        -> signed HTTP request
          -> Nest pairing service
            -> strict API/domain layer
            -> SQLite pairing repository
```

Security boundaries:

- SQLCipher workspace continues to own Chat/Space content.
- The native production identity store owns identity/private prekey/session material and pairing protocol transactions.
- JavaScript owns UI drafts and transports only public material, formatted safety-number display values, stable result codes and opaque ciphertext packets.
- The server owns public registration/prekey material, routing state, expiry, replay protection and opaque packets; it has no content-decryption key.
- Spike API/store/files/aliases remain dev-only and must not be imported by production controllers.

## 2. Runtime composition and navigation

`AppProviders` keeps gesture, keyboard, safe-area and secure workspace providers outside. When `SecureWorkspaceGate` reaches `ready`, it mounts:

```text
IdentityRelationshipProvider
  -> IdentityRelationshipGate
       no identity       -> CreateIdentity flow
       unpaired          -> Pairing method flow
       pending           -> Outgoing/incoming status flow
       awaiting verify   -> SafetyNumber flow
       active            -> WorkspaceProvider -> route children
       recovery/fatal    -> fail-closed recovery/error UI
```

The gate, not a route redirect, prevents private main routes from mounting before `active`. Auth route files remain thin composition/deep-link boundaries and point at feature screens/state; they do not initialize native identity or call HTTP directly.

Existing SQLCipher content is not deleted during upgrade. It becomes visible again after an active relationship exists and remains local-only until the sync child task.

## 3. Domain and application contracts

Framework-free domain types:

```text
IdentitySummary
  m2yId / stableIdentityId / deviceId / optional displayName / registeredAt

RelationshipSummary
  pairId / peerM2yId / optional peerDisplayName / verification status / pairedAt

IdentityRelationshipState
  inspecting | creatingIdentity | registering | unpaired
  | outgoingPending | incomingReview | awaitingSafetyVerification
  | active | rejected | cancelled | expired | networkFailed
  | identityChanged | recoveryRequired | fatal

PairingMethod
  qr-ticket | m2y-id | handshake-code

IdentityRelationshipCommand
  createIdentity / createInvite / preparePairRequest / submitPairRequest
  / acceptPairRequest / rejectPairRequest / cancelPairRequest
  / confirmSafetyNumber / reportSafetyMismatch / retry / resetLocalData
```

Application controller invariants:

- one serialized command at a time;
- no optimistic `active` transition;
- state returned to React only after native and server acknowledgements required by that transition are committed;
- network retry uses the same operation/request ID;
- foreground polling can be cancelled on background/unmount;
- unknown native/server DTO fails closed with one stable diagnostic code.

## 4. Native module production API

The Expo module adds production functions with names/types separate from Spike functions. Representative contract:

```text
inspectProductionIdentity() -> redacted identity/relationship state
prepareIdentityRegistration(displayName?) -> operationId + public registration bundle
commitIdentityRegistration(operationId, server receipt) -> IdentitySummary
createDeviceRequestSignature(canonicalRequest) -> deviceId + publicKeyId + signature

preparePairingPacket(requestId, targetBundle) -> committed opaque outbox item
consumeIncomingPairingPacket(requestId, packet) -> PendingPeerSummary
respondToPairingRequest(requestId, accept|reject) -> committed result/outbox item
confirmSafetyNumber(requestId) -> committed verification outbox item
consumePairingEvent(event) -> committed relationship state

listPairingOutbox() -> opaque pending transport items
ackPairingOutbox(operationId, receipt) -> committed ack
resetProductionIdentity() -> cleanup result
```

Exact DTO decoders live in `src/native/crypto/production/` and enforce:

- exact object keys;
- fixed schema/version values;
- UUID/opaque ID formats and bounded strings;
- known enum/error codes only;
- no native exception message/stack passthrough.

Safety numbers are formatted display groups, never returned as arbitrary raw native payloads. Tests compare deterministic equality or fixed synthetic fixtures without snapshotting a real device value.

## 5. Native production persistence

### 5.1 Files and keys

- Database: app-private `m2y-production-identity-v1.db`.
- Secret-record encryption alias: `m2y.identity.record-key.v1`.
- Device request signing alias: `m2y.device-auth-signing-key.v1`.
- No production filename/alias contains `spike`, `acceptance`, `alice`, `bob` or run ID.

### 5.2 Tables

```text
schema_metadata(version, created_at_ms, updated_at_ms)
identity_projection(singleton_id, m2y_id, stable_identity_id, device_id,
                    display_name_ciphertext, registered_at_ms, revision)
secret_records(record_kind, record_key, ciphertext, revision, updated_at_ms)
pairing_candidates(request_id, peer_route_id, status, candidate_ciphertext,
                   safety_display_ciphertext, expires_at_ms, revision)
relationship(singleton_id, pair_id, peer_route_id, state,
             peer_summary_ciphertext, verified_at_ms, revision)
pairing_outbox(operation_id, request_id, packet_type, ciphertext,
               created_at_ms, acknowledged_at_ms, retry_count)
pairing_inbox(event_id, request_id, packet_hash, applied_at_ms)
replay_tombstones(request_id, packet_hash, outcome, expires_at_ms)
```

All sensitive projections are encrypted records/blobs. Indexable metadata is limited to opaque IDs, status, revision and timestamps.

### 5.3 Transaction protocol

For every native protocol action:

1. acquire the single native executor lock;
2. begin SQLite transaction;
3. decrypt/validate required records into a working copy;
4. execute libsignal/device-auth operation;
5. encrypt changed records with fresh GCM IV and bound AAD;
6. write replay marker and pairing outbox item when applicable;
7. commit SQLite transaction;
8. only after commit return a redacted result/opaque packet reference.

Any error rolls back the transaction and clears transient plaintext arrays where practical. Key missing, bad tag, unsupported schema or corrupt record becomes recovery/fatal; it never regenerates an identity over existing state.

## 6. Device-auth request signing

Canonical request bytes:

```text
M2Y-REQUEST-V1\n
<UPPERCASE_METHOD>\n
<PATH_AND_SORTED_QUERY>\n
<UTC_EPOCH_MS>\n
<RANDOM_NONCE_BASE64URL>\n
<LOWERCASE_SHA256_BODY_HEX>
```

- Body string passed to `fetch` is exactly the body whose UTF-8 SHA-256 is signed.
- Signature is ECDSA P-256/SHA-256 and encoded in one documented form.
- Server rejects unknown device, invalid signature, nonce replay, timestamp outside allowed skew, body mismatch or unsupported version.
- Initial registration is self-signed and includes the device-auth public key; uniqueness plus server receipt binds future requests.
- Public endpoints still receive strict rate limits; successful signature does not bypass authorization or unique-relationship rules.

## 7. Pairing service

### 7.1 Package boundary

```text
pnpm-workspace.yaml
server/
  package.json
  tsconfig.json
  src/
    bootstrap/
    identity/
    pairing/
    auth/
    persistence/
    observability/
  test/
```

Nest is a standard application with its own build/test configuration. Root scripts call it through pnpm filters; client lint/tsconfig remain unchanged except shared quality commands.

### 7.2 Server schema

```text
schema_migrations
identities(m2y_id UNIQUE, stable_identity_id UNIQUE, created_at, status)
devices(device_id UNIQUE, m2y_id FK, auth_public_key, registration_id,
        identity_public_key, signed_prekey_public, signed_prekey_signature,
        kyber_prekey_public, kyber_prekey_signature, status, created_at)
one_time_prekeys(device_id, prekey_id, public_key, lease_request_id, consumed_at)
pair_invites(invite_id, target_device_id, code_hash UNIQUE, expires_at,
             consumed_at, created_at)
pair_requests(request_id, requester_device_id, target_device_id, method,
              status, expires_at, request_packet, response_packet,
              requester_verified_at, target_verified_at, version, created_at)
active_relationship_members(device_id UNIQUE, pair_id, activated_at)
request_nonces(device_id, nonce_hash, expires_at, PRIMARY KEY(device_id, nonce_hash))
```

Public bundle serialization is versioned and length-bounded. One-time prekey selection/lease and pair-request creation run in one transaction. Active relationship creation inserts both members in one transaction; the unique key prevents a second relationship.

### 7.3 HTTP endpoints

```text
POST /v1/identity/register
GET  /v1/identity/status

POST /v1/pair/invites
POST /v1/pair/requests/prepare
POST /v1/pair/requests/:requestId/submit
GET  /v1/pair/events?after=<cursor>
POST /v1/pair/requests/:requestId/respond
POST /v1/pair/requests/:requestId/verify
POST /v1/pair/requests/:requestId/cancel
```

`prepare` accepts exactly one target reference variant. Exact M2Y-ID, QR ticket and handshake code resolve internally and return the same request/bundle shape. `events` returns opaque versioned events with cursor; it does not become the general message sync API.

## 8. Pairing state/transcript

```text
Target creates QR ticket or handshake code (optional for M2Y-ID path)
  -> Initiator prepares request; server leases target prekeys
  -> Initiator native commits pre-key pairing packet to outbox
  -> Server stores/routes opaque packet
  -> Target polls, native decrypts into isolated candidate
  -> Target rejects (tombstone) OR accepts (response packet)
  -> Initiator receives/decrypts response
  -> Both display same safety number
  -> Each independently confirms match
  -> Reciprocal encrypted verification + server atomic unique-membership activation
  -> Native relationship commits active on both clients
```

Mismatch behavior:

- selecting “号码不一致” deletes pending candidate/session where safe, commits a mismatch tombstone, sends cancel/mismatch result, and never activates;
- any identity key difference for an existing peer moves to `identityChanged` and requires a new pairing/re-verification flow in a later task, not silent TOFU replacement.

## 9. UI surface model

Pages/state groups:

1. Create identity: explanation, optional display name, no-recovery warning, progress/error.
2. Identity ready: M2Y-ID display/copy and continue.
3. Pair method chooser.
4. QR: show ticket, scan, camera denied, invalid/expired ticket.
5. M2Y-ID input: formatting, validation, not-found/general failure.
6. Handshake: show/copy countdown and enter code.
7. Outgoing pending: target summary, expiry, cancel/retry.
8. Incoming review: requester summary, accept/reject.
9. Safety number: grouped digits, copy, match/mismatch.
10. Paired success/welcome and active-state transition.
11. Identity change/recovery/fatal boundaries.

Sheets/dialogs remain component states. Motion uses shared tokens and Reduce Motion. Camera/clipboard errors have non-blocking manual alternatives.

## 10. Configuration

- `development`: local `http://127.0.0.1:<port>` only when an explicit development server override is present; Android development manifest may allow localhost cleartext only.
- `preview` and `production`: HTTPS only, valid non-placeholder URL required before release builds.
- No signing key, server secret, DB path outside local development default, or production credential appears in public Expo config.
- Server secrets/config are environment validated at process start; missing/invalid config fails startup.

## 11. Migration and rollback

- Add production identity schema v1 with monotonic native and server migration versions.
- Existing client installs have no production identity, so they enter create-identity without deleting SQLCipher data.
- If implementation is rolled back before user registration, removing production routes/module API leaves the prior secure local workspace intact.
- After registration, rollback cannot silently discard identity. A rollback build must detect unsupported production identity state and fail closed or include an explicit migration path.
- The server keeps migration backups/rollback instructions; schema downgrade is not automatic.

## 12. Validation strategy

- TypeScript: domain reducer/controller, API canonicalization, DTO decoders, provider/gate and all screen states.
- Native JVM: identity/prekey generation, store serialization/encryption helpers, candidate isolation, fingerprint and replay rules.
- Android instrumentation: Keystore record encryption, device signing, process restart, alias loss/corruption, unified cleanup.
- Server unit/integration: endpoint DTOs, repository migrations/transactions, signature/nonce/time, expiry, idempotency, unique pair and redacted logging.
- Cross-layer contract fixtures: native/server public bundle, pairing packet envelope metadata and server/client error enums.
- Two-install acceptance: physical ARM64 + x86_64 emulator, all three discovery methods, force-stop, reject/cancel/expire/mismatch/identity-change and cleanup.

## 13. Rollout gates

Gate 1: workspace/server dependency install and minimal server build/test, including exact-version audit.

Gate 2: production native identity store and device-auth signature pass JVM/instrumentation without touching Spike evidence.

Gate 3: one pairing method completes on two installs through the persistent service.

Gate 4: QR/M2Y-ID/code, complete state UI, safety number and negative paths pass.

Gate 5: full quality/build/log/database/ARM64 evidence and parent progress update.

Any gate may produce no-go. Do not replace persistent/native behavior with in-memory or TypeScript crypto to force a pass.
