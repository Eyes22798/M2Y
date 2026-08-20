package com.m2y.crypto;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
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
 * Copy-on-read SignalProtocolStore used only by the isolated acceptance harness.
 *
 * <p>Every mutable libsignal record is serialized at the store boundary. This makes a working
 * store independent from its committed checkpoint and prevents mutations returned by load methods
 * from becoming durable without the corresponding store call.
 */
final class M2YSignalProtocolStore implements SignalProtocolStore {
  private static final Base64.Encoder BASE64_ENCODER = Base64.getEncoder();
  private static final Base64.Decoder BASE64_DECODER = Base64.getDecoder();

  private final IdentityKeyPair identityKeyPair;
  private final int registrationId;
  private final Map<AddressKey, byte[]> trustedIdentities = new HashMap<>();
  private final Map<Integer, byte[]> preKeys = new HashMap<>();
  private final Map<Integer, byte[]> signedPreKeys = new HashMap<>();
  private final Map<Integer, byte[]> kyberPreKeys = new HashMap<>();
  private final Map<AddressKey, byte[]> sessions = new HashMap<>();
  private final Map<SenderKeyId, byte[]> senderKeys = new HashMap<>();
  private final Set<KyberUse> kyberUses = new HashSet<>();

  M2YSignalProtocolStore(IdentityKeyPair identityKeyPair, int registrationId) {
    this.identityKeyPair = identityKeyPair;
    this.registrationId = registrationId;
  }

  static M2YSignalProtocolStore fromJson(JSONObject json) throws SnapshotFormatException {
    try {
      JsonStrict.requireKeys(
          json,
          "identityKeyPair",
          "kyberPreKeys",
          "kyberUses",
          "preKeys",
          "registrationId",
          "senderKeys",
          "sessions",
          "signedPreKeys",
          "trustedIdentities");

      int registrationId = json.getInt("registrationId");
      if (registrationId <= 0) {
        throw new SnapshotFormatException();
      }

      M2YSignalProtocolStore store =
          new M2YSignalProtocolStore(
              new IdentityKeyPair(decode(json.getString("identityKeyPair"))), registrationId);

      readAddressRecords(json.getJSONArray("trustedIdentities"), store.trustedIdentities);
      readIntegerRecords(json.getJSONArray("preKeys"), store.preKeys);
      readIntegerRecords(json.getJSONArray("signedPreKeys"), store.signedPreKeys);
      readIntegerRecords(json.getJSONArray("kyberPreKeys"), store.kyberPreKeys);
      readAddressRecords(json.getJSONArray("sessions"), store.sessions);
      readSenderKeyRecords(json.getJSONArray("senderKeys"), store.senderKeys);
      readKyberUses(json.getJSONArray("kyberUses"), store.kyberUses);
      store.validateRecords();
      return store;
    } catch (JSONException | IllegalArgumentException | InvalidKeyException e) {
      throw new SnapshotFormatException();
    }
  }

  JSONObject toJson() throws SnapshotFormatException {
    try {
      return new JSONObject()
          .put("identityKeyPair", encode(identityKeyPair.serialize()))
          .put("registrationId", registrationId)
          .put("trustedIdentities", writeAddressRecords(trustedIdentities))
          .put("preKeys", writeIntegerRecords(preKeys))
          .put("signedPreKeys", writeIntegerRecords(signedPreKeys))
          .put("kyberPreKeys", writeIntegerRecords(kyberPreKeys))
          .put("sessions", writeAddressRecords(sessions))
          .put("senderKeys", writeSenderKeyRecords(senderKeys))
          .put("kyberUses", writeKyberUses(kyberUses));
    } catch (JSONException e) {
      throw new SnapshotFormatException();
    }
  }

  M2YSignalProtocolStore copy() throws SnapshotFormatException {
    return fromJson(toJson());
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
    AddressKey key = AddressKey.from(address);
    byte[] serialized = identityKey.serialize();
    byte[] previous = trustedIdentities.put(key, serialized.clone());
    return previous == null || MessageDigest.isEqual(previous, serialized)
        ? IdentityChange.NEW_OR_UNCHANGED
        : IdentityChange.REPLACED_EXISTING;
  }

  @Override
  public boolean isTrustedIdentity(
      SignalProtocolAddress address, IdentityKey identityKey, IdentityKeyStore.Direction direction) {
    byte[] trusted = trustedIdentities.get(AddressKey.from(address));
    return trusted == null || MessageDigest.isEqual(trusted, identityKey.serialize());
  }

  @Override
  public IdentityKey getIdentity(SignalProtocolAddress address) {
    byte[] serialized = trustedIdentities.get(AddressKey.from(address));
    if (serialized == null) {
      return null;
    }
    try {
      return new IdentityKey(serialized.clone());
    } catch (InvalidKeyException e) {
      throw new AssertionError(e);
    }
  }

  @Override
  public PreKeyRecord loadPreKey(int preKeyId) throws InvalidKeyIdException {
    byte[] serialized = requireRecord(preKeys, preKeyId);
    try {
      return new PreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw new AssertionError(e);
    }
  }

  @Override
  public void storePreKey(int preKeyId, PreKeyRecord record) {
    preKeys.put(preKeyId, record.serialize());
  }

  @Override
  public boolean containsPreKey(int preKeyId) {
    return preKeys.containsKey(preKeyId);
  }

  @Override
  public void removePreKey(int preKeyId) {
    preKeys.remove(preKeyId);
  }

  @Override
  public SessionRecord loadSession(SignalProtocolAddress address) {
    byte[] serialized = sessions.get(AddressKey.from(address));
    if (serialized == null) {
      return null;
    }
    try {
      return new SessionRecord(serialized.clone());
    } catch (InvalidMessageException e) {
      throw new AssertionError(e);
    }
  }

  @Override
  public List<SessionRecord> loadExistingSessions(List<SignalProtocolAddress> addresses)
      throws NoSessionException {
    ArrayList<SessionRecord> result = new ArrayList<>(addresses.size());
    for (SignalProtocolAddress address : addresses) {
      SessionRecord record = loadSession(address);
      if (record == null) {
        throw new NoSessionException(address, "session-unavailable");
      }
      result.add(record);
    }
    return result;
  }

  @Override
  public List<Integer> getSubDeviceSessions(String name) {
    return sessions.keySet().stream()
        .filter(key -> key.name().equals(name) && key.deviceId() != 1)
        .map(AddressKey::deviceId)
        .sorted()
        .toList();
  }

  @Override
  public void storeSession(SignalProtocolAddress address, SessionRecord record) {
    sessions.put(AddressKey.from(address), record.serialize());
  }

  @Override
  public boolean containsSession(SignalProtocolAddress address) {
    return sessions.containsKey(AddressKey.from(address));
  }

  @Override
  public void deleteSession(SignalProtocolAddress address) {
    sessions.remove(AddressKey.from(address));
  }

  @Override
  public void deleteAllSessions(String name) {
    sessions.keySet().removeIf(key -> key.name().equals(name));
  }

  @Override
  public SignedPreKeyRecord loadSignedPreKey(int signedPreKeyId) throws InvalidKeyIdException {
    byte[] serialized = requireRecord(signedPreKeys, signedPreKeyId);
    try {
      return new SignedPreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw new AssertionError(e);
    }
  }

  @Override
  public List<SignedPreKeyRecord> loadSignedPreKeys() {
    ArrayList<SignedPreKeyRecord> result = new ArrayList<>();
    for (Integer id : signedPreKeys.keySet().stream().sorted().toList()) {
      try {
        result.add(new SignedPreKeyRecord(signedPreKeys.get(id).clone()));
      } catch (InvalidMessageException e) {
        throw new AssertionError(e);
      }
    }
    return result;
  }

  @Override
  public void storeSignedPreKey(int signedPreKeyId, SignedPreKeyRecord record) {
    signedPreKeys.put(signedPreKeyId, record.serialize());
  }

  @Override
  public boolean containsSignedPreKey(int signedPreKeyId) {
    return signedPreKeys.containsKey(signedPreKeyId);
  }

  @Override
  public void removeSignedPreKey(int signedPreKeyId) {
    signedPreKeys.remove(signedPreKeyId);
  }

  @Override
  public KyberPreKeyRecord loadKyberPreKey(int kyberPreKeyId) throws InvalidKeyIdException {
    byte[] serialized = requireRecord(kyberPreKeys, kyberPreKeyId);
    try {
      return new KyberPreKeyRecord(serialized);
    } catch (InvalidMessageException e) {
      throw new AssertionError(e);
    }
  }

  @Override
  public List<KyberPreKeyRecord> loadKyberPreKeys() {
    ArrayList<KyberPreKeyRecord> result = new ArrayList<>();
    for (Integer id : kyberPreKeys.keySet().stream().sorted().toList()) {
      try {
        result.add(new KyberPreKeyRecord(kyberPreKeys.get(id).clone()));
      } catch (InvalidMessageException e) {
        throw new AssertionError(e);
      }
    }
    return result;
  }

  @Override
  public void storeKyberPreKey(int kyberPreKeyId, KyberPreKeyRecord record) {
    kyberPreKeys.put(kyberPreKeyId, record.serialize());
  }

  @Override
  public boolean containsKyberPreKey(int kyberPreKeyId) {
    return kyberPreKeys.containsKey(kyberPreKeyId);
  }

  @Override
  public void markKyberPreKeyUsed(int kyberPreKeyId, int signedPreKeyId, ECPublicKey baseKey)
      throws ReusedBaseKeyException {
    KyberUse use = new KyberUse(kyberPreKeyId, signedPreKeyId, encode(baseKey.serialize()));
    if (!kyberUses.add(use)) {
      throw new ReusedBaseKeyException();
    }
  }

  @Override
  public void storeSenderKey(
      SignalProtocolAddress sender, UUID distributionId, SenderKeyRecord record) {
    senderKeys.put(new SenderKeyId(AddressKey.from(sender), distributionId), record.serialize());
  }

  @Override
  public SenderKeyRecord loadSenderKey(SignalProtocolAddress sender, UUID distributionId) {
    byte[] serialized = senderKeys.get(new SenderKeyId(AddressKey.from(sender), distributionId));
    if (serialized == null) {
      return null;
    }
    try {
      return new SenderKeyRecord(serialized.clone());
    } catch (InvalidMessageException e) {
      throw new AssertionError(e);
    }
  }

  private void validateRecords() throws SnapshotFormatException {
    try {
      for (byte[] value : trustedIdentities.values()) {
        new IdentityKey(value.clone());
      }
      for (byte[] value : preKeys.values()) {
        new PreKeyRecord(value.clone());
      }
      for (byte[] value : signedPreKeys.values()) {
        new SignedPreKeyRecord(value.clone());
      }
      for (byte[] value : kyberPreKeys.values()) {
        new KyberPreKeyRecord(value.clone());
      }
      for (byte[] value : sessions.values()) {
        new SessionRecord(value.clone());
      }
      for (byte[] value : senderKeys.values()) {
        new SenderKeyRecord(value.clone());
      }
    } catch (InvalidKeyException | InvalidMessageException e) {
      throw new SnapshotFormatException();
    }
  }

  private static byte[] requireRecord(Map<Integer, byte[]> records, int id)
      throws InvalidKeyIdException {
    byte[] serialized = records.get(id);
    if (serialized == null) {
      throw new InvalidKeyIdException("record-unavailable");
    }
    return serialized.clone();
  }

  private static JSONArray writeIntegerRecords(Map<Integer, byte[]> records)
      throws JSONException {
    JSONArray array = new JSONArray();
    for (Integer id : records.keySet().stream().sorted().toList()) {
      array.put(new JSONObject().put("id", id).put("record", encode(records.get(id))));
    }
    return array;
  }

  private static void readIntegerRecords(JSONArray array, Map<Integer, byte[]> target)
      throws JSONException, SnapshotFormatException {
    for (int index = 0; index < array.length(); index++) {
      JSONObject item = array.getJSONObject(index);
      JsonStrict.requireKeys(item, "id", "record");
      int id = item.getInt("id");
      if (id < 0 || target.put(id, decode(item.getString("record"))) != null) {
        throw new SnapshotFormatException();
      }
    }
  }

  private static JSONArray writeAddressRecords(Map<AddressKey, byte[]> records)
      throws JSONException {
    JSONArray array = new JSONArray();
    List<Map.Entry<AddressKey, byte[]>> entries = new ArrayList<>(records.entrySet());
    entries.sort(Map.Entry.comparingByKey(AddressKey.COMPARATOR));
    for (Map.Entry<AddressKey, byte[]> entry : entries) {
      array.put(
          new JSONObject()
              .put("deviceId", entry.getKey().deviceId())
              .put("name", entry.getKey().name())
              .put("record", encode(entry.getValue())));
    }
    return array;
  }

  private static void readAddressRecords(JSONArray array, Map<AddressKey, byte[]> target)
      throws JSONException, SnapshotFormatException {
    for (int index = 0; index < array.length(); index++) {
      JSONObject item = array.getJSONObject(index);
      JsonStrict.requireKeys(item, "deviceId", "name", "record");
      AddressKey key = new AddressKey(item.getString("name"), item.getInt("deviceId"));
      if (!key.isValid() || target.put(key, decode(item.getString("record"))) != null) {
        throw new SnapshotFormatException();
      }
    }
  }

  private static JSONArray writeSenderKeyRecords(Map<SenderKeyId, byte[]> records)
      throws JSONException {
    JSONArray array = new JSONArray();
    List<Map.Entry<SenderKeyId, byte[]>> entries = new ArrayList<>(records.entrySet());
    entries.sort(Map.Entry.comparingByKey(SenderKeyId.COMPARATOR));
    for (Map.Entry<SenderKeyId, byte[]> entry : entries) {
      SenderKeyId key = entry.getKey();
      array.put(
          new JSONObject()
              .put("deviceId", key.address().deviceId())
              .put("distributionId", key.distributionId().toString())
              .put("name", key.address().name())
              .put("record", encode(entry.getValue())));
    }
    return array;
  }

  private static void readSenderKeyRecords(JSONArray array, Map<SenderKeyId, byte[]> target)
      throws JSONException, SnapshotFormatException {
    for (int index = 0; index < array.length(); index++) {
      JSONObject item = array.getJSONObject(index);
      JsonStrict.requireKeys(item, "deviceId", "distributionId", "name", "record");
      AddressKey address = new AddressKey(item.getString("name"), item.getInt("deviceId"));
      SenderKeyId key =
          new SenderKeyId(address, UUID.fromString(item.getString("distributionId")));
      if (!address.isValid() || target.put(key, decode(item.getString("record"))) != null) {
        throw new SnapshotFormatException();
      }
    }
  }

  private static JSONArray writeKyberUses(Set<KyberUse> uses) throws JSONException {
    JSONArray array = new JSONArray();
    for (KyberUse use : uses.stream().sorted(KyberUse.COMPARATOR).toList()) {
      array.put(
          new JSONObject()
              .put("baseKey", use.baseKey())
              .put("kyberPreKeyId", use.kyberPreKeyId())
              .put("signedPreKeyId", use.signedPreKeyId()));
    }
    return array;
  }

  private static void readKyberUses(JSONArray array, Set<KyberUse> target)
      throws JSONException, SnapshotFormatException {
    for (int index = 0; index < array.length(); index++) {
      JSONObject item = array.getJSONObject(index);
      JsonStrict.requireKeys(item, "baseKey", "kyberPreKeyId", "signedPreKeyId");
      String baseKey = item.getString("baseKey");
      decode(baseKey);
      KyberUse use =
          new KyberUse(
              item.getInt("kyberPreKeyId"), item.getInt("signedPreKeyId"), baseKey);
      if (use.kyberPreKeyId() < 0 || use.signedPreKeyId() < 0 || !target.add(use)) {
        throw new SnapshotFormatException();
      }
    }
  }

  private static String encode(byte[] value) {
    return BASE64_ENCODER.encodeToString(value);
  }

  private static byte[] decode(String value) {
    byte[] decoded = BASE64_DECODER.decode(value);
    if (decoded.length == 0 || !encode(decoded).equals(value)) {
      throw new IllegalArgumentException("non-canonical-base64");
    }
    return decoded;
  }

  private record AddressKey(String name, int deviceId) {
    private static final Comparator<AddressKey> COMPARATOR =
        Comparator.comparing(AddressKey::name).thenComparingInt(AddressKey::deviceId);

    static AddressKey from(SignalProtocolAddress address) {
      return new AddressKey(address.getName(), address.getDeviceId());
    }

    boolean isValid() {
      return name != null && !name.isEmpty() && deviceId >= 1 && deviceId <= 127;
    }
  }

  private record SenderKeyId(AddressKey address, UUID distributionId) {
    private static final Comparator<SenderKeyId> COMPARATOR =
        Comparator.comparing(SenderKeyId::address, AddressKey.COMPARATOR)
            .thenComparing(key -> key.distributionId().toString());
  }

  private record KyberUse(int kyberPreKeyId, int signedPreKeyId, String baseKey) {
    private static final Comparator<KyberUse> COMPARATOR =
        Comparator.comparingInt(KyberUse::kyberPreKeyId)
            .thenComparingInt(KyberUse::signedPreKeyId)
            .thenComparing(KyberUse::baseKey);
  }
}

final class JsonStrict {
  private JsonStrict() {}

  static void requireKeys(JSONObject object, String... expected) throws SnapshotFormatException {
    Set<String> expectedKeys = Set.of(expected);
    Set<String> actualKeys = new HashSet<>();
    Iterator<String> keys = object.keys();
    while (keys.hasNext()) {
      actualKeys.add(keys.next());
    }
    if (!actualKeys.equals(expectedKeys)) {
      throw new SnapshotFormatException();
    }
  }
}

final class SnapshotFormatException extends Exception {
  SnapshotFormatException() {
    super("checkpoint-format-invalid");
  }
}
