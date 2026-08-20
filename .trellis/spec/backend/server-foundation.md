# Pairing Service Foundation

## Scenario: Independent NestJS workspace with persistent SQLite

### 1. Scope / Trigger

- Trigger: adding a server route, service, persistence adapter, migration, log field, dependency, bootstrap concern, or server-side test.
- The Expo app remains the repository-root package. The server is the independent `@m2y/server` standard Nest application under `server/`, registered through `pnpm-workspace.yaml`.
- Do not convert the repository to a Nest monorepo or relocate Expo `app/`, `src/`, or native modules.

### 2. Signatures

```text
pnpm-workspace.yaml                 -> packages: [server]
server/src/bootstrap/**             -> environment and process composition
server/src/<feature>/**             -> controller, DTO, application/domain logic
server/src/persistence/**           -> SQLite connection, migrations, repositories
server/src/observability/**         -> redacted logging/metrics boundaries
server/test/**/*.e2e.spec.ts        -> HTTP composition tests

M2Y_SERVER_HOST=<bind-host>
M2Y_SERVER_PORT=<1..65535>
M2Y_SERVER_DATABASE_PATH=<durable-file-path>

DatabaseService.onModuleInit()         -> open, PRAGMA, migrate, verify version
DatabaseService.onApplicationShutdown() -> close connection
MIGRATIONS: readonly { version, sql }[]
```

Quality commands:

```powershell
pnpm install --frozen-lockfile
pnpm server:format:check
pnpm server:typecheck
pnpm server:lint
pnpm server:test
pnpm server:build
```

### 3. Contracts

- Runtime is Node major 24 with `pnpm@10.33.0`; production server dependencies are exact-pinned.
- Server TypeScript uses strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, decorators, Node16 module resolution, and Node 24 types.
- Controllers validate HTTP input and call feature services. They do not issue SQL, read `process.env`, or serialize native/client implementation objects.
- The pairing service uses exact-pinned `better-sqlite3` with a durable file. `:memory:` is allowed only in tests; production schema auto-sync and in-memory fallback are forbidden.
- Apply foreign keys, WAL journaling, and a bounded busy timeout before serving requests. Each migration and version insert executes in one SQLite transaction.
- Repositories use prepared statements and return typed projections instead of raw rows.
- Root `.npmrc` keeps the hoisted linker required by Android builds. Native addons must be explicitly listed in root `pnpm.onlyBuiltDependencies`; never approve all ignored scripts.
- `RedactedLogger` never forwards the raw Nest message, object, or stack. Logs may contain a route template, stable error code, timing, schema version, and redacted counts only.
- Logs must not contain M2Y-ID input, display name, auth signature, key material, opaque packet, safety number, message content, token, nonce, raw URL/query, header, body, or exception text.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Server code enters root Expo TypeScript compilation | Exclude `server`; validate with the server's own config |
| Environment port/path is malformed | Abort startup with a stable config code |
| Database directory is absent | Create the exact parent, then open the file |
| Migration SQL/version insert fails | Roll back migration and abort startup |
| Applied version differs from `LATEST_SCHEMA_VERSION` | Abort with `database-schema-version-mismatch` |
| Foreign-key target is absent | SQLite rejects the write; repository maps a stable error |
| pnpm ignores the `better-sqlite3` build | Allow only that package, rebuild, and run real SQLite tests |
| Native addon fails on Node 24/Windows | Stop and replan; do not bypass persistence |
| Logger receives a secret-bearing error/object | Emit stable structured metadata only |
| Lint/type/test emits warnings | Treat the gate as unclean and fix the cause |

### 5. Good/Base/Bad Cases

- Good: a controller passes a strict DTO to a service; one repository transaction changes durable state; logs contain only its stable result code.
- Base: health reads the migration version without exposing a file path or row content.
- Bad: a route opens SQLite, logs a DTO/exception, uses a process-local map, or lets an ORM auto-create production schema.
- Bad: `pnpm approve-builds --all`, floating server versions, or a test-only fake presented as persistence evidence.

### 6. Tests Required

- Configuration tests cover defaults, bounds, malformed input, and test-only `:memory:`.
- Open a real temporary file, migrate, write through a repository, close, reopen, and assert both data and schema version persist.
- Assert migration idempotency and foreign-key enforcement.
- Inject a log capture sink and prove raw messages/stacks and sensitive fixtures are absent.
- Every HTTP route family gets a real Nest e2e test.
- A built process must start, open a durable SQLite file, and return the expected health schema version.
- Run root format/type/lint/dependency/test/config gates after workspace changes.

### 7. Wrong vs Correct

#### Wrong

```typescript
@Post()
create(@Body() body: unknown) {
  console.error(body);
  return new Map().set('request', body);
}
```

```powershell
pnpm approve-builds --all
```

#### Correct

```typescript
@Post()
create(@Body() input: CreateIdentityDto) {
  return this.identityService.create(input);
}
```

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
}
```
