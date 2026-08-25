# M2Y 全量完成度审计（2026-08-21）

> 本文是一次跨「权威文档 / Trellis 任务树 / 代码现实 / 门禁实跑」四方交叉核验的结果，
> 用途是替换 `current-state-baseline.md`（审计时 HEAD 已落后 4 个提交）作为排期决策输入。

| 项 | 值 |
|---|---|
| 基线 HEAD | `d82644f` feat(crypto): establish Android production identity foundation |
| 审计日期 | 2026-08-21 |
| 工作区状态 | 干净（`git status` 为空）；本轮只做只读核查 + 一次 `pnpm install --frozen-lockfile` |
| 环境 | node v24.8.0 / pnpm 10.33.0 / Expo `~56.0.20` / RN `0.85.3` / React `19.2.3` |
| 标注约定 | 「实测」= 本轮由只读命令现场验证；「未验证」= 本轮无任何证据支撑，不得与实测结果合并表述 |

---

## 0. 结论先行

目标是一个 **iOS/Android 双平台、服务端零明文的双人私密协作空间**（Chat 做入口，Space 做长期
共享上下文）。**当前实际形态是 Android-only、纯本地、零网络的 M0 骨架**：唯一端到端可用的用户
闭环是 SQLCipher 真加密库之上的 `Chat → 保存到 Space → Space → Shared Item 详情` CRUD。其余
P0 功能域（配对、安全号码、密文同步、富消息、文件、Activity、搜索、焚毁、设置子页）在用户可
观察层面为零。

四个 M0 Spike 中 A 未启动、B/C/D 各为部分完成，**没有一项在「跨平台 + 完整量化证据」意义上
关闭**，而生产功能代码已经在写——技术选型 §21.2「写正式功能前」8 项门禁至少 5 项未关闭。

最关键的三个缺口，按影响排序：

1. **CI 自 `38cf657` 起在 server 单测这一步必然失败。** `.github/workflows/ci.yml:36` 的
   `pnpm server:test -- --ci`，多余的 `--` 使 jest 把 `--ci` 当 testPathPattern，匹配 0 用例
   退出 1。因此第 37 行 `pnpm server:build` **从未在 CI 执行过**。多个 Gate 验收记录里反复引用
   的「全量自动门禁通过」这一结论不成立。
2. **配对与安全号码全链路为零，但表已建好。** native 侧 4 张、server 侧 7 张配对表只有
   `CREATE TABLE` DDL、零访问代码；6 个 native 配对函数全仓零命中；安全号码（`Fingerprint`）
   只存在于已归档的 Spike harness。极易被误读成「配对已实现」。
3. **密文同步权重 20 分、当前 0 分**，是最大单点缺口，而它的子任务连 `design.md` /
   `implement.md` 都还没有，按 Trellis 门禁不可 `start`。

此外：父任务 33% 加权基线所依据的仓库状态**落后 4 个提交**（含两笔功能提交），`CLAUDE.md` 与
`README.md` 的项目状态描述均已过时——排期决策的唯一文档输入已与代码脱钩。

---

## 1. 产品目标

**一句话价值**（PRD §1.2）：「M2Y：只有你和另一个人的聊天与共享空间。消息会过去，重要的事留在
你们之间。」

**核心闭环**（§2.2）：

```
聊天产生重要信息 → 统一「保存到 Space」→ 成为 Pin/Task/Note/Agreement（聊天文件自动成为 File）
→ 双方执行/编辑/等待/确认 → 关键状态以卡片或系统事件回到 Chat → 继续讨论并再次关联 Item
```

**范围边界**

| 维度 | 口径 | 依据 |
|---|---|---|
| 关系模型 | 全局只有一个 Pair，无聊天列表、无社交图谱；换对象须先解除 | §1.1 / §3.1.2 |
| 对象模型 | Shared Item 五类统一对象（pin/task/note/file/agreement），**类型只作筛选，不是五套一级导航** | §4.1 / §1.8-3 |
| 一级导航 | 仅 `聊天 \| Space \| 设置` 三项；核心动作 3 次点击内可达 | §5.1 / §5.3 |
| 平台 | iOS **P0**、Android **P0**；macOS/Windows P1；Web P2 | §8.6 |
| 反目标（不做） | 群聊/好友列表/动态/推荐流；情侣化包装；多人项目管理与看板；文档套件与实时协同光标；独立网盘与容量套餐；完整月历与外部日历同步；法定电子签名与可信时间戳；云端读取内容的 AI | §1.7 八条 |
| 对外口径红线 | 统一「服务端零明文 / 产品方不可解密」；**禁止**「完全不存数据」「绝对零元数据」「绝对防截屏」「远程必然擦除」 | §3.15.1 / §8.2 / §1.8-7 |

**北极星指标**：WMSP = 每周双向协作 Pair 数（滚动 7 天内**双方都对同一个 Shared Item** 完成至少
一次有效协作动作的 Pair 数）。仅打开 App、仅浏览、同一方反复创建、Activity 自动生成均不计入
（§9.1）。配套北极星率 = WMSP / 每周活跃 Pair 数（§9.2）。目标值须在封闭 Beta 收集 4 周基线后
设定，当前不得写入任何百分比（§9.3）。

---

## 2. 里程碑真实状态

### 2.1 M0 四个 Spike

| Spike | 状态 | 证据出处 |
|---|---|---|
| A 动画与手势基准 | **未开始** | 五个归档任务无一以动画/手势性能为目标；无 FPS/跳帧/手势冲突/Reduce Motion 真机报告；`src/design/tokens/motion.ts` 初值仍标「需真机校准」；`archive/2026-08/08-12-m2y-skeleton/prd.md:117` Out of Scope 第一条即排除 Spike 性能结论；`src/design/motion/MotionReveal` 无外部引用 |
| B 万条消息列表 + 键盘 | **部分** | 载体已有：`src/testing/benchmarks/` 10,000 条确定性混合消息 FlashList v2 页（`getItemType`、稳定 `keyExtractor`、`maintainVisibleContentPosition`、含输入框、dev-only 入口）；Figma MVP 在 API 37.1 x86_64 模拟器完成 Chat 键盘/发送验收并修复 IME 遮挡。量化缺失：`README.md:95` 自陈「Release FPS、内存、图片尺寸变化、跳帧与倒序加载策略由 Spike B 在真机上量化」；cell recycling 无自动化回归 |
| C SQLCipher + Sync | **部分** | SQLCipher 侧完成且有物理设备证据（见 §3.1）。**同步侧完全未开始**：`src/sync/` 只有 README（原文 `No production sync is implemented in the skeleton.`）；`outbox`/`inbox`/`cursor` 在 `app/`+`src/` 命中 0；FTS 未建表（`app.config.ts` 已开 `enableFTS: true`，但实测 `fts\|FTS` 在代码中零命中） |
| D E2EE 原生集成 | **部分** | Android 分支是全仓证据最强的一段：`archive/2026-08/08-20-android-e2ee-native-spike/evidence/gate-1.md`（双 ABI PASS + 官方 artifact SHA-256 校验）、`evidence/full-acceptance.md`（realme RMX3888 / API 36 / arm64-only 七步全 PASS，含强制停止后 checkpoint 独立重新发现）、`go-no-go.md`。但 Spike D 交付要求「**双平台** libsignal 集成报告」「双平台行为一致且有自动测试」，iOS 侧零实现零证据；`prd.md:80` 自称 Android-only go/no-go；§11.2 第 7 项外部安全评审未完成 |

**M0 整体：部分完成。** §20 另三条退出条件中，「威胁模型、服务端数据清单与日志红线」只有服务端
`RedactedLogger` 落地、**客户端 redaction 层为空**；「最低 iOS/Android 版本与目标设备矩阵」未见
冻结记录（**未验证**是否存在于任务文档之外）；「冻结 Expo SDK 与核心原生依赖」已通过精确 pin +
patch + Doctor 门禁基本达成。

父任务对 M0 的 55%–60% 自估偏乐观，主因是把 SQLCipher（README 编号 C）与密文同步（README 编号
E）拆开计分，而 `CLAUDE.md` 用的是四项编号——**同一句「Spike C 已完成」在两套编号下含义不同**。

### 2.2 产品里程碑

| 里程碑 | 状态 | 证据出处 |
|---|---|---|
| M1 本地原型 | **部分** | 已达成：本地 SQLite 真加密、Chat 纯文本、Space Home 简化版、Save to Space 3 类。未达成：五类 Item 只有 3 类（实测 `schema-v1.ts:20` `kind CHECK IN ('note','task','agreement')`，无 `pin`/`file`）；Space Home 缺「需要你/接下来/置顶」三区域（`SpaceHomeScreen.tsx:84` 只有「最近更新」/「筛选结果」）；`waitingFor`/`'doing'`/`pending_confirmation` 实测 grep 命中均为 0；Activity 零实现；配对即使假数据也为零（三个 `(auth)` 路由不可达，`app/index.tsx` 仍无条件 `<Redirect href="/chat" />`） |
| M2 密文同步 Alpha | **未开始** | 服务端只有 `GET /health`（`server/src/health/health.controller.ts`），8 个 identity/pair 端点全缺，无 envelope/cursor/asset 表；客户端零网络（实测 `apiBaseUrl` 三个 `.invalid` 占位从未被读取、`NetInfo` 命中 0）；无推送（expo-notifications 未安装）；屏幕保护与通知隐私零实现。父任务权重表「密文同步、服务端与离线冲突 20/0」与此一致 |
| M3 封闭 Beta | **未开始** | 无 E2E 框架（实测无 `.maestro/`、`e2e/`、`.detoxrc*`）；无 release 真机性能基准；换机/设备撤销/解绑/账户删除零实现；OTA 签名与 rollout 未见配置；独立安全审计未做（`go-no-go.md` 对「E2EE 已完成」判 NO-GO）。技术选型 §21.3 发布前 8 项门禁全部未开始 |

### 2.3 Trellis 任务树（7 个活动任务）

| 任务 | 状态 | 实测 checkbox 计数 |
|---|---|---|
| 父 `08-20-m2y-product-progress-roadmap` | `planning` | AC **3/11**（已勾三条均为文档性成果：基线口径固化、五子任务创建、依赖顺序记录）；implement.md B–G 共 30 项未勾。`design.md` R2 明确「父任务不以『所有文档已创建』为完成条件」 |
| ① `08-20-android-production-identity-pairing` | **`in_progress`** | AC **0/12**；implement.md **19/53**（执行项 A–G **12/46**，Planning readiness 7/7）。Gate 1 完成、Gate 2 后半段阻塞、Gate 3–5 未开始 |
| ② `08-20-ciphertext-sync-foundation` | `planning` | 目录仅 `prd.md` + `task.json` + 两个 `_example` seed jsonl，**缺 design.md 与 implement.md** → 按 `.trellis/workflow.md` start 门禁不可启动 |
| ③ `08-20-rich-chat-file-lifecycle` | `planning` | 同上 |
| ④ `08-20-space-extended-product-surfaces` | `planning` | 同上 |
| ⑤ `08-20-security-settings-release-readiness` | `planning` | 同上 |
| `00-bootstrap-guidelines` | `in_progress`（实际可直接收尾） | prd.md 三条 checklist 全未勾，但实测 `.trellis/spec/` 下已有 **18 个 md**，且已被 ① 的 implement.jsonl 实际引用注入。是 checklist 未回写，不是 spec 缺失 |

### 2.4 已归档任务

`00-join-helox`、`08-12-m2y-skeleton`、`08-13-figma-mvp-basic-functionality`、
`08-20-android-e2ee-native-spike`、`08-20-android-security-data-foundation`。

注意 `08-12-m2y-skeleton` 标记 `completed` 并归档，但实测 **14 条 AC 全部未勾选**，归档时从未
回写；其 AC 第 10、12 条要求的 Android 安装启动 smoke 与 iOS 构建至今未做。

---

## 3. 已落地（有证据）

### 3.1 数据与安全持久化层 —— 全仓证据最扎实的一层

- `src/data/sqlite/SqlCipherDatabase.ts` — raw-key pragma 为首条操作，校验
  `cipher_version`/`cipher_status`，`foreign_keys = ON`，首迁移后跑 `cipher_integrity_check`，
  错误密钥映射为 `recovery: database-unreadable`
- `src/data/sqlite/schema-v1.ts` — schema v1，实测 **3 张表 + 3 索引**
  （`installation_profile` / `messages` / `shared_items`，含 `(source_message_id, kind)` 部分
  唯一索引做去重）
- `src/data/sqlite/migrations.ts` + `migrations.test.ts` — `PRAGMA user_version`，仅 0→1，
  其他版本抛 `UnsupportedDatabaseVersionError`
- `src/data/secure-store/ExpoDatabaseKeyStore.ts` — 版本化 `KeyEnvelopeV1`
  （provisioning→ready 两阶段）、device / strong-biometric 双模式、稳定错误映射
- `src/native/random/ExpoSecureRandom.ts` — `getRandomBytesAsync(32)` → 64 hex branded key，
  显式拒绝有 `Math.random` fallback 的同步 API
- **物理设备证据**：`.planning/figma-design-implementation/evidence/android-security/01-setup.png`
  至 `11-physical-native-storage-pass.png`（realme RMX3888，11 张 git 跟踪 PNG，06–11 为强生物
  识别序列）。证据存在且已跟踪，只是存放位置与 Trellis 任务目录约定脱节

### 3.2 应用 / 领域层

- `src/application/workspace/decide-command.ts` — 纯函数决策器，5 个命令 + 封闭失败原因联合
- `src/data/sqlite/SqliteWorkspaceSession.ts` — 串行队列 + `BEGIN IMMEDIATE` /
  load-decide-apply-reload / `expectOneChange()`；**明确禁用 `withExclusiveTransactionAsync`**
  （会新建未设 key 的连接）
- `src/application/secure-workspace/` — 7 状态穷举 reducer + `DefaultSecureWorkspaceController`
  （289 行，`runExclusive` 串行化、孤儿密钥清理、reset 全链路）
- `src/domain/identity/state-machine.ts` — 15 状态纯 reducer，`activationCommitted` 必须
  `localConfirmed && remoteConfirmed`。**已写好但零调用方**（见 §4）

### 3.3 UI / 本地闭环

`ChatScreen.tsx` / `SpaceHomeScreen.tsx` / `SharedItemDetailScreen.tsx` / `SaveToSpaceSheet.tsx` /
`SecureWorkspaceGate.tsx`（均在 `src/features/` 下），配 `src/features/preview-workspace-flow.test.tsx`
全链路集成测试与 `.planning/figma-design-implementation/android-*.png` 7 张模拟器截图（含 IME 遮挡
修复前后）。

### 3.4 原生加密层（Android）

`modules/m2y-crypto/android/src/main/java/com/m2y/crypto/production/ProductionIdentityManager.java`
（564 行）— 真实 libsignal `IdentityKeyPair.generate()`；配 `ProductionIdentityDatabase.java`
加密持久化与 3 个 JVM + 2 个 instrumentation 测试（**但从不在 CI 执行**，见 §7.3）。

### 3.5 服务端（最小形态）

`server/src/` — NestJS + `RedactedLogger`（真实实现）+ `DatabaseService` + `migrations.ts`
（8 张表，全部围绕身份/配对）+ `GET /health` + 4 个测试套件。

---

## 4. 进行中：`08-20-android-production-identity-pairing` 卡在 Gate 2 后半段

`status: in_progress`，P0，直接在 `main` 上推进（`branch`/`commit`/`pr_url` 全为 null）。

Gate 1（workspace + 最小持久配对服务，`38cf657`）全通过 6/6；Gate 2 完成「单机生产身份的生成 /
加密持久 / 重启幂等 / 设备签名 / fail-closed 重置」（`d82644f`，x86_64 模拟器 instrumentation
PASS）。两条阻塞项：

| 项 | 内容 | 缺失形态 |
|---|---|---|
| C4 | working-copy 协议事务、candidate 隔离、pairing inbox/outbox、replay tombstones、active relationship 唯一性 | native 的 `pairing_candidates` / `relationship` / `pairing_inbox` / `replay_tombstones` 四张表**只有 CREATE TABLE DDL，零 insert/query/update 方法**（`ProductionIdentityDatabase.java:55,64,82,88,98-99`）；`pairing_outbox` 被挪用为身份注册 outbox（`request_id` 填 operationId、`packet_type` 填 `"identity-registration"`） |
| C7 | replay / rollback 的 JVM + instrumentation 覆盖 | 未实现 |

**连带未接线的部分（当前最容易被误读的区域）**

- `design.md §4` 规定的生产 native 函数只实现 5 个；6 个配对函数（`preparePairingPacket` /
  `consumeIncomingPairingPacket` / `respondToPairingRequest` / `confirmSafetyNumber` /
  `consumePairingEvent` / `listPairingOutbox`+`ack`）**全仓零命中**，仅在
  `src/domain/identity/types.ts:90` 作为类型定义存在
- 生产包内没有 `SignalProtocolStore` 实现、没有 `SessionBuilder`/`SessionCipher` 调用
- **安全号码全仓无任何生产实现**；唯一 `Fingerprint` 出现在 Spike harness
  `LibsignalProtocolProbe.java`
- TS 侧 `prepareM2YIdentityRegistration` / `commitM2YIdentityRegistration` /
  `signM2YDeviceRequest` / `inspectM2YProductionIdentity` 四个 adapter **零调用方**；唯一被调用的
  是 `resetM2YProductionIdentity`（`src/native/crypto/M2YCryptoLocalDataResetter.ts:13`）
- `src/domain/identity/` 的 15 状态 reducer 除自身测试外零引用；无 `IdentityRelationshipProvider`、
  无 identity gate
- 服务端只有 `/health`；8 个 identity/pair 端点、签名 guard、nonce 防重放、prekey lease、
  invite/code hashing、唯一关系事务全缺
- 客户端无 `src/data/pairing/`、无 `PairingApiClient`；`app.config.ts` 三个 `.invalid` 占位
  `apiBaseUrl` 实测零读取

**下一步动作（按 implement.md 顺序）**

1. 补 C4：在 `ProductionIdentityDatabase` 上实现 candidate/relationship/inbox/tombstone 读写，
   在 `ProductionIdentityManager` 上实现 working-copy 协议事务与 6 个缺失 native 配对函数
   （需引入 libsignal `SessionBuilder`/`SessionCipher`/`Fingerprint` 与真正的 `SignalProtocolStore`）
2. 补 C7 的 replay/rollback JVM + instrumentation 测试，关闭 Gate 2
3. 并行推进 B2/B3/B4（strict config reader、`IdentityRelationshipProvider` + gate、移除
   `app/index.tsx` 无条件 `/chat` 跳转）与 D 组（服务端注册 + 签名 guard + prekey lease +
   invite/code + pair 状态机 + 唯一关系事务），才能到 Gate 3 的双安装 M2Y-ID 首次打通
4. 注意本任务证据里**尚无任何 ARM64 真机记录**（现存 ARM64 证据属已归档 Spike，验的是 harness
   不是生产身份）；AC #4/#7 要求的「ARM64 真机 + 第二个独立安装」双端验收是最后且成本最高的一段

**门禁提醒**：父任务 `design.md §4` 门禁 1 —— 在 Gate 2 关闭前，任何关系 UI 都不得宣称已建立
E2EE。

---

## 5. 未开始 / 缺口

### 5.1 四个 planning 子任务与 PRD P0 缺口对齐

| 子任务 | 优先级 | 对应 PRD 缺口 | 权重得分 | 可启动性 |
|---|---|---|---|---|
| `08-20-ciphertext-sync-foundation` | P0 | §3.15.1 密文同步与离线投递、§8.4 离线队列与幂等、§12.3 全部 5 项同步验收 | **20 / 0** | 不可 start（缺 design.md、implement.md，jsonl 为 `_example` 占位，`dev_type`/`scope` = null） |
| `08-20-rich-chat-file-lifecycle` | P0 | §3.2.1 图片/文件/引用回复/系统事件、§3.2.2 送达状态与撤回、§3.2.3+§6.7 焚毁模式、§3.9 File 自动索引与 `assetId` 复用、§10.2 流式加密 | 计入「完整业务页面与状态 20/3」 | 同上 |
| `08-20-space-extended-product-surfaces` | P1 | §3.4 Space Home 四区域、§3.6 Pin、§3.7 Task 四态与 `waitingFor`、§3.8 轻量富文本与冲突副本、§3.10 Agreement 版本确认、§3.11 Activity、§3.12 时间视图、§3.13 统一搜索 | 同上 | 同上 |
| `08-20-security-settings-release-readiness` | P1 | §3.14 生物识别/PIN/后台遮罩/截屏边界、§5.2 设置六子页、§3.15.3 导出、§3.15.4 删除五分类、§8.6 iOS P0、§21.3 发布门禁 | **5 / 0** | 同上 |

四者均为跨 client/native/server/database 的复杂任务，不属于可 PRD-only 的 lightweight 任务，
因此每个都需补齐 `design.md`、`implement.md` 与两个 jsonl 的真实 curated 条目才可 `task.py start`
（依据 `.trellis/workflow.md` 第 164、269、444、456–459 行）。

### 5.2 完全没有实现的 P0 功能（实测 grep 零命中或代码零命中）

| PRD 章节 | P0 功能 | 实测结果 |
|---|---|---|
| §3.1.1–§3.1.4 | M2Y-ID 用户可达创建、三种配对方式、安全号码比对、恢复码、设备管理、解绑 | 用户可观察层面全零；三个 `(auth)` 路由不可达 |
| §3.2.1 | 图片消息、文件消息（≤100MB）、引用回复、系统事件 | 全零；Chat 只有纯文本 + 长按菜单 |
| §3.2.2 | 送达/失败状态、撤回、已读回执、输入状态、本地「提醒我」 | 全零 |
| §3.2.3 / §6.7 | 焚毁模式（含数据库/缓存/FTS 清理验证） | `burn\|焚毁` 命中 **0** |
| §3.3.2 | 动作面板四项 | 只有 3 类（note/task/agreement），缺「收藏」与文件路径 |
| §3.4.1 | Space Home 需要你 / 接下来 / 置顶 三区域 | `SpaceHomeScreen.tsx:84` 只有「最近更新」/「筛选结果」 |
| §3.4.2 | 类型筛选 6 项 | `shared-item-presenters.ts:8-17` 仅 4 项，缺 收藏、文件 |
| §3.6 | Pin / 收藏类型 | `shared_items.kind` CHECK 无 `pin`；`isPinned` 命中 0 |
| §3.7.2 | Task `open → doing → waiting → done`、`waitingFor` 必填、截止日期、本地提醒、回流 Chat | DB CHECK 是另一套（`active/waiting/done/confirmed/archived`）；`'doing'`=0、`waitingFor`=0；schema 无日期列 |
| §3.9 | File 自动索引、单一加密资产复用 | `assetId\|asset_id` 命中 **0** |
| §3.10.3 | Agreement `pending_confirmation`、版本号绑定、双方确认、请求修改、历史快照 | `pending_confirmation`=0；Agreement 被降级为本地草稿，status 复用 `waiting` |
| §3.11 / §3.12 / §3.13 | Activity / 时间视图 / 统一搜索 + 本地 FTS | 全零；FTS 代码零命中（`enableFTS: true` 已开但无虚拟表） |
| §3.14.1–§3.14.4 | 独立 PIN、后台遮罩、任务切换器隐藏、Android 安全窗口、录屏检测、水印、本地安全记录 | 全零；`expo-local-authentication` 实测引用 **0**（生物识别实际由 `expo-secure-store` 的 `requireAuthentication: true` 间接实现）；`expo-screen-capture` 唯一命中是 README 文字 |
| §3.15.2 / §3.15.4 | 推送（默认无明文）、删除五分类 | 推送零（expo-notifications 未安装）；删除语义未分类 |
| §5.2 | 设置六子页 | 只有 3 个不可点行且全标「尚未实现」 |
| §8.1 | 客户端日志 redaction 层 | `src/observability/` 实测只有 README.md（服务端侧已有真实实现） |
| §8.6 | iOS P0 | `ios/` 不存在、git 跟踪 0 个 iOS 文件；`createAppRuntime.ts:26` 写死 `platformSupported: Platform.OS === 'android'` |

### 5.3 目录级空壳

`src/sync/`（仅 README，原文 `No production sync is implemented in the skeleton.`）、
`src/observability/`（仅 README）、`src/shared/`、`src/native/screen-protection/`、
`src/native/secure-storage/`。

---

## 6. 声称 vs 现实的差异

### High —— 均应在下一次写入任何验收记录前处理

| # | 差异 | 证据 |
|---|---|---|
| 1 | 声称「全量自动门禁通过」；实际 **CI 自 `38cf657` 起在 server 单测稳定失败**，`pnpm server:build` 从未在 CI 执行过，`d82644f` 并未通过完整 CI | `.github/workflows/ci.yml:36`（实测确认行内容与引入提交 `38cf657`）；实跑输出 `No tests found, exiting with code 1` / `Pattern: --ci - 0 matches`。改为 `pnpm --filter @m2y/server test --ci` 后 4 套件 10 用例全绿 → **命令写法缺陷，非代码缺陷** |
| 2 | `CLAUDE.md:7,14` 声称「SQLCipher 同步、服务端尚未实现」「目前没有可运行的构建/测试命令」；三处均已过时 | 实跑 `pnpm test --ci` → 19 suites / 75 tests 全通过；`pnpm deps:check` 0 违规；`src/data/sqlite/schema-v1.ts`、`server/src/persistence/migrations.ts` 已落地。仅「E2E 工具未定」这一项仍成立 |
| 3 | `08-12-m2y-skeleton` 为 `status: completed` 并已归档；实际 **14 条 AC 全部未勾选** | `archive/2026-08/08-12-m2y-skeleton/prd.md`（checked=0 / unchecked=14）；`README.md:119-120`「当前没有连接的 Android 设备/模拟器…」「iOS 编译尚待 macOS/EAS」 |
| 4 | 技术选型 §14 声称测试金字塔含「原生集成：iOS/Android test target」、§15.4 主分支门禁含 preview build 与 security tests；实际 **CI 无任何原生编译或原生测试步骤** | `ci.yml` 仅 14 个 run 步骤，末行仍是注释 `# Database migration tests become required when Spike C creates the first schema.`；`package.json` 的 `jest.testMatch` 只匹配 `<rootDir>/src/**/*.test.ts(x)`，`app/` 与 `modules/` 下的测试被静默忽略 |
| 5 | 父任务 33% 加权基线为当前决策依据；实际其依据的仓库状态**落后 4 个提交** | `research/current-state-baseline.md:6` 写明审计时 HEAD = `1e8c6bf`；实测 HEAD = `d82644f`，中间新增 `38cf657`（server 持久化配对基础）与 `d82644f`（Android 生产身份）；权重表「生产身份 25/5」「密文同步 20/0」未反映这两笔增量；`progress-snapshots.md` 全文只有一条 `Initial baseline` |
| 6 | 技术选型 §21.2「写正式功能前」8 项门禁被引为已建立的秩序；实际至少 **5 项未关闭**而生产功能代码已在写 | Spike A 从未启动；Spike B 无 release 真机量化（`README.md:95`）；sync 侧未开始；Detox/Maestro 未落地；客户端 redaction 层只有 README。文档原文警告是「任何一项失败，应调整范围或实现方案，而不是通过弱化验收绕过」 |
| 7 | PRD §7.1 把 Chat 五类消息、Space Home 四区域、五类对象、Activity、时间视图、统一搜索、生物识别/PIN/后台遮罩全列为 P0；实际**大面积缺失** | 见 §5.2 全表；核心实测：`assetId`=0、`waitingFor`=0、`'doing'`=0、`pending_confirmation`=0、`isPinned`=0、`burn\|焚毁`=0、FTS 代码零命中；`schema-v1.ts` 全库只有 3 张表 |
| 8 | `d82644f` 提交信息与 C 组 5/7 勾选暗示生产身份能力已建立；实际**整条链路未接线，配对全为空壳** | 见 §4 |

### Medium

| # | 差异 | 证据 |
|---|---|---|
| 9 | PRD §8.6 把 iOS 列为 P0；实际 iOS **零覆盖且被代码硬性阻断** | 实测 `ios/` 不存在、`git ls-files ios` = 0；`modules/m2y-crypto/expo-module.config.json` platforms 仅 android、无 podspec/Swift；`createAppRuntime.ts:26` 写死 `Platform.OS === 'android'`（iOS 上整个 app 内容不可达）；CI 无 iOS 步骤。根因见 `journal-1.md`「Xcode 按用户选择暂不安装」。父任务已诚实计为「跨平台与发布准备 5/0」，但返工风险随时间放大 |
| 10 | 技术选型 §0/§22 服务端基线为 NestJS(Fastify) + PostgreSQL + Redis + S3 + `ws`；实际是 `@nestjs/platform-express` + `better-sqlite3@13.0.3`，**无 Redis、无对象存储、无 WebSocket** | 实测 `server/package.json` 依赖表；`server/src/main.ts:2` 用默认 Express 适配器；`@WebSocket` 零命中；`migrations.ts` 8 张表全部围绕身份/配对，无 envelope/cursor/asset/push_token/deletion_jobs。子任务 research 已记录这是宿主环境无 Docker/PostgreSQL 的显式取舍并声明「子任务 2 前必须重新评估」，但技术选型文档未更新，两份基线口径不一致 |
| 11 | 技术选型 §0/§8.1/§8.2/§16 与 `CLAUDE.md` 均写「UI 状态 → Zustand」并列出 5 个建议 store；实际**没有 Zustand 依赖** | 实测 `zustand` 在 `package.json`、`app/`、`src/` 命中 0；实际用 React Context + `useSyncExternalStore`（`src/stores/workspace/WorkspaceProvider.tsx`、`src/stores/secure-workspace/SecureWorkspaceProvider.tsx`）。替换本身合理（更少依赖、事务提交后才 setState），但两份权威文档与前端 spec 都未记录该决策变更 |
| 12 | `README.md` 落后 3 个已归档任务 | `README.md:97-105,119-120` 仍写「当前没有连接的 Android 设备/模拟器」（实际已有 realme RMX3888 验收）、「migration 测试会在 Spike C 创建首个 schema 后成为 CI 必选项」（schema 与 `migrations.test.ts` 均已存在，CI 至今只有注释）；README 的 M0 Spike 是五项编号（A 威胁模型 / B 真机性能 / C SQLCipher / D 原生加密 / E 密文同步），与 `CLAUDE.md` 四项编号不一致 |
| 13 | PRD §8.1 / 技术选型 §12 把「日志禁止明文 + 建立 redaction 层」列为技术红线；实际**客户端 redaction 层完全未实现** | 实测 `src/observability/` 只有 README.md；`server/src/observability/redacted-logger.ts` 有真实实现。当前因客户端零网络零崩溃上报而未实际触线，但里程碑 3（富消息与文件）一开工即成为红线暴露点 |
| 14 | 父任务 AC ②③ 已勾 `[x]`，声称四个子任务「已创建并关联」；实际四者**按 Trellis 门禁均不可 start** | 实测四目录各仅 4 个文件，缺 design.md 与 implement.md，jsonl 为 `_example` seed。AC ②③ 勾选的是「已创建」这一较弱条件，真实排期风险未被量化 |

### Low

| # | 差异 | 证据 |
|---|---|---|
| 15 | `00-bootstrap-guidelines` 三条 checklist 全未勾——本轮曾据「`.trellis/spec/` 下有 18 个 md」判为「spec 已填、只是 checklist 未回写、可直接 `finish` + `archive`」。**该结论已于 2026-08-21 复核推翻** | 18 个文件数是对的，但其中 **7 个仍是带 `(To be filled by the team)` 占位的空模板**：`backend/{directory-structure,database-guidelines,error-handling,logging-guidelines,quality-guidelines}.md` 与 `frontend/{hook-guidelines,type-safety}.md`。即 backend 要求的 5 个文件 **0/5 已填**，frontend 要求的 6 个文件 4/6 已填。真正有内容的 `backend/server-foundation.md`（116 行）与 `frontend/production-identity.md`（76 行）是后续任务新增的，不属于 bootstrap 要求的 11 个文件。因此本任务**不可归档**；详细状态与两个处理选项已写入 `.trellis/tasks/00-bootstrap-guidelines/prd.md`。教训：文件数不是填充度证据。**2026-08-21 已闭环**：开发者选定「不硬写 backend 五件套」，6 个空模板已删（5 个 backend + `frontend/hook-guidelines.md`），`frontend/type-safety.md` 已按真实代码填写，两个 `index.md` 记录了删除理由与「密文同步落地后按真实代码再拆分」的触发条件；同时修掉了唯一一处把空模板注入 sub-agent 的接线（`08-20-m2y-product-progress-roadmap/check.jsonl:2` → `backend/server-foundation.md`）。现状：`.trellis/spec/` 12 个 md、0 个占位符，本任务可归档 |
| 16 | `08-20-android-security-data-foundation` 的真机结论一度被认为只有文字支撑；**此结论应修正** | `.planning/figma-design-implementation/evidence/android-security/01-setup.png` 至 `11-physical-native-storage-pass.png` 共 11 张 git 跟踪 PNG + README，命名与 implement.md 勾选项一一对应。真机结论有图像证据，只是存放位置脱离 Trellis 任务目录约定 |
| 17 | `modules/m2y-crypto/index.ts` 统一导出 12 个 API；`src/M2YCryptoModule.web.ts` **只导出 7 个 Spike 函数** | web 平台解析到 `.web.ts` 时 5 个生产身份函数会是 `undefined` 而非受控抛错，与该模块「所有失败路径收敛成稳定错误码」的设计意图不一致；`app.config.ts` 已配 `web.output: 'static'`，该路径并非不可达 |
| 18 | SecureWorkspaceGate 显示「本机加密存储」，UI 上的内容看似用户数据；实际是**演示 seed 写入真实 SQLCipher 生产库** | `src/data/sqlite/seed.ts:17-40` 在 `withKeyedWriteTransaction` 内插入 `demoWorkspaceSnapshot`（`src/application/workspace/demo-workspace.ts:8,22,30-41`，含一条 `kind:'agreement'` 的「电影 · 周六 19:30」），无演示/真实数据隔离标记或清理路径 |
| 19 | `expo-local-authentication` / `expo-screen-capture` / `expo-constants` 已作依赖并在 `app.config.ts` 配置，暗示生物识别、截屏保护、运行时配置已接入；实际 **TS 代码引用数均为 0** | 实测三者在 `app/`+`src/` 代码零命中（`expo-screen-capture` 唯一命中为 README 文字）；`extra.apiBaseUrl`（三个 `.invalid` 占位）从未被读取 |
| 20 | 声称 pnpm workspace 已正确配置；实际本机依赖会静默漂移 | 实测 `node_modules` 时间戳（15:38）早于 `package.json`/`pnpm-lock.yaml`（16:00）；`expo-crypto ~56.0.4` 已在 lockfile 但本机未安装，导致 19 套件全熄火、`server/node_modules` 从未安装。`.husky/pre-commit` 只跑 lint-staged，本地依赖一致性无任何约束；CI 的 `--frozen-lockfile` 挡 lockfile 漂移，挡不住本地漂移 |

---

## 7. 门禁与健康度

### 7.1 实跑结果（装完 `pnpm install --frozen-lockfile` 之后）

| 检查项 | 命令 | 结果 |
|---|---|---|
| 格式（客户端） | `pnpm format:check` | ✅ `All matched files use Prettier code style!` |
| 类型检查（客户端） | `pnpm typecheck` | ✅ exit 0（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitReturns`）——**但有陷阱，见 §7.2** |
| Lint（客户端） | `pnpm lint --max-warnings 0` | ✅ 0 error |
| 单元测试（客户端） | `pnpm test --ci` | ✅ **19 套件 / 75 用例**，0 失败 0 跳过，2.0s |
| 依赖方向 | `pnpm deps:check` | ✅ `no dependency violations found (95 modules, 148 dependencies cruised)` |
| 应用配置 | `pnpm config:check` | ✅ 三环境 public config 校验 |
| Expo Doctor | `pnpm exec expo-doctor` | ✅ 21/21 checks passed |
| 格式/类型/Lint（server） | `server:format:check` / `:typecheck` / `:lint` | ✅ 全部通过 |
| 单测（server，**CI 原样命令**） | `pnpm server:test -- --ci` | ❌ `No tests found, exiting with code 1` |
| 单测（server，修正调用） | `pnpm --filter @m2y/server test --ci` | ✅ **4 套件 / 10 用例** |
| 构建（server） | `pnpm server:build` | ✅ exit 0 |

**合计 23 套件 / 85 用例全绿。JS/TS 层健康度是实测确认的。**

### 7.2 typecheck 的 typed-routes 陷阱（本轮新发现）

初次跑 `pnpm typecheck` 报 2 个错误：

```
src/features/settings/screens/SettingsScreen.tsx(80,19): error TS2322: Type '"/_dev/storage"' ...
src/features/settings/screens/SettingsScreen.tsx(83,19): error TS2322: Type '"/_dev/e2ee"' ...
```

根因是 `.expo/types/router.d.ts` 生成于 8-13 23:09，而 `app/_dev/` 是之后加的。跑
`npx expo customize tsconfig.json` 重新生成后类型里正确出现 `/_dev/e2ee`、`/_dev/flash-list`、
`/_dev/storage`，typecheck 全绿，`tsconfig.json` 未被改动（已有 `.expo/types/**/*.ts` include）。

**副作用（更重要）**：该文件被 gitignore，CI 全新 checkout 时根本不存在 → `Href` 退化成宽松类型
→ **CI 里的 typed routes 实际上没有被校验**。`pnpm exec expo export` 会生成类型，但它排在
`pnpm typecheck` 之后。修法：在 `typecheck` 前插一步 `npx expo customize tsconfig.json`。

### 7.3 未能验证的项与原因

| 项 | 原因 |
|---|---|
| `expo export --platform android` | 会覆盖 `dist/`，只读核验约束下跳过 → **未验证** |
| `expo prebuild --clean --platform android` | `--clean` 会删除并重建 `android/`（破坏性）→ **未验证** |
| `pnpm build:android:debug` / Gradle 编译 | 需 Android SDK + 长时构建并产出构建物 → **未验证** |
| `modules/m2y-crypto` 的 3 个 JVM + 2 个 instrumentation 测试 | 需 Gradle/设备；且**从不在 CI 执行** → **未验证** |
| 远端 CI 运行历史 | `gh` 未登录（`gh auth status` = not logged in）→ 「main 当前是红的」是推断而非事实 |
| E2E | Detox/Maestro 均未落地，无 `.maestro/`、`e2e/`、`.detoxrc*` → 不存在 |
| 覆盖率门禁 | `collectCoverageFrom` 已配置，但 CI 不跑 coverage、无 threshold → 不存在 |
| iOS 任何步骤 | `ios/` 不存在、模块无 iOS 实现、CI 无 iOS 步骤 → **未验证** |
| Release 真机性能基准（FPS/内存/跳帧） | Spike B 未量化 → **未验证** |
| 双安装/双设备端到端配对 | Gate 3 未开始 → **未验证** |
| 独立安全审计 | 未做；`go-no-go.md` 对「E2EE 已完成」判 NO-GO |

### 7.4 门禁配置缺陷清单

> **状态（2026-08-21 实施后）**：第 1、2、3、4、7 项已修复并本地实测；第 5 项（原生编译/测试门禁）
> 已写入 CI（`native-crypto` job，跑 `:m2y-crypto:testDebugUnitTest`），但**本机无 JDK 与 Android
> SDK，Gradle 那一步只能靠首轮 CI 验证**——已本地实测的是 wrapper 的 argv 构造（JDK21 运行 Gradle +
> `-Dorg.gradle.java.installations.paths=jdk17,jdk21` + 只跑该 task，且 `:app:assembleDebug` 与
> arm64 两条既有用法 argv 逐字未变）；第 6 项（server lint 复用根 eslint 配置）未处理。

1. `.github/workflows/ci.yml:36` 的 `--` 使 server 单测必然失败，连带第 37 行 `server:build`
   从未执行 —— **唯一「仓库自称有、实际过不了」的门禁**
2. `typecheck` 之前未生成 expo-router 类型 → typed routes 在 CI 中形同未启用（§7.2）
3. 末行 migration 门禁仍是注释；`migrations.test.ts` 与 server `database.service.spec.ts` 虽被
   普通 jest 带跑，但未被显式识别为门禁
4. `jest.testMatch` 只匹配 `<rootDir>/src/**/*.test.ts(x)`，`app/` 与 `modules/` 下的测试被静默忽略
5. 承担全部密码学的原生模块无任何编译或测试门禁（技术选型 §19.2 唯一列为「极高」的风险，其缓解
   手段目前只存在于人工流程）
6. server lint 复用根 `eslint.config.js`（expo/react-hooks 规则集），对 Node/NestJS 无类型感知
   规则，门禁存在但强度偏弱
7. 无 `concurrency: cancel-in-progress`；无本地依赖一致性约束（`.husky/pre-commit` 只跑 lint-staged）

---

## 8. 建议的下一步

按优先级与依赖顺序排列。

**① 修 CI 并撤回「门禁通过」表述**（无依赖，成本最低）

- `.github/workflows/ci.yml:36` → `pnpm --filter @m2y/server test --ci`
- 在 `pnpm typecheck` 之前插入 `npx expo customize tsconfig.json`（让 typed routes 真正生效）
- `jest.testMatch` 扩到 `modules/**` 与 `app/**`
- 把 migration 测试显式化为门禁步骤
- 把 `:m2y-crypto:testDebugUnitTest`（JVM 测试无需设备）加入 CI

理由：这是唯一一个「声称有、实际过不了」的门禁，且多个 Gate 已把「全量自动门禁通过」写进验收记录；
在修好之前不应再把该结论写入任何新的验收记录。原生 JVM 测试入 CI 直接缓解 §19.2 唯一的「极高」风险。

**② 刷新四处文档基线**（无依赖，应在任何重新评分之前完成）

按父任务 R1「新证据与当前口径冲突时先修正文档基线再继续」处理：

- `CLAUDE.md:7,14` 三处过时表述
- `README.md:97-105,119-120` 的真机状态与 M0 Spike 编号（统一到四项口径，消除「Spike C 已完成」
  的双义）
- `progress-snapshots.md` 追加 `38cf657` 与 `d82644f` 两笔增量快照，并明确
  **「表已建好 ≠ 配对已实现」**
- 回写 `08-12-m2y-skeleton` 的 14 条 AC，并标注 Android smoke 与 iOS 构建仍未做
- 顺手 `finish` + `archive` `00-bootstrap-guidelines`（spec 已有 18 个 md，只是 checklist 未回写）

> **执行后修正（2026-08-21）**：①②已实施，实施过程推翻了上面最后一条。`00-bootstrap-guidelines`
> 当时**不可归档**——`.trellis/spec/` 的 18 个 md 里有 7 个仍是空模板（backend 要求的 5 个文件 0/5 已填）。
> **该项已于同日闭环**：6 个空模板删除、`frontend/type-safety.md` 按真实代码填写、`.trellis/spec/`
> 现为 12 个 md / 0 占位符，任务可归档。见修正后的 Low #15 与
> `.trellis/tasks/00-bootstrap-guidelines/prd.md`。其余四条已完成：`ci.yml`
> 的 `--` 已修、typed-routes 生成步骤已插到 `typecheck` 之前、migration 已成为显式门禁、
> `jest.testMatch` 已扩到 `app/**` 与 `modules/**`、`CLAUDE.md` / `README.md` / `progress-snapshots.md`
> / `current-state-baseline.md` / 父任务 `prd.md` 基线已刷新、`08-12-m2y-skeleton` 的 14 条 AC 已按实测
> 回写（12 勾 2 不勾）。①的第 5 条（把 `:m2y-crypto:testDebugUnitTest` 加入 CI）**已写入但未经 CI 验证**：
> 新增独立 job `native-crypto`（装 JDK 17 + JDK 21、缓存 Gradle、prebuild 后跑
> `pnpm test:native:crypto`），刻意与 `mobile` 分开，使工具链失败不会污染已实测的门禁结果。该模块
> `android/src/test/` 下确有 3 个纯 JVM 测试类共 8 个 `@Test`（`LibsignalProtocolProbeTest`、
> `M2YCheckpointStateTest`、`ProductionIdentityIdsTest`，只依赖 JUnit4 与 `java.util`/`java.security`，
> 不触碰 native `.so`，无需真机），所以这不是一个空门禁。**首轮 CI 必须盯**：Gradle 能否在无 NDK 的
> GitHub runner 上只配置并执行该 task。

理由：33% 基线是后续排期的唯一输入，落后 4 个提交会同时造成两种误判——低估已落地的身份/服务端
增量，以及因为「表已建好」而高估配对进度。

**③ 关闭 Gate 2**（依赖 ①②，是当前唯一在推进的关键路径）

补 C4 与 C7，同时并行 B2/B3/B4 解除 `app/index.tsx` 无条件跳转，再进 D 组服务端端点。理由：
`pairing_outbox` 被挪用为身份注册 outbox 是临时状态，越晚纠正越贵；且在 Gate 2 关闭前，任何关系
UI 都不得宣称已建立 E2EE（父任务 design.md §4 门禁 1）。

**④ 里程碑 3 开工前补两项门禁，或显式记录门禁顺序变更**（依赖 ②，与 ③ 可并行）

最小集是两项：(a) E2E 主方案决策（Detox/Maestro 二选一，技术选型 §14.2 要求 M0 一周内完成）；
(b) 客户端 `src/observability/` redaction 层落地。两者都不依赖配对或同步。若决定不补 Spike A 与
Spike B 的 release 真机量化，则必须按父任务 R2 在父任务中显式记录「门禁顺序变更 + 理由 + 承担的
风险」，而不是让 §21.2 静默失效。理由：redaction 层必须在富消息与文件之前落地——里程碑 3 一开工，
logger 与崩溃报告立刻成为 PRD §8.1 红线的暴露点，事后补的成本远高。

**⑤ 补密文同步子任务的规划形态，并对 iOS 做显式决策**（依赖 ②③）

为 `08-20-ciphertext-sync-foundation` 补 `design.md`、`implement.md` 与两个 jsonl 的真实条目
（它是权重 20、当前 0 分的最大单点缺口，且其他三个子任务的双端状态、失败恢复、Activity/搜索数据源
都建立在 envelope/outbox/inbox/ACK 语义之上）；同时对 iOS 二选一并记入父任务：要么安装 Xcode 并立
独立 iOS libsignal + Keychain + SQLCipher Spike，要么正式把 iOS 从 P0 降级/延期并写明返工风险。
理由：父任务 design.md §4 门禁 4 已写明「iOS 不继承 Android 验收结论」，但这条门禁目前没有任何可
执行路径；iOS 侧 Keychain 生命周期、生物识别与 libsignal 集成差异越晚发现，返工面越大。

---

## 9. 可信度边界与本轮方法

**本轮方法**：8 路并行只读取证（PRD / 技术选型 / 路线总控 / 进行中子任务 / 规划中子任务 / 归档任务
与日志 / 代码现实审计 / 门禁实跑）→ 一轮对抗性交叉核验（不采信任何一方自述，把文档与任务声称的
完成度和代码现实 + 门禁实跑对撞）→ 汇总。共 10 个 agent、~900k tokens。所有 High 级差异与
§7 门禁结果均由主会话独立复核过一遍。

**已实测**：JS/TS 层全部门禁结果、grep 命中数、checkbox 计数、git 提交序列、表数量与 CHECK 约束、
`ci.yml` 行内容与引入提交、`server/package.json` 依赖表、`.trellis/spec` 文件数、`ios/` 缺失与
`platformSupported` 硬编码。

**未验证**（不应与实测结果合并表述为「门禁全绿」）：原生编译、Android 出包、`expo export`、
`expo prebuild`、iOS 全部能力、release 真机性能、双设备端到端配对、独立安全审计、远端 CI 运行历史。

**本轮对仓库的改动**：仅 `pnpm install --frozen-lockfile`（补齐 `expo-crypto` 与
`server/node_modules`）与 `npx expo customize tsconfig.json`（重新生成 gitignore 的
`.expo/types/router.d.ts`）。两者都不改动 git 跟踪文件；`git status` 保持为空。本文件是本轮唯一
新增的跟踪文件。

**下次会话的入口建议**：先读本文件 §8，再按 ①→②→③ 顺序推进；`08-20-android-production-identity-pairing`
仍是唯一 `in_progress` 任务，`python3 ./.trellis/scripts/task.py current` 可确认。注意本仓库
`python` 不可用，Trellis 脚本须用 `python3` 调用。











