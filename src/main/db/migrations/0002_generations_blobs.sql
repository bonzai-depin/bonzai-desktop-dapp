-- 0002_generations_blobs.sql
-- BonzAI Phase 2: persistent generation history + content-addressed blob store.

CREATE TABLE IF NOT EXISTS blobs (
  id           TEXT    PRIMARY KEY,             -- sha256 hex
  ext          TEXT    NOT NULL,
  byte_length  INTEGER NOT NULL,
  mime_type    TEXT,
  width        INTEGER,
  height       INTEGER,
  duration_ms  INTEGER,
  source       TEXT,
  source_id    TEXT,
  created_at   INTEGER NOT NULL,
  ref_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_blobs_source  ON blobs(source, source_id);
CREATE INDEX IF NOT EXISTS idx_blobs_ext     ON blobs(ext);
CREATE INDEX IF NOT EXISTS idx_blobs_created ON blobs(created_at);

CREATE TABLE IF NOT EXISTS generations (
  id               TEXT    PRIMARY KEY,
  pipeline         TEXT    NOT NULL,
  mode             TEXT,
  prompt           TEXT,
  negative_prompt  TEXT,
  system_prompt    TEXT,
  model_key        TEXT,
  model_filename   TEXT,
  params           TEXT,                       -- JSON
  output_text      TEXT,
  output_blobs     TEXT,                       -- JSON array of { blobId, ext, role }
  duration_ms      INTEGER,
  tokens_in        INTEGER,
  tokens_out       INTEGER,
  triggered_by     TEXT,
  company_id       TEXT,
  skill_id         TEXT,
  companion_id     TEXT,
  session_id       TEXT,
  status           TEXT    NOT NULL,
  error            TEXT,
  created_at       INTEGER NOT NULL,
  finished_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gen_pipeline  ON generations(pipeline, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_trigger   ON generations(triggered_by, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_company   ON generations(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_skill     ON generations(skill_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_companion ON generations(companion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_session   ON generations(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_status    ON generations(status, created_at);
