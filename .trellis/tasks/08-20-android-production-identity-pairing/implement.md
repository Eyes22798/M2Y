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
- [x] Add stable error taxonomy shared through explicit client/server fixture files, not duplicated ad hoc strings.

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
6. **原有六个 decision 入口仍未全部接到应用层。** E3a 已把首包 prepare、outbox 恢复和 ACK 接入
   `ProductionIdentityPort`；接受/拒绝、确认安全号码与激活入口仍留在 native adapter，等待 E3b/F
   从已解密的入站 candidate 纵向接通，页面不能直接注入 peer identity。

## D. Pairing service API and signed transport

- [x] Implement device self-signed registration and exact M2Y-ID collision/retry semantics.
- [x] Implement signature middleware/guard for canonical request, clock skew and nonce replay.
- [x] Implement identities, public prekey bundles, one-time prekey lease/replenishment and stable public DTO validation.
- [x] Implement invitation ticket/handshake-code creation, hashing, 10-minute expiry and one-time consumption.
- [x] Implement pair prepare/submit/events/respond/verify/cancel state machine with idempotent operation IDs.
- [x] Enforce both-member unique active relationship transactionally.
- [x] Add route-specific rate limits, length/body limits and log/database sensitive-pattern tests.

### D verification evidence and boundary notes

1. **All discovery modes now share one durable request state machine.** M2Y-ID resolution and the
   hashed, one-use QR/handshake invitations converge in `PairingRequestRepository.prepare`; prekey
   lease and invitation consume run inside the same `IMMEDIATE` transaction. Submit, response,
   cancel, reciprocal verification, expiry events and unique two-member activation use schema v5.
2. **Device authentication covers the exact bytes sent by Android.** The canonical transcript is
   `M2Y-REQUEST-V1`, uppercase method, sorted path/query, millisecond timestamp, nonce and SHA-256 of
   the raw body. Nest composition keeps `rawBody`, enforces a 32 KiB parser limit, accepts only the
   P-256 device key ID and durably rejects nonce replay within the five-minute window.
3. **The public failure boundary is shared and closed.**
   `contracts/pairing-v1/error-codes.json` feeds strict client/server projections. Validation,
   body-parser, throttler, auth, idempotency and state errors expose only fixture-backed
   `{ code, schemaVersion: 1 }`; unknown dependency failures become `internal-error` without text.
4. **Server persistence contains public/opaque material only.** Registration stores the native
   public bundle and 16 prekeys; invitation plaintext is never stored; pairing packets remain opaque.
   A schema-pattern test forbids private/session/plaintext/safety fields and the capture-logger test
   proves messages and stacks are dropped. `M2Y_SERVER_INVITE_HASH_KEY` is mandatory for durable DBs.
5. **Automated evidence on 2026-08-25:** frozen pnpm install passed; server format/type/lint/test/build
   passed at 9 suites / 24 tests; root format/type/lint/dependency/config gates passed and the full
   client suite passed serially at 29 suites / 215 tests. One parallel root run timed out in two
   existing UI tests; both passed alone and the subsequent full serial run was green. Physical
   two-install transport remains section E/G and is not claimed by these server-only tests.

## E. Pairing application controller and three discovery modes

### 纵向闭环执行约束（2026-08-27）

用户确认停止横向扩展基础设施。后续严格按一个可观察的 M2Y-ID 闭环推进：

1. 本机身份生成后立即完成签名注册、receipt 回写，并显示服务端已登记的真实 M2Y-ID。
2. M2Y-ID 输入只调用共同的 prepare/transcript；native 必须先提交真实加密 packet/outbox，
   服务端 submit 成功并 ACK 后才进入 `outgoingPending`。
3. 目标端 polling 事件必须由 native 解密并提交 candidate 后，才显示 `incomingReview`。
4. 接受/拒绝、安全号码和双方确认页面紧接这条链实现；两安装 M2Y-ID Gate 3 通过前，
   不增加通用 sync、推送、附件、Activity、Timeline 或与本闭环无关的基础设施。
5. QR 和握手码仅在 M2Y-ID 闭环通过后作为 discovery adapter 接入同一状态机，不另建协议链。

当前切片状态：身份生成 → 签名注册 → native receipt 提交，以及 M2Y-ID 输入 → 服务端 prepare →
native PQXDH 首包/outbox 同事务提交 → 服务端 submit → native ACK → `outgoingPending` 已接线；
对端 polling packet → native PQXDH 解密与绑定校验 → session/prekey/candidate 同事务提交 →
`incomingReview` 请求摘要也已接线。下一纵向阻塞点是生成并投递接受/拒绝响应密文；在响应、
安全号码和双方确认完成前，F/G 仍不提前勾选。

- [x] Implement signed `PairingApiClient`, exact JSON/body hashing, timeouts, retries and strict response decoding.
- [x] Implement foreground-aware cancellable polling with bounded backoff and cursor persistence.
- [x] 将 M2Y-ID native 首包 outbox 接到服务端 delivery/ack，不发布乐观状态。
- [x] 实现严格的 M2Y-ID 输入归一化与通用查询失败提示。
- [x] 为本机格式化 M2Y-ID 增加安全的复制入口。
- [ ] Install SDK-compatible camera/clipboard/SVG dependencies through Expo; implement QR display/scan/deep link and permission-denied fallback.
- [ ] Implement 8-character handshake-code display/input/countdown and expiry recovery.
- [ ] Unit/integration test all three methods converge to the same pending request state.

### E1 transport evidence

1. `src/application/pairing/contracts.ts` defines the pure `PairingApi`, signer port, typed public
   bundles, operation packets, invitations, events and stable result unions. The concrete client and
   Expo crypto factory remain under `src/data/pairing`; the native adapter implements only the signer
   port, so controllers/screens do not depend on transport or native modules.
2. POST bodies are serialized once. SHA-256, canonical request signing and fetch all consume that
   exact string. Each bounded retry keeps the operation/body but creates a fresh 18-byte nonce,
   timestamp and P-256 signature; two attempts and 10-second per-attempt timeout are the defaults.
3. Every server response is decoded from `unknown` with exact keys, version/enums/UUID/M2Y/base64url
   bounds, active `pairId` invariant and ordered event cursor checks. Known server failures remain
   fixture-backed values; fetch/native/JSON text is never propagated.
4. Automated evidence on 2026-08-25: targeted pairing client/decoder/fixture tests passed at 3 suites /
   14 tests. Full root gates passed at 31 suites / 227 tests and dependency-cruiser reported 131
   modules / 203 dependencies with no violations; server remained green at 9 suites / 24 tests plus
   format/type/lint/build.

### E2 轮询证据

1. `DefaultPairingPollingController` 仅在前台运行；进入后台或停止时同时取消在途 HTTP 与等待，
   快速后台→前台切换通过 generation + 单飞约束串行化，不允许旧事件提交与新轮询重叠。
2. 服务端事件必须先由 `PairingEventConsumer` 成功应用，再写入 `PairingCursorStore` 并推进内存游标；
   应用或持久化失败均 fail-closed。由于写游标失败可能导致重放，E3 消费器必须以事件游标/事件 ID 幂等。
3. `ExpoPairingCursorStore` 只在 SecureStore 中保存非负安全整数游标；缺失值从 0 开始，损坏值、
   原生异常和不可用状态统一映射为稳定失败码，不保存事件、packet 或安全号码。
4. `PairingApiClient.readEvents` 接受外部 `AbortSignal`；外部取消立即终止当前请求且禁止后续重试，
   超时仍保留原有两次有界重试。网络失败采用 1/2/4/8 秒封顶退避，成功轮询间隔为 1.5 秒。
5. 2026-08-27 自动化证据：轮询/游标/API 取消定向测试 3 suites / 21 tests；根目录完整测试
   33 suites / 242 tests；format/type/lint/dependency/config 与 `git diff --check` 全部通过。

### E3a M2Y-ID 发起端闭环证据

1. 页面只接受严格格式的 M2Y-ID，并统一处理本机 ID、目标不存在/无 prekey/已有关系与网络失败；
   controller 会校验服务端 target bundle、native prepared packet 和 submit receipt 的 request、设备、
   stable identity、M2Y-ID、operation 与 expiry 绑定，任何不一致都 fail closed。
2. `ProductionSignalProtocolStore` 把 libsignal identity/session/prekey/signed-prekey/Kyber/sender-key
   记录加密保存到 production `secret_records`。`ProductionPairingProtocolEngine` 在同一 SQLite 事务中
   完成 PQXDH SessionBuilder、PREKEY 首包和加密 outbox；重试返回同一 operation 与密文。
3. submit 成功前不发布 `outgoingPending`。网络中断后，retry/重启会从 native outbox 原样重传；
   服务端返回同 request/operation 的 pending receipt 且 native ACK 成功后，状态机才展示等待对方确认。
4. 2026-08-28 自动化证据：根目录完整 Jest 34 suites / 264 tests；typecheck、lint、format、
   dependency-cruiser 全绿；native JVM `--rerun-tasks` 8 suites / 56 tests、0 failures/errors，
   androidTest Java 编译通过。
   ARM64 debug APK 构建成功，`native-code: 'arm64-v8a'`，110,080,952 bytes，SHA-256
   `770B2461D74D8369DE52DFD116EF519C6CD8A26F824660331E5F3E1645A91CFD`。
5. 真机运行证据仍未完成：本轮 ADB daemon 启动后设备列表为空，所以新增的
   `pqxdhFirstPacketOutboxAndAcknowledgedInspectionSurviveRestart` 仅完成 androidTest 编译，不能声称
   Android Keystore/SQLite/PQXDH 在物理设备上通过；设备重新连接后应优先执行该 suite。

### E3b M2Y-ID 接收端待审核证据

1. `DefaultPairingPollingController` 已在身份 provider 的前台生命周期中启动，并把 `pair-request`
   事件交给身份 controller；只有 `ProductionIdentityPort.consumePairingRequestEvent` 返回与事件
   request 绑定的 `incomingReview`，状态机才发布用户可见状态，失败时游标不会推进。
2. native 严格解码 canonical base64url PREKEY packet，用生产 SQLite-backed libsignal store 完成
   PQXDH 解密；请求 ID、发送方设备/M2Y-ID/stable identity、消息 identity key、握手 identity key、
   有效期必须一致且不能指向本机。session、prekey 消耗、可信身份、inbox marker 与加密 candidate
   在同一事务提交，异常全部回滚。
3. 重放检查先于 libsignal 解密：游标写入失败导致同一 packet 再投递时，不会因已消费 prekey 或
   ratchet 状态而误报损坏，也不会创建第二个 candidate。重启 inspection 只解密最早的有效待审核
   candidate，并拒绝 incoming/outgoing 同时可见的冲突状态。
4. 页面仅展示 native 已提交 candidate 的对方 M2Y-ID 和“尚未接受”说明，不把 transport 明文字段
   当作身份。接受/拒绝按钮本切片刻意不伪接：现有 native decision outbox 尚未携带服务端 `/respond`
   所需的加密 packet，这是下一纵向切片必须解决的真实阻塞点。
5. 2026-08-28 自动化证据：根目录 34 suites / 272 tests 全绿；typecheck、lint、format、
   dependency-cruiser、config 全绿；native JVM 8 suites / 56 tests 通过，
   androidTest Java 编译通过。新增 `incomingPqxdhPacketDecryptsPersistsAndReplaysIdempotently` 已编译，
   但 ADB daemon 重启后设备列表仍为空，不能把该 instrumentation 记录为真机通过。新 ARM64 APK
   110,083,588 bytes，`native-code: 'arm64-v8a'`，SHA-256
   `96516AEBF56DE39175C8DCDFA7BDCF60A5957B7D427BA2AA19214462E75A1AB9`。

### E4 原型优先的身份与配对方式切片

1. 2026-09-04 起不再把整个长画布当成一个实现单元。当前页面内步骤按原型收窄为“身份已在本机创建 →
   配对方式 → 输入 M2Y-ID”，不新增 controller、服务端或 native 协议入口。
2. 身份页展示 controller 已提交的真实 M2Y-ID，使用 Expo SDK 兼容的 Clipboard API 完成复制；复制
   失败时允许长按文本手动复制，不把失败异常或敏感信息显示给用户。
3. 配对方式页保留原型中的扫码、M2Y-ID 和一次性握手码。只有已经真实接通的 M2Y-ID 可操作；扫码和
   握手码带可访问的禁用状态与“暂未开放”说明，避免静态页面被误认为可用功能。
4. 页面步骤、输入草稿和复制反馈均为 screen-local state；只有现有 `startM2yPairing` 成功后才由
   controller 发布 `outgoingPending`，没有增加乐观成功状态。
5. 本切片定向组件测试覆盖复制、逐步导航、未开放入口和真实 M2Y-ID 提交。2026-09-04 完整 Jest
   34 suites / 273 tests、typecheck、lint、依赖边界、配置检查和 Android export 通过；新增 Clipboard
   原生模块已被 Expo autolinking 识别。
6. ARM64 debug APK 构建通过，117,128,748 bytes，仅含 `arm64-v8a`，SHA-256
   `C43B5FFB86DB4AE3FC5721784D2AC10C75909A5D5B6C73DF9F4A0068311151D0`。ADB 设备列表为空，
   因此复制按钮、页面视觉和输入法遮挡仍需真机补验，不能记录为真机通过。
7. 全仓 `format:check` 只被任务开始前已存在且未跟踪的 `metro.config.js` 阻断；本切片文件的 Prettier
   检查通过。Expo Doctor 的唯一失败是仓库原有 9 个 Expo 补丁版本整体落后一版，本切片没有借机
   扩大为 SDK 依赖升级。

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
