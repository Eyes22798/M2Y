export type Migration = Readonly<{
  sql: string;
  version: number;
}>;

export const LATEST_SCHEMA_VERSION = 5;

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({
    version: 1,
    sql: `
      CREATE TABLE service_metadata (
        metadata_key TEXT PRIMARY KEY NOT NULL,
        metadata_value TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE identities (
        m2y_id TEXT PRIMARY KEY NOT NULL,
        stable_identity_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE devices (
        device_id TEXT PRIMARY KEY NOT NULL,
        m2y_id TEXT NOT NULL REFERENCES identities(m2y_id),
        auth_public_key TEXT NOT NULL,
        registration_id INTEGER NOT NULL,
        identity_public_key TEXT NOT NULL,
        signed_prekey_public TEXT NOT NULL,
        signed_prekey_signature TEXT NOT NULL,
        kyber_prekey_public TEXT NOT NULL,
        kyber_prekey_signature TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE one_time_prekeys (
        device_id TEXT NOT NULL REFERENCES devices(device_id),
        prekey_id INTEGER NOT NULL,
        public_key TEXT NOT NULL,
        lease_request_id TEXT,
        consumed_at_ms INTEGER,
        PRIMARY KEY (device_id, prekey_id)
      ) STRICT;

      CREATE TABLE pair_invites (
        invite_id TEXT PRIMARY KEY NOT NULL,
        target_device_id TEXT NOT NULL REFERENCES devices(device_id),
        code_hash TEXT UNIQUE,
        expires_at_ms INTEGER NOT NULL,
        consumed_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE pair_requests (
        request_id TEXT PRIMARY KEY NOT NULL,
        requester_device_id TEXT NOT NULL REFERENCES devices(device_id),
        target_device_id TEXT NOT NULL REFERENCES devices(device_id),
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        request_packet TEXT,
        response_packet TEXT,
        requester_verified_at_ms INTEGER,
        target_verified_at_ms INTEGER,
        version INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE active_relationship_members (
        device_id TEXT PRIMARY KEY NOT NULL REFERENCES devices(device_id),
        pair_id TEXT NOT NULL,
        activated_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE request_nonces (
        device_id TEXT NOT NULL REFERENCES devices(device_id),
        nonce_hash TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        PRIMARY KEY (device_id, nonce_hash)
      ) STRICT;

      CREATE INDEX pair_requests_target_status_idx
        ON pair_requests(target_device_id, status, created_at_ms);
      CREATE INDEX pair_requests_requester_status_idx
        ON pair_requests(requester_device_id, status, created_at_ms);
      CREATE INDEX request_nonces_expiry_idx ON request_nonces(expires_at_ms);
    `,
  }),
  Object.freeze({
    version: 2,
    sql: `
      ALTER TABLE devices ADD COLUMN signed_prekey_id INTEGER;
      ALTER TABLE devices ADD COLUMN kyber_prekey_id INTEGER;
      ALTER TABLE one_time_prekeys ADD COLUMN lease_expires_at_ms INTEGER;

      CREATE TABLE identity_registration_operations (
        operation_id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT UNIQUE NOT NULL REFERENCES devices(device_id),
        m2y_id TEXT UNIQUE NOT NULL REFERENCES identities(m2y_id),
        body_hash TEXT NOT NULL,
        receipt_id TEXT UNIQUE NOT NULL,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX one_time_prekeys_available_idx
        ON one_time_prekeys(device_id, consumed_at_ms, lease_expires_at_ms, prekey_id);
    `,
  }),
  Object.freeze({
    version: 3,
    sql: `
      CREATE TABLE prekey_replenishment_operations (
        operation_id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(device_id),
        body_hash TEXT NOT NULL,
        added_count INTEGER NOT NULL CHECK(added_count > 0),
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX prekey_replenishment_device_idx
        ON prekey_replenishment_operations(device_id, created_at_ms);
    `,
  }),
  Object.freeze({
    version: 4,
    sql: `
      ALTER TABLE pair_invites ADD COLUMN operation_id TEXT;
      ALTER TABLE pair_invites ADD COLUMN invite_kind TEXT;
      ALTER TABLE pair_invites ADD COLUMN ticket_hash TEXT;

      CREATE UNIQUE INDEX pair_invites_operation_idx ON pair_invites(operation_id);
      CREATE UNIQUE INDEX pair_invites_ticket_hash_idx ON pair_invites(ticket_hash);
      CREATE INDEX pair_invites_target_expiry_idx
        ON pair_invites(target_device_id, expires_at_ms, consumed_at_ms);
    `,
  }),
  Object.freeze({
    version: 5,
    sql: `
      ALTER TABLE pair_requests ADD COLUMN prepare_operation_id TEXT;
      ALTER TABLE pair_requests ADD COLUMN prepare_body_hash TEXT;
      ALTER TABLE pair_requests ADD COLUMN pair_id TEXT;

      CREATE UNIQUE INDEX pair_requests_prepare_operation_idx
        ON pair_requests(prepare_operation_id);

      CREATE TABLE pair_request_operations (
        operation_id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(device_id),
        request_id TEXT NOT NULL REFERENCES pair_requests(request_id),
        operation_kind TEXT NOT NULL,
        body_hash TEXT NOT NULL,
        result_status TEXT NOT NULL,
        event_cursor INTEGER,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE pair_events (
        event_cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(device_id),
        request_id TEXT NOT NULL REFERENCES pair_requests(request_id),
        event_type TEXT NOT NULL,
        packet TEXT,
        request_status TEXT NOT NULL,
        operation_id TEXT UNIQUE,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX pair_events_device_cursor_idx ON pair_events(device_id, event_cursor);
      CREATE INDEX pair_requests_expiry_idx ON pair_requests(status, expires_at_ms);
    `,
  }),
]);
