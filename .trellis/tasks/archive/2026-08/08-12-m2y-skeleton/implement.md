# M2Y 客户端骨架 — 实施清单

执行方式：Codex inline。`.trellis/config.yaml` 已设置 `codex.dispatch_mode: inline`；Phase 2 先运行 `trellis-before-dev`，完成后运行 full-scope `trellis-check`。`implement.jsonl` 与 `check.jsonl` 在 inline 模式下保持为空。

前置条件：用户在看到本次修订后的最终规划摘要后，再明确批准进入实施。批准前不运行 `task.py start`，不修改产品代码。

## 有序实施清单

- [x] A. 建仓与保护现有资料
  - 执行 `git init -b main`。
  - 记录初始文件清单与 Git dirty 状态。
  - 创建适合 Expo/CNG、环境变量、签名材料和临时目录的 `.gitignore`。
  - 不创建 commit；提交留到 Trellis Phase 3.4。
  - 验证：PRD、技术选型、`AGENTS.md`、`CLAUDE.md`、`.trellis/` 均存在且内容未丢失。

- [x] B. 生成并无覆盖合并 Expo SDK 56 模板
  - 执行：

    ```text
    pnpm dlx create-expo-app@latest .skeleton-tmp --template default@sdk-56 --no-install --no-agents-md
    ```

  - 比较模板与根目录相对路径；生成冲突清单。
  - 仅移动不冲突的文件；发生冲突时逐项合并，不得覆盖现有文件。
  - 清理模板 demo，保留 Expo Router 与 TypeScript 必需配置。
  - 验证 `package.json` 的 Expo/RN/React 版本确属 SDK 56 兼容矩阵。

- [x] C. 锁定工具链与代码质量
  - `package.json.packageManager` 设为 `pnpm@10.33.0`，Node engines 锁定 24 主版本；增加 Node 版本文件。
  - `pnpm install` 生成 lockfile。
  - 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
  - 配置 Expo ESLint、Prettier、React Hooks rules、lint-staged 和 scripts。
  - 安装并配置 dependency-cruiser；实现 domain、route、component、cycle 边界规则。
  - 验证：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deps:check`。

- [x] D. 落地三环境和 Development Build 配置
  - 创建 `app.config.ts`，使用 `APP_VARIANT` 生成三套 name、`android.package`、`ios.bundleIdentifier`、API URL 和 extra。
  - 创建 `eas.json`：development/preview/production；development 设置 `developmentClient: true`。
  - 创建 `scripts/verify-app-config.mjs` 与 `pnpm config:check`，自动验证三环境互异和 plugin 白名单。
  - 验证：`pnpm config:check`、`pnpm exec expo-doctor`。

- [x] E. 安装原生依赖并正确接线
  - 通过 `pnpm exec expo install` 安装：expo-dev-client、Reanimated、Worklets、Gesture Handler、Keyboard Controller、FlashList、expo-sqlite、SecureStore、LocalAuthentication、ScreenCapture。
  - plugins 只配置 expo-router、expo-sqlite、expo-secure-store、expo-local-authentication；不得把 expo-screen-capture 写入 plugins。
  - expo-sqlite 开启 `enableFTS` 与 `useSQLCipher`；SecureStore/LocalAuthentication 配置一致的 Face ID 文案。
  - 创建 `AppProviders`，根部挂载 `GestureHandlerRootView` 与 `KeyboardProvider`。
  - Zustand、Skia、Rive、Lottie 暂不安装；SDK 56 模板自带的 `@expo/ui` 保留兼容版本，但骨架不建立全局 UI Kit。
  - 验证：config check、typecheck、Expo Doctor 全部通过。

- [x] F. 建立路由、目录和设计系统
  - 清理模板示例；建立 `(auth)`、`(main)`、`+not-found` 及 Chat/Space/Settings 占位页面。
  - 按技术选型 §16 建立全部 `src/` 分层和短 README。
  - 创建 `modules/m2y-crypto/README.md` 与 `server/README.md`，不创建虚假实现。
  - 创建 color/spacing/radius/typography/motion tokens；示例动画支持 Reduce Motion 与测试 scale 0。
  - 验证：typecheck、lint、deps:check，以及 `pnpm exec expo export --platform android`。

- [x] G. 建立 FlashList 基准页
  - 在 `src/testing/benchmarks/` 创建 10,000 条确定性混合消息 fixture。
  - 基准页使用 FlashList v2、`getItemType`、稳定 `keyExtractor`、`maintainVisibleContentPosition`，无动态 cell key。
  - 页面包含 TextInput 并运行在 KeyboardProvider 下。
  - 添加仅开发可见入口；production 正常导航不暴露入口。
  - 验证：组件测试/typecheck；Android Development Build 中可打开页面时记录 smoke 结果。最终性能数字留给 Spike B。

- [x] H. 测试与 CI
  - 配置 jest-expo 与 React Native Testing Library，增加稳定示例测试。
  - 创建 `.github/workflows/ci.yml`，包含 frozen install、format、typecheck、lint、deps、test、config、doctor、Android export、Android clean prebuild。
  - migration 测试用明确 deferred 注释说明 Spike C 启用，不添加永远成功的假测试。
  - 本地逐项执行 CI 等价命令。

- [x] I. Android Development Build 编译
  - 执行 `pnpm exec expo prebuild --clean --no-install --platform android`。
  - 执行 `pnpm build:android:debug:arm64`；脚本从仓库根正确指定 Android 工程目录并补齐 `NODE_ENV`。
  - 记录 debug APK 路径、构建结果与原生依赖问题。
  - 若有可用 Android 设备/模拟器，安装并进行启动 smoke；否则在 README 标为待验证。
  - iOS 构建明确标为 macOS/EAS 待验证，不宣称通过。

- [x] J. README、全量检查与提交准备
  - README 记录环境、命令、三环境、Development Build、FlashList 基准入口、M0 Spike 顺序和待验证项。
  - 运行 full-scope `trellis-check`，修复所有发现后重跑全量命令。
  - 复核没有生产密钥、签名材料、明文业务数据或无边界目录。
  - 按 Trellis Phase 3.4 汇总逻辑 commit 方案并只向用户确认一次。
  - 用户确认后：在 main 提交现有资料基线，创建 `chore/m2y-skeleton`，通过 `task.py set-branch` 回写元数据，再按确认的分组提交骨架工作；不推送。

## 全量验证命令

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
pnpm build:android:debug:arm64
```

三环境 public config 的具体调用封装在 `pnpm config:check`，避免人工检查文本漏项。

## 风险文件与回滚点

- `app.config.ts`：variant 或 plugin 错误会阻止原生生成；每次修改后立即运行 `pnpm config:check`。
- `src/bootstrap/AppProviders.tsx`：Provider 缺失会导致手势/键盘能力运行时失败；组件测试和 Android smoke 必须覆盖根挂载。
- dependency-cruiser 配置：规则过宽会阻塞合法依赖，过窄会留下绕过路径；用允许/禁止 fixture 校验关键规则。
- 模板合并：保留新增/修改路径清单；只回退本任务路径，禁止对仓库根执行宽范围清理。
- `android/`：视为 CNG 产物，不手改后依赖；验证结束后是否保留按项目 `.gitignore` 规则处理。
- Android 构建下载失败时记录具体依赖与重试结果；不得以 prebuild 成功替代 debug 编译成功。

## `task.py start` 前复查

- [x] 用户已审阅并明确批准这份最新方案。
- [x] 任务在批准后由 `task.py start` 进入 `in_progress`。
- [x] `.trellis/config.yaml` 为 `codex.dispatch_mode: inline`。
- [x] `prd.md`、`design.md`、`implement.md` 内容一致且无阻塞问题。
- [x] `implement.jsonl` 与 `check.jsonl` 为空，这是 inline 模式的预期状态。
- [x] pnpm 网络可用；Java 17、Android SDK 路径可访问。
