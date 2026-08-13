# Frontend Directory Structure

## Scenario: Expo Router and Application-Layer Boundaries

### 1. Scope / Trigger

- Trigger: adding or moving routes, root providers, feature screens, or native/data/sync boundaries in the M2Y client.
- Expo Router routes live only in the repository-root `app/` directory.
- Do not create `src/app/`, including an empty directory. Expo Router prefers `src/app/` when it exists and will silently shadow root `app/`, producing empty/stale typed routes.

### 2. Signatures

```text
app/**/*.tsx                     -> route composition only
src/bootstrap/AppProviders.tsx   -> root native providers
src/features/**/screens/*.tsx    -> user-facing screens/use cases
src/domain/**/*.ts               -> framework-free contracts
src/{data,native,sync}/**         -> outer implementation boundaries
```

Routes import a feature screen and export it; routes do not call storage, crypto, or sync implementations directly.

### 3. Contracts

- TypeScript alias: `@/*` resolves to `./src/*`.
- Router root: `./app`.
- Root provider order: `GestureHandlerRootView -> KeyboardProvider -> SafeAreaProvider -> route content`.
- `src/domain` imports no React, Expo, data, native, sync, feature, or testing code.
- `src/bootstrap` owns providers/lifecycle but does not initialize SQLite, cryptography, or sync merely because React rendered.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| `src/app/` exists | Fail review; remove or rename it to `src/bootstrap/` |
| Route imports `src/data`, `src/native`, or `src/sync` | `pnpm deps:check` fails |
| Domain imports React/Expo/outer layer | `pnpm deps:check` fails |
| New route is absent from generated typed routes | Start Expo/type generation, then inspect route-root collision before casting href |

### 5. Good/Base/Bad Cases

- Good: `app/(main)/chat/index.tsx` exports `ChatScreen` from `src/features/chat/screens`.
- Base: a route-owned redirect or layout can remain in `app/`.
- Bad: `src/app/AppProviders.tsx`; even a non-route file under that directory changes Router root selection.

### 6. Tests Required

- `pnpm typecheck` proves typed route strings match the route tree.
- `pnpm deps:check` proves route/domain boundaries and absence of cycles.
- `AppProviders.test.tsx` proves children mount through the provider chain.
- `pnpm exec expo export --platform android` proves Metro resolves the selected route root.

### 7. Wrong vs Correct

#### Wrong

```text
app/(main)/chat/index.tsx
src/bootstrap/AppProviders.tsx
```

#### Correct

```text
app/(main)/chat/index.tsx
src/bootstrap/AppProviders.tsx
```

The second shape keeps the intended root `app/` authoritative.

## Naming

- Route group and feature directory names use kebab-case.
- React component files use PascalCase.
- Pure contract/token/helper files use kebab-case or a concise lowercase noun matching the exported concept.
- README boundary files are allowed in implementation directories that are intentionally deferred.
