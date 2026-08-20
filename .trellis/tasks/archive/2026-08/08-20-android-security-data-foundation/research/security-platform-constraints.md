# Android Security Platform Constraints

Research date: 2026-08-20. Sources are official Expo SDK 56 and Android documentation; the URLs are evidence, not instructions to execute.

## Repository Evidence

- `app.config.ts` enables `expo-sqlite` with `useSQLCipher: true` and `enableFTS: true`.
- `expo-secure-store`, `expo-local-authentication`, and `expo-sqlite` are already SDK-compatible dependencies.
- `src/native/crypto/README.md` forbids placeholder cryptography in TypeScript.
- `src/native/secure-storage/README.md` reserves device key wrapping and protected credential access for a reviewed security implementation.
- `src/bootstrap/README.md` prohibits database/crypto initialization merely because React rendered.
- Auth routes still use `AuthPlaceholderScreen` and correctly avoid claiming real E2EE or identity creation.

## Expo SQLite / SQLCipher

Source: https://docs.expo.dev/versions/v56.0.0/sdk/sqlite/

- `useSQLCipher` changes the native SQLite implementation and therefore requires a Development Build.
- SQLCipher requires `PRAGMA key` immediately after opening the database and before business queries.
- `SQLiteProvider.onInit` runs before children render and is intended for migration/setup.
- Migrations can use `PRAGMA user_version`; M2Y additionally needs a transaction and explicit rollback/error mapping.
- The documentation example interpolates a password for clarity. Production M2Y code must use a controlled encoded key representation and must never interpolate user content.

## Expo SecureStore

Source: https://docs.expo.dev/versions/v55.0.0/sdk/securestore/

- Android values are encrypted in SharedPreferences with keys protected by Android Keystore.
- SecureStore is suitable for small secrets, not the application database or primary business records.
- Android SecureStore data does not survive uninstall.
- Android Auto Backup must exclude SecureStore entries because restored entries cannot be decrypted after uninstall removes the Keystore keys.
- `getItemAsync` can return `null` when an authenticated key is invalidated by biometric enrollment changes.
- Async APIs avoid blocking the JavaScript thread during authentication.

## Expo LocalAuthentication

Source: https://docs.expo.dev/versions/latest/sdk/local-authentication/

- Android's default biometric security level is `weak`.
- `biometricsSecurityLevel: 'strong'` limits authentication to Android Class 3 methods.
- Failure results include user cancel, system cancel, not enrolled, lockout, timeout, passcode not set, and authentication failure; the app state machine must map these without fail-open behavior.
- LocalAuthentication is an access gate. It does not create an M2Y cryptographic identity or prove E2EE.

## Android Keystore and Backup

Sources:

- https://developer.android.com/privacy-and-security/keystore
- https://docs.expo.dev/versions/latest/config/app/

- Android Keystore can keep key material non-exportable and may bind it to secure hardware, but Expo SecureStore does not expose proof that a given value uses StrongBox.
- M2Y may claim system-protected key storage, not guaranteed hardware-backed or StrongBox protection.
- Expo Android config defaults `allowBackup` to enabled. The minimal safe foundation sets it to `false` until a tested encrypted backup/recovery design exists.

## Required Design Consequences

1. Key state and database state are separate inputs; database-present/key-missing is not a first-run condition.
2. Never regenerate a key over an existing unreadable database.
3. Do not mount private routes until key access, database open, and migration all succeed.
4. Keep real M2Y identity/E2EE claims out of this task.
5. Model destructive local reset explicitly if recovery material remains out of scope.
## Additional SDK 56 implementation constraints

- Generate the SQLCipher key with `expo-crypto`'s asynchronous `getRandomBytesAsync`. The synchronous API is not acceptable for this path because Expo documents a development/debugger fallback that may use `Math.random`.
- Encode 32 random bytes as a validated 64-character lowercase hexadecimal key before constructing the SQLCipher key pragma. No user-controlled value may be interpolated into a pragma.
- Add `expo-file-system` as a direct dependency and check the concrete database file under `SQLite.defaultDatabaseDirectory` with `File.exists`. SDK 56's `File` constructor requires the directory to be normalized to a `file://` URI. SecureStore state and database-file state must be evaluated independently before deciding whether setup, unlock, or recovery is allowed.
- Use parameterized SQLite statements or prepared statements for all data values, and always finalize prepared statements. SQLCipher migrations and writes must run `BEGIN IMMEDIATE`, all work, and `COMMIT`/`ROLLBACK` on the same already-keyed connection; Expo's `withExclusiveTransactionAsync` creates a different unkeyed connection and is therefore unsafe for this adapter.
- Destructive recovery uses the supported close/delete APIs: close the live database handle first, delete the database, then remove the key and non-secret initialization envelope. A partial failure remains fail-closed and is retryable.
- Authentication-bound SecureStore behavior must be accepted on a physical Android device. Emulator coverage is useful for functional state transitions but is not sufficient evidence that secret retrieval is actually protected by device authentication.

## SQLCipher raw-key and verification contract

- Zetetic's SQLCipher API documents raw-key syntax as `PRAGMA key = "x'<64 hex characters>'"`; exactly 64 hexadecimal characters become 32 bytes of key material without password KDF. This is appropriate only because the input is already high-entropy random bytes.
- The raw key must be validated against `^[0-9a-f]{64}$` before building that fixed-format pragma. User input and persisted metadata never participate in SQL construction.
- `PRAGMA key` is the first operation on a new connection. It is lazy, so success is not established until `SELECT count(*) FROM sqlite_master` reads the database schema.
- If the bundled SQLCipher version supports it, `PRAGMA cipher_status` must return `1`; absence/unsupported behavior is not silently treated as proof of encryption. `PRAGMA cipher_integrity_check` returns rows only for page/HMAC errors and is suitable for explicit diagnostics or migration acceptance, not for every normal render.
- Database key material must never enter logs, crash reports, analytics, or telemetry. The design therefore maps low-level SQLite/SQLCipher exceptions to stable non-sensitive error codes.
