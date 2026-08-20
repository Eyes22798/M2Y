# Android 安全与数据基础技术设计

## 1. Design Objective and Security Boundary

本阶段把现有内存版 Chat/Space 工作区替换为 Android 原生 SQLCipher 持久化，并用系统保护的 SecureStore 保存数据库主密钥。实现只承诺“当前 Android 安装实例上的加密本地数据库与可选设备认证门槛”。

明确不承诺：M2Y-ID、身份密钥、E2EE、StrongBox、跨设备恢复、卸载后恢复、密钥可导出、JS 内存可靠清零。SQLCipher key 会短暂进入 JavaScript 运行时以完成连接配置；应用只能缩短持有时间、关闭连接并丢弃引用，不能把它描述为硬件内全程不可见。

Android 是唯一启用真实持久化的产品路径。iOS/Web 在本任务中显示诚实的 unsupported 状态；测试通过依赖注入使用 fake runtime，不回退到“看似成功但未加密”的存储。

## 2. Layering and File Shape

```text
app/
├── _layout.tsx                         -> 只组合 AppProviders 与路由
└── _dev/storage.tsx                    -> __DEV__ 下的 Android 原生存储验收页

src/
├── application/
│   ├── secure-workspace/
│   │   ├── contracts.ts                -> 启动状态、端口、稳定错误码
│   │   ├── reducer.ts                  -> 穷举状态转换，无 Expo import
│   │   └── controller.ts               -> inspect/setup/unlock/reset 编排
│   └── workspace/
│       ├── contracts.ts                -> command/query/repository 契约
│       └── decide-command.ts            -> 纯校验与 mutation planning
├── data/
│   ├── secure-store/
│   │   └── ExpoDatabaseKeyStore.ts      -> SecureStore 适配器
│   └── sqlite/
│       ├── SqlCipherDatabase.ts         -> open/key/verify/migrate/close/delete
│       ├── migrations.ts                -> user_version v1
│       ├── schema-v1.ts                 -> 受控静态 SQL
│       └── SqliteWorkspaceRepository.ts -> repository + transaction adapter
├── native/
│   └── random/
│       └── ExpoSecureRandom.ts          -> expo-crypto async RNG / UUID
├── stores/
│   └── workspace/
│       └── WorkspaceProvider.tsx        -> 已提交 snapshot + async commands
├── features/
│   └── secure-workspace/                -> setup/lock/recovery/fatal UI gate
└── bootstrap/
    ├── createAppRuntime.ts              -> 仅构造对象，不执行 I/O
    └── AppProviders.tsx                 -> provider/gate 组合
```

依赖方向固定为：`route/feature -> store/application contracts -> data/native adapters`。`domain` 与 `application` 不导入 React Native、Expo SQLite、SecureStore 或 UI；feature 不直接触达外层适配器。实施时在 `.dependency-cruiser.cjs` 增加 application/data/native 的正向约束，防止边界只存在于文档。

## 3. Core Contracts and Signatures

### 3.1 Secure boot state

```ts
type ProtectionMode = 'device' | 'strong-biometric';

type SecureWorkspaceState =
  | { status: 'checking' }
  | { status: 'setupRequired'; strongBiometricAvailable: boolean }
  | { status: 'locked'; mode: 'strong-biometric'; reason?: UnlockFailureCode }
  | { status: 'opening'; mode: ProtectionMode }
  | { status: 'ready'; mode: ProtectionMode; session: WorkspaceSession }
  | { status: 'recoveryRequired'; reason: RecoveryReason }
  | { status: 'fatal'; code: FatalStorageCode; retryable: boolean };

interface SecureWorkspaceController {
  inspect(): Promise<void>;
  setup(mode: ProtectionMode): Promise<void>;
  unlock(): Promise<void>;
  resetLocalData(): Promise<void>;
  retry(): Promise<void>;
  handleAppBackground(): Promise<void>;
}
```

状态 payload 不含 key、数据库路径、原生异常正文或消息内容。所有公开 action 串行化；同一时间只允许一个 inspect/setup/unlock/reset I/O 流程，重复点击返回当前 promise 或被 UI busy 状态拒绝。

### 3.2 Key-store and database ports

```ts
type KeyEnvelopeV1 = Readonly<{
  version: 1;
  databaseName: 'm2y-workspace-v1.db';
  protection: ProtectionMode;
  lifecycle: 'provisioning' | 'ready';
}>;

interface DatabaseKeyStore {
  readEnvelope(): Promise<KeyEnvelopeReadResult>;
  writeEnvelope(value: KeyEnvelopeV1): Promise<void>;
  readKey(mode: ProtectionMode): Promise<KeyReadResult>;
  writeKey(mode: ProtectionMode, hexKey: DatabaseHexKey): Promise<void>;
  deleteKey(): Promise<void>;
  deleteEnvelope(): Promise<void>;
  canUseStrongBiometric(): Promise<boolean>;
}

interface EncryptedDatabaseManager {
  databaseExists(): boolean;
  open(hexKey: DatabaseHexKey): Promise<WorkspaceSession>;
  deleteDatabase(): Promise<void>;
}
```

`DatabaseHexKey` 只能由验证函数构造：32 个异步原生随机字节编码成 64 位小写 hex，并满足 `^[0-9a-f]{64}$`。SQLCipher 的 raw-key pragma 只能由该品牌类型生成固定格式：`PRAGMA key = "x'<hex>'"`。任何用户输入、envelope 字段或异常文本都不能进入 SQL。

### 3.3 Workspace command boundary

```ts
type WorkspaceCommand =
  | { type: 'sendMessage'; body: string }
  | { type: 'saveMessageToSpace'; messageId: string; kind: PreviewSharedItemKind; title: string; detail: string }
  | { type: 'updateSharedItem'; itemId: string; title: string; detail: string }
  | { type: 'changeSharedItemStatus'; itemId: string; status: SharedItemStatus }
  | { type: 'deleteSharedItem'; itemId: string };

type WorkspaceCommandOutcome = Readonly<{
  result: CommandResult;
  snapshot: WorkspaceSnapshot;
}>;

interface WorkspaceSession {
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  execute(command: WorkspaceCommand): Promise<WorkspaceCommandOutcome>;
  close(): Promise<void>;
}
```

`CommandResult` 保留现有业务失败码，并增加不携带原生异常的 `storage-unavailable | write-failed`。UI command 全部变为 `Promise<CommandResult>`，提交按钮在 pending 时禁用。只有数据库 transaction 成功后返回的新 snapshot 才进入 React state；失败时 UI 不做乐观写入。

业务校验集中在纯函数 `decideWorkspaceCommand(snapshot, command, context)`，输出 typed failure 或一项受控 `WorkspaceMutation`。SQLite adapter 在同一条已经执行过 `PRAGMA key` 的连接上用 `BEGIN IMMEDIATE` 开启 transaction，读取 snapshot、调用 planner、应用 mutation、重读 committed snapshot，再 `COMMIT`；组件、repository 和测试 fake 不复制空值/重复项/未知 ID 规则。禁止使用 Expo SQLite 的 `withExclusiveTransactionAsync`，因为它会为 transaction 新建一条尚未设置 SQLCipher key 的连接。

## 4. Key Lifecycle and Boot Decision Matrix

非秘密 envelope 与认证绑定的 key 使用独立、稳定、版本化名称。envelope 先写 `provisioning`，key 写入后才创建/迁移/seed 数据库，最后把 envelope 改成 `ready`。中途崩溃不会被解释为成功。

| Envelope | DB file | Key read | Result |
|---|---:|---|---|
| absent | absent | 不读取 | `setupRequired`；setup 前清理同名孤儿 key，失败则 fatal |
| ready/device | present | present | `opening` -> verify/migrate -> `ready` |
| ready/strong-biometric | present | 尚未读取 | `locked`；用户触发后由 SecureStore 执行认证读取 |
| ready | present | missing/invalidated | `recoveryRequired` |
| ready | absent | 任意 | `recoveryRequired` |
| absent | present | 不读取 | `recoveryRequired` |
| provisioning | 任意 | 任意 | `recoveryRequired` |
| malformed/unsupported envelope | 任意 | 不读取 | `recoveryRequired(envelope-invalid)`；仅允许二次确认销毁，不静默初始化 |

初始化顺序：写 provisioning envelope -> 写 key -> open/key/verify -> migrate -> 创建 installation profile 与一次性 demo seed -> 写 ready envelope -> 暴露 session。

销毁恢复顺序：阻断私密导航 -> close session -> `SQLite.deleteDatabaseAsync` 删除数据库及 sidecar -> 删除 key -> 删除 envelope -> 回到 `setupRequired`。任一步失败都保持不可进入私密导航的错误状态，允许重试剩余步骤，绝不在失败后自动创建空库。

强生物识别模式不额外调用一次 LocalAuthentication 再读取 key，避免双重认证；由 `SecureStore.getItemAsync(... requireAuthentication: true)` 直接绑定密钥访问。App 进入 Android background 时关闭 session、丢弃 key 引用并回到 `locked`；device 模式不宣称 app lock。生物识别变更导致返回 null 时进入恢复页。

## 5. SQLCipher Open, Schema, and Migration

### 5.1 Connection sequence

1. `SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true })`。
2. 第一条操作是由已验证 key 构造的 raw-key pragma。
3. 立即执行 `SELECT count(*) FROM sqlite_master`；错误 key/损坏库在这里映射为稳定 recovery reason。
4. 读取 `PRAGMA cipher_version`，Android 原生验收必须得到非空版本；若当前库支持 `cipher_status`，值必须为 `1`。
5. 启用 `PRAGMA foreign_keys = ON`，读取 `user_version`，在当前已解密连接上用 `BEGIN IMMEDIATE` / `COMMIT` 执行单调 migration；失败时在同一连接上 `ROLLBACK`。
6. migration/首次创建后运行 `cipher_integrity_check`；正常每次启动不做全库 HMAC 扫描。
7. 任一失败先关闭 handle；不把 key、SQL 参数、路径或底层异常正文上抛给 UI/log。

### 5.2 Schema v1

```sql
installation_profile(
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  installation_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at_ms INTEGER NOT NULL
)

messages(
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL CHECK(author IN ('self', 'other')),
  body TEXT NOT NULL CHECK(length(trim(body)) > 0),
  created_at_ms INTEGER NOT NULL
)

shared_items(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('note', 'task', 'agreement')),
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  detail TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'waiting', 'done', 'confirmed', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  updated_at_ms INTEGER NOT NULL
)
```

增加 `(created_at_ms, id)`、`(updated_at_ms, id)` 排序索引，以及 `source_message_id + kind` 的非空 partial unique index。`Message.savedItemIds` 不落重复 JSON；加载 snapshot 时由 `shared_items.source_message_id` 投影。domain 从展示文案字段迁移为 `createdAtMs/updatedAtMs`，feature presenter 负责 `HH:mm/刚刚` 等显示，fixture 使用固定 epoch 保持测试确定性。

runtime ID 使用安全 UUID 并保留不透明字符串类型，不再持久化 `nextMessageSequence/nextItemSequence`。installation ID 只存在加密库，不展示为 M2Y-ID。

首次 seed 与 installation profile 在同一已解密连接的 write transaction 中执行，且只在 profile、messages、shared_items 全部为空时发生。出现“有数据但无 profile”的不一致时 fail-closed，不覆盖已有内容。

## 6. Provider Composition and UI Flow

```text
GestureHandlerRootView
  -> KeyboardProvider
    -> SafeAreaProvider
      -> SecureWorkspaceProvider
        -> SecureWorkspaceGate
          -> checking/opening: neutral progress
          -> setupRequired: local encryption explanation + protection choice
          -> locked: explicit unlock action
          -> recoveryRequired: explanation + two-step destructive confirm
          -> fatal: redacted error + retry/support text
          -> ready: WorkspaceProvider(session) -> app routes
```

`createAppRuntime` 只构造 adapters/controller，不读取 SecureStore、不打开数据库。`SecureWorkspaceProvider` 的 mount effect 调用一次 `inspect()`；React Strict Mode 重入由 controller 的 in-flight promise 和 state transition guard 吸收。

`WorkspaceSession` 自身串行化 command/close。strong-biometric 模式进入 background 时，close 会先等待正在提交的 transaction 结束，再关闭 handle 并转入 `locked`；不得在 transaction 中途关闭连接，也不得让 background relock 与 reset 并发删除同一数据库。

setup 文案必须说明：数据只在本机、卸载/系统密钥失效后无法恢复、强生物识别是本机访问门槛而非 M2Y 身份。恢复页的危险按钮先打开现有 ConfirmDialog，再要求明确“删除本机数据”确认；按钮 busy 期间不可重复触发。

## 7. Error Contract and Examples

| Scenario | State/result | User-visible behavior |
|---|---|---|
| SecureStore 暂时读取失败 | `fatal(storage-unavailable, retryable)` | 不挂载主导航，提供重试 |
| 用户取消生物识别 | `locked(authentication-cancelled)` | 留在锁屏，可再次解锁 |
| 生物识别锁定/不可用 | `locked(authentication-unavailable)` | 说明使用系统设置恢复，不 fail-open |
| 已有 DB 但 key 返回 null | `recoveryRequired(key-missing-or-invalidated)` | 仅解释与二次确认销毁 |
| key 错误导致 schema read 失败 | `recoveryRequired(database-unreadable)` | 不创建同名空库 |
| migration 失败 | `fatal(migration-failed, retryable)` | 关闭连接，保留原库，允许重试 |
| command transaction 失败 | `{ok:false, reason:'write-failed'}` | 保持上次 committed snapshot |
| snapshot 行含未知 enum/corrupt data | `fatal(data-corrupt)` | 不丢弃未知行、不部分渲染 |

错误做法：捕获 key read 异常后生成新 key，再以同名路径打开数据库。这样可能把旧数据库误判为空库并永久失去恢复判断依据。

正确做法：先记录 envelope/DB file 的独立状态；任何已有初始化痕迹与 key 缺失/验证失败的组合都进入 `recoveryRequired`，只有用户二次确认后才删除。

错误做法：command 先 dispatch 到 React，再异步写库。写入失败会让 UI 与持久状态分叉。

正确做法：transaction 提交后返回完整 committed snapshot，再单次更新 provider state。

## 8. Test and Acceptance Strategy

- Pure Jest tests：secure reducer 全状态转换、组合矩阵、并发 action guard、command planner、timestamp presenter、unknown enum/row decoder。
- Adapter contract tests：使用 fake SecureStore/file/database 验证首次 setup、中途崩溃、missing key、认证取消、reset 每一步失败与重试；断言错误对象和 snapshot 不含敏感值。
- Repository tests：参数化 SQL、重复 migration、唯一约束、command rollback、source relation projection、一次性 seed。Jest 中不把 mock SQLite 成功当作 SQLCipher 证据。
- Android 原生 dev-only harness：在随机临时数据库上验证 `cipher_version`、正确 key reopen、错误 key 无法读取、migration 幂等、integrity check、delete 后文件消失。报告只显示 pass/fail code，完成后清理数据库与 key。
- UI tests：setup、locked、recovery 二次确认、fatal retry；Chat/Space 现有 flow 改为 await async commands 并覆盖 pending/失败。
- Android 模拟器：功能与持久化回归。物理 Android：强生物识别 set/get、取消、background relock、biometric invalidation 能力边界；未完成物理机验收前不得声称认证绑定已发布验证。

## 9. Compatibility, Rollout, and Rollback

- 旧版本只有内存数据，不存在可迁移用户历史；首次加密库直接建立 schema v1 并一次性 seed。
- `app.config.ts` 设置 `android.allowBackup: false`，并同步 SecureStore config plugin 与 config-check 断言；重新 prebuild 验证 manifest，而不是手改 `android/` 业务配置。
- 本任务不修改 FTS 内容索引，不创建 sync/outbox/E2EE 表。后续 schema 必须新增 user_version migration，禁止重写 v1。
- 实施按“纯 contracts -> key/storage adapters -> SQLCipher/session -> gate -> feature async integration”分段。每段都能回退到前一个编译通过点；在持久 provider 完整可用前不删除旧 reducer fixture。
- 若原生 SQLCipher 验收失败，回滚到不挂载私密主导航的 fatal/unsupported 状态；绝不回退为明文 SQLite 或静默内存模式。
