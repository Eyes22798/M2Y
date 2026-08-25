package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.m2y.crypto.production.PairingProtocolRules.ActivationDecision;
import com.m2y.crypto.production.PairingProtocolRules.CandidateAction;
import com.m2y.crypto.production.PairingProtocolRules.CandidateStatus;
import com.m2y.crypto.production.PairingProtocolRules.IncomingDecision;
import com.m2y.crypto.production.PairingProtocolRules.PairingIntentKind;
import com.m2y.crypto.production.PairingProtocolRules.TombstoneOutcome;
import org.junit.Test;

public final class PairingProtocolRulesTest {
  private static final String PAIR_ID = "6b1f4c9a-55f2-4b0b-9d0f-2f2f6b311f4d";
  private static final String PEER_ROUTE_ID = "1ab9957e-2c7f-4ec6-80b2-26941a506ca4";
  private static final String PEER_FINGERPRINT = "a".repeat(64);

  @Test
  public void aRetriedIdenticalPacketIsIdempotentRatherThanASecondCandidate() throws Exception {
    assertEquals(
        IncomingDecision.DUPLICATE, PairingProtocolRules.classifyIncoming(true, null, 2_000, 1_000));
  }

  @Test
  public void aResolvedRequestIsNeverReopenedByANewPacket() throws Exception {
    assertEquals(
        IncomingDecision.TOMBSTONED,
        PairingProtocolRules.classifyIncoming(false, "rejected", 2_000, 1_000));
  }

  @Test
  public void aTombstoneOutrunsExpiryBecauseRefusingIsStricterThanForgetting() throws Exception {
    assertEquals(
        IncomingDecision.TOMBSTONED,
        PairingProtocolRules.classifyIncoming(false, "mismatch", 1_000, 5_000));
  }

  @Test
  public void expiryIsInclusiveOfTheDeadline() throws Exception {
    assertEquals(
        IncomingDecision.EXPIRED, PairingProtocolRules.classifyIncoming(false, null, 1_000, 1_000));
    assertEquals(
        IncomingDecision.APPLY, PairingProtocolRules.classifyIncoming(false, null, 1_001, 1_000));
  }

  @Test
  public void anUnknownStoredTombstoneIsCorruptionRatherThanAPass() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () -> PairingProtocolRules.classifyIncoming(false, "approved", 2_000, 1_000));

    assertEquals("pairing-tombstone-corrupt", failure.safeCode());
  }

  @Test
  public void mismatchIsUnreachableBeforeTheSafetyNumberIsShown() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingProtocolRules.resolveCandidate(
                    CandidateStatus.PENDING_LOCAL_REVIEW, CandidateAction.REPORT_MISMATCH));

    assertEquals("pairing-candidate-transition-invalid", failure.safeCode());
  }

  @Test
  public void anAcceptedCandidateCanStillMismatchCancelOrExpire() throws Exception {
    assertEquals(
        CandidateStatus.MISMATCH,
        PairingProtocolRules.resolveCandidate(
            CandidateStatus.ACCEPTED, CandidateAction.REPORT_MISMATCH));
    assertEquals(
        CandidateStatus.CANCELLED,
        PairingProtocolRules.resolveCandidate(CandidateStatus.ACCEPTED, CandidateAction.CANCEL));
    assertEquals(
        CandidateStatus.EXPIRED,
        PairingProtocolRules.resolveCandidate(CandidateStatus.ACCEPTED, CandidateAction.EXPIRE));
  }

  @Test
  public void anAcceptedCandidateCannotBeQuietlyRejected() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingProtocolRules.resolveCandidate(
                    CandidateStatus.ACCEPTED, CandidateAction.REJECT));

    assertEquals("pairing-candidate-transition-invalid", failure.safeCode());
  }

  @Test
  public void repeatingTheActionThatProducedTheCurrentStatusStaysIdempotent() throws Exception {
    assertEquals(
        CandidateStatus.REJECTED,
        PairingProtocolRules.resolveCandidate(CandidateStatus.REJECTED, CandidateAction.REJECT));
    assertEquals(
        CandidateStatus.ACCEPTED,
        PairingProtocolRules.resolveCandidate(CandidateStatus.ACCEPTED, CandidateAction.ACCEPT));
  }

  @Test
  public void aTerminalCandidateCannotBeMovedToAnotherOutcome() {
    for (CandidateAction action : CandidateAction.values()) {
      if (action == CandidateAction.REJECT) {
        continue;
      }
      assertThrows(
          ProductionIdentityException.class,
          () -> PairingProtocolRules.resolveCandidate(CandidateStatus.REJECTED, action));
    }
  }

  @Test
  public void onlyResolvedCandidatesLeaveATombstone() {
    assertNull(PairingProtocolRules.tombstoneFor(CandidateStatus.PENDING_LOCAL_REVIEW));
    assertNull(PairingProtocolRules.tombstoneFor(CandidateStatus.ACCEPTED));
    assertEquals(
        TombstoneOutcome.REJECTED, PairingProtocolRules.tombstoneFor(CandidateStatus.REJECTED));
    assertEquals(
        TombstoneOutcome.MISMATCH, PairingProtocolRules.tombstoneFor(CandidateStatus.MISMATCH));
    assertEquals(
        TombstoneOutcome.CANCELLED, PairingProtocolRules.tombstoneFor(CandidateStatus.CANCELLED));
    assertEquals(
        TombstoneOutcome.EXPIRED, PairingProtocolRules.tombstoneFor(CandidateStatus.EXPIRED));
  }

  @Test
  public void storedStatusAndOutcomeNamesSurviveARoundTrip() throws Exception {
    for (CandidateStatus status : CandidateStatus.values()) {
      assertEquals(status, CandidateStatus.fromStored(status.stored()));
    }
    for (TombstoneOutcome outcome : TombstoneOutcome.values()) {
      assertEquals(outcome, TombstoneOutcome.fromStored(outcome.stored()));
    }
  }

  @Test
  public void theFirstRelationshipActivates() throws Exception {
    assertEquals(
        ActivationDecision.ACTIVATE,
        PairingProtocolRules.classifyActivation(
            null, null, null, PAIR_ID, PEER_ROUTE_ID, PEER_FINGERPRINT));
  }

  @Test
  public void aSecondRelationshipIsRefusedInsteadOfReplacingTheFirst() throws Exception {
    assertEquals(
        ActivationDecision.RELATIONSHIP_CONFLICT,
        PairingProtocolRules.classifyActivation(
            PAIR_ID,
            PEER_ROUTE_ID,
            PEER_FINGERPRINT,
            "9d0f2f2f-6b31-4f4d-8b0b-1a7e4c9a55f2",
            PEER_ROUTE_ID,
            PEER_FINGERPRINT));
  }

  @Test
  public void theSamePairIdArrivingForAnotherPeerRouteIsAConflict() throws Exception {
    assertEquals(
        ActivationDecision.RELATIONSHIP_CONFLICT,
        PairingProtocolRules.classifyActivation(
            PAIR_ID,
            PEER_ROUTE_ID,
            PEER_FINGERPRINT,
            PAIR_ID,
            "26941a50-6ca4-4ec6-80b2-1ab9957e2c7f",
            PEER_FINGERPRINT));
  }

  @Test
  public void reactivatingTheSameRelationshipIsIdempotent() throws Exception {
    assertEquals(
        ActivationDecision.ALREADY_ACTIVE,
        PairingProtocolRules.classifyActivation(
            PAIR_ID, PEER_ROUTE_ID, PEER_FINGERPRINT, PAIR_ID, PEER_ROUTE_ID, PEER_FINGERPRINT));
  }

  @Test
  public void aChangedPeerIdentityKeyIsReportedAndNotAdopted() throws Exception {
    assertEquals(
        ActivationDecision.PEER_IDENTITY_CHANGED,
        PairingProtocolRules.classifyActivation(
            PAIR_ID, PEER_ROUTE_ID, PEER_FINGERPRINT, PAIR_ID, PEER_ROUTE_ID, "b".repeat(64)));
  }

  @Test
  public void activationRejectsUnusableIdentifiersBeforeTouchingStoredState() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingProtocolRules.classifyActivation(
                    null, null, null, "", PEER_ROUTE_ID, PEER_FINGERPRINT));

    assertEquals("pairing-relationship-invalid", failure.safeCode());
  }

  @Test
  public void everyActionExceptExpiryIsNameableByACaller() throws Exception {
    for (CandidateAction action : CandidateAction.values()) {
      if (action == CandidateAction.EXPIRE) {
        continue;
      }
      assertEquals(action, CandidateAction.fromRequested(action.requested()));
    }
  }

  /**
   * Expiry belongs to the clock, so a caller naming it would be able to retire a live request that
   * the peer is still legitimately answering.
   */
  @Test
  public void expiryCannotBeRequestedByName() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class, () -> CandidateAction.fromRequested("expire"));

    assertEquals("pairing-candidate-action-invalid", failure.safeCode());
  }

  @Test
  public void anUnknownActionNameIsRefusedRatherThanIgnored() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class, () -> CandidateAction.fromRequested("Accept"));

    assertEquals("pairing-candidate-action-invalid", failure.safeCode());
  }

  @Test
  public void everyOutcomeThePeerMustLearnAboutCarriesAnIntentAndExpiryDoesNot() {
    assertEquals(
        PairingIntentKind.RESPOND_ACCEPT, PairingProtocolRules.intentFor(CandidateAction.ACCEPT));
    assertEquals(
        PairingIntentKind.RESPOND_REJECT, PairingProtocolRules.intentFor(CandidateAction.REJECT));
    assertEquals(
        PairingIntentKind.REPORT_MISMATCH,
        PairingProtocolRules.intentFor(CandidateAction.REPORT_MISMATCH));
    assertEquals(PairingIntentKind.CANCEL, PairingProtocolRules.intentFor(CandidateAction.CANCEL));
    assertNull(PairingProtocolRules.intentFor(CandidateAction.EXPIRE));
  }

  @Test
  public void everyIntentAddressesOneOfThePairingResultEndpoints() {
    for (PairingIntentKind kind : PairingIntentKind.values()) {
      assertTrue(
          kind.packetType().equals("pair-response")
              || kind.packetType().equals("pair-verify")
              || kind.packetType().equals("pair-cancel"));
      assertTrue(kind.decision().matches("^[a-zA-Z][a-zA-Z-]{2,63}$"));
    }
  }

  @Test
  public void anOverlongWindowIsRefusedBeforeAnyRowIsWritten() {
    assertEquals(
        "pairing-window-invalid",
        assertThrows(
                ProductionIdentityException.class,
                () ->
                    PairingProtocolRules.requireBoundedWindow(
                        1_000 + PairingProtocolRules.MAX_PAIRING_WINDOW_MS + 1, 1_000))
            .safeCode());
    assertEquals(
        "pairing-window-invalid",
        assertThrows(
                ProductionIdentityException.class,
                () -> PairingProtocolRules.requireBoundedWindow(1_000, 0))
            .safeCode());
  }

  /**
   * A window that has already closed passes this check on purpose: refusing it here would replace a
   * tombstoned expiry with an exception, and the packet would stay replayable.
   */
  @Test
  public void aClosedWindowIsLeftForTheIncomingClassifierToRefuse() throws Exception {
    PairingProtocolRules.requireBoundedWindow(500, 1_000);
    PairingProtocolRules.requireBoundedWindow(
        1_000 + PairingProtocolRules.MAX_PAIRING_WINDOW_MS, 1_000);
  }

  /**
   * The sweep may delete the inbox marker that made a byte-identical retry idempotent, so the
   * tombstone has to outlive the request's own window rather than expire with it.
   */
  @Test
  public void aTombstoneOutlivesTheRequestItProtects() {
    assertEquals(
        1_000 + PairingProtocolRules.TOMBSTONE_RETENTION_MS,
        PairingProtocolRules.tombstoneExpiryFor(1_000));
    assertEquals(Long.MAX_VALUE, PairingProtocolRules.tombstoneExpiryFor(Long.MAX_VALUE));
  }
}
