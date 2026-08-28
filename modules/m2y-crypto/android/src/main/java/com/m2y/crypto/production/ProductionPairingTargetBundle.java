package com.m2y.crypto.production;

import java.util.Base64;
import org.json.JSONException;
import org.json.JSONObject;
import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.ecc.ECPublicKey;
import org.signal.libsignal.protocol.kem.KEMPublicKey;
import org.signal.libsignal.protocol.state.PreKeyBundle;

/** 从 JavaScript 公共租赁包恢复 libsignal 的严格生产输入，不接受未知或私密字段。 */
record ProductionPairingTargetBundle(
    String deviceId,
    String identityPublicKey,
    int kyberPreKeyId,
    String kyberPreKeyPublic,
    String kyberPreKeySignature,
    String m2yId,
    int oneTimePreKeyId,
    String oneTimePreKeyPublic,
    int registrationId,
    int signedPreKeyId,
    String signedPreKeyPublic,
    String signedPreKeySignature,
    String stableIdentityId) {
  private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();
  private static final Base64.Encoder BASE64_URL_ENCODER =
      Base64.getUrlEncoder().withoutPadding();
  private static final String M2Y_ID_PATTERN =
      "^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$";
  private static final String UUID_PATTERN =
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

  static ProductionPairingTargetBundle decode(String json) throws ProductionIdentityException {
    if (json == null || json.length() > 16_384) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid");
    }
    try {
      JSONObject value = new JSONObject(json);
      requireExact(
          value,
          "deviceId",
          "identityPublicKey",
          "kyberPreKeyId",
          "kyberPreKeyPublic",
          "kyberPreKeySignature",
          "m2yId",
          "oneTimePreKey",
          "registrationId",
          "signedPreKeyId",
          "signedPreKeyPublic",
          "signedPreKeySignature",
          "stableIdentityId");
      JSONObject oneTimePreKey = value.getJSONObject("oneTimePreKey");
      requireExact(oneTimePreKey, "id", "publicKey");
      ProductionPairingTargetBundle bundle =
          new ProductionPairingTargetBundle(
              value.getString("deviceId"),
              value.getString("identityPublicKey"),
              value.getInt("kyberPreKeyId"),
              value.getString("kyberPreKeyPublic"),
              value.getString("kyberPreKeySignature"),
              value.getString("m2yId"),
              oneTimePreKey.getInt("id"),
              oneTimePreKey.getString("publicKey"),
              value.getInt("registrationId"),
              value.getInt("signedPreKeyId"),
              value.getString("signedPreKeyPublic"),
              value.getString("signedPreKeySignature"),
              value.getString("stableIdentityId"));
      bundle.validate();
      return bundle;
    } catch (JSONException | IllegalArgumentException e) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid", e);
    }
  }

  PreKeyBundle toPreKeyBundle() throws ProductionIdentityException {
    try {
      return new PreKeyBundle(
          registrationId,
          1,
          oneTimePreKeyId,
          new ECPublicKey(decodeBase64(oneTimePreKeyPublic)),
          signedPreKeyId,
          new ECPublicKey(decodeBase64(signedPreKeyPublic)),
          decodeBase64(signedPreKeySignature),
          new IdentityKey(decodeBase64(identityPublicKey)),
          kyberPreKeyId,
          new KEMPublicKey(decodeBase64(kyberPreKeyPublic)),
          decodeBase64(kyberPreKeySignature));
    } catch (InvalidKeyException | IllegalArgumentException e) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid", e);
    }
  }

  private void validate() throws ProductionIdentityException {
    if (!matches(deviceId, UUID_PATTERN)
        || !matches(stableIdentityId, UUID_PATTERN)
        || !matches(m2yId, M2Y_ID_PATTERN)
        || registrationId <= 0
        || signedPreKeyId <= 0
        || kyberPreKeyId <= 0
        || oneTimePreKeyId <= 0) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid");
    }
    validateBase64(identityPublicKey, 32, 256);
    validateBase64(oneTimePreKeyPublic, 32, 256);
    validateBase64(signedPreKeyPublic, 32, 256);
    validateBase64(signedPreKeySignature, 32, 256);
    validateBase64(kyberPreKeyPublic, 256, 4_096);
    validateBase64(kyberPreKeySignature, 32, 256);
  }

  private static void validateBase64(String value, int minimumBytes, int maximumBytes)
      throws ProductionIdentityException {
    try {
      byte[] decoded = decodeBase64(value);
      if (decoded.length < minimumBytes || decoded.length > maximumBytes) {
        throw new ProductionIdentityException("pairing-target-bundle-invalid");
      }
    } catch (IllegalArgumentException e) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid", e);
    }
  }

  private static byte[] decodeBase64(String value) {
    byte[] decoded = BASE64_URL_DECODER.decode(value);
    if (decoded.length == 0 || !BASE64_URL_ENCODER.encodeToString(decoded).equals(value)) {
      throw new IllegalArgumentException("non-canonical-base64url");
    }
    return decoded;
  }

  private static void requireExact(JSONObject value, String... keys)
      throws ProductionIdentityException {
    if (value.length() != keys.length) {
      throw new ProductionIdentityException("pairing-target-bundle-invalid");
    }
    for (String key : keys) {
      if (!value.has(key)) {
        throw new ProductionIdentityException("pairing-target-bundle-invalid");
      }
    }
  }

  private static boolean matches(String value, String pattern) {
    return value != null && value.matches(pattern);
  }
}
