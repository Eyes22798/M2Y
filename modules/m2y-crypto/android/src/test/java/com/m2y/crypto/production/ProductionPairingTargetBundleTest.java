package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.Base64;
import org.json.JSONObject;
import org.junit.Test;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyType;

public final class ProductionPairingTargetBundleTest {
  private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();

  @Test
  public void exactPublicBundleBuildsPqxdhInput() throws Exception {
    JSONObject json = bundleJson();

    ProductionPairingTargetBundle decoded =
        ProductionPairingTargetBundle.decode(json.toString());

    assertEquals("M2Y-JKLM-NPQR-STUV-WXYZ", decoded.m2yId());
    assertEquals(1, decoded.toPreKeyBundle().getDeviceId());
    assertEquals(decoded.registrationId(), decoded.toPreKeyBundle().getRegistrationId());
  }

  @Test
  public void privateOrMissingFieldsFailClosed() throws Exception {
    JSONObject privateBundle = bundleJson().put("identityPrivateKey", "secret");
    JSONObject missingStableId = bundleJson();
    missingStableId.remove("stableIdentityId");

    assertThrows(
        ProductionIdentityException.class,
        () -> ProductionPairingTargetBundle.decode(privateBundle.toString()));
    assertThrows(
        ProductionIdentityException.class,
        () -> ProductionPairingTargetBundle.decode(missingStableId.toString()));
  }

  private static JSONObject bundleJson() throws Exception {
    IdentityKeyPair identity = IdentityKeyPair.generate();
    ECKeyPair preKey = ECKeyPair.generate();
    ECKeyPair signedPreKey = ECKeyPair.generate();
    byte[] signedSignature =
        identity.getPrivateKey().calculateSignature(signedPreKey.getPublicKey().serialize());
    KEMKeyPair kyber = KEMKeyPair.generate(KEMKeyType.KYBER_1024);
    byte[] kyberSignature =
        identity.getPrivateKey().calculateSignature(kyber.getPublicKey().serialize());
    return new JSONObject()
        .put("deviceId", "8a1bf6aa-4a7a-4bed-9a43-835e74bf2241")
        .put("identityPublicKey", encode(identity.getPublicKey().serialize()))
        .put("kyberPreKeyId", 4)
        .put("kyberPreKeyPublic", encode(kyber.getPublicKey().serialize()))
        .put("kyberPreKeySignature", encode(kyberSignature))
        .put("m2yId", "M2Y-JKLM-NPQR-STUV-WXYZ")
        .put(
            "oneTimePreKey",
            new JSONObject().put("id", 2).put("publicKey", encode(preKey.getPublicKey().serialize())))
        .put("registrationId", 1)
        .put("signedPreKeyId", 3)
        .put("signedPreKeyPublic", encode(signedPreKey.getPublicKey().serialize()))
        .put("signedPreKeySignature", encode(signedSignature))
        .put("stableIdentityId", "a73b209e-4866-4c08-a7dd-08a7389d3c46");
  }

  private static String encode(byte[] value) {
    return BASE64_URL.encodeToString(value);
  }
}
