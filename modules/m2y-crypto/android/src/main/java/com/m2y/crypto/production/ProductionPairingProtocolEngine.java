package com.m2y.crypto.production;

import android.database.sqlite.SQLiteDatabase;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.NoSessionException;
import org.signal.libsignal.protocol.SessionBuilder;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.UntrustedIdentityException;
import org.signal.libsignal.protocol.message.CiphertextMessage;

/** 只负责生产 M2Y-ID 首包：PQXDH 会话变更与可恢复 outbox 在同一 SQLite 事务提交。 */
final class ProductionPairingProtocolEngine {
  private static final Base64.Encoder BASE64_URL_ENCODER =
      Base64.getUrlEncoder().withoutPadding();
  private static final long RECORD_REVISION = 1;

  private final ProductionIdentityDatabase database;
  private final ProductionRecordCipher recordCipher;

  ProductionPairingProtocolEngine(
      ProductionIdentityDatabase database, ProductionRecordCipher recordCipher) {
    this.database = database;
    this.recordCipher = recordCipher;
  }

  Map<String, Object> preparePairingPacket(
      SQLiteDatabase connection,
      ProductionIdentityDatabase.IdentityProjection localIdentity,
      String localDisplayName,
      int localRegistrationId,
      String requestId,
      long expiresAtMs,
      ProductionPairingTargetBundle target,
      long nowMs)
      throws ProductionIdentityException {
    PairingProtocolRules.requireBoundedWindow(expiresAtMs, nowMs);
    if (expiresAtMs <= nowMs) {
      throw new ProductionIdentityException("pairing-request-expired");
    }

    ProductionIdentityDatabase.OutboxRow existing =
        database.pairingOutbox(connection, requestId, "pair-request");
    if (existing != null) {
      ProductionPairingPacketCodec.OutgoingPacket packet = decodeOutbox(existing);
      if (!packet.targetDeviceId().equals(target.deviceId())
          || !packet.targetStableIdentityId().equals(target.stableIdentityId())
          || !packet.targetM2yId().equals(target.m2yId())
          || packet.expiresAtMs() != expiresAtMs) {
        throw new ProductionIdentityException("pairing-request-binding-invalid");
      }
      return ProductionPairingPacketCodec.result(existing.operationId(), packet);
    }
    if (database.loadRelationship(connection) != null) {
      throw new ProductionIdentityException("pairing-relationship-conflict");
    }

    connection.beginTransaction();
    try {
      ProductionSignalProtocolStore store =
          new ProductionSignalProtocolStore(
              connection, database, recordCipher, localRegistrationId, nowMs);
      SignalProtocolAddress localAddress =
          new SignalProtocolAddress(localIdentity.stableIdentityId(), 1);
      SignalProtocolAddress remoteAddress = new SignalProtocolAddress(requestId, 1);
      new SessionBuilder(store, remoteAddress, localAddress).process(target.toPreKeyBundle());

      String localIdentityPublicKey =
          BASE64_URL_ENCODER.encodeToString(store.getIdentityKeyPair().getPublicKey().serialize());
      byte[] handshake =
          ProductionPairingPacketCodec.encodeHandshake(
                  new ProductionPairingPacketCodec.Handshake(
                      requestId,
                      localIdentity.deviceId(),
                      localIdentityPublicKey,
                      localIdentity.m2yId(),
                      localIdentity.stableIdentityId(),
                      localDisplayName,
                      expiresAtMs))
              .getBytes(StandardCharsets.UTF_8);
      String packet;
      try {
        CiphertextMessage ciphertext =
            new SessionCipher(store, localAddress, remoteAddress).encrypt(handshake);
        if (ciphertext.getType() != CiphertextMessage.PREKEY_TYPE) {
          throw new ProductionIdentityException("pairing-first-packet-not-prekey");
        }
        packet = BASE64_URL_ENCODER.encodeToString(ciphertext.serialize());
      } finally {
        Arrays.fill(handshake, (byte) 0);
      }

      String operationId = ProductionIdentityIds.newOperationId();
      ProductionPairingPacketCodec.OutgoingPacket outboxPacket =
          new ProductionPairingPacketCodec.OutgoingPacket(
              nowMs,
              expiresAtMs,
              packet,
              requestId,
              target.deviceId(),
              target.m2yId(),
              target.stableIdentityId());
      byte[] plaintext =
          ProductionPairingPacketCodec.encodeOutgoing(outboxPacket)
              .getBytes(StandardCharsets.UTF_8);
      try {
        database.insertOutbox(
            connection,
            operationId,
            requestId,
            "pair-request",
            recordCipher.encrypt("outbox", operationId, RECORD_REVISION, plaintext),
            nowMs);
      } finally {
        Arrays.fill(plaintext, (byte) 0);
      }
      connection.setTransactionSuccessful();
      return ProductionPairingPacketCodec.result(operationId, outboxPacket);
    } catch (ProductionProtocolStoreFailure e) {
      throw e.failure();
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (InvalidKeyException | UntrustedIdentityException | NoSessionException e) {
      throw new ProductionIdentityException("pairing-protocol-operation-failed", e);
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-protocol-operation-failed", e);
    } finally {
      connection.endTransaction();
    }
  }

  ProductionPairingPacketCodec.OutgoingPacket decodeOutbox(
      ProductionIdentityDatabase.OutboxRow row) throws ProductionIdentityException {
    byte[] plaintext =
        recordCipher.decrypt("outbox", row.operationId(), RECORD_REVISION, row.ciphertext());
    try {
      ProductionPairingPacketCodec.OutgoingPacket packet =
          ProductionPairingPacketCodec.decodeOutgoing(
              new String(plaintext, StandardCharsets.UTF_8));
      if (!packet.requestId().equals(row.requestId()) || !"pair-request".equals(row.packetType())) {
        throw new ProductionIdentityException("pairing-outbox-packet-corrupt");
      }
      return packet;
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  ProductionPairingPacketCodec.OutgoingPacket inspectAcknowledgedOutgoing(
      SQLiteDatabase connection, long nowMs) throws ProductionIdentityException {
    ProductionIdentityDatabase.OutboxRow row =
        database.latestPairingOutbox(connection, "pair-request");
    if (row == null || row.acknowledgedAtMs() == null) {
      return null;
    }
    ProductionPairingPacketCodec.OutgoingPacket packet = decodeOutbox(row);
    return packet.expiresAtMs() > nowMs ? packet : null;
  }
}
