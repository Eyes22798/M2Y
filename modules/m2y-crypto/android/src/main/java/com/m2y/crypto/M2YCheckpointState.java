package com.m2y.crypto;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.util.KeyHelper;

/** Strict, versioned plaintext state that exists only inside the native process before encryption. */
final class M2YCheckpointState {
  static final int SCHEMA_VERSION = 1;
  private static final int MAX_PLAINTEXT_BYTES = 16 * 1024 * 1024;

  private final String runId;
  private final long createdAtEpochMs;
  private final long updatedAtEpochMs;
  private final int revision;
  private final M2YSignalProtocolStore aliceStore;
  private final M2YSignalProtocolStore bobStore;

  M2YCheckpointState(
      String runId,
      long createdAtEpochMs,
      long updatedAtEpochMs,
      int revision,
      M2YSignalProtocolStore aliceStore,
      M2YSignalProtocolStore bobStore) {
    this.runId = runId;
    this.createdAtEpochMs = createdAtEpochMs;
    this.updatedAtEpochMs = updatedAtEpochMs;
    this.revision = revision;
    this.aliceStore = aliceStore;
    this.bobStore = bobStore;
  }

  static M2YCheckpointState createFresh(String runId) throws SnapshotFormatException {
    validateRunId(runId);
    long now = System.currentTimeMillis();
    return new M2YCheckpointState(
        runId,
        now,
        now,
        0,
        new M2YSignalProtocolStore(
            IdentityKeyPair.generate(), KeyHelper.generateRegistrationId(false)),
        new M2YSignalProtocolStore(
            IdentityKeyPair.generate(), KeyHelper.generateRegistrationId(false)));
  }

  static M2YCheckpointState fromBytes(byte[] bytes) throws SnapshotFormatException {
    if (bytes.length == 0 || bytes.length > MAX_PLAINTEXT_BYTES) {
      throw new SnapshotFormatException();
    }
    try {
      JSONObject json = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
      JsonStrict.requireKeys(
          json,
          "alice",
          "bob",
          "createdAtEpochMs",
          "revision",
          "runId",
          "schemaVersion",
          "updatedAtEpochMs");
      if (json.getInt("schemaVersion") != SCHEMA_VERSION) {
        throw new SnapshotFormatException();
      }

      String runId = json.getString("runId");
      validateRunId(runId);
      long createdAt = json.getLong("createdAtEpochMs");
      long updatedAt = json.getLong("updatedAtEpochMs");
      int revision = json.getInt("revision");
      if (createdAt <= 0 || updatedAt < createdAt || revision < 0) {
        throw new SnapshotFormatException();
      }

      return new M2YCheckpointState(
          runId,
          createdAt,
          updatedAt,
          revision,
          M2YSignalProtocolStore.fromJson(json.getJSONObject("alice")),
          M2YSignalProtocolStore.fromJson(json.getJSONObject("bob")));
    } catch (JSONException e) {
      throw new SnapshotFormatException();
    }
  }

  byte[] toBytes() throws SnapshotFormatException {
    try {
      byte[] bytes =
          new JSONObject()
              .put("alice", aliceStore.toJson())
              .put("bob", bobStore.toJson())
              .put("createdAtEpochMs", createdAtEpochMs)
              .put("revision", revision)
              .put("runId", runId)
              .put("schemaVersion", SCHEMA_VERSION)
              .put("updatedAtEpochMs", updatedAtEpochMs)
              .toString()
              .getBytes(StandardCharsets.UTF_8);
      if (bytes.length > MAX_PLAINTEXT_BYTES) {
        throw new SnapshotFormatException();
      }
      return bytes;
    } catch (JSONException e) {
      throw new SnapshotFormatException();
    }
  }

  M2YCheckpointState workingCopy() throws SnapshotFormatException {
    return fromBytes(toBytes());
  }

  M2YCheckpointState advanced() {
    return new M2YCheckpointState(
        runId,
        createdAtEpochMs,
        Math.max(System.currentTimeMillis(), updatedAtEpochMs),
        revision + 1,
        aliceStore,
        bobStore);
  }

  String runId() {
    return runId;
  }

  int revision() {
    return revision;
  }

  M2YSignalProtocolStore aliceStore() {
    return aliceStore;
  }

  M2YSignalProtocolStore bobStore() {
    return bobStore;
  }

  private static void validateRunId(String runId) throws SnapshotFormatException {
    try {
      if (!UUID.fromString(runId).toString().equals(runId)) {
        throw new SnapshotFormatException();
      }
    } catch (IllegalArgumentException e) {
      throw new SnapshotFormatException();
    }
  }
}
