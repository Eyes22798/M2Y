package com.m2y.crypto.production;

import android.database.sqlite.SQLiteDatabase;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.InvalidKeyIdException;
import org.signal.libsignal.protocol.InvalidMessageException;
import org.signal.libsignal.protocol.NoSessionException;
import org.signal.libsignal.protocol.ReusedBaseKeyException;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.ecc.ECPublicKey;
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord;
import org.signal.libsignal.protocol.state.IdentityKeyStore;
import org.signal.libsignal.protocol.state.KyberPreKeyRecord;
import org.signal.libsignal.protocol.state.PreKeyRecord;
import org.signal.libsignal.protocol.state.SessionRecord;
import org.signal.libsignal.protocol.state.SignalProtocolStore;
import org.signal.libsignal.protocol.state.SignedPreKeyRecord;

/**
 * 直接绑定当前 SQLite 事务的生产 SignalProtocolStore。
 *
 * <p>libsignal 的回调是同步接口，因此每次写入都立即落到调用方已经开启的事务；会话、可信身份和
 * outbox 由同一事务一起提交或回滚。所有协议记录仍按 record kind/key 独立加密，不复制到
 * TypeScript、SharedPreferences 或验收 harness。
 */
final class ProductionSignalProtocolStore implements SignalProtocolStore {
  private static final Base64.Encoder BASE64_URL_ENCODER =
      Base64.getUrlEncoder().withoutPadding();
  private static final String KEY_SEPARATOR = "#";

  private final SQLiteDatabase connection;
  private final ProductionIdentityDatabase database;
  private final IdentityKeyPair identityKeyPair;
  private final int registrationId;
  private final ProductionRecordCipher recordCipher;
  private final long nowMs;

  ProductionSignalProtocolStore(
      SQLiteDatabase connection,
      ProductionIdentityDatabase database,
      ProductionRecordCipher recordCipher,
      int registrationId,
      long nowMs)
      throws ProductionIdentityException {
    if (registrationId <= 0) {
      throw new ProductionIdentityException("pairing-local-registration-invalid");
    }
    this.connection = connection;
    this.database = database;
    this.recordCipher = recordCipher;
    this.registrationId = registrationId;
    this.nowMs = nowMs;
    byte[] serialized = requirePlaintext("identity", "local", "identity-record-missing");
    try {
      this.identityKeyPair = new IdentityKeyPair(serialized);
    } catch (InvalidKeyException e) {
      throw new ProductionIdentityException("identity-record-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public IdentityKeyPair getIdentityKeyPair() {
    return identityKeyPair;
  }

  @Override
  public int getLocalRegistrationId() {
    return registrationId;
  }

  @Override
  public IdentityChange saveIdentity(SignalProtocolAddress address, IdentityKey identityKey) {
    String key = addressKey(address);
    byte[] serialized = identityKey.serialize();
    byte[] previous = loadPlaintext("trusted-identity", key);
    try {
      boolean unchanged = previous == null || MessageDigest.isEqual(previous, serialized);
      store("trusted-identity", key, serialized);
      return unchanged ? IdentityChange.NEW_OR_UNCHANGED : IdentityChange.REPLACED_EXISTING;
    } finally {
      clear(previous);
      clear(serialized);
    }
  }

  @Override
  public boolean isTrustedIdentity(
      SignalProtocolAddress address, IdentityKey identityKey, IdentityKeyStore.Direction direction) {
    byte[] trusted = loadPlaintext("trusted-identity", addressKey(address));
    byte[] proposed = identityKey.serialize();
    try {
      return trusted == null || MessageDigest.isEqual(trusted, proposed);
    } finally {
      clear(trusted);
      clear(proposed);
    }
  }

  @Override
  public IdentityKey getIdentity(SignalProtocolAddress address) {
    byte[] serialized = loadPlaintext("trusted-identity", addressKey(address));
    if (serialized == null) {
      return null;
    }
    try {
      return new IdentityKey(serialized);
    } catch (InvalidKeyException e) {
      throw fail("pairing-trusted-identity-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public PreKeyRecord loadPreKey(int preKeyId) throws InvalidKeyIdException {
    byte[] serialized = loadPlaintext("pre-key", integerKey(preKeyId));
    if (serialized == null) {
      throw new InvalidKeyIdException("pairing-pre-key-unavailable");
    }
    try {
      return new PreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw fail("pairing-pre-key-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public void storePreKey(int preKeyId, PreKeyRecord record) {
    store("pre-key", integerKey(preKeyId), record.serialize());
  }

  @Override
  public boolean containsPreKey(int preKeyId) {
    return contains("pre-key", integerKey(preKeyId));
  }

  @Override
  public void removePreKey(int preKeyId) {
    database.deleteSecret(connection, "pre-key", integerKey(preKeyId));
  }

  @Override
  public SessionRecord loadSession(SignalProtocolAddress address) {
    byte[] serialized = loadPlaintext("session", addressKey(address));
    if (serialized == null) {
      return null;
    }
    try {
      return new SessionRecord(serialized);
    } catch (InvalidMessageException e) {
      throw fail("pairing-session-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public List<SessionRecord> loadExistingSessions(List<SignalProtocolAddress> addresses)
      throws NoSessionException {
    List<SessionRecord> sessions = new ArrayList<>(addresses.size());
    for (SignalProtocolAddress address : addresses) {
      SessionRecord session = loadSession(address);
      if (session == null) {
        throw new NoSessionException(address, "pairing-session-unavailable");
      }
      sessions.add(session);
    }
    return sessions;
  }

  @Override
  public List<Integer> getSubDeviceSessions(String name) {
    List<Integer> deviceIds = new ArrayList<>();
    for (String key : database.secretKeys(connection, "session")) {
      AddressParts parts = parseAddressKey(key);
      if (parts.name().equals(name) && parts.deviceId() != 1) {
        deviceIds.add(parts.deviceId());
      }
    }
    deviceIds.sort(Integer::compareTo);
    return deviceIds;
  }

  @Override
  public void storeSession(SignalProtocolAddress address, SessionRecord record) {
    store("session", addressKey(address), record.serialize());
  }

  @Override
  public boolean containsSession(SignalProtocolAddress address) {
    return contains("session", addressKey(address));
  }

  @Override
  public void deleteSession(SignalProtocolAddress address) {
    database.deleteSecret(connection, "session", addressKey(address));
  }

  @Override
  public void deleteAllSessions(String name) {
    for (String key : database.secretKeys(connection, "session")) {
      if (parseAddressKey(key).name().equals(name)) {
        database.deleteSecret(connection, "session", key);
      }
    }
  }

  @Override
  public SignedPreKeyRecord loadSignedPreKey(int signedPreKeyId) throws InvalidKeyIdException {
    byte[] serialized = loadPlaintext("signed-pre-key", integerKey(signedPreKeyId));
    if (serialized == null) {
      throw new InvalidKeyIdException("pairing-signed-pre-key-unavailable");
    }
    try {
      return new SignedPreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw fail("pairing-signed-pre-key-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public List<SignedPreKeyRecord> loadSignedPreKeys() {
    List<SignedPreKeyRecord> records = new ArrayList<>();
    for (String key : database.secretKeys(connection, "signed-pre-key")) {
      try {
        records.add(loadSignedPreKey(Integer.parseInt(key)));
      } catch (InvalidKeyIdException | NumberFormatException e) {
        throw fail("pairing-signed-pre-key-corrupt", e);
      }
    }
    return records;
  }

  @Override
  public void storeSignedPreKey(int signedPreKeyId, SignedPreKeyRecord record) {
    store("signed-pre-key", integerKey(signedPreKeyId), record.serialize());
  }

  @Override
  public boolean containsSignedPreKey(int signedPreKeyId) {
    return contains("signed-pre-key", integerKey(signedPreKeyId));
  }

  @Override
  public void removeSignedPreKey(int signedPreKeyId) {
    database.deleteSecret(connection, "signed-pre-key", integerKey(signedPreKeyId));
  }

  @Override
  public KyberPreKeyRecord loadKyberPreKey(int kyberPreKeyId) throws InvalidKeyIdException {
    byte[] serialized = loadPlaintext("kyber-pre-key", integerKey(kyberPreKeyId));
    if (serialized == null) {
      throw new InvalidKeyIdException("pairing-kyber-pre-key-unavailable");
    }
    try {
      return new KyberPreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw fail("pairing-kyber-pre-key-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  @Override
  public List<KyberPreKeyRecord> loadKyberPreKeys() {
    List<KyberPreKeyRecord> records = new ArrayList<>();
    for (String key : database.secretKeys(connection, "kyber-pre-key")) {
      try {
        records.add(loadKyberPreKey(Integer.parseInt(key)));
      } catch (InvalidKeyIdException | NumberFormatException e) {
        throw fail("pairing-kyber-pre-key-corrupt", e);
      }
    }
    return records;
  }

  @Override
  public void storeKyberPreKey(int kyberPreKeyId, KyberPreKeyRecord record) {
    store("kyber-pre-key", integerKey(kyberPreKeyId), record.serialize());
  }

  @Override
  public boolean containsKyberPreKey(int kyberPreKeyId) {
    return contains("kyber-pre-key", integerKey(kyberPreKeyId));
  }

  @Override
  public void markKyberPreKeyUsed(int kyberPreKeyId, int signedPreKeyId, ECPublicKey baseKey)
      throws ReusedBaseKeyException {
    String key = kyberUseKey(kyberPreKeyId, signedPreKeyId, baseKey.serialize());
    if (contains("kyber-use", key)) {
      throw new ReusedBaseKeyException();
    }
    store("kyber-use", key, new byte[] {1});
  }

  @Override
  public void storeSenderKey(
      SignalProtocolAddress sender, UUID distributionId, SenderKeyRecord record) {
    store("sender-key", senderKey(sender, distributionId), record.serialize());
  }

  @Override
  public SenderKeyRecord loadSenderKey(SignalProtocolAddress sender, UUID distributionId) {
    byte[] serialized = loadPlaintext("sender-key", senderKey(sender, distributionId));
    if (serialized == null) {
      return null;
    }
    try {
      return new SenderKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw fail("pairing-sender-key-corrupt", e);
    } finally {
      clear(serialized);
    }
  }

  private boolean contains(String kind, String key) {
    return database.loadSecret(connection, kind, key) != null;
  }

  private byte[] requirePlaintext(String kind, String key, String missingCode)
      throws ProductionIdentityException {
    ProductionIdentityDatabase.SecretRecord record = database.loadSecret(connection, kind, key);
    if (record == null) {
      throw new ProductionIdentityException(missingCode);
    }
    return recordCipher.decrypt(kind, key, record.revision(), record.ciphertext());
  }

  private byte[] loadPlaintext(String kind, String key) {
    try {
      ProductionIdentityDatabase.SecretRecord record = database.loadSecret(connection, kind, key);
      return record == null
          ? null
          : recordCipher.decrypt(kind, key, record.revision(), record.ciphertext());
    } catch (ProductionIdentityException e) {
      throw fail(e);
    }
  }

  private void store(String kind, String key, byte[] plaintext) {
    try {
      ProductionIdentityDatabase.SecretRecord existing = database.loadSecret(connection, kind, key);
      long revision = existing == null ? 1 : existing.revision() + 1;
      byte[] ciphertext = recordCipher.encrypt(kind, key, revision, plaintext);
      database.upsertSecret(connection, kind, key, ciphertext, revision, nowMs);
    } catch (ProductionIdentityException e) {
      throw fail(e);
    } finally {
      clear(plaintext);
    }
  }

  private static String addressKey(SignalProtocolAddress address) {
    if (address == null
        || address.getName() == null
        || address.getName().isEmpty()
        || address.getName().length() > 128
        || address.getName().contains(KEY_SEPARATOR)
        || address.getDeviceId() < 1
        || address.getDeviceId() > 127) {
      throw fail("pairing-address-invalid", null);
    }
    return address.getName() + KEY_SEPARATOR + address.getDeviceId();
  }

  private static AddressParts parseAddressKey(String key) {
    int separator = key.lastIndexOf(KEY_SEPARATOR);
    if (separator <= 0 || separator == key.length() - 1) {
      throw fail("pairing-address-corrupt", null);
    }
    try {
      int deviceId = Integer.parseInt(key.substring(separator + 1));
      if (deviceId < 1 || deviceId > 127) {
        throw new NumberFormatException();
      }
      return new AddressParts(key.substring(0, separator), deviceId);
    } catch (NumberFormatException e) {
      throw fail("pairing-address-corrupt", e);
    }
  }

  private static String senderKey(SignalProtocolAddress address, UUID distributionId) {
    if (distributionId == null) {
      throw fail("pairing-sender-key-invalid", null);
    }
    return addressKey(address) + KEY_SEPARATOR + distributionId;
  }

  private static String integerKey(int value) {
    if (value < 0) {
      throw fail("pairing-record-id-invalid", null);
    }
    return Integer.toString(value);
  }

  private static String kyberUseKey(int kyberPreKeyId, int signedPreKeyId, byte[] baseKey) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      digest.update(Integer.toString(kyberPreKeyId).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
      digest.update((byte) ':');
      digest.update(Integer.toString(signedPreKeyId).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
      digest.update((byte) ':');
      digest.update(baseKey);
      return BASE64_URL_ENCODER.encodeToString(digest.digest());
    } catch (NoSuchAlgorithmException e) {
      throw new AssertionError(e);
    } finally {
      clear(baseKey);
    }
  }

  private static ProductionProtocolStoreFailure fail(ProductionIdentityException failure) {
    return new ProductionProtocolStoreFailure(failure);
  }

  private static ProductionProtocolStoreFailure fail(String code, Throwable cause) {
    return fail(new ProductionIdentityException(code, cause));
  }

  private static void clear(byte[] bytes) {
    if (bytes != null) {
      Arrays.fill(bytes, (byte) 0);
    }
  }

  private record AddressParts(String name, int deviceId) {}
}

/** 把同步 store 回调中的安全失败带回拥有事务的协议引擎，由引擎恢复稳定错误码。 */
final class ProductionProtocolStoreFailure extends RuntimeException {
  private final ProductionIdentityException failure;

  ProductionProtocolStoreFailure(ProductionIdentityException failure) {
    super(failure.safeCode(), failure);
    this.failure = failure;
  }

  ProductionIdentityException failure() {
    return failure;
  }
}
