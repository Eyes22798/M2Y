# 搭建 M2Y 项目骨架（建仓 + 目录 + 基础设施）

## Goal

基于 PRD V1.1（`M2Y_PRD—1786520919670/M2Y_PRD_修订版.md`）与 React Native 技术选型（`M2Y_React_Native_技术选型.md`），将纯文档目录变为**可编译、可测试、边界可检查的 Expo SDK 56 / React Native 客户端骨架**，使 M0 四个 Spike（动画手势、万条消息列表与键盘、SQLCipher 与同步、E2EE 原生集成）能够直接在该骨架上开展。

用户价值：把技术选型 §21.1 从“依赖清单”落实为可观察的开发基线；避免模板版本漂移、原生能力只安装不接线、架构规则只写在 README 中而无法检查。

## Background

- 项目当前只有 PRD、技术选型和 Trellis 规划资料，没有 `package.json` 或应用源码，也不是 Git 仓库。
- 本机已探测到 Node v24.14.1、pnpm 10.33.0、Git 2.53.0、Java 17 与 Android SDK；因此本任务可以在 Windows 完成 Android Development Build 编译验证。
- 技术基线为 Expo SDK 56 / React Native 0.85 / React 19.2 / TypeScript strict / New Architecture / Hermes v1。
- 技术选型 §21.1 要求：Development Build、三环境配置、Expo Router、design/motion tokens、Reanimated/Gesture Handler/Keyboard Controller、FlashList 基准页、SQLCipher/FTS、SecureStore/LocalAuthentication/ScreenCapture 和 CI 门禁。
- 目标依赖方向是 `route → feature → application/domain → repository port`；domain 不得依赖 React、Expo、SQLite 或 Zustand，组件不得直接访问 SQLite 或 crypto。
- Codex 已在 `.trellis/config.yaml` 明确配置为 `inline`；实施阶段使用 `trellis-before-dev` 与 `trellis-check`，不使用 `implement.jsonl` / `check.jsonl` 注入上下文。
- 2026-08-13 的官方行为核对记录见 `research/2026-08-13-skeleton-corrections.md`。

## Requirements

### R1 安全建仓与版本锁定

- 使用 `git init -b main` 建仓，但不得在实施过程中擅自提交；最终提交遵循 Trellis Phase 3.4 的一次性确认流程：先在 main 创建现有资料基线提交，再创建 `chore/m2y-skeleton` 分支提交骨架工作。
- 使用 `pnpm dlx create-expo-app@latest .skeleton-tmp --template default@sdk-56 --no-install --no-agents-md` 在临时目录生成模板。
- 合并模板前必须生成已有路径冲突清单；任何冲突都不得静默覆盖，现有 PRD、技术选型、`AGENTS.md`、`CLAUDE.md` 与 `.trellis/` 必须原样保留。
- 使用 pnpm 安装并提交 `pnpm-lock.yaml`；`package.json.packageManager` 固定 `pnpm@10.33.0`，Node 主版本固定为 24，并通过 `engines` 与版本文件表达。

### R2 代码质量与可检查的架构边界

- TypeScript 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- 配置 Expo ESLint、Prettier、React Hooks rules 与 lint-staged；提供稳定的 `typecheck`、`lint`、`format:check`、`test` 脚本。
- 使用 dependency-cruiser（或具有同等自动化效果的静态规则）检查以下边界：
  - `src/domain/**` 不依赖 React、React Native、Expo、SQLite、Zustand、features、data、native、sync 或 stores。
  - `app/**` 不直接依赖 data、native、sync 或 crypto 实现。
  - UI component 不直接导入 `expo-sqlite` 或 `modules/m2y-crypto`。
  - 禁止新增无边界的顶层 `utils/` 或 `services/`。
- 架构检查通过 `pnpm deps:check` 执行并进入 CI。

### R3 三环境配置

- 使用 `app.config.ts` 和 `APP_VARIANT=development|preview|production` 生成三套配置。
- 三个环境必须拥有互不相同的 `ios.bundleIdentifier` 与 `android.package`；bundle/application 标识写入原生配置字段，不能只放在 `extra`。
- `extra` 只放 variant、公开 API URL 等非秘密配置；真实密钥、签名材料与生产凭据不得进入仓库或 JS bundle。
- 提供自动配置检查，验证三环境标识互异、variant/API URL 正确、必要 plugins 生效且无非法 plugin。
- 创建 `eas.json` 的 development、preview、production profiles；development 使用 `developmentClient: true` 与 internal distribution。

### R4 路由与应用 Provider

- 使用 Expo Router 建立 `(auth)`、`(main)`、`+not-found` 路由骨架；`(main)` 包含 Chat、Space、Settings 三个入口。
- 根 `AppProviders` 接入 `GestureHandlerRootView` 与 `KeyboardProvider`，并由根布局统一挂载。
- 路由只负责组装，不放业务逻辑；清理模板示例页，不保留与 M2Y 无关的 demo。

### R5 设计与动画基线

- 建立 `src/design/tokens/`：color、spacing、radius、typography、motion；motion 值以技术选型 §5.6 为初值并标注需真机校准。
- 建立 primitives、patterns、motion 目录边界；首版不引入 NativeWind、大型 UI Kit、Skia、Rive 或 Lottie。
- Reanimated 与 Gesture Handler 作为主交互栈，Reanimated 4 同时安装兼容的 `react-native-worklets`。
- 所有骨架动画尊重 Reduce Motion；测试环境允许关闭动画。

### R6 原生依赖与 config plugin

- 通过 `pnpm exec expo install` 安装 SDK 56 兼容版本：`expo-dev-client`、Reanimated、Worklets、Gesture Handler、Keyboard Controller、FlashList、expo-sqlite、SecureStore、LocalAuthentication、ScreenCapture。
- `app.config.ts.plugins` 包含：
  - `expo-router`；
  - `expo-sqlite`，配置 `enableFTS: true`、`useSQLCipher: true`；
  - `expo-secure-store`，配置 Android backup 与 Face ID 权限文案；
  - `expo-local-authentication`，配置一致的 Face ID 权限文案。
- `expo-screen-capture` 仅安装并提供边界封装占位，不加入 `plugins`，因为 SDK 56 没有其内置 config plugin。
- SDK 56 默认模板若已包含 `@expo/ui` 则保留兼容版本，但骨架不把它扩展成大型 UI Kit，也不为尚未存在的功能增加额外 UI 依赖。

### R7 目录结构与占位边界

- 按技术选型 §16 建立 `app/`、`src/{bootstrap,features,domain,data,sync,native,design,stores,observability,testing,shared}`。禁止创建 `src/app/`，因为 Expo Router 会优先把它识别为路由根并遮蔽仓库根 `app/`。
- 建立 `modules/m2y-crypto/README.md`，明确真实 E2EE 实现必须等待 Spike D 和安全评审。
- `server/` 只保留 README，说明 M2 前不创建 NestJS 空壳。
- 各主要目录用短 README 说明职责、允许依赖和禁止依赖；README 与静态依赖检查保持一致。

### R8 FlashList 基准页

- 提供仅开发使用的 FlashList 基准页，生成 10,000 条确定性混合消息数据。
- 基准页使用 FlashList v2、稳定 `keyExtractor`、`getItemType` 与 `maintainVisibleContentPosition`，cell 树不得使用动态 key。
- 页面包含消息输入框，用于后续验证列表、键盘和输入区协同；本任务只保证页面可运行，不承诺 Spike B 的最终 FPS/内存门槛。
- production 构建不应从正常 UI 暴露基准页入口。

### R9 测试与 CI

- 配置 jest-expo 与 React Native Testing Library，至少覆盖 design token、AppProviders 或最小路由页面中的一个稳定行为。
- PR CI 包含：format、typecheck、lint、dependency boundary、unit/component tests、Expo Doctor、三环境 config check、Android export/route smoke、Android prebuild clean。
- migration 测试在数据层尚未实现时以明确的 deferred 说明保留，Spike C 落地后升级为强制门禁。
- CI 使用锁定的 Node 与 pnpm 版本，安装必须遵循 lockfile。

### R10 Development Build 编译基线

- 在 Windows 本机完成 Android CNG 生成，并运行 Gradle `assembleDebug`，证明包含 SQLCipher、Reanimated、Keyboard Controller 等原生依赖的 Development Build 可以编译。
- 记录生成 APK 的路径和编译命令；无需在本任务内连接外部 EAS 账号。
- Android 真机/模拟器启动以及 iOS Development Build 启动作为用户/后续 macOS 或 EAS 验收，必须记录在 README，不得把未验证状态表述为已通过。

## Acceptance Criteria

> **回写说明（2026-08-21）**：本任务归档时 14 条 AC 全部未勾选，属于归档流程漏回写，不是验收失败。
> 以下勾选依据 2026-08-21 在 `HEAD = d82644f` 上的实跑与代码核查（见
> `.trellis/tasks/08-20-m2y-product-progress-roadmap/research/2026-08-21-full-audit.md`）。凡当时未做、
> 至今仍未做的事项一律不勾，并在条目内写明。

- [x] 根目录成为 Git 仓库；main 保留现有资料基线，骨架改动位于 `chore/m2y-skeleton`；原有文档、AI 规则与 `.trellis/` 均未被覆盖或丢失；无未处理的模板路径冲突。<br>*核查*：首提交 `1a7e551 docs: 建立 M2Y 产品资料与 Trellis 基线` 在骨架提交 `88153af` 之前，资料基线与 `.trellis/` 保留完整。`chore/m2y-skeleton` 分支已合并删除，分支名本身无法从历史复核，其余条件均成立。
- [x] `package.json` 锁定 Expo SDK 56 / RN 0.85 / React 19.2 兼容矩阵、pnpm 10.33.0 和 Node 24；`pnpm-lock.yaml` 存在。<br>*核查*：`expo ~56.0.20` / `react-native 0.85.3` / `react 19.2.3`、`packageManager: pnpm@10.33.0`、`engines.node >=24 <25`、lockfile 存在。
- [x] `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deps:check`、`pnpm test --ci` 全部通过。<br>*核查*：五项实跑全绿；`test --ci` = 19 套件 / 75 用例；`deps:check` = 95 modules / 148 dependencies 零违规。
- [x] 三个环境的 `android.package` 与 `ios.bundleIdentifier` 均互不相同；自动 config check 通过；`expo-screen-capture` 不出现在 plugin 列表。<br>*核查*：`pnpm config:check` 通过（development / preview / production）；`app.config.ts` plugin 列表无 `expo-screen-capture`。
- [x] `eas.json` 包含 development、preview、production，development profile 启用 Development Client。<br>*核查*：三个 profile 均存在，`build.development.developmentClient = true`。
- [x] 根布局实际挂载 `GestureHandlerRootView` 与 `KeyboardProvider`；依赖中同时存在 SDK 56 兼容的 Reanimated 和 Worklets。<br>*核查*：`src/bootstrap/AppProviders.tsx:15,16` 实际挂载；依赖含 `react-native-reanimated 4.3.1` 与 `react-native-worklets 0.8.3`。
- [x] `(auth)`、`(main)`、`+not-found` 路由存在，模板 demo 已清除，Android export/route smoke 通过。<br>*核查*：三组路由存在；`APP_VARIANT=development pnpm exec expo export --platform android` 实跑成功（Android bundle 4.4MB + 27 assets）。注意 `(auth)` 三个路由在运行时仍不可达（`app/index.tsx` 无条件跳 `/chat`），这属于后续配对任务范围，不影响本条。
- [x] `src/` 分层、目录 README、`modules/m2y-crypto/` 和 `server/` 占位符合 §16，自动依赖边界检查通过。<br>*核查*：12 个分层 README 均被 git 跟踪；`pnpm deps:check` 零违规。
- [x] FlashList 基准页能生成并渲染 10,000 条确定性混合消息，具备输入框且不在 production 正常导航中暴露。<br>*核查*：`src/testing/benchmarks/{FlashListBenchmarkScreen.tsx,messages.ts,messages.test.ts}`，dev-only 入口。
- [x] `pnpm exec expo-doctor` 无错误；Android `prebuild --clean` 成功。<br>*核查*：`expo-doctor` 实跑 21/21 通过。`prebuild --clean` 未在本轮重跑（破坏性，会重建 `android/`），依据是 CI 中该步骤存在且当时验收通过；`android/` 不在 git 跟踪。
- [ ] Android Development Build 的 Gradle debug 编译成功并产生 APK；README 明确标记 Android 运行与 iOS 构建的待验收状态。<br>*未关闭*：APK 侧成立（Windows 上编译出 98,531,990 bytes，SHA-256 `CF70C730F2D7045ADABE447CDB8CB3B334B1F329F397A4BE88CECD4C44395900`），但**本任务自身要求的 Android 安装启动 smoke 与 iOS 构建至今未做**。后续任务在 realme RMX3888 上取得的真机证据属于 Spike D 与安全数据基础任务，不回溯覆盖本条；iOS 侧至今零实现（`ios/` 不存在，`createAppRuntime.ts:26` 写死 `platformSupported: Platform.OS === 'android'`）。README「当前验收边界」已按实际状态改写。
- [ ] CI workflow 覆盖 R9 的全部自动门禁；migration gate 明确标注由 Spike C 启用。<br>*未关闭且已被取代*：归档时该「标注」以注释形式存在，本条按字面可算达成；但 2026-08-21 审计发现 CI 的 server 单测自 `38cf657` 起因 `pnpm server:test -- --ci` 的多余 `--` 必然失败，`server:build` 从未在 CI 执行——「CI 覆盖全部自动门禁」这一结论不再成立。修复后注释已被真实的 migration 门禁步骤（`pnpm test:migrations`、`pnpm --filter @m2y/server test:migrations`）替换，本条不再适用，由新的门禁清单接管。
- [x] 仓库 README 记录环境准备、开发命令、三环境、Development Build、基准页入口、M0 Spike 顺序和当前未验证事项。<br>*核查*：均在 README 中；M0 Spike 编号已于 2026-08-21 从五项统一到四项，与 `CLAUDE.md` 一致。
- [x] 完整 `trellis-check` 通过后，才按 Phase 3.4 向用户提交一次批量 commit 方案；用户确认前不创建工作提交。<br>*核查*：骨架落在 `88153af` / `a95b1fc` 两笔提交后归档，无提前的工作提交。

## Out of Scope

- M0 四个 Spike 的最终性能、安全或同步结论。
- Chat、Space Home、Shared Item、Activity、Agreement 等正式业务功能。
- SQLCipher schema/migration、outbox/inbox、FTS 索引或业务 Repository 的真实实现。
- libsignal 或其他 E2EE 原生实现；`modules/m2y-crypto` 仅为边界占位。
- NestJS 服务端实现。
- Skia、Rive、Lottie、Detox 或 Maestro 的安装与选型锁定。
- EAS 云构建、商店发布、OTA、签名和生产凭据接入。
- Windows 本机无法执行的 iOS 原生编译；该项保留为 macOS/EAS 后续验证。

## Key Decisions

| 决策 | 结论 | 理由 |
|---|---|---|
| 骨架范围 | 客户端基础设施 + Android 编译基线 | 支撑全部 M0 Spike，同时避免提前实现业务与服务端 |
| Expo 模板 | 显式 `default@sdk-56` | 避免 `latest` 默认 SDK 随发布时间漂移 |
| 模板合并 | 临时目录 + `--no-agents-md` + 冲突即停止 | 保护现有 PRD、Trellis 与 AI 规则 |
| 执行方式 | Codex inline | 与当前任务清单一致，Phase 2 通过技能加载上下文 |
| Development Build | 安装 expo-dev-client、配置 EAS profiles、Windows 编译 Android debug | prebuild 本身不足以证明原生依赖可用 |
| 架构门禁 | README + dependency-cruiser 自动检查 | 文档说明意图，自动检查阻止违规导入 |
| FlashList | 骨架包含 10k 开发基准页 | 满足 §21.1，并为 Spike B 提供可复用入口 |
| `@expo/ui` | 模板自带则保留，骨架不主动扩展 | 尊重 SDK 56 模板兼容矩阵，同时避免过早形成 UI Kit 依赖 |
| 提交策略 | 实施完成后统一提出 commit 计划；确认后先建 main 资料基线，再建工作分支 | 遵循 Trellis Phase 3.4，并为新仓库建立有效 base branch |

## Risks / Deferred

- SDK 56 属于锁定基线而非当前最新 SDK；升级必须作为独立任务，不在建仓时顺带升级。
- Android 原生编译可能受 Gradle/NDK 下载或本机网络影响；应记录具体失败并修复环境，不得用仅 prebuild 通过代替编译验收。
- FlashList 基准页只建立测试载体；FPS、内存、图片尺寸变化和跳帧结论仍属于 Spike B。
- 静态依赖规则需要与实际 path alias/目录布局同步；若 dependency-cruiser 无法正确解析 Expo/TS 配置，可换成等价 ESLint 规则，但不得取消自动边界门禁。
- 真机 Android 和 iOS Development Build 未在本任务自动化环境中运行时，必须保留“待验证”标记。

## Planning Status

- 阻塞产品决策：无。
- `prd.md`、`design.md`、`implement.md` 已根据 2026-08-13 审查结论修订。
- 任务保持 `planning`；用户批准本次最终修订方案后，才能运行 `task.py start`。
