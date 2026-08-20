# Android 安全与数据基础实施计划

执行模式：Codex inline。用户批准本规划摘要后才运行 `task.py start`。实施开始时加载 `trellis-before-dev`；代码完成后加载并执行 `trellis-check`，在 Android 原生验收前不宣称安全能力已验证。

## Ordered Checklist

- [x] A. 建立配置与纯应用契约
  - 用 `pnpm exec expo install expo-crypto expo-file-system` 安装 SDK 56 匹配版本。
  - 设置 Android `allowBackup: false`，同步 SecureStore plugin 配置、config verification 与 config tests。
  - 创建 secure-workspace/workspace contracts、穷举状态 reducer、typed error codes、clock/id/random ports。
  - 把 Message/SharedItem 的展示时间字段迁移为 epoch ms，并把格式化移到 presenter；fixture 使用固定时间。
  - 扩展 dependency-cruiser 规则，强制 route/feature/application/data/native 方向。
  - 检查点：纯层没有 Expo/React Native import，typecheck/deps:check 与 reducer tests 通过。

- [x] B. 实现密钥存储与启动编排
  - 实现 32-byte async secure random -> 64 lowercase hex 的 branded key factory；覆盖长度/格式测试。
  - 实现版本化 envelope 与 SecureStore adapter，分别处理 device/strong-biometric 选项和稳定错误映射。
  - 实现 envelope + DB-file boot decision matrix，以及串行 inspect/setup/unlock/reset/retry/background action。
  - 覆盖 provisioning 中断、key missing/invalidated、认证取消/锁定、重复点击、每一步删除失败。
  - 检查点：任何已有初始化痕迹都不会触发静默 key regeneration；测试输出不出现 key/native error。

- [x] C. 实现 SQLCipher schema、migration 与 session
  - 用 FileSystem `File.exists` 检测固定 DB 文件，用 Expo SQLite 新连接打开；File API 使用规范化的 `file://` URI。
  - 第一条操作设置 validated raw key，随后读 `sqlite_master`；验证 cipher version/status 能力并开启 foreign keys。
  - 建立 schema v1、索引、strict row decoder、user_version migration 与一次性 installation/demo seed。
  - 实现 close/delete 与所有失败路径的 handle cleanup；prepared statements 在 finally 中 finalize。
  - 检查点：重复 migration、wrong key、corrupt row、transaction rollback、delete sidecar 的 contract/integration tests 通过。

- [x] D. 实现持久 workspace repository
  - 将现有同步 command 收敛为纯 command planner + typed mutations。
  - 实现 SQLite repository：同一条已设置 SQLCipher key 的连接内执行 `BEGIN IMMEDIATE -> load -> decide -> apply -> reload -> COMMIT`，禁止使用会新建未解密连接的 transaction helper。
  - 由 source relation 投影 `savedItemIds`，保留 duplicate/unknown/blank 现有语义并增加 storage failures。
  - 创建 `WorkspaceProvider(session)`，只在 commit 后更新 state；commands 统一返回 Promise，并让 session 串行 command/close，防止重复提交与后台关闭竞态。
  - 检查点：Chat 与 Space 始终来自同一 committed snapshot，写失败没有乐观脏状态。

- [x] E. 接入 secure gate 与现有 UI
  - 创建无 I/O 的 `createAppRuntime`，按既定 provider 顺序接入 SecureWorkspaceProvider/Gate/WorkspaceProvider。
  - 实现 setup、locked、opening、recovery、fatal 页面；复用 ConfirmDialog 完成二次确认销毁。
  - setup 中提供 device 默认模式与仅在能力满足时出现的 strong-biometric 选项，使用诚实安全文案。
  - 更新 Chat、Save to Space、Space Detail 的 handlers 为 await async commands，增加 pending/错误反馈。
  - 删除“重启后清空”等过时文案；身份/配对/安全号码继续保持延期占位。
  - 检查点：非 ready 不挂载私密 routes；background relock、恢复重置、正常重启均无双开连接。

- [x] F. 自动化验证与 Android 原生验收
  - [x] 扩充 Jest setup 的 SecureStore/SQLite/FileSystem/crypto 可注入边界，不用 mock 成功冒充 SQLCipher 证据。
  - [x] 添加 secure state、adapter contract、repository、provider 与既有主流程的单元/组件测试。
  - [x] 添加仅开发环境可达的 Android storage acceptance harness，验证正确/错误 key、migration、integrity、删除清理，且只展示 redacted result codes。
  - [x] 运行全部质量门禁与 Android export/prebuild/x86_64 build。
  - [x] Android API 37.1 模拟器验收首次 setup、重启持久化、错误密钥拒绝、密钥缺失恢复与二次确认重置。
  - [x] 截取 setup、native harness、ready-after-restart、recovery、reset-confirm 五个关键状态。
  - [x] 在 realme RMX3888（Android 16/API 36，`arm64-v8a`）验收强生物识别成功/取消/background relock/再次解锁，以及 ARM64 原生 SQLCipher harness。

## Validation Commands

```text
pnpm format:check
pnpm typecheck
pnpm lint
pnpm deps:check
pnpm test --ci
pnpm config:check
pnpm exec expo-doctor
pnpm exec expo export --platform android
pnpm prebuild:android
pnpm build:android:debug -- -PreactNativeArchitectures=x86_64
```

原生验收另在 Android Development Build 中运行 dev-only storage harness。强生物识别结论来自物理设备，不以模拟器结果替代。

## Risky Files and Rollback Points

- `app.config.ts`、`scripts/verify-app-config.mjs`：影响 manifest/backup；改完立即跑 config-check、prebuild 并检查生成 manifest，不手改 CNG 输出。
- `src/bootstrap/AppProviders.tsx`、`app/_layout.tsx`：provider/gate 失误可能泄露私密导航或双开数据库；先用 injected fake runtime 做 provider tests。
- `src/application/secure-workspace/**`：所有 fail-open 风险的中心；要求穷举 reducer 与组合矩阵测试后再接 native adapter。
- `src/data/secure-store/**`：认证选项/稳定名称改变会让旧 key 不可读；v1 名称一旦进入验收不原地重命名。
- `src/data/sqlite/**`：raw-key 顺序、migration、close/delete 最危险；每个阶段先用临时 DB 验证，禁止明文 fallback。
- `src/domain/**`、`src/stores/**`：时间字段与 async command 会影响全部消费者；用 CodeGraph impact/context 与 full typecheck 控制迁移。
- `android/`、`ios/`：视为 Expo CNG 产物；只通过 config/prebuild 更新，不放业务逻辑。

## Before `task.py start`

- [x] 用户已审阅并明确批准本规划摘要进入实施。
- [x] `prd.md` 没有阻塞性 open question，恢复策略已由用户决定。
- [x] `design.md` 覆盖安全边界、接口、schema、状态矩阵、错误合同、测试与 rollback。
- [x] `implement.md` 与 PRD 范围一致，Android 优先且不包含 M2Y-ID/E2EE/同步。
- [x] Codex `dispatch_mode: inline`，实施阶段不要求 sub-agent JSONL context gate。
- [x] 执行开始前加载最新 `trellis-before-dev` 规范。
