package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.m2y.crypto.production.PairingRecordCodec.PeerCandidate;
import com.m2y.crypto.production.PairingTransactionStore.InboundPacket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.signal.libsignal.protocol.IdentityKeyPair;

/**
 * The pairing half of the production store against a real database and a real Keystore. The
 * decisions themselves are unit-tested on the JVM in {@code PairingProtocolRulesTest}; what these
 * tests prove is that the committed rows match those decisions, survive a new manager over the same
 * file, and fail closed when a record or key is gone.
 */
@RunWith(AndroidJUnit4.class)
public final class PairingTransactionStoreInstrumentedTest {
  private static final long ONE_MINUTE_MS = 60_000;
  private static final String RECEIPT = "receipt_pairing_1";

  private Context context;
  private ProductionIdentityManager manager;
  private String peerKeyA;
  private String peerKeyB;

  @Before
  public void setUp() throws Exception {
    context = ApplicationProvider.getApplicationContext();
    peerKeyA = encodedIdentityKey();
    peerKeyB = encodedIdentityKey();
    manager = testManager();
    manager.resetProductionIdentity();
    Map<String, Object> prepared = manager.prepareIdentityRegistration("Pairing Test");
    manager.commitIdentityRegistration((String) prepared.get("operationId"), RECEIPT);
  }

  @After
  public void tearDown() throws Exception {
    new ProductionIdentityManager(context).resetProductionIdentity();
  }

  /**
   * A candidate isolated by one process is answerable by the next, and re-delivering the same bytes
   * is transport noise rather than a second request.
   */
  @Test
  public void aStagedCandidateSurvivesARestartAndItsPacketIsNeverAppliedTwice() throws Exception {
    String requestId = UUID.randomUUID().toString();
    String routeId = UUID.randomUUID().toString();

    assertEquals("apply", stage(requestId, routeId, peerKeyA, ONE_MINUTE_MS));
    assertEquals("duplicate", stage(requestId, routeId, peerKeyA, ONE_MINUTE_MS));

    Map<String, Object> accepted =
        testManager().respondToPairingRequest(requestId, "accept");

    assertEquals("accepted", accepted.get("status"));
    assertEquals(requestId, accepted.get("requestId"));
    assertNotNull(accepted.get("operationId"));
    assertEquals(12, ((List<?>) accepted.get("safetyNumber")).size());
  }

  /**
   * Once a request is refused it stays refused, and the refusal reaches the peer exactly once — even
   * if the caller repeats the decision after the packet was already delivered.
   */
  @Test
  public void aRejectedRequestIsRefusedForeverAndCommitsExactlyOnePacket() throws Exception {
    String requestId = UUID.randomUUID().toString();
    String routeId = UUID.randomUUID().toString();
    stage(requestId, routeId, peerKeyA, ONE_MINUTE_MS);

    Map<String, Object> rejected = manager.respondToPairingRequest(requestId, "reject");
    String operationId = (String) rejected.get("operationId");
    assertEquals("rejected", rejected.get("status"));
    assertEquals(
        operationId, manager.respondToPairingRequest(requestId, "reject").get("operationId"));

    List<Map<String, Object>> queued = outboxItems();
    assertEquals(1, queued.size());
    assertEquals("pair-response", queued.get(0).get("packetType"));
    assertEquals("reject", queued.get(0).get("decision"));
    assertEquals("tombstoned", stage(requestId, routeId, peerKeyB, ONE_MINUTE_MS));

    manager.ackPairingOutbox(operationId, RECEIPT);
    assertTrue(outboxItems().isEmpty());
    assertEquals(
        operationId, manager.respondToPairingRequest(requestId, "reject").get("operationId"));
    assertTrue(outboxItems().isEmpty());
  }

  /**
   * Accepting and confirming are two separate commitments, so they queue two packets; repeating
   * either one returns the operation already queued.
   */
  @Test
  public void acceptingThenConfirmingCommitsOneResponseAndOneVerifyPacket() throws Exception {
    String requestId = UUID.randomUUID().toString();
    stage(requestId, UUID.randomUUID().toString(), peerKeyA, ONE_MINUTE_MS);

    String responseId =
        (String) manager.respondToPairingRequest(requestId, "accept").get("operationId");
    Map<String, Object> confirmed = manager.confirmPairingSafetyNumber(requestId);
    String verifyId = (String) confirmed.get("operationId");

    assertEquals("accepted", confirmed.get("status"));
    assertNotEquals(responseId, verifyId);
    assertEquals(verifyId, manager.confirmPairingSafetyNumber(requestId).get("operationId"));

    List<Map<String, Object>> queued = outboxItems();
    assertEquals(2, queued.size());
    assertEquals("pair-response", queued.get(0).get("packetType"));
    assertEquals("accept", queued.get(0).get("decision"));
    assertEquals("pair-verify", queued.get(1).get("packetType"));
    assertEquals("confirm", queued.get(1).get("decision"));
    assertEquals(requestId, queued.get(1).get("requestId"));
  }

  /**
   * Activation reads the peer from the candidate the local user accepted, and re-applying the same
   * activation event changes nothing.
   */
  @Test
  public void activationTrustsTheStoredCandidateAndIsIdempotent() throws Exception {
    String requestId = UUID.randomUUID().toString();
    String routeId = UUID.randomUUID().toString();
    String pairId = UUID.randomUUID().toString();
    activate(requestId, routeId, peerKeyA, pairId);

    assertEquals(
        "alreadyActive", manager.activatePairedRelationship(requestId, pairId).get("decision"));
    assertEquals("duplicate", stage(requestId, routeId, peerKeyA, ONE_MINUTE_MS));
    assertEquals("tombstoned", stage(requestId, routeId, peerKeyB, ONE_MINUTE_MS));

    ProductionIdentityDatabase.RelationshipRow row = relationship();
    assertEquals(pairId, row.pairId());
    assertEquals(routeId, row.peerRouteId());
    assertEquals("active", row.state());
  }

  /**
   * The schema holds one relationship, so a second pair is refused and a peer whose identity key
   * changed is reported without overwriting the key the user actually verified.
   */
  @Test
  public void aSecondRelationshipIsRefusedAndAChangedPeerKeyIsReportedNotAdopted()
      throws Exception {
    String firstRequest = UUID.randomUUID().toString();
    String firstRoute = UUID.randomUUID().toString();
    String pairId = UUID.randomUUID().toString();
    activate(firstRequest, firstRoute, peerKeyA, pairId);

    String otherRequest = accepted(UUID.randomUUID().toString(), peerKeyB);
    assertEquals(
        "relationshipConflict",
        manager
            .activatePairedRelationship(otherRequest, UUID.randomUUID().toString())
            .get("decision"));

    String changedRequest = accepted(firstRoute, peerKeyB);
    assertEquals(
        "peerIdentityChanged",
        manager.activatePairedRelationship(changedRequest, pairId).get("decision"));

    ProductionIdentityDatabase.RelationshipRow row = relationship();
    assertEquals(pairId, row.pairId());
    assertEquals(firstRoute, row.peerRouteId());
    assertEquals(peerKeyA, storedPeerKey(row));
  }

  /**
   * A mismatch is the user saying the safety numbers differ, so it resolves the request permanently
   * and no later activation can revive it.
   */
  @Test
  public void reportingAMismatchResolvesTheRequestAndNeverActivates() throws Exception {
    String routeId = UUID.randomUUID().toString();
    String requestId = accepted(routeId, peerKeyA);

    Map<String, Object> mismatch = manager.respondToPairingRequest(requestId, "mismatch");
    List<Map<String, Object>> queued = outboxItems();
    assertEquals("mismatch", mismatch.get("status"));
    assertEquals("pair-cancel", queued.get(queued.size() - 1).get("packetType"));
    assertEquals("mismatch", queued.get(queued.size() - 1).get("decision"));

    assertSafeFailure(
        "pairing-candidate-transition-invalid",
        () -> manager.activatePairedRelationship(requestId, UUID.randomUUID().toString()));
    assertNull(relationship());
    assertEquals("tombstoned", stage(requestId, routeId, peerKeyB, ONE_MINUTE_MS));
  }

  /**
   * Both sides run the same clock rule, so retiring an aged-out request tells the peer nothing — but
   * it still has to leave the request unanswerable and unreplayable.
   */
  @Test
  public void theSweepRetiresAnAgedOutRequestWithoutTellingThePeer() throws Exception {
    String requestId = UUID.randomUUID().toString();
    String routeId = UUID.randomUUID().toString();
    stage(requestId, routeId, peerKeyA, 250);
    Thread.sleep(400);

    assertEquals(Integer.valueOf(1), manager.sweepPairingState().get("expiredCandidates"));
    assertTrue(outboxItems().isEmpty());
    assertSafeFailure(
        "pairing-candidate-transition-invalid",
        () -> manager.respondToPairingRequest(requestId, "accept"));
    assertEquals("tombstoned", stage(requestId, routeId, peerKeyB, ONE_MINUTE_MS));
  }

  /** A packet whose window closed in transit leaves a tombstone instead of a candidate. */
  @Test
  public void aPacketThatArrivesAfterItsWindowClosedNeverBecomesACandidate() throws Exception {
    String requestId = UUID.randomUUID().toString();
    String routeId = UUID.randomUUID().toString();

    assertEquals("expired", stage(requestId, routeId, peerKeyA, -1_000));
    assertSafeFailure(
        "pairing-candidate-unknown", () -> manager.respondToPairingRequest(requestId, "accept"));
    assertEquals("tombstoned", stage(requestId, routeId, peerKeyB, ONE_MINUTE_MS));
    assertTrue(outboxItems().isEmpty());
  }

  /** A tampered candidate record rolls the activation back rather than pairing with a guess. */
  @Test
  public void aTamperedCandidateRecordFailsClosedInsteadOfActivating() throws Exception {
    String requestId = accepted(UUID.randomUUID().toString(), peerKeyA);
    execSql(
        "UPDATE pairing_candidates SET candidate_ciphertext = ? WHERE request_id = ?",
        new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14},
        requestId);

    assertSafeFailure(
        "identity-record-corrupt",
        () -> manager.activatePairedRelationship(requestId, UUID.randomUUID().toString()));
    assertNull(relationship());
  }

  /**
   * The inbox marker is what makes a byte-identical retry idempotent, so the sweep may only drop it
   * once neither a candidate nor a tombstone still depends on it.
   */
  @Test
  public void inboxMarkersAreKeptUntilNothingStillNeedsThem() throws Exception {
    String requestId = UUID.randomUUID().toString();
    stage(requestId, UUID.randomUUID().toString(), peerKeyA, ONE_MINUTE_MS);
    manager.respondToPairingRequest(requestId, "reject");

    assertEquals(Integer.valueOf(0), manager.sweepPairingState().get("removedInboxMarkers"));

    execSql("DELETE FROM pairing_candidates WHERE request_id = ?", requestId);
    assertEquals(Integer.valueOf(0), manager.sweepPairingState().get("removedInboxMarkers"));

    execSql("DELETE FROM replay_tombstones WHERE request_id = ?", requestId);
    assertEquals(Integer.valueOf(1), manager.sweepPairingState().get("removedInboxMarkers"));
  }

  /** Pairing before the server has registered this device would queue work nothing can deliver. */
  @Test
  public void pairingIsRefusedUntilRegistrationCompletes() throws Exception {
    manager.resetProductionIdentity();
    manager.prepareIdentityRegistration(null);

    assertSafeFailure("identity-registration-incomplete", () -> manager.listPairingOutbox());
    assertSafeFailure(
        "identity-registration-incomplete",
        () -> manager.respondToPairingRequest(UUID.randomUUID().toString(), "accept"));
  }

  /** Without the record key nothing can be read or written, so every action stops at the boundary. */
  @Test
  public void aMissingRecordKeyStopsEveryPairingAction() throws Exception {
    String requestId = UUID.randomUUID().toString();
    stage(requestId, UUID.randomUUID().toString(), peerKeyA, ONE_MINUTE_MS);
    deleteAlias(ProductionRecordCipher.KEY_ALIAS);

    assertSafeFailure("identity-key-missing", () -> manager.listPairingOutbox());
    assertSafeFailure(
        "identity-key-missing", () -> manager.respondToPairingRequest(requestId, "accept"));
  }

  /** Steps a caller must not be able to skip or invent from outside the module. */
  @Test
  public void theModuleBoundaryRefusesActionsThatWouldSkipTheProtocol() throws Exception {
    String requestId = UUID.randomUUID().toString();
    stage(requestId, UUID.randomUUID().toString(), peerKeyA, ONE_MINUTE_MS);

    assertSafeFailure(
        "pairing-candidate-action-invalid",
        () -> manager.respondToPairingRequest(requestId, "expire"));
    assertSafeFailure(
        "pairing-candidate-transition-invalid",
        () -> manager.confirmPairingSafetyNumber(requestId));
    assertSafeFailure(
        "pairing-candidate-transition-invalid",
        () -> manager.activatePairedRelationship(requestId, UUID.randomUUID().toString()));
    assertSafeFailure(
        "pairing-outbox-unknown",
        () -> manager.ackPairingOutbox(UUID.randomUUID().toString(), RECEIPT));
    assertSafeFailure(
        "pairing-outbox-receipt-invalid",
        () -> manager.ackPairingOutbox(UUID.randomUUID().toString(), "short"));
  }

  /** Stages a candidate, then accepts and confirms it, and returns its request id. */
  private String accepted(String routeId, String peerIdentityKey) throws Exception {
    String requestId = UUID.randomUUID().toString();
    stage(requestId, routeId, peerIdentityKey, ONE_MINUTE_MS);
    manager.respondToPairingRequest(requestId, "accept");
    manager.confirmPairingSafetyNumber(requestId);
    return requestId;
  }

  private void activate(String requestId, String routeId, String peerIdentityKey, String pairId)
      throws Exception {
    stage(requestId, routeId, peerIdentityKey, ONE_MINUTE_MS);
    manager.respondToPairingRequest(requestId, "accept");
    manager.confirmPairingSafetyNumber(requestId);
    assertEquals("activate", manager.activatePairedRelationship(requestId, pairId).get("decision"));
  }

  /**
   * Delivers a packet whose bytes are derived from the request and peer key, so re-staging the same
   * arguments is a byte-identical retry and changing the key is a different packet for the same
   * request.
   */
  private String stage(
      String requestId, String routeId, String peerIdentityKey, long expiresInMs) throws Exception {
    InboundPacket inbound =
        new InboundPacket(
            UUID.randomUUID().toString(),
            requestId,
            routeId,
            (requestId + "|" + peerIdentityKey).getBytes(StandardCharsets.UTF_8),
            System.currentTimeMillis() + expiresInMs);
    PeerCandidate candidate =
        new PeerCandidate(
            UUID.randomUUID().toString(),
            peerIdentityKey,
            "M2Y-2345-6789-ABCD-EFGH",
            UUID.randomUUID().toString(),
            System.currentTimeMillis());
    return (String) manager.stagePeerCandidate(inbound, candidate).get("decision");
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> outboxItems() throws Exception {
    return (List<Map<String, Object>>) manager.listPairingOutbox().get("items");
  }

  private ProductionIdentityDatabase.RelationshipRow relationship() {
    ProductionIdentityDatabase database = new ProductionIdentityDatabase(context);
    try {
      return database.loadRelationship(database.getReadableDatabase());
    } finally {
      database.close();
    }
  }

  private static String storedPeerKey(ProductionIdentityDatabase.RelationshipRow row)
      throws Exception {
    byte[] plaintext =
        new ProductionRecordCipher()
            .decrypt("relationship", "peer-summary", 1, row.peerSummaryCiphertext());
    return PairingRecordCodec.decodeCandidate(new String(plaintext, StandardCharsets.UTF_8))
        .peerIdentityKey();
  }

  /** 测试只替换网络响应密文生成；候选、安全码和事务仍使用真实实现。 */
  private ProductionIdentityManager testManager() {
    return new ProductionIdentityManager(
        context,
        (connection, identity, registrationId, requestId, action, nowMs) ->
            new ProductionPairingPacketCodec.ResponsePacket(
                nowMs, action, "p".repeat(64), requestId));
  }

  private static String encodedIdentityKey() {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(IdentityKeyPair.generate().getPublicKey().serialize());
  }

  private void execSql(String sql, Object... args) {
    ProductionIdentityDatabase database = new ProductionIdentityDatabase(context);
    try {
      database.getWritableDatabase().execSQL(sql, args);
    } finally {
      database.close();
    }
  }

  private static void assertSafeFailure(String expectedCode, CheckedOperation operation)
      throws Exception {
    try {
      operation.run();
      fail("Expected production identity failure: " + expectedCode);
    } catch (ProductionIdentityException error) {
      assertEquals(expectedCode, error.safeCode());
    }
  }

  private static void deleteAlias(String alias) throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    if (keyStore.containsAlias(alias)) {
      keyStore.deleteEntry(alias);
    }
  }

  @FunctionalInterface
  private interface CheckedOperation {
    void run() throws Exception;
  }
}
