# Android Production Identity Guidelines

## Scenario: Production identity creation, persistence, and reset

### 1. Scope / Trigger

- Trigger: changing production identity, libsignal prekeys, Android Keystore aliases, native identity SQLite, native DTOs, identity state, or destructive local reset.
- This scenario is distinct from `M2YCryptoAcceptanceHarness`. Spike personas, run IDs, checkpoint files, aliases, and DTOs remain development evidence only.

### 2. Signatures

```text
SecureWorkspaceGate ready
  -> production identity inspection
  -> prepareIdentityRegistration(displayName?)
  -> persist encrypted identity/prekeys + durable registration outbox
  -> server acknowledgement
  -> commitIdentityRegistration(operationId, receiptId)
```

```text
m2y-production-identity-v1.db
m2y.identity.record-key.v1
m2y.device-auth-signing-key.v1
```

### 3. Contracts

- All production identity operations run on one native serial executor.
- Private identity, signed pre-key, Kyber pre-key, and one-time pre-key records are encrypted independently with AES-256-GCM. AAD binds schema version, record kind, record key, and revision.
- The device-auth key is Android Keystore P-256 and signs only the documented `M2Y-REQUEST-V1` canonical form using SHA-256 with ECDSA.
- Registration preparation is restart-idempotent while its durable outbox entry is pending. It must return the original operation and public bundle rather than generating a replacement identity.
- Android `JSONObject.put` must receive an explicit `JSONArray`/`JSONObject` tree for nested registration pre-key records; an immutable Java `List<Map<...>>` is otherwise stringified on Android.
- Production native payloads cross JavaScript only through exact TypeScript decoders. Unknown keys, enum values, malformed IDs, duplicate pre-key IDs, private material, and raw native exception details fail closed.
- Unified reset closes the active SQLCipher session, cleans production identity/Keystore and development acceptance state, then deletes SQLCipher data/key/envelope. Any partial failure remains `recoveryRequired`.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Identity DB exists but record or signing alias is missing | `identity-key-missing`; do not regenerate |
| Secret record GCM tag/envelope is invalid | `identity-record-corrupt`; do not expose native cause |
| Registration prepare is retried after restart | Return the same operation ID and public keys |
| Registration ACK references no pending outbox operation | Reject with a stable registration code |
| Nested one-time pre-key list is not encoded as JSON array | Instrumentation retry test fails; fix native JSON construction |
| Production or acceptance cleanup fails | Keep app fail-closed in `recoveryRequired/reset-failed` |

### 5. Good / Base / Bad Cases

- Good: commit SQLite state and encrypted outbox in one transaction, then return a redacted DTO.
- Good: test signing by verifying against the exported public key without snapshotting any private bytes.
- Base: optional display name is trimmed, bounded, encrypted locally, and omitted when empty.
- Bad: create a new identity when a key alias is missing, persist private libsignal records in TypeScript/SecureStore, or reuse acceptance Alice/Bob state.

### 6. Tests Required

- JVM tests cover human-readable M2Y-ID format and production identifier independence.
- TypeScript tests cover exact absent/pending/unpaired projections, exact public registration bundles, duplicate/unknown fields, signatures, reset DTOs, and identity relationship transitions.
- Android instrumentation covers creation, prepare retry, P-256 verification, registration commit, process/manager restart, missing alias, corrupt encrypted record, and reset cleanup.
- Secure workspace controller tests prove native cleanup failure prevents SQLCipher deletion and leaves the state fail-closed.

### 7. Wrong vs Correct

#### Wrong

```java
json.put("oneTimePreKeys", immutableListOfMaps);
```

#### Correct

```java
JSONArray preKeys = new JSONArray();
preKeys.put(new JSONObject().put("id", id).put("publicKey", publicKey));
json.put("oneTimePreKeys", preKeys);
```
