# Android 安全与数据基础

## Goal

建立 Android 优先、可验证且不夸大安全能力的本地数据基础：用户在当前设备创建的 Chat 与 Space 内容能够通过 SQLCipher 加密持久化，数据库密钥受系统安全存储保护，应用具备明确的初始化、锁定、就绪和恢复失败状态。

本任务是执行路线中的 P1 基础阶段，不等同于产品 PRD 中“P1 功能版本”。它只为后续真实 M2Y-ID、配对、E2EE 和同步提供可靠边界，不在本阶段伪造这些能力。

## Background

- Android MVP 已完成 Chat → Save to Space → Space → Shared Item Detail 的内存闭环，重启后数据会清空。
- `app.config.ts` 已为 `expo-sqlite` 启用 SQLCipher/FTS，并配置 `expo-secure-store` 与 `expo-local-authentication`；依赖存在但没有 schema、migration、repository、密钥生命周期或解锁状态机。
- `src/native/crypto` 禁止 TypeScript 占位密码学；`src/bootstrap` 禁止因 React 首次渲染而直接初始化数据库或加密模块。
- 当前身份、配对和安全号码页面仍是诚实的流程占位，不得在缺少真实身份密钥与协议时改称已安全建立。
- 官方平台约束表明 SecureStore 数据可能因卸载或生物识别变更而丢失/失效，SQLCipher 必须在数据库打开后、任何业务查询前设置密钥。

## Requirements

### R1 — 威胁边界与安全表述

- 在 task research/design 中记录本阶段保护的对象、攻击边界、残余风险和禁止声明。
- 本阶段只承诺“当前 Android 设备上的受保护密钥与加密本地数据库”，不承诺硬件 StrongBox、E2EE、匿名、远程删除或跨设备恢复。
- 数据库密钥、PIN/恢复材料、消息正文、Shared Item 标题/正文不得进入 source、public config、日志、异常文本、测试快照或分析事件。

### R2 — Android 数据库密钥生命周期

- 使用原生安全随机源生成高熵 SQLCipher 主密钥；不得使用 `Math.random`、时间戳、UUID 拼接或仓库常量作为密钥。
- SecureStore 适配器使用稳定、带版本的 key/service 名称，并只提供 typed async commands。
- 必须区分 SecureStore 不可用、首次无密钥、已存在密钥、认证取消、密钥失效、读取异常和删除异常。
- 数据库文件已经存在但对应密钥缺失/失效时，不得静默生成新密钥覆盖或创建同名空库；进入明确的 `recoveryRequired` 状态。
- `recoveryRequired` 只提供返回说明和经二次确认的“销毁本机数据并重新初始化”；本阶段不提供恢复码、PIN 找回或伪恢复。
- 重置必须先关闭数据库，再删除数据库文件、密钥和非秘密初始化标记；任一步骤失败都保持不可进入私密导航的错误状态。
- Android 应用数据备份默认关闭，避免恢复出无法由新 Keystore 解密的数据库或密钥材料。

### R3 — SQLCipher schema、migration 与 repository 边界

- 密钥可用后才打开数据库，并在任何 schema/query 前执行 SQLCipher key setup 与最小可验证查询。
- migration 使用单调 `user_version`、事务和幂等边界；失败时保持旧版本可诊断，不伪造成功。
- 首期 schema 覆盖当前 Message、SharedItem、来源关联和必要的本地 installation profile；不加入 sync/outbox、附件资产或 E2EE 会话表。
- repository/command 适配当前 domain 与共享工作区契约；route、screen、domain 不直接导入 Expo SQLite、SecureStore 或 native crypto。
- 所有 SQL 参数化；动态 SQL 仅允许受控枚举，禁止拼接用户输入。

### R4 — 应用安全启动状态机

- 建立可穷举状态：`checking`、`setupRequired`、`locked`、`opening`、`ready`、`recoveryRequired`、`fatal`。
- App shell 可以安装 provider，但不得在普通 React render 中重复打开数据库或读取密钥。
- 只有 `ready` 状态能够挂载读取私密数据的主导航；其他状态只显示最小必要说明和允许动作。
- Android 强生物识别可用时允许用户启用快捷解锁；生物识别只是访问门槛，不得被描述为新的加密身份。
- 用户取消、认证失败、系统锁定和设备不支持必须保持在安全状态，不得 fail-open。

### R5 — 本地 installation profile

- 创建只在加密数据库内使用的不透明 installation ID、创建时间和可选显示名。
- installation ID 不是公开 `M2Y-ID`、账号、公钥指纹或安全号码，界面和类型命名必须区分。
- 真实身份密钥、M2Y-ID、恢复包、配对和安全号码继续保持延期占位。

### R6 — 当前 MVP 数据迁移到持久 repository

- Chat 与 Space 继续共享一套 command/query 规则，但运行数据改由持久 repository 驱动。
- 用户发送消息、保存条目、编辑、更新状态和确认删除后，正常关闭并重启 App，数据仍保持一致。
- 首次安装可注入确定性演示数据；演示数据与运行数据使用相同 schema/domain 类型，并且只在空库初始化一次。
- 旧版内存预览无需迁移，因为它没有可持久化的历史数据；相关“重启后清空”文案在持久化生效后必须删除或改正。

### R7 — 失败恢复、测试与 Android 验收

- 单元测试覆盖启动状态机、密钥结果映射、migration、repository command 和 unknown/corrupt data。
- 集成测试使用临时数据库验证 schema v1、重复 migration、事务回滚和错误密钥无法读取既有数据。
- Android Development Build 验证首次 setup、正常重启、强生物识别成功/取消、持久数据重载和密钥缺失恢复页。
- 强生物识别的密钥绑定、取消和后台重新锁定必须在物理 Android 设备验收；模拟器只作为功能状态流证据。
- 验收不得通过把真实密钥或数据库复制到测试输出完成。

## Acceptance Criteria

- [x] Android 首次启动进入明确 setup 状态，完成初始化后才进入主导航。
- [x] SQLCipher 主密钥由安全随机源产生并保存在 SecureStore；仓库、public config、日志和测试输出中不存在该密钥。
- [x] Android manifest 禁止应用数据自动备份，SecureStore/数据库恢复策略与该配置一致。
- [x] 用户创建或修改的 Chat/Space 数据在正常重启后保持一致，UI 不再声称重启即清空。
- [x] 数据库存在但 SecureStore 密钥缺失/失效时进入 `recoveryRequired`，不静默覆盖原数据库；二次确认重置后旧数据消失并可重新初始化。
- [x] 生物识别取消、失败、锁定或不可用不会进入私密主导航。
- [x] installation profile 不被展示或命名为 M2Y-ID、E2EE 身份或安全号码。
- [x] schema/migration/repository 与启动状态机测试通过，包含错误密钥、重复 migration 和事务失败路径。
- [x] `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm deps:check`、`pnpm test --ci`、`pnpm config:check`、Expo Doctor、Android export 与 x86_64 Gradle build 全部通过。
- [x] Android API 37.1 模拟器完成首次初始化、重启持久化、密钥缺失恢复和二次确认重置截图验收，无明文敏感日志。
- [x] 物理 Android 设备完成强生物识别成功/取消、后台重新锁定与再次解锁验收；ARM64 原生 SQLCipher harness 同时通过。

当前验收状态：代码、自动化、模拟器恢复路径、x86_64/ARM64 SQLCipher 原生 harness 均已完成。强生物识别结论来自 realme RMX3888（Android 16/API 36）物理设备，覆盖成功、取消、后台重新锁定、再次解锁和重启后持久化；模拟器没有被用来替代这部分证据。

## Out of Scope

- 真实 M2Y-ID、身份密钥、公钥指纹、安全号码、恢复码/恢复包。
- 配对、E2EE 会话协议、消息密文协议、服务端、同步、outbox/inbox 和冲突处理。
- 独立 App PIN、PIN KDF、诱饵 PIN、紧急删除和完整本地安全记录。
- 附件加密、缩略图/缓存清理、FTS 内容索引、导出、换机和密钥轮换。
- iOS 行为、iCloud Keychain 语义、商店发布和生产安全认证。

## Key Decisions

| Decision | Choice | Consequence |
|---|---|---|
| 密钥丢失/失效恢复 | 明确告警、二次确认后销毁本机数据并重新初始化 | 不制造不可审计的恢复承诺；本机历史不可恢复，setup 与重置前必须说明 |
| 身份范围 | 仅 installation profile，不生成或展示 M2Y-ID | 后续原生身份密钥与配对协议可独立审计 |
| 平台顺序 | Android 实现与验收优先 | iOS Keychain/生物识别语义留给独立任务 |
