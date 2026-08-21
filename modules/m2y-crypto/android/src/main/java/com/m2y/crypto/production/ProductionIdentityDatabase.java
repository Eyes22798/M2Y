package com.m2y.crypto.production;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

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

  void insertOutbox(
      SQLiteDatabase database,
      String operationId,
      String packetType,
      byte[] ciphertext,
      long nowMs) {
    ContentValues values = new ContentValues();
    values.put("operation_id", operationId);
    values.put("request_id", operationId);
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

  record PendingOutbox(String operationId, byte[] ciphertext) {}

  record SecretRecord(byte[] ciphertext, long revision) {}
}
