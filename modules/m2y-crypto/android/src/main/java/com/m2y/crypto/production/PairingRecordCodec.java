package com.m2y.crypto.production;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Exactly-keyed JSON for the two encrypted pairing payloads: the isolated peer candidate and the
 * locally committed protocol intent that the transport later turns into a wire packet. Key order is
 * not part of the format — these records are only ever decoded by this class.
 *
 * <p>Both directions validate the same bounds. A record that was tampered with, truncated or written
 * by a newer schema is reported as corrupt instead of being partially trusted, because a candidate
 * is peer-supplied data that no safety number has confirmed yet.
 */
final class PairingRecordCodec {
  private static final int SCHEMA_VERSION = 1;
  private static final String M2Y_ID_PATTERN =
      "^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$";
  private static final String UUID_PATTERN =
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
  private static final String BASE64_URL_PATTERN = "^[A-Za-z0-9_-]{1,512}$";

  private PairingRecordCodec() {}

  record PeerCandidate(
      String peerDeviceId,
      String peerIdentityKey,
      String peerM2yId,
      String peerStableIdentityId,
      long receivedAtMs) {}

  record PairingIntent(String decision, String packetType, String requestId, long createdAtMs) {}

  static String encodeCandidate(PeerCandidate candidate) throws ProductionIdentityException {
    validateCandidate(candidate, "pairing-candidate-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("peerDeviceId", candidate.peerDeviceId());
    fields.put("peerIdentityKey", candidate.peerIdentityKey());
    fields.put("peerM2yId", candidate.peerM2yId());
    fields.put("peerStableIdentityId", candidate.peerStableIdentityId());
    fields.put("receivedAtMs", candidate.receivedAtMs());
    fields.put("schemaVersion", SCHEMA_VERSION);
    return encode(fields, "pairing-candidate-invalid");
  }

  static PeerCandidate decodeCandidate(String json) throws ProductionIdentityException {
    JSONObject parsed = parse(json, 6, "pairing-candidate-corrupt");
    try {
      PeerCandidate candidate =
          new PeerCandidate(
              parsed.getString("peerDeviceId"),
              parsed.getString("peerIdentityKey"),
              parsed.getString("peerM2yId"),
              parsed.getString("peerStableIdentityId"),
              parsed.getLong("receivedAtMs"));
      validateCandidate(candidate, "pairing-candidate-corrupt");
      return candidate;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-candidate-corrupt", e);
    }
  }

  static String encodeIntent(PairingIntent intent) throws ProductionIdentityException {
    validateIntent(intent, "pairing-intent-invalid");
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("createdAtMs", intent.createdAtMs());
    fields.put("decision", intent.decision());
    fields.put("packetType", intent.packetType());
    fields.put("requestId", intent.requestId());
    fields.put("schemaVersion", SCHEMA_VERSION);
    return encode(fields, "pairing-intent-invalid");
  }

  static PairingIntent decodeIntent(String json) throws ProductionIdentityException {
    JSONObject parsed = parse(json, 5, "pairing-intent-corrupt");
    try {
      PairingIntent intent =
          new PairingIntent(
              parsed.getString("decision"),
              parsed.getString("packetType"),
              parsed.getString("requestId"),
              parsed.getLong("createdAtMs"));
      validateIntent(intent, "pairing-intent-corrupt");
      return intent;
    } catch (JSONException e) {
      throw new ProductionIdentityException("pairing-intent-corrupt", e);
    }
  }

  private static String encode(Map<String, Object> fields, String safeCode)
      throws ProductionIdentityException {
    try {
      return new JSONObject(Collections.unmodifiableMap(fields)).toString();
    } catch (RuntimeException e) {
      throw new ProductionIdentityException(safeCode, e);
    }
  }

  private static JSONObject parse(String json, int expectedFields, String safeCode)
      throws ProductionIdentityException {
    if (json == null || json.length() > 4_096) {
      throw new ProductionIdentityException(safeCode);
    }
    try {
      JSONObject parsed = new JSONObject(json);
      if (parsed.length() != expectedFields || parsed.getInt("schemaVersion") != SCHEMA_VERSION) {
        throw new ProductionIdentityException(safeCode);
      }
      return parsed;
    } catch (JSONException e) {
      throw new ProductionIdentityException(safeCode, e);
    }
  }

  private static void validateCandidate(PeerCandidate candidate, String safeCode)
      throws ProductionIdentityException {
    require(candidate != null, safeCode);
    require(matches(candidate.peerDeviceId(), UUID_PATTERN), safeCode);
    require(matches(candidate.peerIdentityKey(), BASE64_URL_PATTERN), safeCode);
    require(matches(candidate.peerM2yId(), M2Y_ID_PATTERN), safeCode);
    require(matches(candidate.peerStableIdentityId(), UUID_PATTERN), safeCode);
    require(candidate.receivedAtMs() > 0, safeCode);
  }

  private static void validateIntent(PairingIntent intent, String safeCode)
      throws ProductionIdentityException {
    require(intent != null, safeCode);
    require(matches(intent.requestId(), UUID_PATTERN), safeCode);
    require(matches(intent.packetType(), "^[a-z][a-z-]{2,63}$"), safeCode);
    require(matches(intent.decision(), "^[a-zA-Z][a-zA-Z-]{2,63}$"), safeCode);
    require(intent.createdAtMs() > 0, safeCode);
  }

  private static boolean matches(String value, String pattern) {
    return value != null && value.matches(pattern);
  }

  private static void require(boolean condition, String safeCode)
      throws ProductionIdentityException {
    if (!condition) {
      throw new ProductionIdentityException(safeCode);
    }
  }
}
