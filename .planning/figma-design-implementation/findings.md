# Findings

- Repository is a single-package React Native project with TypeScript UI screens under `src/features`.
- Existing design tokens and primitives live under `src/design`.
- No Figma URL, file key, or node ID was found in the repository.
- Figma's design-context API requires a concrete file key and node ID; guessing is prohibited by the design-to-code workflow.
- The provided Figma file uses `1GFOX8WVTlTTUzujDtriym` / page node `1:2`; its usable content is flattened under frame `1:3419`.
- The design resolves to four MVP pages (Chat, Space, Shared Item Detail, Settings), two overlay types, and reusable empty/error states; the remaining screens are variants or deferred security/sync flows.
- The approved task artifacts live in `.trellis/tasks/08-13-figma-mvp-basic-functionality/`.
- Implementation must remain an in-memory preview and must not claim persistence, sync, pairing, or E2EE.
- On Android, `KeyboardProvider` plus `tabBarHideOnKeyboard` does not keep a fixed composer or sheet footer above the IME. Fixed-bottom surfaces require `react-native-keyboard-controller`'s `KeyboardAvoidingView`; scrollable forms require `KeyboardAwareScrollView` and device/emulator verification with the IME open.
- The local Android SDK provides an API 37.1 Google APIs 16 KB image. A reusable `M2Y_API_37_1_16K` AVD now exists for Android-first regression checks.
- Cross-session Trellis memory confirms the agreed post-MVP order: local identity and encrypted data foundation first; pairing/E2EE and sync second; richer message/file/business states and additional pages only after those contracts are real.
- The completed Figma MVP task is still the active Trellis task and its worktree changes are not committed. P1 planning may inspect evidence, but P1 product code must not be mixed into that dirty task.
- The repository already declares `expo-secure-store`, `expo-sqlite`, and `expo-local-authentication`, but the native crypto and secure-storage directories are contract-only README boundaries. Identity, pairing, and safety-number routes still render one shared placeholder screen.
- Existing architecture rules prohibit bootstrap-time database/crypto initialization, TypeScript placeholder cryptography, and sensitive plaintext/keys/safety numbers in diagnostics. P1 must preserve those boundaries instead of making the placeholder routes appear secure prematurely.
- CodeGraph is initialized and healthy, but reported three added and two modified indexed files; sync it before using structural context for the P1 design.
- Official Expo SDK 56 SQLite guidance requires setting `PRAGMA key` immediately after opening a SQLCipher database and supports migrations in `SQLiteProvider.onInit`; the key must come from the protected storage boundary, never a source literal. Source: https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/
- Expo SecureStore on Android encrypts SharedPreferences with Android Keystore, loses data on uninstall, excludes its entries from Auto Backup, and can return `null` after biometric enrollment invalidates an authenticated key. Therefore “missing key”, “invalidated key”, and “database cannot decrypt” need explicit recovery states. Source: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
- Expo LocalAuthentication defaults Android biometric prompts to the weaker security level; P1 should require `biometricsSecurityLevel: 'strong'` when biometrics protect access to secrets, while retaining a product decision about device-credential/PIN fallback. Source: https://docs.expo.dev/versions/latest/sdk/local-authentication/
- Android Keystore can keep key material non-exportable and optionally hardware-backed, but SecureStore abstraction does not prove StrongBox residency. P1 must claim protected local key storage, not hardware-backed security, unless a native adapter later attests it. Source: https://developer.android.com/privacy-and-security/keystore
- Expo's app config defaults Android application backup to enabled; for an encrypted private collaboration database, `android.allowBackup: false` is the safest P1 default unless a tested key/data recovery design is added. Source: https://docs.expo.dev/versions/latest/config/app/
- The product PRD ultimately requires an independent PIN and recovery material, but implementing those safely also requires a native KDF/recovery-key lifecycle. The minimal foundation can instead expose destructive local reset after key loss and defer PIN/recovery without claiming recoverability.
- The user approved destructive local reset after SecureStore key loss/invalidation. Recovery UI must require a second confirmation and must remain fail-closed if database/key deletion is only partially successful.
- `PreviewWorkspaceProvider` is the single consumer boundary for Chat, Space, and detail commands, but its commands are currently synchronous reducer calls. Persistent repositories will require an explicit async command result and boot/hydration state instead of dispatch-then-return semantics.
- `AppProviders` currently mounts the workspace provider unconditionally. The secure boot boundary must gate private descendants until key access, SQLCipher open, migration, and hydration complete while keeping gesture/keyboard/safe-area providers outside that gate.
## 2026-08-20 — Security foundation decisions and SDK constraints

- Product decision approved: if the encrypted database exists but its key is missing or invalidated, Phase 1 offers only an explanation and a second-confirm destructive local reset; there is no recovery code, app PIN, or KDF fallback.
- The secure boot decision must combine two independent facts: the SecureStore envelope/key state and the physical SQLite database-file state. Silent key regeneration is forbidden whenever either side indicates prior initialization.
- Add direct SDK 56 dependencies for `expo-crypto` (asynchronous native random bytes) and `expo-file-system` (database-file existence). The SQLCipher key is 32 random bytes represented as validated hex.
- Use exclusive SQLite transactions for ordered migrations, parameterized/prepared statements for data, and explicit statement finalization.
- Authentication-bound key retrieval requires physical-device acceptance; emulator-only success cannot support the security claim.
- SQLCipher's official raw-key contract accepts exactly 64 hex characters as 32 key bytes. Key verification requires a real schema read after `PRAGMA key`; setting the pragma alone does not prove that an existing database opened successfully.
- SQLCipher key material and raw native error details must be kept out of logs/crash/analytics surfaces; application-facing failures use stable typed codes.
- Expo SDK 56's new File API expects a `file://` URI even though `defaultDatabaseDirectory` is exposed as an absolute path; normalize it before constructing `File` for database existence checks.
- Expo SQLite's `withExclusiveTransactionAsync` creates a separate connection. Because SQLCipher keys are connection-local, migrations, seed, and workspace writes must use `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` on the same connection that received `PRAGMA key`.
- Native Android evidence now proves SQLCipher wrong-key rejection, correct-key reopen, idempotent migration, recovery after SecureStore loss, persistent workspace reload, and destructive reset. Strong-biometric key binding still requires a physical device.
