package com.m2y.crypto.production;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.ArrayList;
import java.util.List;

final class ProductionIdentityDatabase extends SQLiteOpenHelper {
  static final String DATABASE_NAME = "m2y-production-identity-v1.db";
  static final int SCHEMA_VERSION = 1;

  private final Context context;

  ProductionIdentityDatabase(Context context) {
    super(context.getApplicationContext(), DATABASE_NAME, null, SCHEMA_VERSION);
    this.context = context.getApplicationContext();
    setWriteAheadLoggingEnabled(true);
  }

  @Override
  public void onConfigure(SQLiteDatabase database) {
    super.onConfigure(database);
    database.setForeignKeyConstraintsEnabled(true);
    try (Cursor cursor = database.rawQuery("PRAGMA busy_timeout = 5000", null)) {
      cursor.moveToFirst();
    }
  }

  @Override
  public void onCreate(SQLiteDatabase database) {
    database.execSQL(
        "CREATE TABLE schema_metadata ("
            + "version INTEGER PRIMARY KEY NOT NULL, "
            + "created_at_ms INTEGER NOT NULL, "
            + "updated_at_ms INTEGER NOT NULL)");
    database.execSQL(
        "CREATE TABLE identity_projection ("
            + "singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1), "
            + "m2y_id TEXT UNIQUE NOT NULL, "
            + "stable_identity_id TEXT UNIQUE NOT NULL, "
            + "device_id TEXT UNIQUE NOT NULL, "
            + "display_name_ciphertext BLOB, "
            + "registered_at_ms INTEGER, "
            + "revision INTEGER NOT NULL CHECK(revision > 0))");
    database.execSQL(
        "CREATE TABLE secret_records ("
            + "record_kind TEXT NOT NULL, "
            + "record_key TEXT NOT NULL, "
            + "ciphertext BLOB NOT NULL, "
            + "revision INTEGER NOT NULL CHECK(revision > 0), "
            + "updated_at_ms INTEGER NOT NULL, "
            + "PRIMARY KEY(record_kind, record_key))");
    database.execSQL(
        "CREATE TABLE pairing_candidates ("
            + "request_id TEXT PRIMARY KEY NOT NULL, "
            + "peer_route_id TEXT NOT NULL, "
            + "status TEXT NOT NULL, "
            + "candidate_ciphertext BLOB NOT NULL, "
            + "safety_display_ciphertext BLOB, "
            + "expires_at_ms INTEGER NOT NULL, "
            + "revision INTEGER NOT NULL CHECK(revision > 0))");
    database.execSQL(
        "CREATE TABLE relationship ("
            + "singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1), "
            + "pair_id TEXT UNIQUE NOT NULL, "
            + "peer_route_id TEXT NOT NULL, "
            + "state TEXT NOT NULL, "
            + "peer_summary_ciphertext BLOB NOT NULL, "
            + "verified_at_ms INTEGER, "
            + "revision INTEGER NOT NULL CHECK(revision > 0))");
    database.execSQL(
        "CREATE TABLE pairing_outbox ("
            + "operation_id TEXT PRIMARY KEY NOT NULL, "
            + "request_id TEXT NOT NULL, "
            + "packet_type TEXT NOT NULL, "
            + "ciphertext BLOB NOT NULL, "
            + "created_at_ms INTEGER NOT NULL, "
            + "acknowledged_at_ms INTEGER, "
            + "retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count >= 0))");
    database.execSQL(
        "CREATE TABLE pairing_inbox ("
            + "event_id TEXT PRIMARY KEY NOT NULL, "
            + "request_id TEXT NOT NULL, "
            + "packet_hash TEXT NOT NULL, "
            + "applied_at_ms INTEGER NOT NULL)");
    database.execSQL(
        "CREATE TABLE replay_tombstones ("
            + "request_id TEXT NOT NULL, "
            + "packet_hash TEXT NOT NULL, "
            + "outcome TEXT NOT NULL, "
            + "expires_at_ms INTEGER NOT NULL, "
            + "PRIMARY KEY(request_id, packet_hash))");
    database.execSQL(
        "CREATE INDEX pairing_outbox_pending_idx "
            + "ON pairing_outbox(acknowledged_at_ms, created_at_ms)");
    database.execSQL(
        "CREATE INDEX pairing_candidates_expiry_idx "
            + "ON pairing_candidates(status, expires_at_ms)");

    long now = System.currentTimeMillis();
    ContentValues metadata = new ContentValues();
    metadata.put("version", SCHEMA_VERSION);
    metadata.put("created_at_ms", now);
    metadata.put("updated_at_ms", now);
    database.insertOrThrow("schema_metadata", null, metadata);
  }

  @Override
  public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
    throw new IllegalStateException("identity-database-unsupported-upgrade");
  }

  boolean databaseFileExists() {
    return context.getDatabasePath(DATABASE_NAME).isFile();
  }

  void deleteDatabase() throws ProductionIdentityException {
    close();
    if (databaseFileExists() && !context.deleteDatabase(DATABASE_NAME)) {
      throw new ProductionIdentityException("identity-database-delete-failed");
    }
  }

  int countSecretRecords(SQLiteDatabase database) {
    try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM secret_records", null)) {
      if (!cursor.moveToFirst()) {
        throw new IllegalStateException("identity-database-read-failed");
      }
      return cursor.getInt(0);
    }
  }

  IdentityProjection loadIdentity(SQLiteDatabase database) {
    try (Cursor cursor =
        database.query(
            "identity_projection",
            new String[] {
              "m2y_id",
              "stable_identity_id",
              "device_id",
              "display_name_ciphertext",
              "registered_at_ms",
              "revision"
            },
            "singleton_id = 1",
            null,
            null,
            null,
            null)) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      byte[] displayName = cursor.isNull(3) ? null : cursor.getBlob(3);
      Long registeredAt = cursor.isNull(4) ? null : cursor.getLong(4);
      return new IdentityProjection(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          displayName,
          registeredAt,
          cursor.getLong(5));
    }
  }

  void insertIdentity(SQLiteDatabase database, IdentityProjection identity) {
    ContentValues values = new ContentValues();
    values.put("singleton_id", 1);
    values.put("m2y_id", identity.m2yId());
    values.put("stable_identity_id", identity.stableIdentityId());
    values.put("device_id", identity.deviceId());
    values.put("display_name_ciphertext", identity.displayNameCiphertext());
    if (identity.registeredAtMs() == null) {
      values.putNull("registered_at_ms");
    } else {
      values.put("registered_at_ms", identity.registeredAtMs());
    }
    values.put("revision", identity.revision());
    database.insertOrThrow("identity_projection", null, values);
  }

  void markRegistered(SQLiteDatabase database, long registeredAtMs) {
    ContentValues values = new ContentValues();
    values.put("registered_at_ms", registeredAtMs);
    values.put("revision", 2);
    if (database.update("identity_projection", values, "singleton_id = 1 AND registered_at_ms IS NULL", null)
        != 1) {
      throw new IllegalStateException("identity-registration-state-invalid");
    }
  }

  SecretRecord loadSecret(SQLiteDatabase database, String recordKind, String recordKey) {
    try (Cursor cursor =
        database.query(
            "secret_records",
            new String[] {"ciphertext", "revision"},
            "record_kind = ? AND record_key = ?",
            new String[] {recordKind, recordKey},
            null,
            null,
            null)) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new SecretRecord(cursor.getBlob(0), cursor.getLong(1));
    }
  }

  void insertSecret(
      SQLiteDatabase database,
      String recordKind,
      String recordKey,
      byte[] ciphertext,
      long revision,
      long nowMs) {
    ContentValues values = new ContentValues();
    values.put("record_kind", recordKind);
    values.put("record_key", recordKey);
    values.put("ciphertext", ciphertext);
    values.put("revision", revision);
    values.put("updated_at_ms", nowMs);
    database.insertOrThrow("secret_records", null, values);
  }

  void upsertSecret(
      SQLiteDatabase database,
      String recordKind,
      String recordKey,
      byte[] ciphertext,
      long revision,
      long nowMs) {
    ContentValues values = new ContentValues();
    values.put("record_kind", recordKind);
    values.put("record_key", recordKey);
    values.put("ciphertext", ciphertext);
    values.put("revision", revision);
    values.put("updated_at_ms", nowMs);
    if (database.insertWithOnConflict(
            "secret_records", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        == -1) {
      throw new IllegalStateException("identity-secret-write-failed");
    }
  }

  boolean deleteSecret(SQLiteDatabase database, String recordKind, String recordKey) {
    return database.delete(
            "secret_records",
            "record_kind = ? AND record_key = ?",
            new String[] {recordKind, recordKey})
        == 1;
  }

  List<String> secretKeys(SQLiteDatabase database, String recordKind) {
    List<String> keys = new ArrayList<>();
    try (Cursor cursor =
        database.query(
            "secret_records",
            new String[] {"record_key"},
            "record_kind = ?",
            new String[] {recordKind},
            null,
            null,
            "record_key ASC")) {
      while (cursor.moveToNext()) {
        keys.add(cursor.getString(0));
      }
    }
    return keys;
  }

  void insertOutbox(
      SQLiteDatabase database,
      String operationId,
      String requestId,
      String packetType,
      byte[] ciphertext,
      long nowMs) {
    ContentValues values = new ContentValues();
    values.put("operation_id", operationId);
    values.put("request_id", requestId);
    values.put("packet_type", packetType);
    values.put("ciphertext", ciphertext);
    values.put("created_at_ms", nowMs);
    values.putNull("acknowledged_at_ms");
    values.put("retry_count", 0);
    database.insertOrThrow("pairing_outbox", null, values);
  }

  boolean hasPendingOutbox(SQLiteDatabase database, String operationId, String packetType) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {"operation_id"},
            "operation_id = ? AND packet_type = ? AND acknowledged_at_ms IS NULL",
            new String[] {operationId, packetType},
            null,
            null,
            null)) {
      return cursor.moveToFirst();
    }
  }

  PendingOutbox pendingRegistration(SQLiteDatabase database) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {"operation_id", "ciphertext"},
            "packet_type = ? AND acknowledged_at_ms IS NULL",
            new String[] {"identity-registration"},
            null,
            null,
            "created_at_ms ASC",
            "1")) {
      return cursor.moveToFirst() ? new PendingOutbox(cursor.getString(0), cursor.getBlob(1)) : null;
    }
  }

  PendingOutbox identityRegistration(SQLiteDatabase database) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {"operation_id", "ciphertext"},
            "packet_type = ?",
            new String[] {"identity-registration"},
            null,
            null,
            "created_at_ms ASC, rowid ASC",
            "1")) {
      return cursor.moveToFirst() ? new PendingOutbox(cursor.getString(0), cursor.getBlob(1)) : null;
    }
  }

  void acknowledgeOutbox(SQLiteDatabase database, String operationId, long nowMs) {
    ContentValues values = new ContentValues();
    values.put("acknowledged_at_ms", nowMs);
    if (database.update(
            "pairing_outbox",
            values,
            "operation_id = ? AND acknowledged_at_ms IS NULL",
            new String[] {operationId})
        != 1) {
      throw new IllegalStateException("identity-registration-operation-invalid");
    }
  }

  record IdentityProjection(
      String m2yId,
      String stableIdentityId,
      String deviceId,
      byte[] displayNameCiphertext,
      Long registeredAtMs,
      long revision) {}

  void insertCandidate(
      SQLiteDatabase database,
      String requestId,
      String peerRouteId,
      String status,
      byte[] candidateCiphertext,
      long expiresAtMs,
      long revision) {
    ContentValues values = new ContentValues();
    values.put("request_id", requestId);
    values.put("peer_route_id", peerRouteId);
    values.put("status", status);
    values.put("candidate_ciphertext", candidateCiphertext);
    values.putNull("safety_display_ciphertext");
    values.put("expires_at_ms", expiresAtMs);
    values.put("revision", revision);
    database.insertOrThrow("pairing_candidates", null, values);
  }

  CandidateRow loadCandidate(SQLiteDatabase database, String requestId) {
    try (Cursor cursor =
        database.query(
            "pairing_candidates",
            new String[] {
              "peer_route_id", "status", "candidate_ciphertext", "safety_display_ciphertext",
              "expires_at_ms", "revision"
            },
            "request_id = ?",
            new String[] {requestId},
            null,
            null,
            null)) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new CandidateRow(
          requestId,
          cursor.getString(0),
          cursor.getString(1),
          cursor.getBlob(2),
          cursor.isNull(3) ? null : cursor.getBlob(3),
          cursor.getLong(4),
          cursor.getLong(5));
    }
  }

  CandidateRow firstReviewableCandidate(SQLiteDatabase database, long nowMs) {
    try (Cursor cursor =
        database.query(
            "pairing_candidates",
            new String[] {
              "request_id", "peer_route_id", "status", "candidate_ciphertext",
              "safety_display_ciphertext", "expires_at_ms", "revision"
            },
            "status = ? AND expires_at_ms > ?",
            new String[] {
              PairingProtocolRules.CandidateStatus.PENDING_LOCAL_REVIEW.stored(),
              Long.toString(nowMs)
            },
            null,
            null,
            "rowid ASC",
            "1")) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new CandidateRow(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          cursor.getBlob(3),
          cursor.isNull(4) ? null : cursor.getBlob(4),
          cursor.getLong(5),
          cursor.getLong(6));
    }
  }

  CandidateRow firstAcceptedCandidate(SQLiteDatabase database, long nowMs) {
    try (Cursor cursor =
        database.query(
            "pairing_candidates",
            new String[] {
              "request_id", "peer_route_id", "status", "candidate_ciphertext",
              "safety_display_ciphertext", "expires_at_ms", "revision"
            },
            "status = ? AND expires_at_ms > ?",
            new String[] {
              PairingProtocolRules.CandidateStatus.ACCEPTED.stored(), Long.toString(nowMs)
            },
            null,
            null,
            "rowid ASC",
            "1")) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new CandidateRow(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          cursor.getBlob(3),
          cursor.isNull(4) ? null : cursor.getBlob(4),
          cursor.getLong(5),
          cursor.getLong(6));
    }
  }

  void updateCandidateResolution(
      SQLiteDatabase database,
      String requestId,
      String status,
      byte[] safetyDisplayCiphertext,
      long revision) {
    ContentValues values = new ContentValues();
    values.put("status", status);
    if (safetyDisplayCiphertext == null) {
      values.putNull("safety_display_ciphertext");
    } else {
      values.put("safety_display_ciphertext", safetyDisplayCiphertext);
    }
    values.put("revision", revision);
    if (database.update("pairing_candidates", values, "request_id = ?", new String[] {requestId})
        != 1) {
      throw new IllegalStateException("pairing-candidate-update-failed");
    }
  }

  void updateCandidateStatus(
      SQLiteDatabase database, String requestId, String status, long revision) {
    ContentValues values = new ContentValues();
    values.put("status", status);
    values.put("revision", revision);
    if (database.update("pairing_candidates", values, "request_id = ?", new String[] {requestId})
        != 1) {
      throw new IllegalStateException("pairing-candidate-update-failed");
    }
  }

  /**
   * Candidates whose window has closed while they were still answerable. A resolved candidate is
   * left alone: its outcome already produced a tombstone and must not be rewritten as expiry.
   */
  List<CandidateRow> answerableExpiredCandidates(SQLiteDatabase database, long nowMs) {
    List<CandidateRow> rows = new ArrayList<>();
    try (Cursor cursor =
        database.query(
            "pairing_candidates",
            new String[] {
              "request_id", "peer_route_id", "status", "expires_at_ms", "revision"
            },
            "expires_at_ms <= ? AND status IN (?, ?)",
            new String[] {
              Long.toString(nowMs),
              PairingProtocolRules.CandidateStatus.PENDING_LOCAL_REVIEW.stored(),
              PairingProtocolRules.CandidateStatus.ACCEPTED.stored()
            },
            null,
            null,
            "expires_at_ms ASC")) {
      while (cursor.moveToNext()) {
        rows.add(
            new CandidateRow(
                cursor.getString(0),
                cursor.getString(1),
                cursor.getString(2),
                null,
                null,
                cursor.getLong(3),
                cursor.getLong(4)));
      }
    }
    return rows;
  }
  RelationshipRow loadRelationship(SQLiteDatabase database) {
    try (Cursor cursor =
        database.query(
            "relationship",
            new String[] {
              "pair_id", "peer_route_id", "state", "peer_summary_ciphertext", "verified_at_ms",
              "revision"
            },
            "singleton_id = 1",
            null,
            null,
            null,
            null)) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new RelationshipRow(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          cursor.getBlob(3),
          cursor.isNull(4) ? null : cursor.getLong(4),
          cursor.getLong(5));
    }
  }

  /**
   * The singleton primary key is what makes a second relationship impossible at the storage layer,
   * so this insert is allowed to be unconditional: a conflicting activation has already been refused
   * by the protocol rules, and anything that reaches here and still conflicts must fail loudly.
   */
  void insertRelationship(
      SQLiteDatabase database,
      String pairId,
      String peerRouteId,
      String state,
      byte[] peerSummaryCiphertext,
      long verifiedAtMs,
      long revision) {
    ContentValues values = new ContentValues();
    values.put("singleton_id", 1);
    values.put("pair_id", pairId);
    values.put("peer_route_id", peerRouteId);
    values.put("state", state);
    values.put("peer_summary_ciphertext", peerSummaryCiphertext);
    values.put("verified_at_ms", verifiedAtMs);
    values.put("revision", revision);
    database.insertOrThrow("relationship", null, values);
  }
  boolean hasInboxFingerprint(SQLiteDatabase database, String requestId, String packetHash) {
    try (Cursor cursor =
        database.query(
            "pairing_inbox",
            new String[] {"event_id"},
            "request_id = ? AND packet_hash = ?",
            new String[] {requestId, packetHash},
            null,
            null,
            null)) {
      return cursor.moveToFirst();
    }
  }

  String inboxPacketHash(SQLiteDatabase database, String requestId) {
    try (Cursor cursor =
        database.query(
            "pairing_inbox",
            new String[] {"packet_hash"},
            "request_id = ?",
            new String[] {requestId},
            null,
            null,
            "applied_at_ms ASC",
            "1")) {
      return cursor.moveToFirst() ? cursor.getString(0) : null;
    }
  }

  void insertInbox(
      SQLiteDatabase database,
      String eventId,
      String requestId,
      String packetHash,
      long appliedAtMs) {
    ContentValues values = new ContentValues();
    values.put("event_id", eventId);
    values.put("request_id", requestId);
    values.put("packet_hash", packetHash);
    values.put("applied_at_ms", appliedAtMs);
    database.insertOrThrow("pairing_inbox", null, values);
  }
  String tombstoneOutcome(SQLiteDatabase database, String requestId) {
    try (Cursor cursor =
        database.query(
            "replay_tombstones",
            new String[] {"outcome"},
            "request_id = ?",
            new String[] {requestId},
            null,
            null,
            "expires_at_ms DESC",
            "1")) {
      return cursor.moveToFirst() ? cursor.getString(0) : null;
    }
  }

  /**
   * Tombstones are written with conflict-ignore so that repeating a resolution is idempotent. The
   * outcome of the first refusal is the one that stands; a later write cannot soften it.
   */
  void insertTombstone(
      SQLiteDatabase database,
      String requestId,
      String packetHash,
      String outcome,
      long expiresAtMs) {
    ContentValues values = new ContentValues();
    values.put("request_id", requestId);
    values.put("packet_hash", packetHash);
    values.put("outcome", outcome);
    values.put("expires_at_ms", expiresAtMs);
    database.insertWithOnConflict(
        "replay_tombstones", null, values, SQLiteDatabase.CONFLICT_IGNORE);
  }

  /**
   * The operation id already committed for this request and packet type, in any acknowledgement
   * state, or {@code null} when the decision has never been queued. Acknowledged rows count on
   * purpose: an outbox row is the durable record that a decision was already handed to the
   * transport, so reusing it is what keeps a repeated local decision from queueing a second packet.
   */
  String committedIntentId(SQLiteDatabase database, String requestId, String packetType) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {"operation_id"},
            "request_id = ? AND packet_type = ?",
            new String[] {requestId, packetType},
            null,
            null,
            "created_at_ms ASC, rowid ASC",
            "1")) {
      return cursor.moveToFirst() ? cursor.getString(0) : null;
    }
  }

  /**
   * Pending transport work other than identity registration, which has its own dedicated call and a
   * different payload shape.
   */
  List<OutboxRow> pendingPairingIntents(SQLiteDatabase database) {
    List<OutboxRow> rows = new ArrayList<>();
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {
              "operation_id", "request_id", "packet_type", "ciphertext", "created_at_ms",
              "retry_count"
            },
            "acknowledged_at_ms IS NULL AND packet_type <> ?",
            new String[] {"identity-registration"},
            null,
            null,
            "created_at_ms ASC, rowid ASC")) {
      while (cursor.moveToNext()) {
        rows.add(
            new OutboxRow(
                cursor.getString(0),
                cursor.getString(1),
                cursor.getString(2),
                cursor.getBlob(3),
                cursor.getLong(4),
                cursor.getLong(5),
                null));
      }
    }
    return rows;
  }

  boolean outboxExists(SQLiteDatabase database, String operationId) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {"operation_id"},
            "operation_id = ?",
            new String[] {operationId},
            null,
            null,
            null)) {
      return cursor.moveToFirst();
    }
  }

  OutboxRow pairingOutbox(
      SQLiteDatabase database, String requestId, String packetType) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {
              "operation_id", "request_id", "packet_type", "ciphertext", "created_at_ms",
              "retry_count", "acknowledged_at_ms"
            },
            "request_id = ? AND packet_type = ?",
            new String[] {requestId, packetType},
            null,
            null,
            "created_at_ms ASC, rowid ASC",
            "1")) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new OutboxRow(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          cursor.getBlob(3),
          cursor.getLong(4),
          cursor.getLong(5),
          cursor.isNull(6) ? null : cursor.getLong(6));
    }
  }

  OutboxRow latestPairingOutbox(SQLiteDatabase database, String packetType) {
    try (Cursor cursor =
        database.query(
            "pairing_outbox",
            new String[] {
              "operation_id", "request_id", "packet_type", "ciphertext", "created_at_ms",
              "retry_count", "acknowledged_at_ms"
            },
            "packet_type = ?",
            new String[] {packetType},
            null,
            null,
            "created_at_ms DESC, rowid DESC",
            "1")) {
      if (!cursor.moveToFirst()) {
        return null;
      }
      return new OutboxRow(
          cursor.getString(0),
          cursor.getString(1),
          cursor.getString(2),
          cursor.getBlob(3),
          cursor.getLong(4),
          cursor.getLong(5),
          cursor.isNull(6) ? null : cursor.getLong(6));
    }
  }

  /** Returns whether this call was the one that acknowledged the item. */
  boolean acknowledgeOutboxIfPending(SQLiteDatabase database, String operationId, long nowMs) {
    ContentValues values = new ContentValues();
    values.put("acknowledged_at_ms", nowMs);
    return database.update(
            "pairing_outbox",
            values,
            "operation_id = ? AND acknowledged_at_ms IS NULL",
            new String[] {operationId})
        == 1;
  }

  int deleteExpiredTombstones(SQLiteDatabase database, long nowMs) {
    return database.delete(
        "replay_tombstones", "expires_at_ms <= ?", new String[] {Long.toString(nowMs)});
  }

  /**
   * Removes inbox markers for requests that no longer have a candidate or a tombstone. While either
   * exists the marker is still doing work; once neither does, there is nothing left for a replayed
   * packet to corrupt.
   */
  int deleteOrphanInboxMarkers(SQLiteDatabase database) {
    return database.delete(
        "pairing_inbox",
        "request_id NOT IN (SELECT request_id FROM pairing_candidates) "
            + "AND request_id NOT IN (SELECT request_id FROM replay_tombstones)",
        null);
  }
  record CandidateRow(
      String requestId,
      String peerRouteId,
      String status,
      byte[] candidateCiphertext,
      byte[] safetyDisplayCiphertext,
      long expiresAtMs,
      long revision) {}

  record OutboxRow(
      String operationId,
      String requestId,
      String packetType,
      byte[] ciphertext,
      long createdAtMs,
      long retryCount,
      Long acknowledgedAtMs) {}

  record PendingOutbox(String operationId, byte[] ciphertext) {}

  record RelationshipRow(
      String pairId,
      String peerRouteId,
      String state,
      byte[] peerSummaryCiphertext,
      Long verifiedAtMs,
      long revision) {}

  record SecretRecord(byte[] ciphertext, long revision) {}
}
