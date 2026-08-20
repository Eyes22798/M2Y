# Android E2EE 原生集成技术设计

## 1. 设计目标

以最小、隔离、可清理的 Android harness 证明官方 libsignal 能在当前 Expo/RN 工程中完成 PQXDH 建链、Double Ratchet 双向消息、失败拒绝、持久重开、安全号码一致性和性能测量。所有协议状态留在 Kotlin/native 边界，JavaScript 只接收脱敏状态码和聚合指标。

## 2. 边界与目录

```text
dev route / Settings link
  -> src/testing/e2ee/AcceptanceScreen
    -> src/native/crypto/M2YCryptoSpikeAdapter.ts
      -> modules/m2y-crypto/index.ts
        -> Expo Module Kotlin facade
          -> LibsignalScenarioRunner
          -> CheckpointingSignalProtocolStore
          -> AndroidKeystoreCheckpoint
```

- `modules/m2y-crypto/`：持久的 Expo local module、Gradle/Maven 配置、Kotlin protocol/store/harness 和 native tests。
- `src/native/crypto/`：仅 typed adapter、capability/result decoder；不得实现密码学或持有 protocol records。
- `src/testing/e2ee/` 与 `app/_dev/e2ee.tsx`：仅 development 可达的 redacted acceptance UI。
- `android/`：CNG 输出，不放手工业务逻辑。需要的 app packaging exclusions 由 config plugin 生成。

## 3. 依赖和构建

- 精确锁定：
  - `org.signal:libsignal-client:0.101.0`
  - `org.signal:libsignal-android:0.101.0`
- libsignal 依赖与精确版本只在 local module Gradle 中声明。Expo 会由消费端 `:app` 解析聚合模块依赖，因此 Signal Maven repository 由 config plugin 持久注入根 `allprojects.repositories`；使用 libsignal v0.101.0 发布脚本指向的官方 GCS bucket 端点，不手改 CNG 输出。
- config plugin 为 app packaging 排除 desktop native resources 与 testing JNI；每次 clean prebuild 验证排除仍存在。
- Gate 1 只创建最小 module 并调用安全的版本/capability API。若 Kotlin metadata、AGP、NDK、16 KB page size 或 ABI 构建失败，停止后续实现并形成 no-go 报告。

## 4. Expo Module API

JavaScript-facing API 不接受/返回密钥、protocol records、fingerprint 或明文：

```text
getSpikeInfo() -> libraryVersion / protocol / platform / ABI
runFreshAcceptance() -> runId + redacted checks
runResumeAcceptance(runId) -> redacted checks
runNegativeAcceptance(runId) -> redacted checks
runPerformanceAcceptance(runId) -> aggregate timings/memory/size references
cleanupAcceptance(runId) -> cleanup status
```

- `runId` 是测试相关 ID，不是身份或密钥。
- 所有 native exception 映射成固定错误码；原始 message/stack 不跨 bridge、不写日志。
- Async functions 通过单一 coroutine/Mutex 串行化；每个 operation 使用 fresh working-copy store。

## 5. Native store 与 checkpoint

### 5.1 Store payload

Versioned strict snapshot 包含两个隔离 persona（Alice/Bob）：

- local registration ID 与 serialized identity key pair；
- trusted remote identities；
- pre-key、signed pre-key、Kyber pre-key records；
- session 与 sender-key records；
- run ID、schema version、created/updated timestamps；
- 不包含测试明文、日志或 UI 数据。

Record 使用 libsignal 官方 serialize/constructor contract。Snapshot 使用 kotlinx serialization JSON + Base64 只作为加密前内部编码；磁盘永远只保存 AES-GCM envelope。

### 5.2 Encryption envelope

- Alias：`m2y.e2ee.spike.checkpoint-key.v1`。
- Android Keystore 生成 AES-256 key，限定 GCM/no padding，使用系统生成随机 IV。
- File magic/version/run ID 作为 AAD；磁盘 envelope 只保存 version、IV 与 ciphertext/tag。
- `AtomicFile.startWrite/finishWrite/failWrite` 确保 crash-safe replace；module Mutex 提供锁。
- checkpoint 存在但 alias 缺失/失效、版本未知、认证 tag 错误时 fail-closed，返回稳定 recovery code，不重建身份覆盖旧状态。

### 5.3 Commit protocol

1. 解密并严格解析 committed snapshot，构造 working-copy store。
2. 在 working copy 上执行一个 protocol action。
3. 序列化全部 records、加密并 atomic checkpoint。
4. checkpoint 成功后才返回 redacted result；失败时丢弃 working copy 和未发布结果。

## 6. Protocol scenarios

### 6.1 Fresh round trip

- Alice/Bob 分别生成 identity、registration ID、signed/one-time/Kyber pre-keys。
- Alice 处理 Bob PQXDH bundle，发送 pre-key message；Bob 解密并建立 session。
- Bob 回复 ratcheted message；Alice 解密。
- 生成双方相同的 numeric fingerprint；只比较 equality，默认 UI 不展示号码。

### 6.2 Resume

- Fresh phase checkpoint 后由测试流程 force-stop/restart development build。
- Native module 重新打开 checkpoint，不重新生成身份，继续完成多轮双向消息。
- 丢失 alias/损坏 checkpoint 必须进入 stable failure，不生成新 persona 覆盖。

### 6.3 Negative cases

- 乱序：在库允许的 skipped-message window 内成功。
- 重复：返回 `duplicate-message-rejected`。
- bit-flipped ciphertext：返回 `corrupt-ciphertext-rejected`。
- remote identity replacement：返回 `identity-change-rejected`，旧 session 不被静默覆盖。
- checkpoint write fault：不返回 plaintext/ciphertext success，reopen 仍是上一个 committed state。

### 6.4 Performance and package evidence

- Native loop 执行 1,000 条双向短消息，记录总耗时、p50/p95 与 process memory delta；内容为固定 synthetic bytes，不输出。
- 生成 32-byte attachment content key，用已建立 session 封装；另用 synthetic 100 MB temp file 测量 native streaming boundary，结束后删除。完整生产附件格式另立任务。
- 对比无 libsignal 基线和集成后 x86_64/arm64 APK/AAB 大小、native libraries 与方法数；报告不设未经产品确认的硬阈值。

## 7. Tests and evidence

- Kotlin/JUnit：store copy/commit、serialization roundtrip、protocol scenarios、typed errors、fault injection。
- Android instrumentation/dev harness：Keystore、AtomicFile、process restart、cleanup、ABI/native load。
- Jest/RNTL：adapter strict decoder、dev-only route、redacted UI、production route absence。
- Android API 37.1 x86_64 emulator 与 realme RMX3888 arm64 physical device 各完成一次；物理设备数据只使用隔离 harness。

## 8. Go / No-Go

### Go

- Gate 1 build/runtime 兼容；所有协议/持久/negative checks 通过；无敏感 bridge/log 输出；体量/性能/维护风险可量化；清理完成。

### No-Go

- Kotlin/RN/Expo/ABI 不能在不升级主基线的情况下兼容；协议 state 无法可靠 checkpoint；上游 API/维护或许可证义务不可接受；关键失败路径出现 fail-open。

No-go 时保留研究和失败证据，移除/回滚 module 依赖，不实现配对 UI 或替代 JavaScript crypto。
