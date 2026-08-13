# M2Y 客户端骨架 — 技术设计

## 1. 架构与边界

- 单仓库、单 Expo App：仓库根即应用根，pnpm 管理，不启用 workspace。
- 依赖方向：`route → feature → application/domain → repository port`；data/native/sync 实现 port。
- domain 不依赖 React、React Native、Expo、SQLite、Zustand、features、data、native、sync 或 stores。
- `app/**` 只做路由和页面组装，不直接导入 data、native、sync 或 crypto 实现。
- UI component 不直接导入 `expo-sqlite` 或 `modules/m2y-crypto`。
- README 解释边界；dependency-cruiser 把关键边界变为可执行检查。两者必须同步修改。

## 2. 安全落盘方案

仓库根已有 PRD、技术选型、Trellis 和 AI 规则，模板不得覆盖这些内容。

1. `git init -b main`，确认初始 dirty 清单，但不自动提交。
2. 在根目录之外的子目录生成锁定模板：

   ```text
   pnpm dlx create-expo-app@latest .skeleton-tmp --template default@sdk-56 --no-install --no-agents-md
   ```

3. 比较 `.skeleton-tmp` 与仓库根的相对路径，生成冲突清单。
4. 若存在冲突，逐项合并或停止；禁止覆盖已有文件。没有冲突的模板文件才可移动到根目录。
5. 保留一份本次新增路径清单，出现问题时只回退本次新增/修改文件，不执行宽范围删除。
6. 删除空的 `.skeleton-tmp`，使用 pnpm 安装依赖并锁定 lockfile。

模板生成时使用 `--no-agents-md`，避免覆盖当前 Trellis 管理的 `AGENTS.md`、`CLAUDE.md` 与 `.claude/`。

## 3. 目标目录

```text
app/
├── _layout.tsx                 # 只组装 AppProviders 与 Router
├── (auth)/
│   ├── _layout.tsx
│   ├── create-identity.tsx
│   ├── pair.tsx
│   └── verify-safety-number.tsx
├── (main)/
│   ├── _layout.tsx             # Chat / Space / Settings
│   ├── chat/index.tsx
│   ├── space/index.tsx
│   └── settings/index.tsx
├── _dev/
│   └── flash-list.tsx          # 仅开发入口；production 不从正常 UI 暴露
└── +not-found.tsx

src/
├── bootstrap/                  # AppProviders / bootstrap / lifecycle；不得命名为 app
├── features/                   # identity / pairing / chat / save-to-space / space-home / shared-item / activity / search / settings / privacy
├── domain/                     # message / shared-item / operation / sync
├── data/                       # db / repositories / search / assets
├── sync/                       # outbox / inbox / transport / conflict / SyncEngine
├── native/                     # crypto / secure-storage / screen-protection 边界
├── design/                     # tokens / primitives / patterns / motion
├── stores/                     # 仅 UI/session 状态
├── observability/
├── testing/
│   └── benchmarks/             # 10k 确定性消息数据与基准组件
└── shared/                     # 极少量无业务归属的工具

modules/
└── m2y-crypto/README.md        # Spike D 前置与安全边界

server/
└── README.md                   # M2 前不创建 NestJS 空壳
```

## 4. AppProviders

`src/bootstrap/AppProviders.tsx` 负责稳定的根级 Provider 顺序。不要创建 `src/app/`；Expo Router 会将它优先识别为路由根并遮蔽仓库根 `app/`：

```text
GestureHandlerRootView
└── KeyboardProvider
    └── Router content
```

- `GestureHandlerRootView` 必须尽量靠近根部。
- `KeyboardProvider` 是 Keyboard Controller 的必要接线；是否关闭启动预加载根据首次 Android 运行结果调整。
- 骨架不创建 SQLite、Zustand 或 crypto 全局 Provider；这些能力在对应 Spike/业务 use case 中按边界接入。

## 5. 版本与包管理

- 模板固定 `default@sdk-56`，安装后用 `pnpm exec expo install --check` 与 Expo Doctor 核对兼容矩阵。
- `package.json`：
  - `packageManager: pnpm@10.33.0`；
  - Node engines 锁定 24 主版本；
  - 通过 `.nvmrc` 或等价版本文件记录 Node 24。
- 所有 Expo/React Native 原生依赖使用 `pnpm exec expo install` 安装，不手写猜测版本。
- Reanimated 4 与 `react-native-worklets` 同时安装。
- 本任务不安装 Zustand、Skia、Rive、Lottie 等尚未使用的依赖。SDK 56 默认模板已经包含 `@expo/ui` 时保留其兼容版本，但骨架不使用它搭建全局 UI 抽象。

## 6. 三环境配置

`app.config.ts` 读取 `APP_VARIANT`，默认 development，并生成：

| Variant | App 名称 | Android package | iOS bundle identifier | API |
|---|---|---|---|---|
| development | M2Y Dev | `com.m2y.app.dev` | `com.m2y.app.dev` | 开发占位地址 |
| preview | M2Y Preview | `com.m2y.app.preview` | `com.m2y.app.preview` | 预览占位地址 |
| production | M2Y | `com.m2y.app` | `com.m2y.app` | 生产占位地址 |

具体组织/域名可在正式上架前替换；当前要求是合法、稳定、三环境互异。`extra` 包含 `variant`、`apiBaseUrl`，不包含秘密。

`eas.json`：

- development：`developmentClient: true`、`distribution: internal`、`APP_VARIANT=development`。
- preview：`distribution: internal`、`APP_VARIANT=preview`。
- production：`APP_VARIANT=production`。

增加 `scripts/verify-app-config.mjs` 与 `pnpm config:check`：依次加载三套 public config，检查标识唯一、extra 正确、SQLCipher/FTS plugins 存在，以及 `expo-screen-capture` 不在 plugins。

## 7. 原生依赖与 plugins

必装依赖：

```text
expo-dev-client
react-native-reanimated
react-native-worklets
react-native-gesture-handler
react-native-keyboard-controller
@shopify/flash-list
expo-sqlite
expo-secure-store
expo-local-authentication
expo-screen-capture
```

`app.config.ts.plugins`：

```text
expo-router
expo-sqlite(enableFTS=true, useSQLCipher=true)
expo-secure-store(configureAndroidBackup=true, Face ID 文案)
expo-local-authentication(Face ID 文案)
```

`expo-screen-capture` 没有 SDK 56 config plugin，不写入 plugins。它在 `src/native/screen-protection/` 只建立模块边界/README，真实策略由后续隐私功能实现。

## 8. FlashList 基准页

- `src/testing/benchmarks/` 生成 10,000 条可重复的混合消息 fixture，避免随机数据导致结果不可比较。
- 至少包含文本、较长文本、系统事件三类 cell，并用 `getItemType` 分池。
- 使用稳定 `keyExtractor`、`maintainVisibleContentPosition`，cell 内不创建动态 key。
- 页面包含 TextInput，并运行于 `KeyboardProvider` 下，为 Spike B 提供列表与键盘共存入口。
- development 正常导航中可以通过明确的开发入口进入；production 正常导航不显示入口，路由本身不承载敏感数据。
- 本任务验证渲染与编译；release FPS、内存、图片尺寸变化、跳帧报告由 Spike B 完成。

## 9. 设计与 Reduce Motion

- tokens：`color.ts`、`spacing.ts`、`radius.ts`、`typography.ts`、`motion.ts`。
- motion token 包含 duration、spring、reduce-motion 映射；初值来自技术选型 §5.6，README 明确“需真机校准”。
- 测试环境可以把 motion scale 设为 0；骨架中的示例动画必须尊重系统 Reduce Motion。

## 10. 架构检查

使用 dependency-cruiser 和 TypeScript 配置解析 `app/**/*.ts(x)`、`src/**/*.ts(x)`：

- 禁止 domain 指向框架或外层实现。
- 禁止 route 绕过 feature/application 直接调用 data/native/sync。
- 禁止 component 直接导入 SQLite 或 crypto module。
- 检查 circular dependency。

命令固定为 `pnpm deps:check`，进入本地验收与 CI。README 是说明，自动检查才是门禁。

## 11. 测试与 CI

测试：jest-expo + React Native Testing Library。示例测试优先选择纯 token/Provider 边界，避免测试依赖易变的模板文案。

PR CI：

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android
pnpm exec expo prebuild --clean --no-install --platform android
```

migration test 在 Spike C 前作为明确 deferred 项，不用永远成功的空测试伪装已覆盖。

## 12. Development Build 验证

本机已有 Java 17 与 Android SDK，因此任务内执行：

```text
pnpm exec expo prebuild --clean --no-install --platform android
pnpm build:android:debug:arm64
```

Windows 使用 `.npmrc` 的 `node-linker=hoisted`，避免 pnpm 隔离布局叠加 CMake/Prefab 后触发 Ninja 长路径误判。构建脚本负责从仓库根指定 Android 工程目录并补齐 `NODE_ENV=development`。

成功标准：产生可定位的 arm64 debug APK，且构建包含 `expo-dev-client` 与已选原生模块。是否连接模拟器/真机启动取决于执行时设备状态；未启动则在 README 明确为待验证。

iOS 编译需要 macOS/Xcode 或 EAS，保留为后续验收，不得在 Windows 上宣称通过。

## 13. 回滚与提交

- 模板合并前记录已有文件与冲突清单；回滚只针对本任务新增/修改路径，不进行宽范围删除。
- `android/` 与 `ios/` 是 CNG 可再生产物，不依赖手工修改。
- 实施步骤设置 A–H **验证检查点**，不在每个检查点自动提交。
- 完成 full-scope `trellis-check` 后，按 Trellis Phase 3.4 汇总 commit 分组，一次向用户确认；确认后先在 main 提交“现有资料基线”，再创建 `chore/m2y-skeleton` 并提交骨架工作，最后通过 `task.py set-branch` 回写元数据。确认前不提交、不推送。

## 14. 主要权衡

| 决策 | 选择 | 未选择 | 原因 |
|---|---|---|---|
| 模板版本 | `default@sdk-56` | 未指定版本的 latest 默认模板 | 保持已批准的 RN 0.85 基线 |
| 原生验证 | Android debug 编译 | 仅 prebuild | 编译才能发现原生依赖和 Gradle 问题 |
| 架构边界 | README + dependency-cruiser | 只有空目录 README | 需要自动阻止违规导入 |
| UI 依赖 | 模板依赖保留、业务依赖按需增加 | 额外引入大型 UI Kit | 维持模板兼容并控制抽象成本 |
| 提交 | 末尾统一确认 | A–H 边做边提交 | 遵循 Trellis Phase 3.4 |
