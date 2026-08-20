export type Migration = Readonly<{
  sql: string;
  version: number;
}>;

export const LATEST_SCHEMA_VERSION = 1;

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
]);
