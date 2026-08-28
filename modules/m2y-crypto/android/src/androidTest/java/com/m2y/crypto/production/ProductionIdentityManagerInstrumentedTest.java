package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.SessionBuilder;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyType;
import org.signal.libsignal.protocol.message.CiphertextMessage;
import org.signal.libsignal.protocol.state.impl.InMemorySignalProtocolStore;
import org.signal.libsignal.protocol.util.KeyHelper;

@RunWith(AndroidJUnit4.class)
public final class ProductionIdentityManagerInstrumentedTest {
  private Context context;
  private ProductionIdentityManager manager;

  @Before
  public void setUp() throws Exception {
    context = ApplicationProvider.getApplicationContext();
    manager = new ProductionIdentityManager(context);
    manager.resetProductionIdentity();
  }

  @After
  public void tearDown() throws Exception {
    new ProductionIdentityManager(context).resetProductionIdentity();
  }

  @Test
  public void identityRegistrationSigningAndRestartRemainStable() throws Exception {
    assertEquals("absent", manager.inspectProductionIdentity().get("status"));

    Map<String, Object> prepared = manager.prepareIdentityRegistration("  Alice  ");
    Map<String, Object> retry = manager.prepareIdentityRegistration("ignored-on-retry");
    assertEquals(prepared.get("operationId"), retry.get("operationId"));
    assertEquals(prepared.get("identityPublicKey"), retry.get("identityPublicKey"));
    assertEquals(prepared.get("authPublicKey"), retry.get("authPublicKey"));

    Map<String, Object> pending = new ProductionIdentityManager(context).inspectProductionIdentity();
    assertEquals("pendingRegistration", pending.get("status"));
    assertEquals("Alice", pending.get("displayName"));
    assertEquals(prepared.get("m2yId"), pending.get("m2yId"));

    String canonical =
        "M2Y-REQUEST-V1\nPOST\n/v1/identity/register\n1800000000000\nnonce\n"
            + "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    Map<String, Object> signed = manager.signDeviceRequest(canonical);
    assertTrue(
        verifySignature(
            (String) prepared.get("authPublicKey"),
            canonical,
            (String) signed.get("signature")));

    manager.commitIdentityRegistration((String) prepared.get("operationId"), "receipt_123");
    Map<String, Object> reopened = new ProductionIdentityManager(context).inspectProductionIdentity();
    assertEquals("unpaired", reopened.get("status"));
    assertEquals(prepared.get("m2yId"), reopened.get("m2yId"));
    assertEquals(prepared.get("stableIdentityId"), reopened.get("stableIdentityId"));
    assertEquals(prepared.get("deviceId"), reopened.get("deviceId"));
  }

  @Test
  public void pqxdhFirstPacketOutboxAndAcknowledgedInspectionSurviveRestart() throws Exception {
    Map<String, Object> registration = manager.prepareIdentityRegistration("Alice");
    manager.commitIdentityRegistration((String) registration.get("operationId"), "receipt_pairing");
    String requestId = UUID.randomUUID().toString();
    long expiresAtMs = System.currentTimeMillis() + 600_000L;
    JSONObject targetBundle = pairingTargetBundle();

    Map<String, Object> prepared =
        manager.preparePairingPacket(requestId, expiresAtMs, targetBundle.toString());
    Map<String, Object> retry =
        manager.preparePairingPacket(requestId, expiresAtMs, targetBundle.toString());

    assertEquals("committed", prepared.get("status"));
    assertEquals(prepared.get("operationId"), retry.get("operationId"));
    assertEquals(prepared.get("packet"), retry.get("packet"));
    assertEquals(requestId, prepared.get("requestId"));
    assertTrue(((String) prepared.get("packet")).length() >= 32);

    @SuppressWarnings("unchecked")
    java.util.List<Map<String, Object>> outbox =
        (java.util.List<Map<String, Object>>) manager.listPairingOutbox().get("items");
    assertEquals(1, outbox.size());
    assertEquals("pair-request", outbox.get(0).get("packetType"));
    assertEquals("submit", outbox.get(0).get("decision"));
    assertEquals(prepared.get("packet"), outbox.get(0).get("packet"));

    manager.ackPairingOutbox((String) prepared.get("operationId"), "receipt_pairing_packet");
    Map<String, Object> reopened = new ProductionIdentityManager(context).inspectProductionIdentity();
    assertEquals("outgoingPending", reopened.get("status"));
    assertEquals(requestId, reopened.get("requestId"));
    assertEquals("M2Y-JKLM-NPQR-STUV-WXYZ", reopened.get("targetM2yId"));
  }

  @Test
  public void incomingPqxdhPacketDecryptsPersistsAndReplaysIdempotently() throws Exception {
    Map<String, Object> registration = manager.prepareIdentityRegistration("Bob");
    manager.commitIdentityRegistration((String) registration.get("operationId"), "receipt_target");
    String requestId = UUID.randomUUID().toString();
    String eventId = UUID.randomUUID().toString();
    long expiresAtMs = System.currentTimeMillis() + 600_000L;
    String packet = senderPacket(registration, requestId, expiresAtMs);
    byte[] corruptedBytes = Base64.getUrlDecoder().decode(packet);
    corruptedBytes[corruptedBytes.length - 1] ^= 0x01;
    String corruptedPacket = encode(corruptedBytes);

    assertSafeFailure(
        "pairing-packet-open-failed",
        () -> manager.consumePairingRequestEvent(eventId, requestId, corruptedPacket));
    assertEquals("unpaired", manager.inspectProductionIdentity().get("status"));

    Map<String, Object> inspection =
        manager.consumePairingRequestEvent(eventId, requestId, packet);

    assertEquals("incomingReview", inspection.get("status"));
    assertEquals(requestId, inspection.get("requestId"));
    assertEquals("M2Y-JKLM-NPQR-STUV-WXYZ", inspection.get("peerM2yId"));
    assertEquals("8a1bf6aa-4a7a-4bed-9a43-835e74bf2241", inspection.get("peerDeviceId"));
    assertFalse(inspection.containsKey("packet"));

    Map<String, Object> replayed =
        new ProductionIdentityManager(context)
            .consumePairingRequestEvent(eventId, requestId, packet);
    assertEquals("incomingReview", replayed.get("status"));
    assertEquals(requestId, replayed.get("requestId"));
  }

  @Test
  public void missingKeystoreKeyFailsClosedAndResetRemovesRemainingState() throws Exception {
    manager.prepareIdentityRegistration(null);
    deleteAlias(ProductionRecordCipher.KEY_ALIAS);

    assertSafeFailure("identity-key-missing", manager::inspectProductionIdentity);
    manager.resetProductionIdentity();

    assertFalse(context.getDatabasePath("m2y-production-identity-v1.db").exists());
    assertFalse(hasAlias(ProductionRecordCipher.KEY_ALIAS));
    assertFalse(hasAlias(ProductionDeviceSigner.KEY_ALIAS));
  }

  @Test
  public void corruptEncryptedIdentityRecordFailsClosed() throws Exception {
    manager.prepareIdentityRegistration(null);
    ProductionIdentityDatabase database = new ProductionIdentityDatabase(context);
    SQLiteDatabase connection = database.getWritableDatabase();
    connection.execSQL(
        "UPDATE secret_records SET ciphertext = ? WHERE record_kind = 'identity' AND record_key = 'local'",
        new Object[] {new byte[] {1, 2, 3}});
    database.close();

    assertSafeFailure("identity-record-corrupt", manager::inspectProductionIdentity);
  }

  private static boolean verifySignature(String encodedPublicKey, String value, String encodedSignature)
      throws Exception {
    byte[] publicKey = Base64.getUrlDecoder().decode(encodedPublicKey);
    byte[] signatureBytes = Base64.getUrlDecoder().decode(encodedSignature);
    Signature verifier = Signature.getInstance("SHA256withECDSA");
    verifier.initVerify(
        KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(publicKey)));
    verifier.update(value.getBytes(StandardCharsets.UTF_8));
    return verifier.verify(signatureBytes);
  }

  private static JSONObject pairingTargetBundle() throws Exception {
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

  private static String senderPacket(
      Map<String, Object> targetRegistration, String requestId, long expiresAtMs)
      throws Exception {
    ProductionPairingTargetBundle target =
        ProductionPairingTargetBundle.decode(
            targetBundleFromRegistration(targetRegistration).toString());
    IdentityKeyPair senderIdentity = IdentityKeyPair.generate();
    InMemorySignalProtocolStore senderStore =
        new InMemorySignalProtocolStore(
            senderIdentity, KeyHelper.generateRegistrationId(false));
    String senderStableIdentityId = "a73b209e-4866-4c08-a7dd-08a7389d3c46";
    SignalProtocolAddress senderAddress =
        new SignalProtocolAddress(senderStableIdentityId, 1);
    SignalProtocolAddress requestAddress = new SignalProtocolAddress(requestId, 1);
    new SessionBuilder(senderStore, requestAddress, senderAddress).process(target.toPreKeyBundle());
    String handshake =
        ProductionPairingPacketCodec.encodeHandshake(
            new ProductionPairingPacketCodec.Handshake(
                requestId,
                "8a1bf6aa-4a7a-4bed-9a43-835e74bf2241",
                encode(senderIdentity.getPublicKey().serialize()),
                "M2Y-JKLM-NPQR-STUV-WXYZ",
                senderStableIdentityId,
                "Alice",
                expiresAtMs));
    CiphertextMessage ciphertext =
        new SessionCipher(senderStore, senderAddress, requestAddress)
            .encrypt(handshake.getBytes(StandardCharsets.UTF_8));
    assertEquals(CiphertextMessage.PREKEY_TYPE, ciphertext.getType());
    return encode(ciphertext.serialize());
  }

  private static JSONObject targetBundleFromRegistration(Map<String, Object> registration)
      throws Exception {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> preKeys =
        (List<Map<String, Object>>) registration.get("oneTimePreKeys");
    Map<String, Object> preKey = preKeys.get(0);
    return new JSONObject()
        .put("deviceId", registration.get("deviceId"))
        .put("identityPublicKey", registration.get("identityPublicKey"))
        .put("kyberPreKeyId", registration.get("kyberPreKeyId"))
        .put("kyberPreKeyPublic", registration.get("kyberPreKeyPublic"))
        .put("kyberPreKeySignature", registration.get("kyberPreKeySignature"))
        .put("m2yId", registration.get("m2yId"))
        .put(
            "oneTimePreKey",
            new JSONObject().put("id", preKey.get("id")).put("publicKey", preKey.get("publicKey")))
        .put("registrationId", registration.get("registrationId"))
        .put("signedPreKeyId", registration.get("signedPreKeyId"))
        .put("signedPreKeyPublic", registration.get("signedPreKeyPublic"))
        .put("signedPreKeySignature", registration.get("signedPreKeySignature"))
        .put("stableIdentityId", registration.get("stableIdentityId"));
  }

  private static String encode(byte[] value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }

  private static void assertSafeFailure(String expectedCode, CheckedOperation operation)
      throws Exception {
    try {
      operation.run();
      fail("Expected production identity failure");
    } catch (ProductionIdentityException error) {
      assertEquals(expectedCode, error.safeCode());
    }
  }

  private static boolean hasAlias(String alias) throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    return keyStore.containsAlias(alias);
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
