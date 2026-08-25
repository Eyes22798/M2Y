# Signed Pairing API

## Scenario: Durable identity registration and opaque pairing relay

### 1. Scope / Trigger

- Trigger: changing an identity or pairing route, canonical signature input, public DTO, error code,
  prekey lease, invitation, pairing transition, operation idempotency, event cursor, or related schema.
- The server stores public identity/prekey material and opaque encrypted protocol packets only. Native
  clients remain responsible for private identity keys, libsignal sessions, safety numbers and message
  plaintext.
- `contracts/pairing-v1/error-codes.json` is the cross-layer source of public error codes; both the
  Expo client and server import validated projections of that fixture.

### 2. Signatures

```text
POST /v1/identity/register
GET  /v1/identity/status
POST /v1/identity/prekeys/replenish
POST /v1/pair/invites
POST /v1/pair/requests/prepare
POST /v1/pair/requests/:requestId/submit
GET  /v1/pair/events?after=<non-negative-safe-integer>
POST /v1/pair/requests/:requestId/respond
POST /v1/pair/requests/:requestId/verify
POST /v1/pair/requests/:requestId/cancel

M2Y_SERVER_INVITE_HASH_KEY=<base64url 32-byte secret>  # required for durable databases

M2Y-REQUEST-V1\n<METHOD>\n<SORTED_PATH_QUERY>\n<TIMESTAMP>\n<NONCE>\n<BODY_SHA256_HEX>
```

- Headers are `x-m2y-device-id`, `x-m2y-key-id: device-auth-v1`, `x-m2y-timestamp`,
  `x-m2y-nonce`, and `x-m2y-signature`.
- Device auth uses P-256 SPKI DER public keys and ECDSA/SHA-256 DER signatures, all base64url encoded.
- Every mutating request carries a UUID v4 `operationId`; repositories bind it to device, request,
  operation kind and raw-body hash.

### 3. Contracts

- Nest must be created with `rawBody: true` and `bodyParser: false`, then install the JSON parser with
  a `32kb` limit before `configureApplication`. Do not reconstruct JSON before hashing or verifying.
- Registration is self-signed by the submitted device-auth public key. It atomically stores one
  identity, one device, the exact native public bundle, 16 one-time prekeys, receipt and consumed nonce.
- All later routes use `DeviceSignatureGuard`: timestamp window is ±5 minutes and nonce consumption
  is durable. A repeated nonce is a conflict even when the operation body is otherwise idempotent.
- QR tickets and 8-character handshake codes live for 10 minutes, are deterministic on operation
  retry, are stored only as hashes, and are consumed once inside pairing prepare's transaction.
- M2Y-ID, QR and handshake discovery converge to the same prepared request. Submit/respond/verify/
  cancel relay only base64url opaque packets of 32..24576 characters.
- A one-time prekey is leased during prepare and consumed during submit. Both members must verify
  before one `pair_id` and exactly two unique active-member rows are inserted atomically.
- Event cursors are server-generated integers. Clients acknowledge progress by persisting the last
  processed cursor; the server never infers receipt from a poll alone.
- Public failures are exactly `{ "code": <fixture-code>, "schemaVersion": 1 }`; raw validator,
  SQLite, crypto, body-parser or Nest exception text never crosses HTTP.

### 4. Validation & Error Matrix

| Condition | Stable result |
|---|---|
| Unknown/extra DTO field, malformed UUID/M2Y-ID/base64url/cursor | `request-invalid` (400) |
| JSON exceeds 32 KiB | `request-body-too-large` (413) |
| Route throttle exceeded | `rate-limited` (429) |
| Header/key/timestamp/nonce/signature invalid | corresponding `device-auth-*` code (401) |
| Timestamp is outside ±5 minutes | `device-auth-timestamp-outside-window` (401) |
| Durable nonce already consumed | `device-auth-nonce-replayed` (409) |
| Same operation ID with a different body/actor/kind | family-specific idempotency conflict (409) |
| M2Y/stable/device identity collision | exact `identity-*-collision` code (409) |
| Missing/expired/consumed discovery target | `pairing-target-unavailable` (404) |
| Actor is not the request member allowed for a transition | `pairing-request-forbidden` (403) |
| Transition is invalid or member already has a relationship | state/relationship conflict (409) |
| Unexpected dependency/SQLite failure | `internal-error` (500), with no exception detail |

### 5. Good/Base/Bad Cases

- Good: retrying the same registration/prepare/mutation operation and byte-identical body returns the
  first durable result without consuming another nonce-independent resource or prekey.
- Base: an authenticated device polls `events?after=0` and receives an empty ordered event list.
- Bad: stringify a parsed object again for signature verification; key order or number formatting can
  change the bytes and invalidate the native signature.
- Bad: use a deferred SQLite transaction for an invitation consume, prekey lease or relationship
  activation; concurrent writers can both observe availability before either writes.
- Bad: catch every SQLite exception as replay/idempotency conflict. Only structural
  `SQLITE_CONSTRAINT*` codes may be mapped; I/O and corruption failures must remain internal errors.

### 6. Tests Required

- Unit-test canonicalization: method normalization, sorted query, raw body hash and deterministic text.
- E2E-test self-signed registration, exact retry/collision outcomes, clock skew, bad signature and
  durable nonce replay.
- E2E-test prekey replenish/lease, hashed one-use QR/code invitations, all three discovery modes,
  opaque submit/accept/reject/cancel, reciprocal verify and unique relationship activation.
- Assert idempotent retry returns the original request/result and a different body with the same
  operation ID is rejected.
- Assert oversized JSON returns only the stable 413 body and the seventh invite in one minute returns
  only the stable 429 body.
- Scan the durable schema for private-key, plaintext-message, session-key and safety-number fields;
  inject a redacted logger sink and assert raw messages, traces and secret fixtures never reach it.
- Run server format/type/lint/test/build plus all root gates whenever the shared fixture changes.

### 7. Wrong vs Correct

#### Wrong

```typescript
const canonicalBody = JSON.stringify(request.body);
verify(publicKey, canonicalRequest(canonicalBody), signature);
database.transaction(() => consumeInviteAndLeasePreKey())();
```

#### Correct

```typescript
const rawBody = request.rawBody;
verify(publicKey, canonicalRequest({ body: rawBody, ...requestMetadata }), signature);
database.transaction(() => consumeInviteAndLeasePreKey()).immediate();
```
