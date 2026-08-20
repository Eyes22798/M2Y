# Frontend State Management

## Scenario: Committed Local Workspace Session

### 1. Scope / Trigger

- Trigger: changing Chat/Space shared state, workspace commands, encrypted SQLite persistence, or
  the secure workspace provider boundary.
- Runtime messages and shared items live in one `WorkspaceSession`. React owns only the latest
  committed snapshot; SQLite owns durable truth.
- Screen-local drafts, filters, pending dialog visibility, and command feedback remain component
  state.

### 2. Signatures

```typescript
type WorkspaceCommandOutcome = Readonly<{
  result: CommandResult;
  snapshot: WorkspaceSnapshot;
}>;

interface WorkspaceSession {
  readonly initialSnapshot: WorkspaceSnapshot;
  execute(command: WorkspaceCommand): Promise<WorkspaceCommandOutcome>;
  loadSnapshot(): Promise<WorkspaceSnapshot>;
  close(): Promise<void>;
}

type WorkspaceCommands = Readonly<{
  sendMessage(body: string): Promise<CommandResult>;
  saveMessageToSpace(input: SaveMessageInput): Promise<CommandResult>;
  updateSharedItem(input: UpdateSharedItemInput): Promise<CommandResult>;
  changeSharedItemStatus(itemId: string, status: SharedItemStatus): Promise<CommandResult>;
  deleteSharedItem(itemId: string): Promise<CommandResult>;
}>;
```

`WorkspaceProvider(session)` exposes `{ state, commands, busy }` through `useWorkspace()`.
`SecureWorkspaceGate` mounts that provider only when the secure controller is `ready`.

### 3. Contracts

- `decideWorkspaceCommand(snapshot, command, context)` is the framework-free source of validation
  and returns either one typed mutation or one typed business failure.
- The SQLite session serializes commands and close requests. A command transaction performs
  `load -> decide -> mutate -> reload`; the provider updates React state only from its returned
  committed snapshot.
- SQLCipher write transactions must execute `BEGIN IMMEDIATE`, all reads/writes, and
  `COMMIT`/`ROLLBACK` on the same already-keyed `SQLiteDatabase` connection. Do not use Expo
  SQLite's `withExclusiveTransactionAsync` here because it creates another connection that has not
  received this session's `PRAGMA key`.
- A transaction/write failure returns `write-failed` with the session's last committed snapshot.
  A command after close is requested returns `storage-unavailable`.
- `savedItemIds` is projected from `shared_items.source_message_id`; it is not persisted as a second
  mutable JSON value.
- The in-memory session under `src/testing` uses the same planner and projection semantics. It is a
  test boundary, not a production plaintext fallback.
- Store modules import application contracts, not concrete SQLite, SecureStore, native random, or
  feature modules. Runtime adapter composition remains in `src/bootstrap`.
- Message bodies and shared-item contents must never be logged or placed in error strings or test
  snapshots.

### 4. Validation & Error Matrix

| Condition | Result and state behavior |
|---|---|
| Blank message body | `blank-message`; committed snapshot unchanged |
| Blank shared-item title | `blank-title`; committed snapshot unchanged |
| Unknown source message | `message-not-found`; no transaction mutation |
| Duplicate source message and kind | `duplicate-item` with `existingItemId`; no duplicate row |
| Unknown item for edit/status/delete | `item-not-found`; committed snapshot unchanged |
| SQLite mutation throws or changes zero/multiple rows | `write-failed`; React keeps last committed snapshot |
| Session close already requested | `storage-unavailable`; no new transaction starts |
| Snapshot row contains an unknown enum or orphan relation | secure boot fails closed as `data-corrupt` |

### 5. Good / Base / Bad Cases

- Good: Chat and Space render the same committed snapshot and await typed async commands.
- Good: editing title, detail, and status is one command and one database transaction.
- Base: form drafts and filter selections remain local component state.
- Bad: dispatching an optimistic React update before SQLite commits.
- Bad: mounting a plaintext/in-memory workspace in production when SQLCipher fails.
- Bad: duplicating blank/duplicate/unknown-ID validation in feature screens or adapters.

### 6. Tests Required

- Planner unit tests assert blank, duplicate, unknown-ID, edit, status, delete, and relation cleanup
  behavior without React or Expo imports.
- SQLite session tests assert transaction failure returns `write-failed` and the exact last committed
  snapshot; commands after close return `storage-unavailable`.
- Row-decoder tests assert source relation projection and fail-closed handling of unknown/corrupt
  rows.
- Provider/flow tests await commands and assert Chat, Save to Space, Space, detail edit, and delete
  observe one shared snapshot without React `act` warnings.
- Secure gate tests assert private workspace children are not mounted before `ready`.
- Native Android acceptance, not Jest mocks, proves SQLCipher correct-key reopen and wrong-key
  rejection.

### 7. Wrong vs Correct

#### Wrong

```typescript
setMessages((current) => [...current, optimisticMessage]);
void database.insertMessage(optimisticMessage);
```

This can expose data the database rejected and leaves Chat and Space inconsistent after restart.

#### Correct

```typescript
const outcome = await session.execute({ type: 'send-message', body });
setState(outcome.snapshot);
return outcome.result;
```

Only the snapshot returned after the serialized transaction is visible to React.

## State Categories

- Component state: form drafts, selected filters, temporary dialog visibility, and redacted command
  feedback.
- Secure boot state: controller-owned checking/setup/locked/opening/ready/recovery/fatal state mirrored
  by `SecureWorkspaceProvider`.
- Persistent workspace state: last committed `WorkspaceSnapshot` owned by `WorkspaceProvider` and
  backed by the ready `WorkspaceSession`.
- Server/sync state: not implemented; add a separately specified repository/sync boundary rather
  than extending local component state.

## Common Mistakes

- Do not mirror shared items into screen-local arrays.
- Do not expose the workspace provider above the secure `ready` gate.
- Do not update provider state from a planned mutation; use the committed snapshot returned by the
  session.
- Do not treat the test-only in-memory session as evidence of persistence or encryption.
- Do not log message bodies or shared-item details while debugging state transitions.
- Do not move SQLCipher session work into an Expo transaction helper that opens a new connection;
  encryption keys are connection-local.
