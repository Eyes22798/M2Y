# Android 生产身份、配对与安全号码闭环

## Goal

把已通过的 Android 本地安全与 libsignal Spike 产品化为真实、可重启恢复且可由两个独立 Android 安装完成的身份与配对闭环：用户无需手机号或邮箱即可创建 M2Y-ID，通过二维码、M2Y-ID 或 10 分钟一次性握手码发起请求，双方明确接受并核验一致的安全号码后，应用才进入唯一双人关系。

本任务完成后可以声明“Android 身份与配对链路已通过双端验收”，但仍不能声明普通消息已经跨设备同步、附件已端到端加密、iOS 已完成或产品已通过独立安全审计。

## 原型优先范围修订（2026-09-04）

本任务前半段为一次性覆盖完整安全链路而扩张过快。后续交付改为以 Figma 中已经画出的用户页面和相邻交互为边界，每次只纵向打通一个可见切片：

1. 当前切片只交付“身份已在本机创建 → 复制 M2Y-ID → 选择配对方式 → 输入 M2Y-ID → 发起真实加密请求”。
2. 配对方式页按原型展示扫码、M2Y-ID 和一次性握手码；当前只有已经端到端接通的 M2Y-ID 可进入，另外两项明确显示“暂未开放”，不制作假成功流程。
3. 已完成的 native、服务端和传输能力继续作为真实闭环底座，但在下一张用户可见页面需要它们之前，不再横向增加通用同步、推送、附件或额外协议设施。
4. Figma 中后续的等待、请求审核、安全号码、关系和设备页面按相邻状态逐个实现，不再因为它们同时存在于长画布中而视为同一轮必须全部完成。
5. 每个切片的完成标准包含可见页面、真实入口、失败状态、自动化测试和 Android 构建；尚未接通的入口必须禁用或隐藏，不能用静态 PASS 文案代替功能。

## Background

- Android SQLCipher、SecureStore、安全启动、强生物识别和统一本地重置已经通过模拟器与 ARM64 真机验收。
- 官方 libsignal `0.101.0` 已证明 PQXDH、双棘轮、持久重开、身份变化拒绝和安全号码一致性可在当前 Expo/RN 工程运行。
- 现有 `M2YCryptoSpike*`、Alice/Bob persona、runId、开发 checkpoint 和 `_dev/e2ee` 只属于验收 harness，不得作为生产状态复用。
- 当前三个 auth route 共用诚实占位页，`app/index.tsx` 无条件进入 Chat；必须增加状态驱动的身份/关系门，防止未建立关系时把本地预览冒充真实双人产品。
- PRD 要求唯一双人关系、三种配对方式、双方确认和安全号码；Figma/差距报告还要求请求等待、拒绝、取消、过期、权限拒绝和号码不一致状态。
- M2Y-ID 与握手码需要最小协调服务才能跨两台设备成立；通用消息 envelope、outbox/inbox 和冲突同步仍属于下一子任务。

## Requirements

### R1 — 真实本地身份与声明边界

- 首次安全工作区就绪但尚无身份时进入身份创建流程，不进入主导航。
- 原生侧生成并持有一套生产 identity key、registration ID、signed pre-key、one-time pre-key、Kyber pre-key、不可变 stable identity ID 和 Android device-auth signing key。
- 生成随机、可人工输入的 `M2Y-ID`；它只降低与现实身份直接关联，不承诺匿名或不可枚举。
- 创建身份不要求手机号、邮箱、通讯录或真实姓名；显示名可选并作为加密配对负载传递。
- 头像依赖后续附件生命周期，本任务不上传头像；界面不得伪装头像已同步。
- 当前任务不实现 PIN/恢复包。创建身份前明确提示：卸载、系统密钥丢失或本机重置可能永久失去当前身份与历史数据，平台不能代恢复。

### R2 — 生产 native store 与失败恢复

- 在 `modules/m2y-crypto` 新建生产 API/store，与所有 Spike 类、alias、文件和 DTO 隔离；不得重命名或复用验收 checkpoint。
- 生产 store 只包含一个本地身份和至多一个 active relationship；协议私密记录永远不进入 TypeScript、日志、测试快照或普通 SharedPreferences。
- Android 原生 SQLite 保存版本化记录；identity/pre-key/session 等秘密 blob 使用独立 Android Keystore AES-GCM key 加密，AAD 绑定 schema、record kind、record key 和 revision。
- 所有 native store/protocol 操作通过单一串行 executor 执行。配对协议状态和待发送不透明 packet 必须在同一原生事务提交后才返回给应用层。
- 收到配对请求时先在隔离 working copy/candidate session 中解密；用户接受前不得覆盖 active trust/session。拒绝或身份变化必须留下可重放防护状态。
- 数据库存在但 Keystore key、版本或认证标签失效时 fail-closed；统一本地重置必须清理 SQLCipher workspace、生产身份 store、设备签名 key 和开发验收材料，部分失败时不得进入私密导航。

### R3 — 最小配对协调服务

- 在 `server/` 建立独立 NestJS standard application，并用 pnpm workspace 管理；不得让 Nest CLI 重排现有 Expo 根目录。
- 服务使用持久 SQLite repository、显式 migration、prepared statements 和事务；本任务精确锁定依赖版本，禁止 production schema auto-sync。
- 服务端只保存 M2Y-ID、设备/路由标识、设备认证公钥、libsignal 公共 pre-key 材料、不透明配对 packet、状态、过期时间、幂等信息和必要反滥用元数据。
- 服务端不得接收/记录身份私钥、会话密钥、安全号码、显示名、消息明文或可解密关系内容。
- Android Keystore P-256 device-auth key 对规范化 method/path/timestamp/nonce/body hash 签名；服务端验证签名、时钟窗口和 nonce 防重放，不使用手机号/密码账号。
- 所有请求使用严格 DTO validation、body/field 长度上限、幂等 operation ID、速率限制和稳定错误码；日志只允许 request ID、稳定错误码、路由模板、耗时和脱敏计数。
- 本任务服务只负责 identity registration、pre-key lease、pair invitation/request/response/verification/cancel/expiry 和 pairing event polling，不实现普通消息同步。

### R4 — 三种配对入口

- 二维码：目标设备创建 10 分钟有效的一次性 invitation ticket，以 `m2y://pair?...` deep link/QR 展示；扫描权限拒绝时提供手动输入路径。
- M2Y-ID：请求方输入完整 ID，服务端只对精确匹配和已认证、受限速的请求返回通用结果，避免公开目录或批量枚举。
- 握手码：目标设备创建 8 位、分组显示、10 分钟有效、一次消费的随机 code；错误、过期、已消费均返回不泄露目标状态的统一失败语义。
- 三种入口只能决定目标和 pre-key lease，随后必须进入同一个加密 pairing transcript、请求状态机和安全号码核验流程。
- 已有 active relationship 的任一端不能创建第二段关系；本任务不提供解绑以绕过该约束。

### R5 — 双方请求确认与安全号码

- 状态模型至少覆盖：`creatingIdentity`、`registering`、`unpaired`、`outgoingPending`、`incomingReview`、`awaitingSafetyVerification`、`active`、`rejected`、`cancelled`、`expired`、`networkFailed`、`identityChanged`、`recoveryRequired`。
- 发起方可以取消；接收方可以接受或拒绝；服务端过期和网络失败可安全重试且不重复建立关系。
- incoming request 只在 native candidate 解密和严格校验成功后展示对方 M2Y-ID/显示名摘要；未知版本、request binding 不一致或损坏 packet 一律拒绝。
- 双方接受请求后分别显示由 libsignal fingerprint API 得出的同一组格式化安全号码，并提供“号码一致”和“号码不一致”动作。
- 只有双方均明确确认一致且相互验证 packet 已提交，relationship 才进入 `active`；任意不一致、identity replacement 或 packet replay 都 fail-closed。
- 安全号码可以在当前 UI 短暂展示/复制，但不得进入日志、分析、崩溃文本或测试快照。

### R6 — 导航、页面与可访问性

- `SecureWorkspaceGate` 仍是最外层私密数据门；其 `ready` 后再挂载 identity/relationship controller 和 gate。
- identity/relationship gate 必须在状态未 `active` 时阻止 Chat、Space 和 Settings 私密内容挂载，不能只依赖 route redirect。
- 将占位页替换为真实状态页面/组件：创建身份、身份结果、选择配对方式、展示/扫描 QR、输入 M2Y-ID、展示/输入握手码、发出等待、收到请求、拒绝/取消/过期/失败、安全号码、一致/不一致和成功欢迎。
- 页面复用现有 design tokens、motion、keyboard 和 dialog/sheet pattern；表单键盘打开时主要动作仍可见。
- 所有按钮、输入、二维码和状态具有可读 accessibility label；安全状态不能只用颜色表达。
- 升级现有开发安装时不删除既有 SQLCipher 数据；在关系建立前隐藏主页面，关系建立后保留本地内容但不宣称已同步给对方。

### R7 — Typed client/native/server boundaries

- `src/domain` 定义框架无关 identity、pairing state 和 command/result；screen 不直接访问 fetch、SecureStore 或 native module。
- `src/native/crypto` 为生产 API 建立独立 strict decoder；未知字段、未知 enum、过长值或 raw native exception 一律映射为稳定失败。
- `src/data/pairing` 负责规范化请求、device signature、HTTP transport、超时、response decoding 和稳定网络错误，不记录 request body。
- React provider 只发布已由 native store/server 确认的 committed state；不以 optimistic UI 把 pending request 显示为 active。
- pairing poll 使用可取消、前后台感知、带退避的短轮询；推送和通用 sync 留待后续任务。

### R8 — 验证与证据

- Domain/Jest 覆盖状态转换、重复命令、取消/拒绝/过期、号码不一致、active relationship 唯一性和 strict decoder。
- Native JVM/instrumentation 覆盖生产身份生成、P-256 request signing、Keystore 加密 store、candidate isolation、process restart、replay/corrupt/identity-change 拒绝和统一 reset。
- Server 覆盖 migration、签名/nonce/clock validation、限速、M2Y-ID collision、ticket/code expiry、pre-key lease、幂等、唯一关系和日志脱敏。
- 两个独立 Android 安装（至少一台 ARM64 真机，另一端可为 x86_64 模拟器）通过三种入口、双方确认、安全号码一致、重启恢复、拒绝/取消/过期和身份变化验收。
- 本地验收服务可以通过 ADB reverse 暴露给两端；production/preview 仍必须要求 HTTPS 有效域名，开发 HTTP 配置不得泄漏到 production manifest/config。

## Acceptance Criteria

- [ ] 全新 Android 安装在安全工作区就绪后创建并注册真实身份，不采集手机号、邮箱或通讯录。
- [ ] 同一安装在进程重启、强制停止和正常应用重启后保持相同 M2Y-ID、identity public key 和 device-auth public key。
- [ ] 生产 native store、Keystore aliases、DTO 和文件均与 Spike harness 隔离；生产流程不使用 Alice/Bob、runId 或 `_dev/e2ee` 状态。
- [ ] ARM64 真机与第二个独立 Android 安装分别通过 QR、M2Y-ID 和 10 分钟握手码到达同一 incoming request 流程。
- [ ] 发起方取消、接收方拒绝、邀请/请求过期、重复提交、损坏 packet 和 active relationship 冲突均返回稳定结果且不创建关系。
- [ ] 双方必须分别接受请求并确认安全号码一致；两端显示完全一致，任一端选择不一致都会阻断 active。
- [ ] 两端关系在 force-stop/restart 后仍为 active；模拟 identity replacement 会进入高可见 `identityChanged` 并阻断继续信任。
- [ ] 服务数据库和捕获日志中不存在身份私钥、会话密钥、安全号码、显示名、消息明文或原生异常文本。
- [ ] native secret store key 丢失/损坏时应用 fail-closed；二次确认统一重置后 SQLCipher、身份 store、设备签名 key 和验收材料均被清理。
- [ ] Root 与 server 的 format/typecheck/lint/test、依赖边界、Expo config/doctor/export、server build、clean prebuild、x86_64/ARM64 build 和原生测试全部通过。
- [ ] 对目标 Figma 页面/状态完成 Android 截图核对，键盘、相机权限拒绝、Reduce Motion 和读屏标签无阻断问题。
- [ ] 任务归档时更新父任务完成度表和 progress snapshot，明确普通消息同步、附件、恢复、iOS 和独立审计仍未完成。

## Out of Scope

- 普通 Chat/Space 密文 envelope、delivery ACK、通用 outbox/inbox、推送和冲突同步。
- 图片/文件附件加密、头像同步和 100 MB 生产文件格式。
- App PIN、恢复包、受控换机、设备撤销、解绑、删除账号和多设备同时在线。
- iOS、桌面端、公共生产部署、应用商店发布和独立安全审计结论。
- 把 M2Y-ID 描述为网络匿名、把安全号码描述为第三方认证或把本任务描述为完整产品 E2EE 发布。

## Key Decisions

| Decision | Choice | Consequence |
|---|---|---|
| 关系范围 | 单个身份、单台活跃 Android、唯一关系 | 与 P0 顺序一致；换机、多设备和解绑后续实现 |
| 配对服务边界 | 本任务实现最小 identity/pair relay | 三种方式可真机闭环；通用消息同步仍保持独立任务 |
| 服务组织 | `server/` 独立 Nest standard app + pnpm workspace | 不让 Nest monorepo schematic 重排 Expo 根目录 |
| 服务存储 | 精确锁定 `better-sqlite3` + 显式 migration | 当前无 Docker/Postgres 依赖，可做持久双端验收；同步任务前重新评估吞吐/迁移 |
| API 认证 | Android Keystore P-256 请求签名 | 不引入手机号、密码或长期 bearer secret；服务只保存认证公钥 |
| protocol store | native SQLite + per-secret Keystore AES-GCM | 满足同步 libsignal callbacks 与事务提交，避免复用 Spike 全量 AtomicFile checkpoint |
| 请求接收 | candidate store，接受后才成为 active trust | 拒绝/损坏请求不能污染当前身份与关系 |
| 恢复策略 | 本任务仅 fail-closed + 统一销毁重置 | 不伪造恢复；PIN/恢复包在后续安全设置任务实现 |
| 配对轮询 | 前后台感知的短轮询 | 不提前引入推送/通用 sync，同时可完成双端验收 |

## Risks and Deferred Items

- libsignal 第三方 API 不承诺稳定，生产 API 必须继续精确锁定 `0.101.0` 并保留升级回归门禁。
- `better-sqlite3` 是原生 Node 依赖；实施第一门必须验证 Node 24/Windows 安装和 server build，失败时回到数据库选型，不用内存存储冒充持久服务。
- 本地两端验收证明协议与产品闭环，不等于互联网部署、抗 DDoS、隐私政策或独立安全审计完成。
- 没有恢复包时，身份 store 丢失只能销毁本机状态；UI 必须在创建前明确说明。
