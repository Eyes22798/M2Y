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
PairingApi.readEvents(afterCursor, signal?)
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

## 场景：前台短轮询与持久游标

### 1. 范围 / 触发条件

- 修改配对事件轮询、App 前后台生命周期、事件消费顺序、SecureStore 游标或请求取消语义时，
  必须遵守本场景。
- 应用层拥有轮询状态机与端口；数据层实现 HTTP 取消和游标存储；页面不得自行维护定时器或游标。

### 2. 签名

```text
PairingApi.readEvents(afterCursor, signal?) -> PairingApiResult<PairingEvents>
PairingEventConsumer.applyEvents(events) -> ok | pairing-event-apply-failed
PairingCursorStore.readCursor() -> cursor | pairing-cursor-*
PairingCursorStore.writeCursor(cursor) -> ok | pairing-cursor-*
PairingPollingController.start(foreground) / setForeground(foreground) / stop()
```

### 3. 合同

- 首次无游标时从 `0` 开始；游标必须是十进制非负安全整数，SecureStore 只保存游标本身。
- 每批事件必须按“读取 → 应用全部事件 → 持久化 `nextCursor` → 推进内存游标”的顺序处理。
- 进入后台或停止时必须取消 HTTP 与退避等待；回到前台后从最近的已提交游标恢复。
- 任一时刻最多存在一个轮询周期。快速后台→前台切换必须等旧周期退出后再启动新周期。
- 网络失败默认按 1/2/4/8 秒退避并封顶；成功后重置失败次数，1.5 秒后继续轮询。
- 外部取消不得继续 HTTP 重试。超时与普通网络失败仍由 transport 的有界重试规则处理。
- 游标写入失败可能使已应用事件在下次启动时重放，因此事件消费者必须按游标或 `eventId` 幂等。

### 4. 验证与错误矩阵

| 条件 | 结果 |
|---|---|
| SecureStore 无记录 | `cursor = 0` |
| 游标不是非负安全整数 | `failed/pairing-cursor-invalid`；不发请求 |
| SecureStore 不可用或抛错 | `failed/pairing-cursor-unavailable`；不暴露原生文本 |
| 事件应用失败 | `failed/pairing-event-apply-failed`；不写游标 |
| 游标写入失败 | 稳定失败；不得推进内存游标 |
| App 进入后台或停止 | 取消在途工作并暂停/停止；不计网络失败 |
| 网络或超时失败 | 保持原游标并按封顶退避重试 |

### 5. 正常 / 基线 / 错误案例

- 正常：游标 7 读取到事件 8，事件成功应用并持久化 8，下一轮从 8 开始。
- 基线：服务端返回空事件且 `nextCursor` 不变，仍提交该游标并按成功间隔继续。
- 错误：先写游标 8 再应用事件；进程若在两步之间终止，会永久跳过未应用事件。
- 错误：每次前台回调都直接启动异步轮询；快速切换可能让两个周期并发消费同一批事件。

### 6. 必需测试

- 断言事件成功应用后才调用 `writeCursor`，应用失败时不写游标。
- 覆盖损坏游标、SecureStore 读取/写入异常和非法写入。
- 覆盖后台取消在途 HTTP、回前台从原游标恢复、停止后不再重试。
- 用可控的事件应用 Promise 回归快速后台→前台竞态，断言 API 周期不重叠。
- 连续制造三次网络失败，断言游标不变且退避达到上限后不再增长。
- 外部取消 transport 请求后，断言只有一次请求尝试。

### 7. 错误与正确示例

#### 错误

```typescript
await cursorStore.writeCursor(batch.nextCursor);
await eventConsumer.applyEvents(batch.events);
```

#### 正确

```typescript
const applied = await eventConsumer.applyEvents(batch.events);
if (!applied.ok) return fail(applied.reason);
const persisted = await cursorStore.writeCursor(batch.nextCursor);
if (!persisted.ok) return fail(persisted.reason);
```
