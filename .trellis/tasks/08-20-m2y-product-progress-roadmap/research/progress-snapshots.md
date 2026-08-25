# Progress snapshots

Reading order: newest entry last. Each entry names the commit it describes, so a snapshot can
always be re-derived from the repository instead of from prose.

**Standing rule — "tables exist" is not "the feature works".** Several entries below landed
`CREATE TABLE` DDL ahead of any access code. Score DDL as 0 until there is read/write code plus a
test. This is the single most likely way to over-report pairing progress.

## 2026-08-20 — Initial baseline

- Trigger: Android E2EE native Spike archived after x86_64 emulator and ARM64 physical-device acceptance.
- Repository state: `HEAD = 1e8c6bf`.
- Full P0 weighted completion: **33/100**.
- M0 technical-roadmap estimate: **55%–60%**.
- Release-ready estimate: **20%–25%**.
- Newly proven: Android local encrypted persistence, strong-biometric access boundary, official libsignal native feasibility, protocol restart/negative/performance behavior.
- Still not proven: production M2Y-ID, real pairing, safety-number UI, ciphertext sync, attachments, iOS and release readiness.
- Next child: `08-20-android-production-identity-pairing`.

## 2026-08-20 — `38cf657` server persistent pairing foundation

- Trigger: Gate 1 of `08-20-android-production-identity-pairing` closed 6/6.
- Landed: NestJS server (`@nestjs/platform-express`, not Fastify) with a real `RedactedLogger`,
  `DatabaseService`, `migrations.ts` covering 8 identity/pairing tables, `GET /health`, 4 test suites.
- Not landed: all 8 identity/pair endpoints, signature guard, nonce replay protection, prekey lease,
  invite/code hashing, unique-relationship transaction.
- **Tables exist ≠ pairing works**: the 7 server-side pairing tables carry zero access code.
- Deviation from the technology baseline: `better-sqlite3` instead of PostgreSQL, and no Redis, no
  object storage, no WebSocket. Recorded in the child task's research as an explicit host-environment
  tradeoff that must be re-evaluated before `08-20-ciphertext-sync-foundation`.

## 2026-08-21 — `d82644f` Android production identity foundation

- Trigger: Gate 2 of `08-20-android-production-identity-pairing` partially closed (single-device
  identity generate / encrypted persist / restart idempotence / device signing / fail-closed reset),
  verified by x86_64 emulator instrumentation.
- Landed: `ProductionIdentityManager.java` (564 lines) on real libsignal `IdentityKeyPair.generate()`,
  `ProductionIdentityDatabase.java` encrypted persistence, 3 JVM + 2 instrumentation tests.
- **Still blocked**: C4 (working-copy protocol transaction, candidate isolation, pairing inbox/outbox,
  replay tombstones, unique active relationship) and C7 (replay/rollback coverage).
- **Tables exist ≠ pairing works**: native `pairing_candidates` / `relationship` / `pairing_inbox` /
  `replay_tombstones` are DDL only, zero insert/query/update. `pairing_outbox` is currently
  repurposed as an identity-registration outbox — a temporary state that gets more expensive to
  correct the longer it stands.
- Not wired: 6 of the 11 designed native pairing functions have zero hits repo-wide; safety number
  (`Fingerprint`) has no production implementation at all; 4 of 5 TS adapters have zero callers; the
  15-state identity reducer has no caller outside its own test; `app/index.tsx` still redirects
  unconditionally to `/chat`, so the three `(auth)` routes remain unreachable.
- Gate: per parent `design.md` §4 gate 1, no relationship UI may claim E2EE is established until
  Gate 2 closes.

## 2026-08-21 — Full audit supersedes the 33% baseline

- Trigger: cross-verification of authoritative docs / Trellis task tree / code reality / live gate
  runs at `HEAD = d82644f`. Report: `research/2026-08-21-full-audit.md`.
- The 2026-08-20 baseline was computed at `1e8c6bf` and is **4 commits behind**, so it both
  understates the identity/server increments above and overstates pairing progress.
- **No rescore is recorded here.** Per R1 the documentation baseline is corrected first; the weighted
  table in `prd.md` is to be recomputed from acceptance evidence in a later, explicit pass.
- Numbering hazard resolved: `README.md` used a five-item M0 Spike scheme (A threat model … E sync)
  while `CLAUDE.md` used four items, which made "Spike C is done" mean two different things. Both
  files now use the four-item scheme where **C = SQLCipher + sync**; the SQLCipher half is done and
  the sync half has not started.
- CI correction landed the same day: `.github/workflows/ci.yml` had `pnpm server:test -- --ci`, whose
  stray `--` made jest read `--ci` as a test path pattern, match 0 tests and exit 1. Server unit tests
  had therefore been failing since `38cf657`, and `pnpm server:build` had never executed in CI. Any
  earlier acceptance record claiming "all automated gates passed" is not supported for the server leg.
