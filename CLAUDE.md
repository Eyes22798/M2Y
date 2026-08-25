# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目状态

**M2Y（My Two People）产品处于 M0/M1 早期阶段**：仓库已有 Expo SDK 56 客户端骨架、SQLCipher 真加密本地库、Android 生产身份原生模块，以及只提供 `GET /health` 的最小 NestJS 服务端。当前真实形态是 **Android-only、纯本地、零网络**：唯一端到端可用的用户闭环是 `Chat → 保存到 Space → Space → Shared Item 详情`。密文同步、配对全链路与 E2E 测试工具尚未开始；iOS 零实现（`ios/` 不存在，`createAppRuntime.ts` 写死 `platformSupported: Platform.OS === 'android'`）。逐项完成度见 `.trellis/tasks/08-20-m2y-product-progress-roadmap/research/2026-08-21-full-audit.md`。当前有两份权威文档：

| 文档 | 路径 | 作用 |
|---|---|---|
| 产品需求文档（PRD）V1.1 | `M2Y_PRD—1786520919670/M2Y_PRD_修订版.md` | 产品是什么、做什么（产品评审稿） |
| React Native 技术选型 | `M2Y_React_Native_技术选型.md` | 怎么实现、选什么技术（建议立项基线） |

技术选型文档明确：E2EE 原生集成与 E2E 测试工具**必须先完成技术验证（M0 四个 Spike）**，之后才能固化目录与基础设施。四个 Spike 中 A 未开始、B/C/D 各为部分完成，没有一项在「双平台 + 完整量化证据」意义上关闭。

JS/TS 层门禁已可运行且实测全绿（合计 23 套件 / 85 用例）：客户端 `pnpm format:check` / `typecheck` / `lint` / `deps:check` / `test --ci` / `test:migrations` / `config:check` / `pnpm exec expo-doctor`，服务端同名 `server:*`。`pnpm typecheck` 之前必须先跑 `pnpm exec expo customize tsconfig.json`——expo-router 的 typed routes 写在被 gitignore 的 `.expo/types/` 里，缺失时 `Href` 会退化成宽松类型而静默跳过校验。原生侧只有 `modules/m2y-crypto` 的 JVM 单测进了 CI（`native-crypto` job → `pnpm test:native:crypto`，首轮 CI 结果尚未回来）；**原生编译（`:app:assembleDebug`）、instrumentation 测试与 E2E 仍然没有任何门禁**（技术选型 §19.2 唯一列为「极高」的风险，只被部分缓解）。

## 产品一句话与核心闭环

M2Y 是"只属于两个人的私密协作空间"：聊天是入口，Space 是长期共享上下文。核心闭环：

```
Chat → Save to Space → 协作（执行/编辑/等待/确认）→ 状态回到 Chat
```

- 全局只有一个双人关系（Pair），没有聊天列表、群聊与社交功能。
- **Shared Item** 是 Space 的统一对象：`pin`（收藏）/ `task`（待办）/ `note`（笔记）/ `file`（文件）/ `agreement`（约定）；类型只是筛选，不是五套独立导航。
- Task 状态机：`open → doing → waiting → done`；进入 `waiting` 必须指明 `waitingFor`（我/对方/双方）。
- Agreement 是"双方确认同一内容版本"：`draft → pending_confirmation → confirmed`（或 `changes_requested`）；任何正文修改生成新版本并重新等待双方确认，确认绑定 `agreementId + version`。
- File 不是独立网盘，而是聊天文件自动建立的索引视图；Chat 消息与 Space File Item 引用同一个 `assetId`，不重复上传。
- 术语易混点：**收藏（Pin Item，一种类型）≠ 置顶（isPinned，排序属性）**；"Decision" 已更名为 "Agreement（约定）"；"文件仓" 已改为文件自动索引。
- 焚毁模式（阅后即焚）消息禁止保存到 Space、禁止进入搜索索引、销毁后须清理本地数据库/缓存/FTS。

## 技术基线（技术选型文档 §0/§22）

| 层 | 选择 |
|---|---|
| 客户端 | Expo SDK 56 + RN 0.85 + React 19.2 + TypeScript（strict）；Development Build + CNG；Hermes New Architecture |
| 路由 | Expo Router + Native Stack |
| 动画/手势 | Reanimated + Gesture Handler；按需 Skia；Rive 或 Lottie 二选一 |
| 列表/键盘 | FlashList v2；react-native-keyboard-controller |
| 状态 | 三类分离：业务数据 → SQLite；UI 状态 → React Context + `useSyncExternalStore`；动画 → SharedValue。（技术选型文档写的是 Zustand，实现时改为 Context + `useSyncExternalStore`：更少依赖，且能保证只在事务提交后 setState。仓库无 `zustand` 依赖，不要按文档补装） |
| 数据库 | Expo SQLite + SQLCipher + FTS5；显式 SQL + Repository（首版不用 ORM） |
| 同步 | 自有 Outbox/Inbox + cursor Sync Engine（不用 TanStack Query 当同步引擎） |
| 网络 | fetch + 原生 WebSocket（仅 wake-up）+ NetInfo |
| 服务端 | 目标：NestJS（Fastify）+ PostgreSQL + Redis + S3 兼容对象存储；只处理密文 envelope、设备、cursor、队列与密文文件。**当前实现**：NestJS + Express 适配器 + `better-sqlite3`，无 Redis、无对象存储、无 WebSocket（宿主环境无 Docker/PostgreSQL 的临时取舍，密文同步子任务开工前必须重新评估） |
| 测试/CI | Jest + RNTL + SQLite 集成测试；E2E 在 Detox/Maestro Spike 后二选一；CI 门禁：format / typecheck / lint / 依赖边界 / 单测 / migration 测试 / expo doctor / export / prebuild clean，外加独立 job 跑 `:m2y-crypto` 的 JVM 单测 |
| 发布 | EAS Build/Submit；OTA 仅 JS 资源；生产 OTA 必须端到端签名 |

显式拒绝项：Expo Go（无法验证 SQLCipher/E2EE/推送）、NativeWind、大型跨平台 UI Kit、首版 ORM（Drizzle）、Socket.IO、WebView 富文本编辑器、JS 自研密码学。

## 不可妥协的架构约束

1. **客户端 SQLite 是业务数据的唯一真相**，不是内存 store，也不是网络缓存。
2. **先写本地事务，再异步同步**：业务修改与 outbox 操作必须在同一事务提交。
3. **动画状态与业务状态分离**：Reanimated SharedValue 不存业务实体。
4. **E2EE 不在 JS 自研**：密钥生成、会话、加解密必须走经过评审的原生实现/绑定（M0 必须完成 libsignal Spike）。
5. **从第一天使用 Development Build**；`ios/`、`android/` 视为可再生构建产物，原生修改必须进 config plugin / Expo Module，不能手改后依赖其存在。
6. **依赖方向**：route → feature → application/domain → repository port。以下 5 条由 `pnpm deps:check`（`.dependency-cruiser.cjs`）实际拦截，改动前先读该文件而不是凭本节记忆：`no-circular`、`domain-stays-framework-free`、`routes-use-feature-boundaries`、`application-stays-framework-free`、`outer-adapters-do-not-depend-on-ui`、`ui-does-not-own-storage-or-crypto`。要点：`src/domain`、`src/application` 不得 import react / react-native / expo / @shopify 或任何外层目录；`app/**` 不得直连 `src/{data,native,sync}`；design 与 feature 的 components/screens 不得 import `expo-sqlite`、`src/native/crypto`、`modules/m2y-crypto`。
7. 版本口径以 Expo SDK 56 稳定兼容矩阵为准（用 `npx expo install` 安装原生依赖）；建仓时用 `create-expo-app` 生成当日稳定模板并提交 pnpm lockfile。

## 安全与隐私红线（跨两份文档一致）

- 服务端**零明文**：只存密文 envelope 与密文资产，不持有内容解密密钥；对外口径是"服务端零明文/产品方不可解密"，禁止使用"完全不存数据""绝对零元数据"等表述。
- 日志与崩溃报告不得含消息、标题、文件名、搜索词明文；建立 redaction 层。
- 不承诺"绝对防截屏""远程必然擦除"等不可验证能力。
- 推送默认无明文（"M2Y 有一项更新"）；本地搜索索引解密后建在本机，服务端不接收查询词。
- 数据库密钥随机生成，不进 `.env`、不进 JS bundle；SecureStore 只保存小型包装密钥材料。

## 规划中的结构

技术选型文档 §16 定义目标目录：`app/`（Expo Router 路由）、`src/{app,features,domain,data,sync,native,design,stores,observability,testing,shared}`、`modules/m2y-crypto/`（原生加密模块）、`server/`（NestJS）。§21.1 建仓清单是开始实现时的第一步。

里程碑：M0 技术验证 → M1 本地原型 → M2 密文同步 Alpha → M3 封闭 Beta。M0 是四个 Spike，编号以本文件为准（`README.md` 曾用五项编号，已统一）：

| Spike | 范围 | 状态（2026-08-21 实测） |
|---|---|---|
| A | 动画与手势基准（真机 FPS、跳帧、手势冲突、Reduce Motion） | 未开始 |
| B | 万条消息列表 + 键盘 | 部分：10K FlashList 基准页与键盘验收已有，release 真机量化未做 |
| C | SQLCipher + 同步 | 部分：SQLCipher 侧完成且有真机证据，**同步侧（outbox/inbox/cursor/FTS）完全未开始** |
| D | E2EE 原生集成 | 部分：Android libsignal 集成有真机证据，iOS 零实现，外部安全评审未做 |

「Spike C 已完成」是不成立的表述——C 含同步半边。引用完成度时须写明是 SQLCipher 侧还是同步侧。

## 文档约定

- 项目文档为中文（技术术语保留英文），新增文档保持同样风格。
- PRD 附录 B 的逻辑数据模型（TypeScript 接口）是 Shared Item / Task / Agreement / Activity 等对象的事实定义；附录 C 是服务端接口草案——服务端不提供 `/todo`、`/note` 等明文业务端点。
- 北极星指标 WMSP（每周双向协作 Pair 数）定义见 PRD §9；指标事件不得包含标题、正文、文件名等明文。
