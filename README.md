# M2Y

M2Y 是两个人的私密协作空间，聊天是入口。当前仓库处于 M0/M1 早期：本地 SQLCipher 真加密库、Android 生产身份原生模块与最小 NestJS 服务端（仅 `GET /health`）已落地，但**密文同步、配对全链路与 iOS 均为零**，本文件不宣称它们已完成。逐项完成度见 `.trellis/tasks/08-20-m2y-product-progress-roadmap/research/2026-08-21-full-audit.md`。

## 技术基线

- Expo SDK 56、React Native 0.85.3、React 19.2.3、TypeScript 6 strict
- Expo Router；根级 Gesture Handler、Keyboard Controller 与 Safe Area Provider
- Reanimated 4 + Worklets，统一 motion token，并尊重系统 Reduce Motion
- FlashList 2；开发环境包含 10,000 条确定性混合消息基准页
- SQLite 已启用 SQLCipher raw-key 真加密与 schema v1 迁移；`enableFTS` 已开但尚未建任何虚拟表。Secure Store 承担密钥包装（含强生物识别模式）；Local Authentication 与 Screen Capture 目前只是依赖与原生边界，TS 侧零引用
- pnpm 10.33.0、Node 24、Jest、React Native Testing Library、ESLint、Prettier、dependency-cruiser

项目级 `.npmrc` 使用 pnpm hoisted 布局。这是 Windows/CMake 的必要约束：React Native 的 Prefab 目录很深，pnpm 默认隔离布局会让部分路径接近 250 字符，Android SDK 自带的 Ninja 可能把实际存在的文件误判为缺失。

## 开始开发

```powershell
pnpm install --frozen-lockfile
pnpm start
```

项目包含原生模块，请使用 Development Build，不以 Expo Go 作为正式运行环境：

libsignal `0.101.0` 发布为 Java 21 字节码，因此 Android 构建的 `JAVA_HOME` 必须指向 JDK 21。当前 React Native Gradle 插件仍需要 JDK 17 toolchain；若 Gradle 未自动发现它，通过 `M2Y_JAVA_17_HOME` 显式指定：

```powershell
$env:APP_VARIANT='development'
$env:JAVA_HOME='C:\path\to\jdk-21'
$env:M2Y_JAVA_17_HOME='C:\path\to\jdk-17'
pnpm prebuild:android
pnpm build:android:debug:arm64
pnpm start --dev-client
```

`build:android:debug:arm64` 面向常见 Android 真机；模拟器可改用 `pnpm build:android:debug -- -PreactNativeArchitectures=x86_64`，不指定架构则编译全部默认 ABI。脚本会补齐 `NODE_ENV=development`。

Android debug APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。`android/` 与 `ios/` 是 CNG 可再生成目录，不在其中维护手工业务改动。

若本地访问 Gradle 官方分发站超时，可只对当前构建指定可信镜像；脚本会修改 CNG 生成且被忽略的 wrapper 配置，不会把镜像固化进仓库：

```powershell
$env:GRADLE_DISTRIBUTION_URL='https://mirrors.cloud.tencent.com/gradle/gradle-9.3.1-bin.zip'
pnpm build:android:debug:arm64
```

Windows 可以生成和编译 Android。iOS 至今零实现（见「当前验收边界」），仓库不宣称 iOS 已通过编译。

## 三环境

| `APP_VARIANT` | App 名称 | Android / iOS identifier |
|---|---|---|
| `development`（默认） | M2Y Dev | `com.m2y.app.dev` |
| `preview` | M2Y Preview | `com.m2y.app.preview` |
| `production` | M2Y | `com.m2y.app` |

`app.config.ts` 只包含可公开配置。真实 API 域名、密钥、签名材料和 token 不应写入仓库。运行 `pnpm config:check` 会加载并验证三套 public config、原生标识和 plugin 白名单。

## 常用门禁

```powershell
pnpm format:check
pnpm exec expo customize tsconfig.json   # 必须在 typecheck 之前
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci
pnpm test:migrations --ci
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android

pnpm server:format:check
pnpm server:typecheck
pnpm server:lint
pnpm --filter @m2y/server test --ci
pnpm --filter @m2y/server test:migrations --ci
pnpm server:build
```

原生侧只有一项自动门禁，需要 JDK 21（`JAVA_HOME`）+ JDK 17（`M2Y_JAVA_17_HOME`）与已生成的 `android/`：

```powershell
pnpm exec expo prebuild --clean --no-install --platform android
pnpm test:native:crypto    # → :m2y-crypto:testDebugUnitTest，纯 JVM，不需要真机
```

`expo customize tsconfig.json` 会重新生成被 gitignore 的 `.expo/types/router.d.ts`。缺少该文件时 expo-router 的 `Href` 退化成宽松类型，typecheck 会静默跳过路由校验——所以它必须排在 `pnpm typecheck` 之前，而不是靠 `expo export` 事后补。

给 `pnpm --filter` 或 `pnpm <script>` 传 jest 参数时**不要加 `--` 分隔符**：`pnpm server:test -- --ci` 会让 jest 把 `--ci` 当成 testPathPattern，匹配 0 个用例并以 1 退出。

dependency-cruiser 自动保护以下边界：

- `src/domain` 不依赖 React、Expo 或外层实现
- `app/` 路由不直接访问 `data/native/sync`
- UI 组件不直接访问 SQLite 或 crypto module
- 禁止循环依赖

## 目录

- `app/`：路由组合，只指向 feature screen
- `src/bootstrap/`：根 Provider 与生命周期接线
- `src/features/`：用户用例和界面
- `src/domain/`：纯 TypeScript 领域契约
- `src/data/`、`src/sync/`、`src/native/`：外层实现边界
- `src/design/`：token、primitive 和 motion pattern
- `src/testing/benchmarks/`：10K FlashList 基准 fixture 与页面
- `modules/m2y-crypto/`：原生加密模块（Android 已有 libsignal 生产身份实现，iOS 未实现）
- `server/`：NestJS 密文中继服务；当前只有 `GET /health`、`RedactedLogger` 与身份/配对 schema，无 envelope/cursor/asset 表

## 10K 消息基准

开发环境打开“设置”，选择“打开 10,000 条消息基准页”。页面包含文本、长文本和系统事件三类可复现 cell、稳定 key、`getItemType`、`maintainVisibleContentPosition` 和键盘输入框。

当前任务只验证渲染/编译入口。Release FPS、内存、图片尺寸变化、跳帧与倒序加载策略由 Spike B 在真机上量化；production 正常导航不显示该入口。

## M0 Spike 顺序

编号与 `CLAUDE.md` 统一为四项（此前 README 使用的五项编号已废弃：原 A「威胁模型」属 M0 退出条件而非 Spike，原 E「密文同步」是下表 C 的后半边）。

1. A：动画与手势基准——真机 FPS、跳帧、手势冲突与 Reduce Motion
2. B：真机聊天列表、键盘、图片与动画性能
3. C：SQLite/SQLCipher schema、迁移、FTS、备份恢复 **+ 密文同步 outbox/inbox/cursor 与服务端不可解密验证**
4. D：原生加密模块、协议互操作与审计策略（iOS 与 Android 双平台）

C 含同步半边，因此「Spike C 已完成」不是有效表述：SQLCipher 侧已完成并有真机证据，同步侧尚未开始。

数据库 migration 测试已成为 CI 显式门禁（`pnpm test:migrations`、`pnpm server:test:migrations`）。

## 隐私与安全约束

- 正确表述是“服务端零明文、服务端不可解密”，不是“零服务端留存”
- 不在 JavaScript 中实现占位密码学
- 日志不得记录消息明文、密钥、安全号码、token 或解密文件内容
- `expo-screen-capture` 在 SDK 56 是运行时依赖，不放入 config plugin 列表
- 签名材料、生产密钥和本地环境文件均不提交

## 当前验收边界

- JS/TS 层已自动验证：格式、类型、Lint、依赖边界、单测（客户端 19 套件 / 75 用例，服务端 4 套件 / 10 用例）、migration 门禁、三环境 public config、Expo Doctor
- Android arm64 Development Build 已在 Windows 完整编译，APK 为 98,531,990 bytes，SHA-256 为 `CF70C730F2D7045ADABE447CDB8CB3B334B1F329F397A4BE88CECD4C44395900`
- 真机证据已存在：realme RMX3888（Android API 36、arm64）完成 SQLCipher/Keystore 强生物识别序列与 libsignal Spike 七步验收；Chat 键盘与发送在 API 37.1 x86_64 模拟器验收
- 仍未做：release 真机性能量化（FPS/内存/跳帧）、双安装端到端配对、E2E 框架（Detox/Maestro 未二选一）、独立安全审计
- `modules/m2y-crypto` 的 JVM 单测（3 个测试类 / 8 个 `@Test`，不需要真机）已进入 CI 的独立 `native-crypto` job，但该 job **尚未经过首轮 CI 验证**：本机没有 JDK 与 Android SDK，只在本地验证了 Gradle wrapper 的调用参数。原生编译（`:app:assembleDebug`）与 instrumentation 测试仍**没有进入 CI**，只在人工流程中执行
- iOS 为零覆盖且被代码硬性阻断：`ios/` 不存在、`modules/m2y-crypto` 无 iOS 实现、`createAppRuntime.ts` 写死 `platformSupported: Platform.OS === 'android'`。PRD 把 iOS 列为 P0，该缺口需要显式决策而不是顺延
