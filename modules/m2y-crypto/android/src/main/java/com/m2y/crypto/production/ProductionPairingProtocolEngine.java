package com.m2y.crypto.production;

import android.database.sqlite.SQLiteDatabase;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import org.signal.libsignal.protocol.DuplicateMessageException;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.InvalidKeyIdException;
import org.signal.libsignal.protocol.InvalidMessageException;
import org.signal.libsignal.protocol.InvalidVersionException;
import org.signal.libsignal.protocol.LegacyMessageException;
import org.signal.libsignal.protocol.NoSessionException;
import org.signal.libsignal.protocol.SessionBuilder;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.UntrustedIdentityException;
import org.signal.libsignal.protocol.message.CiphertextMessage;
import org.signal.libsignal.protocol.message.PreKeySignalMessage;

/** 负责生产 M2Y-ID 握手密文，并让会话变更与可恢复 outbox 处于同一 SQLite 事务。 */
final class ProductionPairingProtocolEngine implements PairingResponsePacketFactory {
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

  /** 使用首包已经建立的双棘轮会话生成接受或拒绝响应；事务由候选状态存储统一持有。 */
  @Override
  public ProductionPairingPacketCodec.ResponsePacket createResponsePacket(
      SQLiteDatabase connection,
      ProductionIdentityDatabase.IdentityProjection localIdentity,
      int localRegistrationId,
      String requestId,
      String action,
      long nowMs)
      throws ProductionIdentityException {
    byte[] plaintext =
        ProductionPairingPacketCodec.encodeResponse(
                new ProductionPairingPacketCodec.Response(action, requestId))
            .getBytes(StandardCharsets.UTF_8);
    try {
      ProductionSignalProtocolStore store =
          new ProductionSignalProtocolStore(
              connection, database, recordCipher, localRegistrationId, nowMs);
      SignalProtocolAddress localAddress =
          new SignalProtocolAddress(localIdentity.stableIdentityId(), 1);
      SignalProtocolAddress remoteAddress = new SignalProtocolAddress(requestId, 1);
      CiphertextMessage ciphertext =
          new SessionCipher(store, localAddress, remoteAddress).encrypt(plaintext);
      if (ciphertext.getType() != CiphertextMessage.WHISPER_TYPE) {
        throw new ProductionIdentityException("pairing-response-not-ratcheted");
      }
      return new ProductionPairingPacketCodec.ResponsePacket(
          nowMs,
          action,
          BASE64_URL_ENCODER.encodeToString(ciphertext.serialize()),
          requestId);
    } catch (ProductionProtocolStoreFailure error) {
      throw error.failure();
    } catch (UntrustedIdentityException | NoSessionException error) {
      throw new ProductionIdentityException("pairing-response-encrypt-failed", error);
    } catch (RuntimeException error) {
      throw new ProductionIdentityException("pairing-response-encrypt-failed", error);
    } finally {
      Arrays.fill(plaintext, (byte) 0);
    }
  }

  /** 解密并提交目标端收到的首包；session、prekey 消耗、可信身份与 candidate 同事务落盘。 */
  void consumePairingRequestEvent(
      SQLiteDatabase connection,
      ProductionIdentityDatabase.IdentityProjection localIdentity,
      int localRegistrationId,
      PairingTransactionStore pairingStore,
      String eventId,
      String requestId,
      String encodedPacket,
      long nowMs)
      throws ProductionIdentityException {
    byte[] packet = decodePacket(encodedPacket);
    String fingerprint = PairingPacketFingerprint.ofPacket(requestId, packet);
    connection.beginTransaction();
    try {
      if (database.hasInboxFingerprint(connection, requestId, fingerprint)
          || database.tombstoneOutcome(connection, requestId) != null) {
        connection.setTransactionSuccessful();
        return;
      }
      if (database.loadCandidate(connection, requestId) != null) {
        throw new ProductionIdentityException("pairing-candidate-conflict");
      }

      ProductionSignalProtocolStore store =
          new ProductionSignalProtocolStore(
              connection, database, recordCipher, localRegistrationId, nowMs);
      SignalProtocolAddress localAddress =
          new SignalProtocolAddress(localIdentity.stableIdentityId(), 1);
      SignalProtocolAddress remoteAddress = new SignalProtocolAddress(requestId, 1);
      PreKeySignalMessage message = new PreKeySignalMessage(packet);
      byte[] plaintext =
          new SessionCipher(store, localAddress, remoteAddress).decrypt(message);
      try {
        ProductionPairingPacketCodec.Handshake handshake =
            ProductionPairingPacketCodec.decodeHandshake(
                new String(plaintext, StandardCharsets.UTF_8));
        validateInboundHandshake(localIdentity, requestId, message, handshake, nowMs);
        pairingStore.stageCandidate(
            connection,
            new PairingTransactionStore.InboundPacket(
                eventId, requestId, handshake.senderDeviceId(), packet, handshake.expiresAtMs()),
            new PairingRecordCodec.PeerCandidate(
                handshake.senderDeviceId(),
                handshake.senderIdentityPublicKey(),
                handshake.senderM2yId(),
                handshake.senderStableIdentityId(),
                nowMs),
            nowMs);
      } finally {
        Arrays.fill(plaintext, (byte) 0);
      }
      connection.setTransactionSuccessful();
    } catch (ProductionProtocolStoreFailure e) {
      throw e.failure();
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (InvalidMessageException
        | InvalidVersionException
        | LegacyMessageException
        | InvalidKeyException
        | InvalidKeyIdException
        | DuplicateMessageException
        | UntrustedIdentityException e) {
      throw new ProductionIdentityException("pairing-packet-open-failed", e);
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("pairing-packet-open-failed", e);
    } finally {
      Arrays.fill(packet, (byte) 0);
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

  ProductionPairingPacketCodec.ResponsePacket decodeResponseOutbox(
      ProductionIdentityDatabase.OutboxRow row) throws ProductionIdentityException {
    byte[] plaintext =
        recordCipher.decrypt("outbox", row.operationId(), RECORD_REVISION, row.ciphertext());
    try {
      ProductionPairingPacketCodec.ResponsePacket packet =
          ProductionPairingPacketCodec.decodeResponsePacket(
              new String(plaintext, StandardCharsets.UTF_8));
      if (!packet.requestId().equals(row.requestId()) || !"pair-response".equals(row.packetType())) {
        throw new ProductionIdentityException("pairing-outbox-response-corrupt");
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

  private static byte[] decodePacket(String encoded) throws ProductionIdentityException {
    if (encoded == null
        || encoded.length() < 32
        || encoded.length() > 24_576
        || !encoded.matches("^[A-Za-z0-9_-]+$")) {
      throw new ProductionIdentityException("pairing-packet-invalid");
    }
    try {
      byte[] decoded = Base64.getUrlDecoder().decode(encoded);
      if (!BASE64_URL_ENCODER.encodeToString(decoded).equals(encoded)) {
        Arrays.fill(decoded, (byte) 0);
        throw new ProductionIdentityException("pairing-packet-invalid");
      }
      return decoded;
    } catch (IllegalArgumentException e) {
      throw new ProductionIdentityException("pairing-packet-invalid", e);
    }
  }

  private static void validateInboundHandshake(
      ProductionIdentityDatabase.IdentityProjection localIdentity,
      String requestId,
      PreKeySignalMessage message,
      ProductionPairingPacketCodec.Handshake handshake,
      long nowMs)
      throws ProductionIdentityException {
    String messageIdentity =
        BASE64_URL_ENCODER.encodeToString(message.getIdentityKey().serialize());
    if (!requestId.equals(handshake.requestId())
        || handshake.expiresAtMs() <= nowMs
        || localIdentity.deviceId().equals(handshake.senderDeviceId())
        || localIdentity.m2yId().equals(handshake.senderM2yId())
        || localIdentity.stableIdentityId().equals(handshake.senderStableIdentityId())
        || !MessageDigest.isEqual(
            messageIdentity.getBytes(StandardCharsets.US_ASCII),
            handshake.senderIdentityPublicKey().getBytes(StandardCharsets.US_ASCII))) {
      throw new ProductionIdentityException("pairing-handshake-binding-invalid");
    }
    PairingProtocolRules.requireBoundedWindow(handshake.expiresAtMs(), nowMs);
  }
}

/** 允许持久化 instrumentation 测试注入不依赖真实双端会话的固定响应密文。 */
interface PairingResponsePacketFactory {
  ProductionPairingPacketCodec.ResponsePacket createResponsePacket(
      SQLiteDatabase connection,
      ProductionIdentityDatabase.IdentityProjection localIdentity,
      int localRegistrationId,
      String requestId,
      String action,
      long nowMs)
      throws ProductionIdentityException;
}
