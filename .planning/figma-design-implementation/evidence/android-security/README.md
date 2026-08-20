# Android Security and Storage Acceptance

Date: 2026-08-20  
Emulator: Android API 37.1, x86_64, 16 KB page-size, Expo development build  
Physical device: realme RMX3888, Android 16 / API 36, `arm64-v8a`, 2026-06-01 security patch

## Physical-device APK

- Artifact: `android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`
- Native ABI reported by Android `aapt`: `arm64-v8a` only.
- SHA-256: `C3FD056CA3236FACE86E9AC28AE185113AFE594DAFC7FE680C86BE7E4AE90DD7`
- The earlier `app-debug.apk` was an x86_64 64-bit emulator build, not a 32-bit ARM build.

## Passed native checks

- First launch remains on setup until the device-protected SQLCipher workspace is initialized.
- SQLCipher schema v1 creation and migration succeed.
- Reopening with the correct key succeeds and migration remains idempotent.
- Opening the existing temporary database with a wrong key is rejected.
- The database remains readable with the correct key after the wrong-key attempt.
- Temporary native acceptance data is removed after the harness finishes.
- `persist-check-0820` remains after an Android force-stop and development-build restart.
- Removing only the test installation's SecureStore preferences while retaining the database enters
  fail-closed `database-without-envelope` recovery.
- Destructive reset requires a second confirmation, returns to setup, can reinitialize, and does not
  restore the previous marker.
- Strong-biometric setup and unlock succeed on the physical Android device.
- Cancelling the system biometric prompt remains fail-closed and shows the locked workspace.
- Sending the app to the background relocks the workspace; private Chat content is not mounted until
  another successful biometric unlock.
- `physical-strong-0820` survives force-stop/restart and is visible only after re-authentication.
- The physical ARM64 device also passes all five redacted native SQLCipher harness checks.

The harness displays stable pass/fail codes only. It does not display the database key, database
path, SQL parameters, or native exception text.

## Screenshots

- `01-setup.png` — secure workspace setup before private navigation mounts.
- `02-native-storage-pass.png` — all five redacted native storage checks pass.
- `03-ready-after-restart.png` — marker visible after force-stop/restart.
- `04-recovery.png` — database retained but SecureStore envelope/key removed.
- `05-reset-confirm.png` — second confirmation before destructive reset.
- `06-physical-setup-strong.png` — strong-biometric mode is available during physical-device setup.
- `07-physical-biometric-ready.png` — successful biometric setup reaches the private workspace.
- `08-physical-locked-after-background.png` — returning from background shows the locked gate.
- `09-physical-biometric-prompt.png` — real Android system biometric prompt before cancellation.
- `10-physical-reunlock-persisted.png` — persisted marker after force-stop and biometric re-unlock.
- `11-physical-native-storage-pass.png` — all five native SQLCipher checks pass on ARM64 hardware.

The physical test installation was absent before installation, so no previous M2Y application data
was overwritten. The native acceptance harness uses and removes an isolated temporary database.
