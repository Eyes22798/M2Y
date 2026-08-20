# M2Y

M2Y 是两个人的私密协作空间，聊天是入口。当前仓库是 M0 客户端工程骨架：它建立可编译、可测试、可做原生 Spike 的 React Native 基线，但不伪装 E2EE、同步、数据库或生产服务已经完成。

## 技术基线

- Expo SDK 56、React Native 0.85.3、React 19.2.3、TypeScript 6 strict
- Expo Router；根级 Gesture Handler、Keyboard Controller 与 Safe Area Provider
- Reanimated 4 + Worklets，统一 motion token，并尊重系统 Reduce Motion
- FlashList 2；开发环境包含 10,000 条确定性混合消息基准页
- SQLite 配置启用 FTS 与 SQLCipher；Secure Store、Local Authentication 和 Screen Capture 只建立正确原生边界
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

Windows 可以生成和编译 Android；iOS 原生编译仍需 macOS/Xcode 或 EAS Build。本任务不宣称 iOS 已通过编译。

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
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android
```

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
- `modules/m2y-crypto/`：未来审计原生加密模块边界
- `server/`：未来密文中继服务边界；M0 不创建空 NestJS 项目

## 10K 消息基准

开发环境打开“设置”，选择“打开 10,000 条消息基准页”。页面包含文本、长文本和系统事件三类可复现 cell、稳定 key、`getItemType`、`maintainVisibleContentPosition` 和键盘输入框。

当前任务只验证渲染/编译入口。Release FPS、内存、图片尺寸变化、跳帧与倒序加载策略由 Spike B 在真机上量化；production 正常导航不显示该入口。

## M0 后续 Spike 顺序

1. A：威胁模型、密钥生命周期与本地身份边界
2. B：真机聊天列表、键盘、图片与动画性能
3. C：SQLite/SQLCipher schema、迁移、FTS 与备份恢复
4. D：原生加密模块、协议互操作与审计策略
5. E：密文同步、outbox/inbox、冲突与服务端不可解密验证

数据库 migration 测试会在 Spike C 创建首个 schema 后成为 CI 必选项；当前不保留永远成功的空测试。

## 隐私与安全约束

- 正确表述是“服务端零明文、服务端不可解密”，不是“零服务端留存”
- 不在 JavaScript 中实现占位密码学
- 日志不得记录消息明文、密钥、安全号码、token 或解密文件内容
- `expo-screen-capture` 在 SDK 56 是运行时依赖，不放入 config plugin 列表
- 签名材料、生产密钥和本地环境文件均不提交

## 当前验收边界

- Android JavaScript bundle、类型、Lint、依赖边界、测试、三环境和 Expo Doctor 已自动验证
- Android arm64 Development Build 已在 Windows 完整编译，APK 为 98,531,990 bytes，SHA-256 为 `CF70C730F2D7045ADABE447CDB8CB3B334B1F329F397A4BE88CECD4C44395900`
- 当前没有连接的 Android 设备/模拟器，因此安装启动 smoke 尚待真机或模拟器
- iOS 编译尚待 macOS/EAS
