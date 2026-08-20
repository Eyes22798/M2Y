export const currentSchemaVersion = 1;

export const schemaV1Sql = `
CREATE TABLE installation_profile (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  installation_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL CHECK(author IN ('self', 'other')),
  body TEXT NOT NULL CHECK(length(trim(body)) > 0),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE shared_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('note', 'task', 'agreement')),
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  detail TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'waiting', 'done', 'confirmed', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX messages_created_at_idx ON messages(created_at_ms, id);
CREATE INDEX shared_items_updated_at_idx ON shared_items(updated_at_ms DESC, id);
CREATE UNIQUE INDEX shared_items_source_kind_idx
  ON shared_items(source_message_id, kind)
  WHERE source_message_id IS NOT NULL;
`;
