# Frontend Type Safety

## Scenario: Strict Types Across Domain, Application, and UI

### 1. Scope / Trigger

- Trigger: declaring or changing a domain entity, an application port, a command/event/result union,
  or any prop type consumed by `app/**` or `src/features/**`.
- Applies to the Expo client only. Server types follow
  [Server Foundation](../backend/server-foundation.md); the two packages compile under separate
  `tsconfig` files and share no types.

### 2. Signatures

```text
src/domain/<area>/types.ts          -> entities, value unions, state/command/event unions
src/domain/<area>/state-machine.ts  -> pure transitions over those unions
src/application/<area>/contracts.ts -> port interfaces + snapshot/command/result types
src/features/**, app/**             -> consume the above; declare props locally, export no new entities
```

Client `tsconfig.json` compiler options that types must satisfy:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noFallthroughCasesInSwitch": true,
  "noImplicitReturns": true,
  "paths": { "@/*": ["./src/*"], "@/assets/*": ["./assets/*"] }
}
```

### 3. Contracts

- Data shapes are `Readonly<{ ... }>` type aliases. `interface` is reserved for ports that expose
  methods, and every current one lives in `src/application/*/contracts.ts` (`WorkspaceSession`,
  `DatabaseKeyStore`, `EncryptedDatabaseManager`, `DatabaseKeyGenerator`, `LocalCryptoDataResetter`,
  `SecureWorkspaceController`).
- Collections are `readonly T[]`. Fixed-arity data uses a tuple, as in
  `SafetyNumberDisplay.groups: readonly [string, string, string, string, string, string]`.
- Enumerable domain values are declared once as an `as const` array and the union is derived from it:
  `export const sharedItemKinds = [...] as const` then
  `export type SharedItemKind = (typeof sharedItemKinds)[number]`. Never restate the members in a
  second union, and never use a TypeScript `enum` — the codebase has none.
- Variant types are discriminated unions. The discriminant is `status` for machine state, `type` for
  commands / events / mutations, and `ok` for command results.
- Expected failures are values, not exceptions: `CommandResult` returns
  `{ ok: false; reason: 'blank-title' | 'item-not-found' | ... }`. Do not add an `Error` subclass or
  throw to signal a rejected command.
- Derive narrowed variants with `Extract` / `Exclude` instead of redeclaring them — see
  `WorkspaceDecision` in `src/application/workspace/contracts.ts`.
- Type-only imports use `import type`, and cross-layer imports use the `@/*` alias
  (`import type { Message } from '@/domain/message/types'`), never a deep relative path.
- Optional properties are declared with `?` and, because `exactOptionalPropertyTypes` is on, must be
  omitted rather than set to `undefined`.
- `any` is absent from `app/**` and `src/**`; keep it that way. Use `unknown` plus a narrowing check
  at the boundary where a value genuinely arrives untyped.
- Non-null assertions (`!`) appear only in the dev-only harness under `src/testing/e2ee/`. Do not
  introduce them in `app/**`, `src/features/**`, `src/application/**`, or `src/domain/**`.
- `src/domain/**` and `src/application/**` must not import react / react-native / expo / @shopify or
  any outer directory; `pnpm deps:check` enforces this, so types cannot depend on framework types.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Indexed read such as `items[i]` | Treat as possibly `undefined` and narrow; `noUncheckedIndexedAccess` will not let it through |
| A new member is added to an `as const` value list | Every `switch` over the derived union fails to compile until handled |
| A `switch` over a discriminated union misses a case | `noImplicitReturns` / `noFallthroughCasesInSwitch` surface it at compile time |
| An optional prop is passed as an explicit `undefined` | Rejected by `exactOptionalPropertyTypes`; omit the property |
| A UI file wants to export a new entity type | Move the type to `src/domain/<area>/types.ts` and import it |
| `.expo/types/router.d.ts` is missing | `Href` degrades to a loose type and route typos stop failing — run `pnpm exec expo customize tsconfig.json` before `pnpm typecheck` |
| A port needs a new method | Extend the `interface` in `src/application/<area>/contracts.ts`, not the calling component |

### 5. Good / Base / Bad Cases

- Good: a command union gains a variant, the reducer's `switch` fails to compile, and the missing
  transition plus its test are added in the same change.
- Base: a screen imports `SharedItemStatus` and renders one branch per member without a default case
  that silently swallows unknown values.
- Bad: widening a field to `string` to make a call site compile, casting with `as`, adding a parallel
  union of the same members, or exporting an entity type from a component file.
### 6. Tests Required

- A state or command union change is covered by the matching pure test next to it
  (`src/domain/identity/state-machine.test.ts`, `src/application/workspace/decide-command.test.ts`,
  `src/application/secure-workspace/reducer.test.ts`).
- Assert both branches of a result union: the `ok: true` payload and each `reason` a caller can act
  on. A type alone is not evidence the branch is reachable.
- Run `pnpm exec expo customize tsconfig.json` then `pnpm typecheck`, plus `pnpm lint` and
  `pnpm deps:check`, before reporting a type change as done.

### 7. Wrong vs Correct

#### Wrong

```typescript
export interface SharedItem {
  id: string;
  kind: 'task' | 'note' | 'file' | 'agreement' | 'event';
  status: string;
  sourceMessageId: string | undefined;
}

const first = items[0];
first.title.trim();
```

#### Correct

```typescript
export const sharedItemKinds = ['task', 'note', 'file', 'agreement', 'event'] as const;
export type SharedItemKind = (typeof sharedItemKinds)[number];

export type SharedItem = Readonly<{
  id: string;
  kind: SharedItemKind;
  status: SharedItemStatus;
  sourceMessageId?: string;
}>;

const first = items[0];
if (first) {
  first.title.trim();
}
```

## Common Mistakes

- Restating an `as const` list as a hand-written union, so the two drift apart.
- Reaching for `interface` for plain data because it looks familiar; that loses the `Readonly` intent
  the rest of the codebase relies on.
- Adding `| undefined` to an optional property instead of omitting it, which fights
  `exactOptionalPropertyTypes` rather than satisfying it.
- Running `pnpm typecheck` on a fresh clone and trusting a pass that never validated routes, because
  `.expo/types/` had not been generated yet.


