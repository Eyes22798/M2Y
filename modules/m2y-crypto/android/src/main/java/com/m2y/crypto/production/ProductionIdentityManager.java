package com.m2y.crypto.production;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyType;
import org.signal.libsignal.protocol.state.KyberPreKeyRecord;
import org.signal.libsignal.protocol.state.PreKeyRecord;
import org.signal.libsignal.protocol.state.SignedPreKeyRecord;
import org.signal.libsignal.protocol.util.KeyHelper;

public final class ProductionIdentityManager {
  private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final int ONE_TIME_PREKEY_COUNT = 16;
  private static final long RECORD_REVISION = 1;

  private final ProductionIdentityDatabase database;
  private final ProductionDeviceSigner deviceSigner;
  private final ExecutorService executor;
  private final PairingTransactionStore pairingStore;
  private final ProductionRecordCipher recordCipher;
  private final SecureRandom secureRandom;

  public ProductionIdentityManager(Context context) {
    this(
        new ProductionIdentityDatabase(context),
        new ProductionRecordCipher(),
        new ProductionDeviceSigner(),
        new SecureRandom(),
        Executors.newSingleThreadExecutor(
            runnable -> {
              Thread thread = new Thread(runnable, "m2y-production-identity");
              thread.setDaemon(true);
              return thread;
            }));
  }

  ProductionIdentityManager(
      ProductionIdentityDatabase database,
      ProductionRecordCipher recordCipher,
      ProductionDeviceSigner deviceSigner,
      SecureRandom secureRandom,
      ExecutorService executor) {
    this.database = database;
    this.recordCipher = recordCipher;
    this.deviceSigner = deviceSigner;
    this.secureRandom = secureRandom;
    this.executor = executor;
    this.pairingStore = new PairingTransactionStore(database, recordCipher);
  }

  /**
   * Retires a delivered pairing intent. The receipt is required and shape-checked so a caller cannot
   * clear the queue for work it never handed to the server, but schema v1 has no column for it, so
   * it is proof of delivery rather than a stored fact.
   */
  public Map<String, Object> ackPairingOutbox(String operationId, String receiptId)
      throws ProductionIdentityException {
    validateUuid(operationId, "pairing-outbox-invalid");
    if (receiptId == null || !receiptId.matches("^[A-Za-z0-9_-]{8,128}$")) {
      throw new ProductionIdentityException("pairing-outbox-receipt-invalid");
    }

    return execute(
        () ->
            pairingStore.acknowledgeOutbox(
                requireRegisteredConnection(), operationId, System.currentTimeMillis()));
  }

  /**
   * Applies the server's activation for a request the local user already accepted and verified. Only
   * the pair id is taken from the caller; the peer route and identity come from the stored candidate,
   * so an activation naming a different peer is refused rather than followed.
   */
  public Map<String, Object> activatePairedRelationship(String requestId, String pairId)
      throws ProductionIdentityException {
    validateUuid(requestId, "pairing-request-invalid");
    validateUuid(pairId, "pairing-relationship-invalid");

    return execute(
        () ->
            pairingStore.activateRelationship(
                requireRegisteredConnection(), requestId, pairId, System.currentTimeMillis()));
  }

  public Map<String, Object> commitIdentityRegistration(String operationId, String receiptId)
      throws ProductionIdentityException {
    validateUuid(operationId, "identity-registration-operation-invalid");
    if (receiptId == null || !receiptId.matches("^[A-Za-z0-9_-]{8,128}$")) {
      throw new ProductionIdentityException("identity-registration-receipt-invalid");
    }

    return execute(
        () -> {
          SQLiteDatabase connection = database.getWritableDatabase();
          connection.beginTransaction();
          try {
            ProductionIdentityDatabase.IdentityProjection identity =
                requireIdentity(connection);
            if (identity.registeredAtMs() == null) {
              if (!database.hasPendingOutbox(
                  connection, operationId, "identity-registration")) {
                throw new ProductionIdentityException(
                    "identity-registration-operation-invalid");
              }
              long now = System.currentTimeMillis();
              database.markRegistered(connection, now);
              database.acknowledgeOutbox(connection, operationId, now);
            }
            connection.setTransactionSuccessful();
          } finally {
            connection.endTransaction();
          }
          return inspectInternal();
        });
  }

  /**
   * Records that the local user compared the safety number and found it correct. This is one of the
   * two independent confirmations activation requires, so it queues an intent for the peer without
   * moving the candidate out of {@code accepted}.
   */
  public Map<String, Object> confirmPairingSafetyNumber(String requestId)
      throws ProductionIdentityException {
    validateUuid(requestId, "pairing-request-invalid");

    return execute(
        () ->
            pairingStore.confirmSafetyNumber(
                requireRegisteredConnection(), requestId, System.currentTimeMillis()));
  }

  public Map<String, Object> inspectProductionIdentity() throws ProductionIdentityException {
    return execute(this::inspectInternal);
  }

  /** The pairing intents the transport still has to deliver, oldest first. */
  public Map<String, Object> listPairingOutbox() throws ProductionIdentityException {
    return execute(() -> pairingStore.listOutbox(requireRegisteredConnection()));
  }

  public Map<String, Object> prepareIdentityRegistration(String displayName)
      throws ProductionIdentityException {
    String normalizedDisplayName = normalizeDisplayName(displayName);
    return execute(() -> prepareIdentityRegistrationInternal(normalizedDisplayName));
  }

  public void resetProductionIdentity() throws ProductionIdentityException {
    execute(
        () -> {
          ProductionIdentityException failure = null;
          try {
            database.deleteDatabase();
          } catch (ProductionIdentityException e) {
            failure = e;
          }
          try {
            recordCipher.deleteKey();
          } catch (ProductionIdentityException e) {
            failure = e;
          }
          try {
            deviceSigner.deleteKey();
          } catch (ProductionIdentityException e) {
            failure = e;
          }
          if (failure != null) {
            throw new ProductionIdentityException("identity-reset-failed", failure);
          }
          return null;
        });
  }

  /**
   * Applies the local user's answer to a staged pairing request. {@code expire} is not a nameable
   * action: aging out belongs to the clock and {@link #sweepPairingState()}.
   */
  public Map<String, Object> respondToPairingRequest(String requestId, String action)
      throws ProductionIdentityException {
    validateUuid(requestId, "pairing-request-invalid");
    PairingProtocolRules.CandidateAction resolved =
        PairingProtocolRules.CandidateAction.fromRequested(action);

    return execute(
        () ->
            pairingStore.resolveCandidate(
                requireRegisteredConnection(), requestId, resolved, System.currentTimeMillis()));
  }

  public Map<String, Object> signDeviceRequest(String canonicalRequest)
      throws ProductionIdentityException {
    if (canonicalRequest == null
        || canonicalRequest.length() > 8_192
        || !canonicalRequest.startsWith("M2Y-REQUEST-V1\n")) {
      throw new ProductionIdentityException("device-request-canonical-invalid");
    }

    return execute(
        () -> {
          SQLiteDatabase connection = database.getReadableDatabase();
          ProductionIdentityDatabase.IdentityProjection identity = requireIdentity(connection);
          verifyKeyBoundary(connection, identity);
          Map<String, Object> result = new LinkedHashMap<>();
          result.put("deviceId", identity.deviceId());
          result.put("publicKeyId", "device-auth-v1");
          result.put("schemaVersion", 1);
          result.put("signature", deviceSigner.sign(canonicalRequest));
          return Collections.unmodifiableMap(result);
        });
  }

  /**
   * Retires pairing state the clock has settled. Callers may run this at any time; it is the only
   * path that can expire a request, which is why {@code expire} is not an action a caller can name.
   */
  public Map<String, Object> sweepPairingState() throws ProductionIdentityException {
    return execute(
        () -> pairingStore.sweep(requireRegisteredConnection(), System.currentTimeMillis()));
  }

  /**
   * Isolates a peer candidate that has already been opened. Package-private on purpose: opening an
   * inbound packet needs the libsignal session that arrives with the protocol engine, so publishing
   * this over the module boundary now would expose a function no caller could supply an argument
   * for. Instrumentation tests share this package and drive it directly.
   */
  Map<String, Object> stagePeerCandidate(
      PairingTransactionStore.InboundPacket inbound, PairingRecordCodec.PeerCandidate candidate)
      throws ProductionIdentityException {
    return execute(
        () ->
            pairingStore.stageCandidate(
                requireRegisteredConnection(), inbound, candidate, System.currentTimeMillis()));
  }

  private static Map<String, Object> bundleFromJson(JSONObject json)
      throws ProductionIdentityException {
    try {
      if (json.length() != 15 || json.getInt("schemaVersion") != 1) {
        throw new ProductionIdentityException("identity-registration-bundle-corrupt");
      }
      Map<String, Object> bundle = new LinkedHashMap<>();
      bundle.put("authPublicKey", json.getString("authPublicKey"));
      bundle.put("deviceId", json.getString("deviceId"));
      bundle.put("identityPublicKey", json.getString("identityPublicKey"));
      bundle.put("kyberPreKeyId", json.getInt("kyberPreKeyId"));
      bundle.put("kyberPreKeyPublic", json.getString("kyberPreKeyPublic"));
      bundle.put("kyberPreKeySignature", json.getString("kyberPreKeySignature"));
      bundle.put("m2yId", json.getString("m2yId"));
      bundle.put("oneTimePreKeys", preKeysFromJson(json.getJSONArray("oneTimePreKeys")));
      bundle.put("operationId", json.getString("operationId"));
      bundle.put("registrationId", json.getInt("registrationId"));
      bundle.put("schemaVersion", 1);
      bundle.put("signedPreKeyId", json.getInt("signedPreKeyId"));
      bundle.put("signedPreKeyPublic", json.getString("signedPreKeyPublic"));
      bundle.put("signedPreKeySignature", json.getString("signedPreKeySignature"));
      bundle.put("stableIdentityId", json.getString("stableIdentityId"));
      return Collections.unmodifiableMap(bundle);
    } catch (JSONException e) {
      throw new ProductionIdentityException("identity-registration-bundle-corrupt", e);
    }
  }

  private static JSONObject bundleToJson(Map<String, Object> bundle)
      throws ProductionIdentityException {
    try {
      JSONObject json = new JSONObject();
      for (Map.Entry<String, Object> entry : bundle.entrySet()) {
        if (entry.getKey().equals("oneTimePreKeys")) {
          JSONArray preKeys = new JSONArray();
          if (!(entry.getValue() instanceof List<?> values)) {
            throw new ProductionIdentityException("identity-registration-bundle-invalid");
          }
          for (Object value : values) {
            if (!(value instanceof Map<?, ?> preKey)) {
              throw new ProductionIdentityException("identity-registration-bundle-invalid");
            }
            preKeys.put(
                new JSONObject()
                    .put("id", preKey.get("id"))
                    .put("publicKey", preKey.get("publicKey")));
          }
          json.put(entry.getKey(), preKeys);
        } else {
          json.put(entry.getKey(), entry.getValue());
        }
      }
      return json;
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (JSONException e) {
      throw new ProductionIdentityException("identity-registration-bundle-invalid", e);
    }
  }

  private static void clear(byte[] bytes) {
    Arrays.fill(bytes, (byte) 0);
  }

  private <T> T execute(Callable<T> operation) throws ProductionIdentityException {
    try {
      return executor.submit(operation).get();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ProductionIdentityException("identity-operation-interrupted", e);
    } catch (ExecutionException e) {
      Throwable cause = e.getCause();
      if (cause instanceof ProductionIdentityException productionError) {
        throw productionError;
      }
      throw new ProductionIdentityException("identity-operation-failed", cause);
    }
  }

  private Map<String, Object> inspectInternal() throws ProductionIdentityException {
    SQLiteDatabase connection = database.getReadableDatabase();
    ProductionIdentityDatabase.IdentityProjection identity = database.loadIdentity(connection);
    if (identity == null) {
      if (database.countSecretRecords(connection) != 0
          || recordCipher.hasKey()
          || deviceSigner.hasKey()) {
        throw new ProductionIdentityException("identity-state-orphaned");
      }
      return Map.of("schemaVersion", 1, "status", "absent");
    }

    verifyKeyBoundary(connection, identity);
    String displayName = decryptDisplayName(identity);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("deviceId", identity.deviceId());
    if (displayName != null) {
      result.put("displayName", displayName);
    }
    result.put("m2yId", identity.m2yId());
    ProductionIdentityDatabase.PendingOutbox pendingRegistration =
        database.pendingRegistration(connection);
    if (identity.registeredAtMs() == null) {
      if (pendingRegistration == null) {
        throw new ProductionIdentityException("identity-registration-state-invalid");
      }
      result.put("operationId", pendingRegistration.operationId());
      result.put("status", "pendingRegistration");
    } else {
      result.put("registeredAtMs", identity.registeredAtMs());
      result.put("status", "unpaired");
    }
    result.put("revision", identity.revision());
    result.put("schemaVersion", 1);
    result.put("stableIdentityId", identity.stableIdentityId());
    return Collections.unmodifiableMap(result);
  }

  private Map<String, Object> prepareIdentityRegistrationInternal(String displayName)
      throws ProductionIdentityException {
    SQLiteDatabase connection = database.getWritableDatabase();
    ProductionIdentityDatabase.IdentityProjection existing = database.loadIdentity(connection);
    if (existing != null) {
      ProductionIdentityDatabase.PendingOutbox pending = database.pendingRegistration(connection);
      if (existing.registeredAtMs() == null && pending != null) {
        verifyKeyBoundary(connection, existing);
        byte[] jsonBytes =
            recordCipher.decrypt(
                "outbox", pending.operationId(), RECORD_REVISION, pending.ciphertext());
        try {
          return bundleFromJson(new JSONObject(new String(jsonBytes, StandardCharsets.UTF_8)));
        } catch (JSONException e) {
          throw new ProductionIdentityException("identity-registration-bundle-corrupt", e);
        } finally {
          clear(jsonBytes);
        }
      }
      throw new ProductionIdentityException("identity-already-created");
    }
    if (database.countSecretRecords(connection) != 0
        || recordCipher.hasKey()
        || deviceSigner.hasKey()) {
      throw new ProductionIdentityException("identity-state-orphaned");
    }

    recordCipher.createKey();
    try {
      deviceSigner.createKey();
    } catch (ProductionIdentityException e) {
      recordCipher.deleteKey();
      throw e;
    }

    boolean committed = false;
    connection.beginTransaction();
    try {
      long now = System.currentTimeMillis();
      String m2yId = ProductionIdentityIds.newM2yId(secureRandom);
      String stableIdentityId = ProductionIdentityIds.newStableIdentityId();
      String deviceId = ProductionIdentityIds.newDeviceId();
      String operationId = ProductionIdentityIds.newOperationId();
      IdentityKeyPair identityKeyPair = IdentityKeyPair.generate();
      int registrationId = KeyHelper.generateRegistrationId(false);

      ECKeyPair signedPreKeyPair = ECKeyPair.generate();
      int signedPreKeyId = KeyHelper.generateRegistrationId(true);
      byte[] signedPreKeySignature =
          identityKeyPair
              .getPrivateKey()
              .calculateSignature(signedPreKeyPair.getPublicKey().serialize());
      SignedPreKeyRecord signedPreKeyRecord =
          new SignedPreKeyRecord(
              signedPreKeyId, now, signedPreKeyPair, signedPreKeySignature);

      KEMKeyPair kyberPreKeyPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024);
      int kyberPreKeyId = KeyHelper.generateRegistrationId(true);
      byte[] kyberPreKeySignature =
          identityKeyPair
              .getPrivateKey()
              .calculateSignature(kyberPreKeyPair.getPublicKey().serialize());
      KyberPreKeyRecord kyberPreKeyRecord =
          new KyberPreKeyRecord(
              kyberPreKeyId, now, kyberPreKeyPair, kyberPreKeySignature);

      List<Map<String, Object>> oneTimePreKeys = new ArrayList<>(ONE_TIME_PREKEY_COUNT);
      for (int index = 0; index < ONE_TIME_PREKEY_COUNT; index++) {
        int preKeyId = KeyHelper.generateRegistrationId(true);
        ECKeyPair preKeyPair = ECKeyPair.generate();
        PreKeyRecord record = new PreKeyRecord(preKeyId, preKeyPair);
        persistSecret(connection, "pre-key", Integer.toString(preKeyId), record.serialize(), now);
        oneTimePreKeys.add(
            Map.of(
                "id", preKeyId,
                "publicKey", encode(preKeyPair.getPublicKey().serialize())));
      }

      persistSecret(connection, "identity", "local", identityKeyPair.serialize(), now);
      persistSecret(
          connection,
          "signed-pre-key",
          Integer.toString(signedPreKeyId),
          signedPreKeyRecord.serialize(),
          now);
      persistSecret(
          connection,
          "kyber-pre-key",
          Integer.toString(kyberPreKeyId),
          kyberPreKeyRecord.serialize(),
          now);

      byte[] displayNameCiphertext = null;
      if (displayName != null) {
        displayNameCiphertext =
            recordCipher.encrypt(
                "projection",
                "display-name",
                RECORD_REVISION,
                displayName.getBytes(StandardCharsets.UTF_8));
      }
      database.insertIdentity(
          connection,
          new ProductionIdentityDatabase.IdentityProjection(
              m2yId,
              stableIdentityId,
              deviceId,
              displayNameCiphertext,
              null,
              RECORD_REVISION));

      Map<String, Object> bundle = new LinkedHashMap<>();
      bundle.put("authPublicKey", deviceSigner.publicKey());
      bundle.put("deviceId", deviceId);
      bundle.put("identityPublicKey", encode(identityKeyPair.getPublicKey().serialize()));
      bundle.put("kyberPreKeyId", kyberPreKeyId);
      bundle.put("kyberPreKeyPublic", encode(kyberPreKeyPair.getPublicKey().serialize()));
      bundle.put("kyberPreKeySignature", encode(kyberPreKeySignature));
      bundle.put("m2yId", m2yId);
      bundle.put("oneTimePreKeys", Collections.unmodifiableList(oneTimePreKeys));
      bundle.put("operationId", operationId);
      bundle.put("registrationId", registrationId);
      bundle.put("schemaVersion", 1);
      bundle.put("signedPreKeyId", signedPreKeyId);
      bundle.put("signedPreKeyPublic", encode(signedPreKeyPair.getPublicKey().serialize()));
      bundle.put("signedPreKeySignature", encode(signedPreKeySignature));
      bundle.put("stableIdentityId", stableIdentityId);
      Map<String, Object> immutableBundle = Collections.unmodifiableMap(bundle);

      byte[] bundleBytes = bundleToJson(immutableBundle).toString().getBytes(StandardCharsets.UTF_8);
      try {
        database.insertOutbox(
            connection,
            operationId,
            operationId,
            "identity-registration",
            recordCipher.encrypt("outbox", operationId, RECORD_REVISION, bundleBytes),
            now);
      } finally {
        clear(bundleBytes);
      }

      connection.setTransactionSuccessful();
      committed = true;
      return immutableBundle;
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (RuntimeException e) {
      throw new ProductionIdentityException("identity-create-failed", e);
    } finally {
      connection.endTransaction();
      if (!committed) {
        cleanupKeysAfterFailedCreate();
      }
    }
  }

  private void cleanupKeysAfterFailedCreate() throws ProductionIdentityException {
    ProductionIdentityException failure = null;
    try {
      recordCipher.deleteKey();
    } catch (ProductionIdentityException e) {
      failure = e;
    }
    try {
      deviceSigner.deleteKey();
    } catch (ProductionIdentityException e) {
      failure = e;
    }
    if (failure != null) {
      throw new ProductionIdentityException("identity-create-rollback-failed", failure);
    }
  }

  private String decryptDisplayName(ProductionIdentityDatabase.IdentityProjection identity)
      throws ProductionIdentityException {
    byte[] ciphertext = identity.displayNameCiphertext();
    if (ciphertext == null) {
      return null;
    }
    byte[] plaintext =
        recordCipher.decrypt("projection", "display-name", RECORD_REVISION, ciphertext);
    try {
      String displayName = new String(plaintext, StandardCharsets.UTF_8);
      return normalizeDisplayName(displayName);
    } finally {
      clear(plaintext);
    }
  }

  private static String encode(byte[] bytes) {
    return BASE64_URL_ENCODER.encodeToString(bytes);
  }

  private static String normalizeDisplayName(String displayName)
      throws ProductionIdentityException {
    if (displayName == null) {
      return null;
    }
    String normalized = displayName.trim();
    if (normalized.isEmpty()) {
      return null;
    }
    if (normalized.length() > 64
        || normalized.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint))) {
      throw new ProductionIdentityException("identity-display-name-invalid");
    }
    return normalized;
  }

  private static List<Map<String, Object>> preKeysFromJson(JSONArray array)
      throws JSONException, ProductionIdentityException {
    if (array.length() != ONE_TIME_PREKEY_COUNT) {
      throw new ProductionIdentityException("identity-registration-bundle-corrupt");
    }
    List<Map<String, Object>> result = new ArrayList<>(ONE_TIME_PREKEY_COUNT);
    for (int index = 0; index < array.length(); index++) {
      JSONObject item = array.getJSONObject(index);
      if (item.length() != 2) {
        throw new ProductionIdentityException("identity-registration-bundle-corrupt");
      }
      result.add(Map.of("id", item.getInt("id"), "publicKey", item.getString("publicKey")));
    }
    return Collections.unmodifiableList(result);
  }

  private void persistSecret(
      SQLiteDatabase connection,
      String recordKind,
      String recordKey,
      byte[] plaintext,
      long nowMs)
      throws ProductionIdentityException {
    try {
      database.insertSecret(
          connection,
          recordKind,
          recordKey,
          recordCipher.encrypt(recordKind, recordKey, RECORD_REVISION, plaintext),
          RECORD_REVISION,
          nowMs);
    } finally {
      clear(plaintext);
    }
  }

  private ProductionIdentityDatabase.IdentityProjection requireIdentity(SQLiteDatabase connection)
      throws ProductionIdentityException {
    ProductionIdentityDatabase.IdentityProjection identity = database.loadIdentity(connection);
    if (identity == null) {
      throw new ProductionIdentityException("identity-missing");
    }
    return identity;
  }

  /**
   * The writable connection every pairing action runs on, after proving this device still owns a
   * server-registered identity backed by live Keystore keys. Pairing before registration has no
   * peer to reach, so it fails here rather than writing a row nothing can ever deliver.
   */
  private SQLiteDatabase requireRegisteredConnection() throws ProductionIdentityException {
    SQLiteDatabase connection = database.getWritableDatabase();
    ProductionIdentityDatabase.IdentityProjection identity = requireIdentity(connection);
    verifyKeyBoundary(connection, identity);
    if (identity.registeredAtMs() == null) {
      throw new ProductionIdentityException("identity-registration-incomplete");
    }
    return connection;
  }

  private static void validateUuid(String value, String safeCode)
      throws ProductionIdentityException {
    if (value == null
        || !value.matches(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      throw new ProductionIdentityException(safeCode);
    }
  }

  private void verifyKeyBoundary(
      SQLiteDatabase connection, ProductionIdentityDatabase.IdentityProjection identity)
      throws ProductionIdentityException {
    if (!recordCipher.hasKey() || !deviceSigner.hasKey()) {
      throw new ProductionIdentityException("identity-key-missing");
    }
    ProductionIdentityDatabase.SecretRecord identityRecord =
        database.loadSecret(connection, "identity", "local");
    if (identityRecord == null) {
      throw new ProductionIdentityException("identity-record-missing");
    }
    byte[] serialized =
        recordCipher.decrypt(
            "identity", "local", identityRecord.revision(), identityRecord.ciphertext());
    try {
      new IdentityKeyPair(serialized);
    } catch (InvalidKeyException e) {
      throw new ProductionIdentityException("identity-record-corrupt", e);
    } finally {
      clear(serialized);
    }
    if (identity.m2yId().length() != 23 || identity.deviceId().length() != 36) {
      throw new ProductionIdentityException("identity-projection-corrupt");
    }
  }
}
