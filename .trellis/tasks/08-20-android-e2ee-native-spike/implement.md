# Android E2EE 原生集成实施计划

执行模式：Codex inline。用户已批准，`task.py start` 已运行，`trellis-before-dev` 规范已加载。完成代码后运行 `trellis-check`。

## Ordered Checklist

- [x] A. 建立 Gate 1：依赖、许可证与最小 native load
  - 记录当前 arm64/x86_64 APK 基线、Gradle/Kotlin/NDK/ABI 与第三方 notices。
  - 将 `modules/m2y-crypto/` 建成 Android local Expo Module，精确锁定 libsignal 0.101.0。
  - 用 config plugin 持久注入 app packaging exclusions，验证 clean prebuild 可重现。
  - 只实现 `getSpikeInfo`，构建并启动 x86_64 emulator 与 arm64 physical development build。
  - Stop gate：Kotlin 2.1.20 无法消费 libsignal 依赖、ABI/JNI load 失败或必须升级 Expo/RN 时，停止并回到规划，不继续 store/protocol 代码。

- [x] B. 建立 typed/native boundary 与 in-memory PQXDH round trip
  - 定义 redacted result/error union、严格 TypeScript decoder 和 native exception mapping。
  - Kotlin 内部建立 Alice/Bob `SignalProtocolStore` working copies、PQXDH bundle、首条 pre-key message 与后续 ratcheted reply。
  - 验证 numeric fingerprint equality；号码、keys、plaintext、records 不跨 bridge。
  - Kotlin tests 覆盖成功和 corrupted/duplicate/untrusted identity 基础语义。

- [x] C. 实现 crash-safe encrypted checkpoint
  - 实现 versioned strict snapshot 与全部 libsignal record serialize/reconstruct。
  - 实现 Android Keystore AES-256-GCM envelope、系统 IV、AAD、`AtomicFile` 与 module Mutex。
  - 每个 top-level action 在 working copy 执行，只有 checkpoint 成功才发布结果；加入 write-fault rollback test。
  - 覆盖 alias missing、unknown version、bad tag、truncated file、cleanup partial failure。

- [x] D. 完成 restart、negative、fingerprint-change 与 performance scenarios
  - 将 fresh/resume 分为两个独立 native commands，支持真实 force-stop/restart 验收。
  - 覆盖允许窗口内乱序、重复拒绝、损坏密文拒绝、identity replacement 拒绝和旧 committed state 恢复。
  - 运行 1,000 条双向消息基准、attachment key envelope 与 synthetic 100 MB native streaming/temp cleanup。
  - 记录 timing/memory/package delta，只输出 aggregate metrics。

- [x] E. 接入 dev-only acceptance UI
  - 添加 `src/native/crypto` adapter、`src/testing/e2ee` screen 与 `app/_dev/e2ee.tsx`。
  - Settings 仅 development 显示入口；preview/production route 或入口不可达。
  - UI 只显示稳定 PASS/FAIL code、版本/ABI 和 aggregate metrics；不显示原生异常或安全号码。

- [x] F. 完整验证与 go/no-go 报告
  - 运行 format/type/lint/dependency/Jest/config/Doctor/export/clean prebuild。
  - 运行 module JVM tests、Android instrumented tests、x86_64/arm64 debug builds。
  - 在 API 37.1 emulator 和 realme RMX3888 physical device 完成 fresh → force-stop → resume → negative → performance → cleanup。
  - 检查 APK/AAB native entries、desktop/testing resource exclusions、包体变化和敏感日志。
  - 输出 Android go/no-go、已知风险、AGPL/source/notices 清单以及 iOS/production storage/配对/同步后续任务。

  完成状态：自动化门禁、API 37.1 x86_64 模拟器完整流程、ARM64-only 构建、真机 Gate 1，以及最新 APK 在 realme RMX3888 上的 fresh → force-stop → resume → negative → performance → cleanup 全流程均已通过。

## Validation Commands

```text
pnpm format:check
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci --runInBand
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android
pnpm prebuild:android
android\\gradlew.bat :m2y-crypto:testDebugUnitTest
pnpm build:android:debug -- -PreactNativeArchitectures=x86_64
pnpm build:android:debug:arm64
```

Instrumentation、force-stop/resume、logcat redaction、APK/AAB 内容和 package delta 使用 Android SDK/ADB 单独记录到 task evidence。

## Risky Files and Rollback Points

- `modules/m2y-crypto/android/build.gradle`：Maven/Kotlin/ABI 风险最高；Gate 1 单独提交/检查，失败可整体移除 module。
- config plugin 与 `app.config.ts`：必须通过 clean prebuild 验证，禁止依赖手改 `android/`。
- Kotlin store/checkpoint：任何 commit-order 或 alias-loss fail-open 都是 no-go；不得以 UI workaround 继续。
- `src/native/crypto/**`：只允许 typed adapter，不把 protocol records/keys/base64 ciphertext 变成普通 JS state。
- dev harness：必须 development-only、使用隔离测试身份并可清理；禁止读取真实 Chat/Space 内容。

## Before `task.py start`

- [x] 用户审阅并明确批准本规划摘要进入实施。
- [x] 许可证方向已决定：接受 AGPLv3 开源义务。
- [x] Android-only 范围、libsignal 版本、native module、protocol scenario 与 checkpoint 设计已收敛。
- [x] 生产 M2Y-ID/配对/服务端/同步/iOS 明确不在当前任务。
- [x] Gate 1 允许得出 no-go，不通过升级主技术基线掩盖兼容失败。
