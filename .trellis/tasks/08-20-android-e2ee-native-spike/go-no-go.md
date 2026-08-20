# Android E2EE native Spike — Go / No-Go

Date: 2026-08-20

## Decision

**GO for the Android native architecture and the next product-design task.** The
official libsignal 0.101.0 Java/Android artifacts work with the current Expo 56,
React Native 0.85.3, Hermes/New Architecture and CNG workflow without upgrading
the app baseline. The isolated native implementation demonstrates PQXDH session
setup, bidirectional ratcheting, durable encrypted reopen, fail-closed negative
paths, stable redacted bridge contracts, cleanup and acceptable measured Spike
performance.

**NO-GO for production release or an “E2EE complete” claim.** This Spike does
not implement production identity lifecycle, pairing, pre-key service,
transactional message sync, attachment format, device change/revocation,
recovery, group/multi-device behavior, iOS parity, or an independent threat and
cryptographic integration review. The completed ARM64 Spike acceptance does not
remove those product and release gates.

## Release gates retained

- Fulfil AGPLv3 corresponding-source obligations for every distributed build,
  preserve license/notices, document reproducible source-to-binary mapping, and
  obtain final application-store/legal review.
- Treat libsignal's third-party API as unsupported: keep 0.101.0 pinned and rerun
  ABI, serialization/reopen, protocol-negative and package audits on every
  upgrade.
- Replace the Spike checkpoint with a reviewed production state/outbox/inbox
  transaction design. Do not reuse the harness run ID, personas or dev route as
  product state.
- Keep identity keys, session records, plaintext, fingerprints and raw native
  exceptions inside the native security boundary; the app layer receives only
  narrow commands and redacted domain results.
- Repeat the physical ARM64 acceptance for libsignal or toolchain upgrades, and
  create a separate iOS feasibility task before claiming platform parity.

## Recommended next tasks

1. Define the production M2Y-ID and single-device identity lifecycle, server
   pre-key contract, QR/handshake pairing transcript and safety-number UX.
2. Design ciphertext envelope, idempotent outbox/inbox transactions, retry and
   acknowledgement semantics around native protocol-state commits.
3. Define attachment content encryption/streaming and authenticated metadata;
   the 100 MB Spike is only a boundary/performance probe.
4. Add device replacement/revocation, key-change warnings, recovery policy and a
   formal threat model, then commission integration/security review.
5. Run an independent iOS libsignal feasibility and secure-storage Spike.
