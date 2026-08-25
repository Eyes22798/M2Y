# Pairing API Client

## Scenario: Signed Android pairing transport

### 1. Scope / Trigger

- Trigger: changing a pairing HTTP method, request/response DTO, canonical signature, timeout/retry,
  server failure, Expo Crypto primitive or native device-signing adapter.
- `src/application/pairing/contracts.ts` owns the framework-free port and readonly DTOs.
  `src/data/pairing/**` owns JSON/HTTP/crypto transport. `src/native/crypto/**` implements only the
  device-signing port; feature screens and application controllers never call `fetch` or Expo Crypto.

### 2. Signatures

```text
DeviceRequestSigner.signDeviceRequest(canonicalRequest) -> deviceId / publicKeyId / signature

PairingApi.registerIdentity(input)
PairingApi.readIdentityStatus()
PairingApi.replenishPreKeys(input)
PairingApi.createInvitation(input)
PairingApi.preparePairRequest(input)
PairingApi.submitPairRequest(requestId, packet)
PairingApi.readEvents(afterCursor)
PairingApi.respondToPairRequest(requestId, response)
PairingApi.verifyPairRequest(requestId, packet)
PairingApi.cancelPairRequest(requestId, packet)

M2Y-REQUEST-V1\n<METHOD>\n<SORTED_PATH_QUERY>\n<TIMESTAMP>\n<NONCE>\n<BODY_SHA256_HEX>
```

### 3. Contracts

- Serialize a POST body exactly once with `JSON.stringify`. The same string goes to Expo SHA-256,
  the native canonical signer and `fetch`; never parse/rebuild it between those steps.
- `createExpoPairingApiClient` uses Expo Crypto SHA-256/HEX and 18 random bytes encoded as a
  36-character lowercase-hex nonce. Hex is an allowed unpadded base64url subset.
- Every attempt receives a fresh timestamp, nonce and native signature while preserving the exact
  method, target and body. Default HTTP timeout is 10 seconds and the default maximum is two attempts.
- Retry transport failures, timeouts and 5xx only. Do not retry a decoded 4xx contract failure; its
  operation ID remains available for an explicit application retry.
- Registration is self-signed, but the returned native signer `deviceId` must equal the body
  `deviceId` before any request is sent.
- Success/error response bodies enter as `unknown` and must have exact keys, schema version 1,
  known enums, bounded IDs/packets, ordered cursors and the expected discriminant relationship.
- Expected failures are `PairingApiResult` values. No raw fetch/native/JSON exception text is stored,
  logged or returned to application/UI code.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Hash/nonce/native signing fails | `client/pairing-signing-failed` |
| Registration signer device differs from body | `client/pairing-signature-device-mismatch`; no fetch |
| Both attempts fail before an HTTP response | `client/pairing-network-unavailable` |
| Both attempts are aborted by the timeout | `client/pairing-timeout` |
| 200 body has unknown/missing/invalid fields | `client/pairing-response-invalid` |
| Non-200 body has an unknown code/shape | `client/pairing-response-invalid` |
| Non-200 body is fixture-backed | `server/<code>` plus numeric HTTP status |
| Active mutation lacks `pairId`, or non-active carries one | `client/pairing-response-invalid` |
| Event cursors are unordered or packet is not bounded base64url | `client/pairing-response-invalid` |

### 5. Good/Base/Bad Cases

- Good: a retry sends byte-identical registration JSON with a fresh nonce/signature and receives the
  first durable server receipt through operation idempotency.
- Base: `readEvents(0)` sends a signed GET with an empty-body SHA-256 and no content-type/body.
- Bad: sign `JSON.stringify(input)` and later call `fetch` with `JSON.stringify({ ...input })`; a
  future key-order/normalization change silently breaks the signature.
- Bad: return `error.message`, `response.text()` or an unchecked `response.json()` object to a
  controller; it can expose server/native details and lets unknown schema reach UI state.

### 6. Tests Required

- Assert canonical query sorting and the complete newline-delimited signature transcript.
- Capture hash input, native signer input and fetch body; prove all derive from the exact same string.
- Prove a transport retry keeps the body but changes timestamp/nonce and signs again.
- Prove two timed-out attempts are aborted and converge to the stable timeout value.
- Cover every response family decoder, extra-key rejection, enum/ID/bounds checks, active `pairId`
  invariant and ordered event cursors.
- Inject secret-looking error fields and assert the returned failure contains none of them.
- Run root format/type/lint/dependency/test/config gates and server contract tests after fixture or DTO
  changes.

### 7. Wrong vs Correct

#### Wrong

```typescript
const signature = await signer.signDeviceRequest(JSON.stringify(input));
const response = await fetch(url, { body: JSON.stringify({ ...input }), method: 'POST' });
return response.json();
```

#### Correct

```typescript
const body = JSON.stringify(input);
const bodyHash = await hashBody(body);
const signature = await signer.signDeviceRequest(canonical({ bodyHash, ...metadata }));
const response: unknown = await fetch(url, { body, headers: signedHeaders(signature), method: 'POST' });
return decodeExactResponse(response);
```
