# Current state baseline — 2026-08-20

## Repository state used for this baseline

- `52ac76e feat: validate Android native E2EE spike`
- `a299eb8 test: record ARM64 E2EE acceptance`
- `1e8c6bf chore(task): archive Android E2EE native spike`
- `HEAD` and the local `origin/main` tracking ref both point to `1e8c6bf` during the audit.
- Repository root `app-debug.apk` remains an untracked ARM64 build artifact; it is not counted as source completion.

## Completed task evidence

1. `.trellis/tasks/archive/2026-08/08-13-figma-mvp-basic-functionality/prd.md`
   - Basic Chat → Save to Space → Space → Shared Item Detail loop passed.
2. `.trellis/tasks/archive/2026-08/08-20-android-security-data-foundation/prd.md`
   - SQLCipher, SecureStore, secure boot, persistence, recovery reset and ARM64 strong-biometric acceptance passed.
3. `.trellis/tasks/archive/2026-08/08-20-android-e2ee-native-spike/prd.md`
   - Official libsignal 0.101.0, PQXDH, double ratchet, encrypted restart checkpoint, negative cases and ARM64/x86_64 acceptance passed.

## User-facing route evidence

Implemented production-facing route families:

- Chat
- Space Home
- Shared Item Detail
- Settings

Boundary-only routes:

- Create Identity
- Pair
- Verify Safety Number

Development-only routes:

- FlashList benchmark
- SQLCipher/storage acceptance
- E2EE native acceptance

Development-only acceptance screens do not count as production pages or features.

## Known missing product areas

- Production identity, pairing requests, three pairing paths, safety-number lifecycle.
- Ciphertext server/sync, outbox/inbox, push privacy, offline retry and conflict handling.
- Images, files, quote/reply, recall, delivery states, disappearing-message mode and multi-select.
- Complete Pin/Task/Note/File/Agreement state machines.
- Activity, time view, global search and settings subpages.
- Recovery package, device replacement/revocation, export/unpair/delete semantics.
- iOS native acceptance, distribution compliance and independent production security review.

## Measurement caveat

The Figma board is flattened and contains roughly 50 screens/spec artifacts, not 50 independent application routes. The 33% baseline is therefore a capability-weighted engineering estimate. It must be refreshed from acceptance evidence, not from visual frame counts.
