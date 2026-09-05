package com.m2y.crypto.production;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/** 生产配对握手负载与加密 outbox 元数据；所有结构都使用严格版本化 JSON。 */
final class ProductionPairingPacketCodec {
  private static final int SCHEMA_VERSION = 1;
  private static final String M2Y_ID_PATTERN =
      "^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$";
  private static final String UUID_PATTERN =
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
  private static final String BASE64_URL_PATTERN = "^[A-Za-z0-9_-]+$";

  private ProductionPairingPacketCodec() {}

  record Handshake(
      String requestId,
      String senderDeviceId,
      String senderIdentityPublicKey,
      String senderM2yId,
      String senderStableIdentityId,
      String senderDisplayName,
      long expiresAtMs) {}

  record OutgoingPacket(
      long createdAtMs,
      long expiresAtMs,
      String packet,
      String requestId,
      String targetDeviceId,
      String targetM2yId,
      String targetStableIdentityId) {}

  record Response(String action, String requestId) {}

  record ResponsePacket(long createdAtMs, String action, String packet, String requestId) {}

  static String encodeHandshake(Handshake value) throws ProductionIdentityException {
    validateHandshake(value, "pairing-handshake-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("expiresAtMs", value.expiresAtMs());
    fields.put("requestId", value.requestId());
    fields.put("schemaVersion", SCHEMA_VERSION);
    fields.put("senderDeviceId", value.senderDeviceId());
    if (value.senderDisplayName() != null) {
      fields.put("senderDisplayName", value.senderDisplayName());
    }
    fields.put("senderIdentityPublicKey", value.senderIdentityPublicKey());
    fields.put("senderM2yId", value.senderM2yId());
    fields.put("senderStableIdentityId", value.senderStableIdentityId());
    return encode(fields, "pairing-handshake-invalid");
  }

  static Handshake decodeHandshake(String json) throws ProductionIdentityException {
    if (json == null || json.length() > 4_096) {
      throw new ProductionIdentityException("pairing-handshake-corrupt");
    }
    try {
      JSONObject value = new JSONObject(json);
      boolean hasDisplayName = value.has("senderDisplayName");
      if (value.length() != (hasDisplayName ? 8 : 7)
          || value.getInt("schemaVersion") != SCHEMA_VERSION) {
        throw new ProductionIdentityException("pairing-handshake-corrupt");
      }
      Handshake handshake =
          new Handshake(
              value.getString("requestId"),
              value.getString("senderDeviceId"),
              value.getString("senderIdentityPublicKey"),
              value.getString("senderM2yId"),
              value.getString("senderStableIdentityId"),
              hasDisplayName ? value.getString("senderDisplayName") : null,
              value.getLong("expiresAtMs"));
      validateHandshake(handshake, "pairing-handshake-corrupt");
      return handshake;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-handshake-corrupt", e);
    }
  }

  static String encodeResponse(Response value) throws ProductionIdentityException {
    validateResponse(value, "pairing-response-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("action", value.action());
    fields.put("requestId", value.requestId());
    fields.put("schemaVersion", SCHEMA_VERSION);
    return encode(fields, "pairing-response-invalid");
  }

  static Response decodeResponse(String json) throws ProductionIdentityException {
    if (json == null || json.length() > 1_024) {
      throw new ProductionIdentityException("pairing-response-corrupt");
    }
    try {
      JSONObject value = new JSONObject(json);
      if (value.length() != 3 || value.getInt("schemaVersion") != SCHEMA_VERSION) {
        throw new ProductionIdentityException("pairing-response-corrupt");
      }
      Response response =
          new Response(value.getString("action"), value.getString("requestId"));
      validateResponse(response, "pairing-response-corrupt");
      return response;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-response-corrupt", e);
    }
  }

  static String encodeOutgoing(OutgoingPacket value) throws ProductionIdentityException {
    validateOutgoing(value, "pairing-outbox-packet-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("createdAtMs", value.createdAtMs());
    fields.put("expiresAtMs", value.expiresAtMs());
    fields.put("packet", value.packet());
    fields.put("packetType", "pair-request");
    fields.put("requestId", value.requestId());
    fields.put("schemaVersion", SCHEMA_VERSION);
    fields.put("targetDeviceId", value.targetDeviceId());
    fields.put("targetM2yId", value.targetM2yId());
    fields.put("targetStableIdentityId", value.targetStableIdentityId());
    return encode(fields, "pairing-outbox-packet-invalid");
  }

  static OutgoingPacket decodeOutgoing(String json) throws ProductionIdentityException {
    if (json == null || json.length() > 32_768) {
      throw new ProductionIdentityException("pairing-outbox-packet-corrupt");
    }
    try {
      JSONObject value = new JSONObject(json);
      if (value.length() != 9
          || value.getInt("schemaVersion") != SCHEMA_VERSION
          || !"pair-request".equals(value.getString("packetType"))) {
        throw new ProductionIdentityException("pairing-outbox-packet-corrupt");
      }
      OutgoingPacket packet =
          new OutgoingPacket(
              value.getLong("createdAtMs"),
              value.getLong("expiresAtMs"),
              value.getString("packet"),
              value.getString("requestId"),
              value.getString("targetDeviceId"),
              value.getString("targetM2yId"),
              value.getString("targetStableIdentityId"));
      validateOutgoing(packet, "pairing-outbox-packet-corrupt");
      return packet;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-outbox-packet-corrupt", e);
    }
  }

  static String encodeResponsePacket(ResponsePacket value) throws ProductionIdentityException {
    validateResponsePacket(value, "pairing-outbox-response-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("action", value.action());
    fields.put("createdAtMs", value.createdAtMs());
    fields.put("packet", value.packet());
    fields.put("packetType", "pair-response");
    fields.put("requestId", value.requestId());
    fields.put("schemaVersion", SCHEMA_VERSION);
    return encode(fields, "pairing-outbox-response-invalid");
  }

  static ResponsePacket decodeResponsePacket(String json) throws ProductionIdentityException {
    if (json == null || json.length() > 32_768) {
      throw new ProductionIdentityException("pairing-outbox-response-corrupt");
    }
    try {
      JSONObject value = new JSONObject(json);
      if (value.length() != 6
          || value.getInt("schemaVersion") != SCHEMA_VERSION
          || !"pair-response".equals(value.getString("packetType"))) {
        throw new ProductionIdentityException("pairing-outbox-response-corrupt");
      }
      ResponsePacket packet =
          new ResponsePacket(
              value.getLong("createdAtMs"),
              value.getString("action"),
              value.getString("packet"),
              value.getString("requestId"));
      validateResponsePacket(packet, "pairing-outbox-response-corrupt");
      return packet;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-outbox-response-corrupt", e);
    }
  }

  static Map<String, Object> result(
      String operationId, OutgoingPacket packet) throws ProductionIdentityException {
    if (!matches(operationId, UUID_PATTERN)) {
      throw new ProductionIdentityException("pairing-outbox-packet-corrupt");
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("expiresAtMs", packet.expiresAtMs());
    result.put("operationId", operationId);
    result.put("packet", packet.packet());
    result.put("requestId", packet.requestId());
    result.put("schemaVersion", SCHEMA_VERSION);
    result.put("status", "committed");
    result.put("targetDeviceId", packet.targetDeviceId());
    result.put("targetM2yId", packet.targetM2yId());
    result.put("targetStableIdentityId", packet.targetStableIdentityId());
    return Collections.unmodifiableMap(result);
  }

  private static String encode(Map<String, Object> fields, String code)
      throws ProductionIdentityException {
    try {
      return new JSONObject(Collections.unmodifiableMap(fields)).toString();
    } catch (RuntimeException e) {
      throw new ProductionIdentityException(code, e);
    }
  }

  private static void validateHandshake(Handshake value, String code)
      throws ProductionIdentityException {
    require(value != null, code);
    require(matches(value.requestId(), UUID_PATTERN), code);
    require(matches(value.senderDeviceId(), UUID_PATTERN), code);
    require(matches(value.senderStableIdentityId(), UUID_PATTERN), code);
    require(matches(value.senderM2yId(), M2Y_ID_PATTERN), code);
    requireBase64(value.senderIdentityPublicKey(), 32, 256, code);
    require(value.expiresAtMs() > 0, code);
    if (value.senderDisplayName() != null) {
      require(!value.senderDisplayName().isBlank() && value.senderDisplayName().length() <= 64, code);
      require(
          value.senderDisplayName().codePoints().noneMatch(Character::isISOControl), code);
    }
  }

  private static void validateResponse(Response value, String code)
      throws ProductionIdentityException {
    require(value != null, code);
    require(matches(value.requestId(), UUID_PATTERN), code);
    require("accept".equals(value.action()) || "reject".equals(value.action()), code);
  }

  private static void validateOutgoing(OutgoingPacket value, String code)
      throws ProductionIdentityException {
    require(value != null, code);
    require(value.createdAtMs() > 0 && value.expiresAtMs() > value.createdAtMs(), code);
    require(matches(value.requestId(), UUID_PATTERN), code);
    require(matches(value.targetDeviceId(), UUID_PATTERN), code);
    require(matches(value.targetStableIdentityId(), UUID_PATTERN), code);
    require(matches(value.targetM2yId(), M2Y_ID_PATTERN), code);
    requireBase64(value.packet(), 32, 24_576, code);
  }

  private static void validateResponsePacket(ResponsePacket value, String code)
      throws ProductionIdentityException {
    require(value != null, code);
    require(value.createdAtMs() > 0, code);
    validateResponse(new Response(value.action(), value.requestId()), code);
    requireBase64(value.packet(), 32, 24_576, code);
  }

  private static void requireBase64(String value, int minimum, int maximum, String code)
      throws ProductionIdentityException {
    require(
        value != null
            && value.length() >= minimum
            && value.length() <= maximum
            && value.matches(BASE64_URL_PATTERN),
        code);
  }

  private static void require(boolean condition, String code) throws ProductionIdentityException {
    if (!condition) {
      throw new ProductionIdentityException(code);
    }
  }

  private static boolean matches(String value, String pattern) {
    return value != null && value.matches(pattern);
  }
}
