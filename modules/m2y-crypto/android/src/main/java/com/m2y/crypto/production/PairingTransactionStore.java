package com.m2y.crypto.production;

import android.database.sqlite.SQLiteDatabase;
import com.m2y.crypto.production.PairingProtocolRules.ActivationDecision;
import com.m2y.crypto.production.PairingProtocolRules.CandidateAction;
import com.m2y.crypto.production.PairingProtocolRules.CandidateStatus;
import com.m2y.crypto.production.PairingProtocolRules.IncomingDecision;
import com.m2y.crypto.production.PairingProtocolRules.PairingIntentKind;
import com.m2y.crypto.production.PairingProtocolRules.TombstoneOutcome;
import com.m2y.crypto.production.PairingRecordCodec.PairingIntent;
import com.m2y.crypto.production.PairingRecordCodec.PeerCandidate;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The pairing half of the production store: every write that stages, resolves or activates runs as
 * one SQLite transaction, and nothing is returned until that transaction has committed. A caller
 * that sees a result can therefore assume the state survives a kill; a caller that sees an exception
 * can assume nothing was written.
 *
 * <p>All decisions come from {@link PairingProtocolRules}, which is unit-tested on the JVM. What
 * lives here is the ordering — read, decide, encrypt, write markers, commit — plus the encryption
 * boundary, because those are the parts that need a real database and a real Keystore.
 */
final class PairingTransactionStore {
  private static final long RECORD_REVISION = 1;

  /**
   * Stands in for the packet hash of a request that never had an inbound packet, so a locally
   * originated refusal can still key a tombstone. Tombstone lookups are per request, so the value
   * only has to be a stable non-hash.
   */
  private static final String NO_PACKET = "none";

  private final ProductionIdentityDatabase database;
  private final ProductionPairingProtocolEngine protocolEngine;
  private final ProductionRecordCipher recordCipher;

  PairingTransactionStore(
      ProductionIdentityDatabase database, ProductionRecordCipher recordCipher) {
    this.database = database;
    this.recordCipher = recordCipher;
    this.protocolEngine = new ProductionPairingProtocolEngine(database, recordCipher);
  }

  /** An inbound pairing packet as the transport delivered it, before anything is trusted. */
  record InboundPacket(
      String eventId, String requestId, String peerRouteId, byte[] packet, long expiresAtMs) {}

  /**
   * Isolates a peer-supplied candidate. The replay gate runs inside the same transaction as the
   * insert, so two deliveries racing on the same request cannot both pass it, and the candidate is
   * stored encrypted with nothing but opaque ids and a status readable in the clear.
   */
  Map<String, Object> stageCandidate(
      SQLiteDatabase connection, InboundPacket inbound, PeerCandidate candidate, long nowMs)
      throws ProductionIdentityException {
    PairingProtocolRules.requireBoundedWindow(inbound.expiresAtMs(), nowMs);
    String fingerprint = PairingPacketFingerprint.ofPacket(inbound.requestId(), inbound.packet());
    String candidateJson = PairingRecordCodec.encodeCandidate(candidate);

    connection.beginTransaction();
    try {
      IncomingDecision decision =
          PairingProtocolRules.classifyIncoming(
              database.hasInboxFingerprint(connection, inbound.requestId(), fingerprint),
              database.tombstoneOutcome(connection, inbound.requestId()),
              inbound.expiresAtMs(),
              nowMs);
      if (decision == IncomingDecision.APPLY) {
        if (database.loadCandidate(connection, inbound.requestId()) != null) {
          throw new ProductionIdentityException("pairing-candidate-conflict");
        }
        byte[] plaintext = candidateJson.getBytes(StandardCharsets.UTF_8);
        try {
          database.insertCandidate(
              connection,
              inbound.requestId(),
              inbound.peerRouteId(),
              CandidateStatus.PENDING_LOCAL_REVIEW.stored(),
              recordCipher.encrypt(
                  "candidate", inbound.requestId(), RECORD_REVISION, plaintext),
              inbound.expiresAtMs(),
              RECORD_REVISION);
        } finally {
          Arrays.fill(plaintext, (byte) 0);
        }
        database.insertInbox(
            connection, inbound.eventId(), inbound.requestId(), fingerprint, nowMs);
      } else if (decision == IncomingDecision.EXPIRED) {
        database.insertTombstone(
            connection,
            inbound.requestId(),
            fingerprint,
            TombstoneOutcome.EXPIRED.stored(),
            PairingProtocolRules.tombstoneExpiryFor(inbound.expiresAtMs()));
      }
      connection.setTransactionSuccessful();
      return result("decision", storedDecision(decision), "requestId", inbound.requestId());
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-candidate-store-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * Applies a local decision to a staged candidate: the status transition, the tombstone that makes
   * the request unrepeatable, and the outbox intent the transport later delivers, all committed
   * together. Accepting deliberately writes no tombstone — the request is still live until both
   * sides have confirmed the safety number.
   */
  Map<String, Object> resolveCandidate(
      SQLiteDatabase connection, String requestId, CandidateAction action, long nowMs)
      throws ProductionIdentityException {
    connection.beginTransaction();
    try {
      ProductionIdentityDatabase.CandidateRow row = requireCandidate(connection, requestId);
      CandidateStatus current = CandidateStatus.fromStored(row.status());
      CandidateStatus next = PairingProtocolRules.resolveCandidate(current, action);
      if (next != current) {
        database.updateCandidateStatus(connection, requestId, next.stored(), row.revision() + 1);
      }

      TombstoneOutcome outcome = PairingProtocolRules.tombstoneFor(next);
      if (outcome != null) {
        writeTombstone(connection, requestId, outcome, row.expiresAtMs());
      }

      Map<String, Object> committed =
          commitIntent(connection, requestId, PairingProtocolRules.intentFor(action), nowMs);
      connection.setTransactionSuccessful();
      return merge(result("requestId", requestId, "status", next.stored()), committed);
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-candidate-store-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * Commits the local half of safety-number verification. The candidate stays accepted: confirming
   * is not an outcome, it is one of the two independent confirmations that activation later requires.
   */
  Map<String, Object> confirmSafetyNumber(
      SQLiteDatabase connection, String requestId, long nowMs)
      throws ProductionIdentityException {
    connection.beginTransaction();
    try {
      ProductionIdentityDatabase.CandidateRow row = requireCandidate(connection, requestId);
      if (CandidateStatus.fromStored(row.status()) != CandidateStatus.ACCEPTED) {
        throw new ProductionIdentityException("pairing-candidate-transition-invalid");
      }
      if (nowMs >= row.expiresAtMs()) {
        throw new ProductionIdentityException("pairing-candidate-expired");
      }

      Map<String, Object> committed =
          commitIntent(connection, requestId, PairingIntentKind.CONFIRM_SAFETY, nowMs);
      connection.setTransactionSuccessful();
      return merge(
          result("requestId", requestId, "status", CandidateStatus.ACCEPTED.stored()), committed);
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-candidate-store-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * Activates the single relationship the schema allows. The peer route and identity key come from
   * the locally accepted candidate rather than from the activation event, so a server that names a
   * different peer cannot redirect the relationship; only the pair id is taken from the caller.
   */
  Map<String, Object> activateRelationship(
      SQLiteDatabase connection, String requestId, String pairId, long nowMs)
      throws ProductionIdentityException {
    connection.beginTransaction();
    try {
      ProductionIdentityDatabase.CandidateRow row = requireCandidate(connection, requestId);
      if (CandidateStatus.fromStored(row.status()) != CandidateStatus.ACCEPTED) {
        throw new ProductionIdentityException("pairing-candidate-transition-invalid");
      }
      PeerCandidate candidate = decodeCandidate(requestId, row.candidateCiphertext());
      String fingerprint = PairingPacketFingerprint.ofPeerIdentity(candidate.peerIdentityKey());

      ProductionIdentityDatabase.RelationshipRow stored = database.loadRelationship(connection);
      ActivationDecision decision =
          PairingProtocolRules.classifyActivation(
              stored == null ? null : stored.pairId(),
              stored == null ? null : stored.peerRouteId(),
              stored == null ? null : storedPeerFingerprint(stored),
              pairId,
              row.peerRouteId(),
              fingerprint);

      if (decision == ActivationDecision.ACTIVATE) {
        writeRelationship(connection, pairId, row.peerRouteId(), candidate, nowMs);
        writeTombstone(connection, requestId, TombstoneOutcome.APPLIED, row.expiresAtMs());
      }
      connection.setTransactionSuccessful();
      return result("decision", storedDecision(decision), "requestId", requestId);
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-relationship-store-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * The pending transport work, decrypted into protocol metadata. Identity registration is excluded:
   * it carries a different payload and has its own call.
   */
  Map<String, Object> listOutbox(SQLiteDatabase connection) throws ProductionIdentityException {
    List<Map<String, Object>> items = new ArrayList<>();
    for (ProductionIdentityDatabase.OutboxRow row : database.pendingPairingIntents(connection)) {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("createdAtMs", row.createdAtMs());
      if ("pair-request".equals(row.packetType())) {
        ProductionPairingPacketCodec.OutgoingPacket packet = protocolEngine.decodeOutbox(row);
        item.put("decision", "submit");
        item.put("expiresAtMs", packet.expiresAtMs());
        item.put("packet", packet.packet());
        item.put("targetDeviceId", packet.targetDeviceId());
        item.put("targetM2yId", packet.targetM2yId());
        item.put("targetStableIdentityId", packet.targetStableIdentityId());
      } else {
        PairingIntent intent = decodeIntent(row.operationId(), row.ciphertext());
        if (!intent.requestId().equals(row.requestId())
            || !intent.packetType().equals(row.packetType())) {
          throw new ProductionIdentityException("pairing-intent-corrupt");
        }
        item.put("decision", intent.decision());
      }
      item.put("operationId", row.operationId());
      item.put("packetType", row.packetType());
      item.put("requestId", row.requestId());
      item.put("retryCount", row.retryCount());
      items.add(Collections.unmodifiableMap(item));
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("items", Collections.unmodifiableList(items));
    result.put("schemaVersion", 1);
    return Collections.unmodifiableMap(result);
  }

  /**
   * Acknowledges delivered transport work. Re-acknowledging is a success rather than an error: the
   * transport may legitimately retry a call whose response it never saw.
   */
  Map<String, Object> acknowledgeOutbox(
      SQLiteDatabase connection, String operationId, long nowMs)
      throws ProductionIdentityException {
    connection.beginTransaction();
    try {
      boolean acknowledged = database.acknowledgeOutboxIfPending(connection, operationId, nowMs);
      if (!acknowledged && !database.outboxExists(connection, operationId)) {
        throw new ProductionIdentityException("pairing-outbox-unknown");
      }
      connection.setTransactionSuccessful();
      return result("operationId", operationId, "status", "acknowledged");
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-outbox-store-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * Retires state the clock has settled: candidates whose window closed while still answerable
   * become expired with a tombstone, tombstones past their retention are dropped, and inbox markers
   * are dropped only once neither a candidate nor a tombstone still needs them.
   */
  Map<String, Object> sweep(SQLiteDatabase connection, long nowMs)
      throws ProductionIdentityException {
    connection.beginTransaction();
    try {
      int expired = 0;
      for (ProductionIdentityDatabase.CandidateRow row :
          database.answerableExpiredCandidates(connection, nowMs)) {
        CandidateStatus next =
            PairingProtocolRules.resolveCandidate(
                CandidateStatus.fromStored(row.status()), CandidateAction.EXPIRE);
        database.updateCandidateStatus(
            connection, row.requestId(), next.stored(), row.revision() + 1);
        writeTombstone(connection, row.requestId(), TombstoneOutcome.EXPIRED, row.expiresAtMs());
        expired++;
      }
      int tombstones = database.deleteExpiredTombstones(connection, nowMs);
      int markers = database.deleteOrphanInboxMarkers(connection);
      connection.setTransactionSuccessful();

      Map<String, Object> result = new LinkedHashMap<>();
      result.put("expiredCandidates", expired);
      result.put("removedInboxMarkers", markers);
      result.put("removedTombstones", tombstones);
      result.put("schemaVersion", 1);
      return Collections.unmodifiableMap(result);
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-sweep-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  /**
   * Reuses the operation already committed for this request and packet type when one exists, so a
   * caller that repeats a decision — after a lost response, or by tapping twice — gets the first
   * operation back instead of queueing a second packet the peer would have to ignore.
   */
  private Map<String, Object> commitIntent(
      SQLiteDatabase connection, String requestId, PairingIntentKind kind, long nowMs)
      throws ProductionIdentityException {
    if (kind == null) {
      return Map.of();
    }
    String committed = database.committedIntentId(connection, requestId, kind.packetType());
    if (committed != null) {
      return Map.of("operationId", committed);
    }

    String operationId = ProductionIdentityIds.newOperationId();
    byte[] plaintext =
        PairingRecordCodec.encodeIntent(
                new PairingIntent(kind.decision(), kind.packetType(), requestId, nowMs))
            .getBytes(StandardCharsets.UTF_8);
    try {
      database.insertOutbox(
          connection,
          operationId,
          requestId,
          kind.packetType(),
          recordCipher.encrypt("outbox", operationId, RECORD_REVISION, plaintext),
          nowMs);
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
    return Map.of("operationId", operationId);
  }

  PeerCandidate decodeCandidate(ProductionIdentityDatabase.CandidateRow row)
      throws ProductionIdentityException {
    return decodeCandidate(row.requestId(), row.candidateCiphertext());
  }

  private PeerCandidate decodeCandidate(String requestId, byte[] ciphertext)
      throws ProductionIdentityException {
    if (ciphertext == null) {
      throw new ProductionIdentityException("pairing-candidate-corrupt");
    }
    byte[] plaintext =
        recordCipher.decrypt("candidate", requestId, RECORD_REVISION, ciphertext);
    try {
      return PairingRecordCodec.decodeCandidate(new String(plaintext, StandardCharsets.UTF_8));
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  private PairingIntent decodeIntent(String operationId, byte[] ciphertext)
      throws ProductionIdentityException {
    byte[] plaintext = recordCipher.decrypt("outbox", operationId, RECORD_REVISION, ciphertext);
    try {
      return PairingRecordCodec.decodeIntent(new String(plaintext, StandardCharsets.UTF_8));
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  private static Map<String, Object> merge(
      Map<String, Object> base, Map<String, Object> additional) {
    if (additional.isEmpty()) {
      return base;
    }
    Map<String, Object> merged = new LinkedHashMap<>(base);
    merged.putAll(additional);
    Map<String, Object> ordered = new LinkedHashMap<>();
    merged.keySet().stream().sorted().forEach(key -> ordered.put(key, merged.get(key)));
    return Collections.unmodifiableMap(ordered);
  }

  private ProductionIdentityDatabase.CandidateRow requireCandidate(
      SQLiteDatabase connection, String requestId) throws ProductionIdentityException {
    if (requestId == null || requestId.isEmpty() || requestId.length() > 128) {
      throw new ProductionIdentityException("pairing-candidate-unknown");
    }
    ProductionIdentityDatabase.CandidateRow row = database.loadCandidate(connection, requestId);
    if (row == null) {
      throw new ProductionIdentityException("pairing-candidate-unknown");
    }
    return row;
  }

  private static Map<String, Object> result(
      String firstKey, Object firstValue, String secondKey, Object secondValue) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put(firstKey, firstValue);
    result.put("schemaVersion", 1);
    result.put(secondKey, secondValue);
    return Collections.unmodifiableMap(result);
  }

  private static String storedDecision(Enum<?> decision) {
    String[] parts = decision.name().toLowerCase(java.util.Locale.ROOT).split("_");
    StringBuilder camel = new StringBuilder(parts[0]);
    for (int index = 1; index < parts.length; index++) {
      camel.append(Character.toUpperCase(parts[index].charAt(0))).append(parts[index].substring(1));
    }
    return camel.toString();
  }

  private String storedPeerFingerprint(ProductionIdentityDatabase.RelationshipRow stored)
      throws ProductionIdentityException {
    byte[] plaintext =
        recordCipher.decrypt(
            "relationship", "peer-summary", RECORD_REVISION, stored.peerSummaryCiphertext());
    try {
      return PairingPacketFingerprint.ofPeerIdentity(
          PairingRecordCodec.decodeCandidate(new String(plaintext, StandardCharsets.UTF_8))
              .peerIdentityKey());
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  private void writeRelationship(
      SQLiteDatabase connection,
      String pairId,
      String peerRouteId,
      PeerCandidate candidate,
      long nowMs)
      throws ProductionIdentityException {
    byte[] plaintext =
        PairingRecordCodec.encodeCandidate(candidate).getBytes(StandardCharsets.UTF_8);
    try {
      database.insertRelationship(
          connection,
          pairId,
          peerRouteId,
          "active",
          recordCipher.encrypt("relationship", "peer-summary", RECORD_REVISION, plaintext),
          nowMs,
          RECORD_REVISION);
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  private void writeTombstone(
      SQLiteDatabase connection, String requestId, TombstoneOutcome outcome, long expiresAtMs) {
    String packetHash = database.inboxPacketHash(connection, requestId);
    database.insertTombstone(
        connection,
        requestId,
        packetHash == null ? NO_PACKET : packetHash,
        outcome.stored(),
        PairingProtocolRules.tombstoneExpiryFor(expiresAtMs));
  }
}
