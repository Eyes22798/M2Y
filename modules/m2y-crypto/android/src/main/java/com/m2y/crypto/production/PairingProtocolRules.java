package com.m2y.crypto.production;

/**
 * The pairing decisions that must not depend on SQLite, the Keystore or a device clock the caller
 * controls. Keeping them here means the fail-closed rules — never reopen a resolved request, never
 * hold two relationships, never silently accept a new peer identity key — are unit-testable on the
 * JVM instead of only on a physical device.
 */
final class PairingProtocolRules {
  /**
   * How long a resolved request stays refusable after its own window closes. A tombstone has to
   * outlive the request it protects by a wide margin, because the sweep may delete the inbox marker
   * that made a byte-identical retry idempotent; after that the tombstone is the only thing left
   * refusing an old packet.
   */
  static final long TOMBSTONE_RETENTION_MS = 30L * 24 * 60 * 60 * 1_000;

  /** The widest pairing window a caller may ask for. A longer one is refused, not clamped. */
  static final long MAX_PAIRING_WINDOW_MS = 24L * 60 * 60 * 1_000;

  private PairingProtocolRules() {}

  /** Persisted in {@code pairing_candidates.status}. */
  enum CandidateStatus {
    PENDING_LOCAL_REVIEW("pendingLocalReview"),
    ACCEPTED("accepted"),
    REJECTED("rejected"),
    MISMATCH("mismatch"),
    CANCELLED("cancelled"),
    EXPIRED("expired");

    private final String stored;

    CandidateStatus(String stored) {
      this.stored = stored;
    }

    String stored() {
      return stored;
    }

    static CandidateStatus fromStored(String value) throws ProductionIdentityException {
      for (CandidateStatus status : values()) {
        if (status.stored.equals(value)) {
          return status;
        }
      }
      throw new ProductionIdentityException("pairing-candidate-corrupt");
    }
  }

  /** What the local user, the peer or the clock does to a staged candidate. */
  enum CandidateAction {
    ACCEPT("accept"),
    REJECT("reject"),
    REPORT_MISMATCH("mismatch"),
    CANCEL("cancel"),
    EXPIRE("expire");

    private final String requested;

    CandidateAction(String requested) {
      this.requested = requested;
    }

    String requested() {
      return requested;
    }

    /**
     * Parses the action name a caller asked for. {@code EXPIRE} is deliberately not reachable from
     * here: expiry belongs to the clock and the sweep, so accepting it over the module boundary
     * would let a caller retire a live request by naming it.
     */
    static CandidateAction fromRequested(String value) throws ProductionIdentityException {
      for (CandidateAction action : values()) {
        if (action != EXPIRE && action.requested.equals(value)) {
          return action;
        }
      }
      throw new ProductionIdentityException("pairing-candidate-action-invalid");
    }
  }

  /** Persisted in {@code replay_tombstones.outcome}; why a request can never be applied again. */
  enum TombstoneOutcome {
    APPLIED("applied"),
    REJECTED("rejected"),
    MISMATCH("mismatch"),
    CANCELLED("cancelled"),
    EXPIRED("expired");

    private final String stored;

    TombstoneOutcome(String stored) {
      this.stored = stored;
    }

    String stored() {
      return stored;
    }

    static TombstoneOutcome fromStored(String value) throws ProductionIdentityException {
      for (TombstoneOutcome outcome : values()) {
        if (outcome.stored.equals(value)) {
          return outcome;
        }
      }
      throw new ProductionIdentityException("pairing-tombstone-corrupt");
    }
  }

  enum IncomingDecision {
    APPLY,
    DUPLICATE,
    TOMBSTONED,
    EXPIRED
  }

  enum ActivationDecision {
    ACTIVATE,
    ALREADY_ACTIVE,
    RELATIONSHIP_CONFLICT,
    PEER_IDENTITY_CHANGED
  }

  /**
   * The wire intent a local decision commits to the outbox. Every intent is addressed to one of the
   * three pairing result endpoints, so the packet type is what the transport dispatches on and the
   * decision is what the peer's own protocol rules read.
   */
  enum PairingIntentKind {
    RESPOND_ACCEPT("pair-response", "accept"),
    RESPOND_REJECT("pair-response", "reject"),
    CONFIRM_SAFETY("pair-verify", "confirm"),
    REPORT_MISMATCH("pair-cancel", "mismatch"),
    CANCEL("pair-cancel", "cancel");

    private final String packetType;
    private final String decision;

    PairingIntentKind(String packetType, String decision) {
      this.packetType = packetType;
      this.decision = decision;
    }

    String packetType() {
      return packetType;
    }

    String decision() {
      return decision;
    }
  }

  /**
   * Returns the intent a resolved candidate must hand to the transport, or {@code null} when the
   * outcome needs no packet. Expiry is the one such outcome: both sides run the same clock rule, so
   * telling the peer a request aged out adds a message without adding information.
   */
  static PairingIntentKind intentFor(CandidateAction action) {
    return switch (action) {
      case ACCEPT -> PairingIntentKind.RESPOND_ACCEPT;
      case REJECT -> PairingIntentKind.RESPOND_REJECT;
      case REPORT_MISMATCH -> PairingIntentKind.REPORT_MISMATCH;
      case CANCEL -> PairingIntentKind.CANCEL;
      case EXPIRE -> null;
    };
  }

  /**
   * Refuses a pairing window wider than a day, before any row is written, so a distant deadline
   * cannot create an effectively immortal pending request. Whether the window has already closed is
   * deliberately not decided here — that is {@link #classifyIncoming}'s answer, and it carries a
   * tombstone with it rather than an exception.
   */
  static void requireBoundedWindow(long expiresAtMs, long nowMs)
      throws ProductionIdentityException {
    if (nowMs <= 0 || expiresAtMs > nowMs + MAX_PAIRING_WINDOW_MS) {
      throw new ProductionIdentityException("pairing-window-invalid");
    }
  }

  /** When the tombstone for a request whose window closes at {@code expiresAtMs} may be swept. */
  static long tombstoneExpiryFor(long expiresAtMs) {
    return expiresAtMs > Long.MAX_VALUE - TOMBSTONE_RETENTION_MS
        ? Long.MAX_VALUE
        : expiresAtMs + TOMBSTONE_RETENTION_MS;
  }

  /**
   * A retried delivery of the byte-identical packet is transport noise and stays idempotent, but a
   * different packet for a request that already carries a tombstone is refused rather than applied:
   * the fingerprint is scoped to the packet, the tombstone to the request.
   */
  static IncomingDecision classifyIncoming(
      boolean fingerprintAlreadyApplied, String storedTombstone, long expiresAtMs, long nowMs)
      throws ProductionIdentityException {
    if (fingerprintAlreadyApplied) {
      return IncomingDecision.DUPLICATE;
    }
    if (storedTombstone != null) {
      TombstoneOutcome.fromStored(storedTombstone);
      return IncomingDecision.TOMBSTONED;
    }
    return nowMs >= expiresAtMs ? IncomingDecision.EXPIRED : IncomingDecision.APPLY;
  }

  /**
   * Mismatch is reachable only from {@code ACCEPTED} because the safety number is displayed after
   * acceptance; a candidate still awaiting review has no number to compare.
   */
  static CandidateStatus resolveCandidate(CandidateStatus current, CandidateAction action)
      throws ProductionIdentityException {
    CandidateStatus resolved =
        switch (action) {
          case ACCEPT -> CandidateStatus.ACCEPTED;
          case REJECT -> CandidateStatus.REJECTED;
          case REPORT_MISMATCH -> CandidateStatus.MISMATCH;
          case CANCEL -> CandidateStatus.CANCELLED;
          case EXPIRE -> CandidateStatus.EXPIRED;
        };
    if (current == resolved) {
      return resolved;
    }

    boolean allowed =
        switch (current) {
          case PENDING_LOCAL_REVIEW -> action != CandidateAction.REPORT_MISMATCH;
          case ACCEPTED ->
              action == CandidateAction.REPORT_MISMATCH
                  || action == CandidateAction.CANCEL
                  || action == CandidateAction.EXPIRE;
          case REJECTED, MISMATCH, CANCELLED, EXPIRED -> false;
        };
    if (!allowed) {
      throw new ProductionIdentityException("pairing-candidate-transition-invalid");
    }
    return resolved;
  }

  /**
   * Returns the tombstone a resolved candidate must leave behind, or {@code null} while the request
   * is still in flight and a later packet is still legitimate.
   */
  static TombstoneOutcome tombstoneFor(CandidateStatus status) {
    return switch (status) {
      case PENDING_LOCAL_REVIEW, ACCEPTED -> null;
      case REJECTED -> TombstoneOutcome.REJECTED;
      case MISMATCH -> TombstoneOutcome.MISMATCH;
      case CANCELLED -> TombstoneOutcome.CANCELLED;
      case EXPIRED -> TombstoneOutcome.EXPIRED;
    };
  }

  /**
   * The relationship table holds a single row by schema, so activation has to answer what an
   * incoming activation means against whatever is already there rather than overwrite it. A changed
   * peer identity key is reported, never adopted.
   */
  static ActivationDecision classifyActivation(
      String storedPairId,
      String storedPeerRouteId,
      String storedPeerIdentityFingerprint,
      String pairId,
      String peerRouteId,
      String peerIdentityFingerprint)
      throws ProductionIdentityException {
    requireOpaqueId(pairId, "pairing-relationship-invalid");
    requireOpaqueId(peerRouteId, "pairing-relationship-invalid");
    requireOpaqueId(peerIdentityFingerprint, "pairing-relationship-invalid");

    if (storedPairId == null) {
      return ActivationDecision.ACTIVATE;
    }
    if (!storedPairId.equals(pairId) || !peerRouteId.equals(storedPeerRouteId)) {
      return ActivationDecision.RELATIONSHIP_CONFLICT;
    }
    return peerIdentityFingerprint.equals(storedPeerIdentityFingerprint)
        ? ActivationDecision.ALREADY_ACTIVE
        : ActivationDecision.PEER_IDENTITY_CHANGED;
  }

  private static void requireOpaqueId(String value, String safeCode)
      throws ProductionIdentityException {
    if (value == null || value.isEmpty() || value.length() > 128) {
      throw new ProductionIdentityException(safeCode);
    }
  }
}
