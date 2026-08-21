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
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

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
