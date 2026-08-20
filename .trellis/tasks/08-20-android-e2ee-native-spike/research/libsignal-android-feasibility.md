# libsignal Android 可行性研究

日期：2026-08-20

## 结论摘要

- 首选方案：官方 `org.signal:libsignal-client:0.101.0` + `org.signal:libsignal-android:0.101.0`。
- 接入方式：`modules/m2y-crypto/` 本地 Expo Module，Kotlin adapter；不修改 CNG 生成的 `android/` 业务代码。
- 当前任务只给出 Android go/no-go；iOS 一致性必须另立任务，Android 结论不能冒充双平台 Spike D 完成。
- 许可证：M2Y 接受 AGPLv3 开源义务；发布仍需对应源码、第三方 notices、加密出口与应用商店条款检查。
- 第一执行门槛：Expo SDK 56 的 Kotlin 2.1.20 能否消费 libsignal 的 Kotlin 2.2.20/coroutines 1.10.x/serialization 1.9.x 依赖。失败时立即 no-go 或回到规划，不在本任务顺带升级 Expo/RN。

## 官方证据

### Signal libsignal

- 官方仓库与许可证：https://github.com/signalapp/libsignal
- v0.101.0 release：https://github.com/signalapp/libsignal/releases/tag/v0.101.0
- Java/Android 构建和 Maven 使用：https://github.com/signalapp/libsignal/blob/main/README.md
- 当前 PQXDH/session 测试：https://github.com/signalapp/libsignal/blob/main/java/client/src/test/java/org/signal/libsignal/protocol/SessionBuilderTest.java
- 当前测试包含 `PreKeyBundle`、`SessionBuilder`、`SessionCipher`、PQXDH protocol v4、双向消息、乱序、重复、损坏密文和 identity replacement 场景。
- 官方 Maven metadata 在 2026-08-20 同时报告 `libsignal-client` 和 `libsignal-android` latest/release 为 `0.101.0`。

### Expo Modules

- 本地模块指南：https://docs.expo.dev/modules/get-started/
- Expo Modules overview：https://docs.expo.dev/modules/overview/
- 本地模块会被 Expo Autolinking 自动发现，适合当前 Kotlin/New Architecture；生成的 Android/iOS 项目仍可由 CNG 重建。

### Android 安全存储

- Android Keystore `KeyGenParameterSpec`：https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec
- `AtomicFile`：https://developer.android.com/reference/android/util/AtomicFile.html
- Keystore AES/GCM 从 API 23 可用；M2Y min SDK 为 24。
- `AtomicFile` 提供写入完成后替换，但不提供锁；module 必须串行化所有 checkpoint 操作。
- AndroidX `EncryptedFile` 已 deprecated，不作为新依赖。

## 兼容性与体量

| 项目 | 当前事实 | 计划含义 |
|---|---|---|
| Expo/RN | Expo 56 / RN 0.85.3 / Hermes / New Architecture | 使用本地 Expo Module，不引入旧 bridge-only RN 包 |
| Kotlin | Expo 解析为 2.1.20；libsignal POM 声明 stdlib 2.2.20 | compile/runtime probe 是 Gate 1 |
| Android | min 24 / compile 36 / target 36 / NDK 27.1 | 覆盖 Keystore AES-GCM 与当前真机/模拟器 |
| ABI | app 支持四 ABI；验收重点 `arm64-v8a` + `x86_64` | 使用 libsignal 官方 Android AAR，不自行编 Rust/JNI |
| libsignal artifacts | client JAR 约 148 MB；Android AAR 约 195 MB（未 strip） | 比较单 ABI APK/AAB delta，并排除 desktop/testing binaries |
| 维护 | 官方说明 packages 为 Signal 自用，上游 release 频繁 | 锁精确版本、保存 fixture、设升级/rollback 门禁 |

## 候选路径比较

| 路径 | 结论 | 原因 |
|---|---|---|
| 官方 Java/Android artifacts + Kotlin Expo Module | 选择进入 Gate 1 | 当前 PQXDH/session API、Android 四 ABI 和 Maven artifact 均由 Signal 官方发布；能让 protocol state 留在 native |
| 官方 `@signalapp/libsignal-client` Node package | 拒绝 Android | 官方只发布 Windows/macOS/Debian native libraries，不包含 Android React Native runtime |
| 已归档 `libsignal-protocol-java` / JavaScript | 拒绝 | 2022 年已归档，不能代表当前 PQXDH、Kyber、维护或安全边界 |
| 未经独立评审的第三方 React Native binding | 不作为默认方案 | 可减少桥接工作，但会新增维护者、版本和密钥跨 bridge 风险；只有 Gate 1 no-go 后才重新立项评估 |

## Store 约束

- `SignalProtocolStore` 同步组合 identity/pre-key/signed-pre-key/Kyber/session/sender-key stores。
- Store load 必须返回持久记录副本；协议只在显式 store 调用后提交变化。
- Kotlin callback 不能异步调用 JavaScript `WorkspaceSession`。
- Spike 使用 working-copy in-memory store；顶层操作完成后，把所有序列化 record 组成 versioned snapshot，经 Android Keystore AES-GCM 加密并用 `AtomicFile` checkpoint。
- 只有 checkpoint 成功才向 JavaScript 返回结果；失败丢弃 working copy，防止 ratchet/pre-key 已前进但磁盘未提交。
- 该 checkpoint 仅是 Spike harness。生产 identity/session/outbox 事务设计必须在后续任务重新评审。

## 明确不证明的内容

- 不证明 iOS 可用、双平台一致或 App Store 许可已经解决。
- 不证明生产配对、服务器 pre-key 发布、设备撤销或多设备协议完成。
- 不证明项目已经完成独立密码学审计。
- 不把 100 MB 文件正文通过 JS bridge 或 libsignal message 加密；本任务只验证附件内容密钥生成/封装和独立 native synthetic-file benchmark 边界。
