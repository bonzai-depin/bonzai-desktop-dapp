CREATE TABLE IF NOT EXISTS memory_instances (
  instance_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  architecture_json TEXT NOT NULL DEFAULT '{}',
  indexes_json TEXT NOT NULL DEFAULT '{}',
  logs_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(scope, identity_id)
);

CREATE TABLE IF NOT EXISTS memory_sources (
  id TEXT PRIMARY KEY,
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  text_content TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_sources_instance ON memory_sources(instance_key, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_notes (
  id TEXT PRIMARY KEY,
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  source_id TEXT,
  note_kind TEXT NOT NULL,
  text_content TEXT NOT NULL,
  confidence TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_notes_instance ON memory_notes(instance_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_notes_source ON memory_notes(source_id);

CREATE TABLE IF NOT EXISTS memory_pages (
  id TEXT NOT NULL,
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  page_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(instance_key, id)
);

CREATE TABLE IF NOT EXISTS memory_links (
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'backlink',
  PRIMARY KEY(instance_key, from_id, to_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(instance_key, to_id);

CREATE TABLE IF NOT EXISTS memory_review_queue (
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(instance_key, item_id)
);

CREATE TABLE IF NOT EXISTS memory_contribution_parents (
  instance_key TEXT NOT NULL REFERENCES memory_instances(instance_key) ON DELETE CASCADE,
  contribution_id TEXT NOT NULL,
  PRIMARY KEY(instance_key, contribution_id)
);

