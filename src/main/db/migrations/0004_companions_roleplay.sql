-- 0004_companions_roleplay.sql
-- BonzAI Phase 4: companions, companion memory, roleplay sessions + messages.

CREATE TABLE IF NOT EXISTS companions (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  first_name               TEXT,
  family_name              TEXT,
  avatar                   TEXT,
  archetype                TEXT,
  age                      INTEGER,
  gender                   TEXT,
  image                    TEXT,
  image_prompt_base        TEXT,
  content_level_default    TEXT,
  is_default               INTEGER NOT NULL DEFAULT 0,
  is_custom                INTEGER NOT NULL DEFAULT 0,
  description              TEXT,
  short_bio                TEXT,
  personality              TEXT,
  appearance               TEXT,
  background               TEXT,
  voice_style              TEXT,
  voice_persona            TEXT,
  traits                   TEXT,                                -- JSON
  compatible_scenarios     TEXT,                                -- JSON
  big5                     TEXT,                                -- JSON
  spending_habits          TEXT,                                -- JSON
  chain_id                 INTEGER,
  contract_address         TEXT,
  token_id                 TEXT,
  agent_wallet             TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companions_custom  ON companions(is_custom, updated_at);
CREATE INDEX IF NOT EXISTS idx_companions_default ON companions(is_default);
CREATE INDEX IF NOT EXISTS idx_companions_name    ON companions(name);

CREATE TABLE IF NOT EXISTS companion_memory (
  id                  TEXT PRIMARY KEY,
  companion_id        TEXT NOT NULL,
  scope               TEXT NOT NULL,
  content             TEXT NOT NULL,
  importance          INTEGER,
  session_id          TEXT,
  created_at          INTEGER NOT NULL,
  last_recalled_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mem_companion ON companion_memory(companion_id, scope);
CREATE INDEX IF NOT EXISTS idx_mem_session   ON companion_memory(session_id);

CREATE TABLE IF NOT EXISTS roleplay_sessions (
  id              TEXT PRIMARY KEY,
  companion_id    TEXT NOT NULL,
  scenario_key    TEXT,
  content_level   TEXT,
  modes           TEXT,                            -- JSON array
  summary         TEXT,
  started_at      INTEGER NOT NULL,
  last_active_at  INTEGER,
  archived        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rps_companion ON roleplay_sessions(companion_id, last_active_at);
CREATE INDEX IF NOT EXISTS idx_rps_active    ON roleplay_sessions(archived, last_active_at);

CREATE TABLE IF NOT EXISTS roleplay_messages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  role            TEXT NOT NULL,
  text            TEXT,
  audio_blob_id   TEXT,
  audio_ext       TEXT,
  image_blob_id   TEXT,
  image_ext       TEXT,
  video_blob_id   TEXT,
  video_ext       TEXT,
  generation_id   TEXT,
  meta            TEXT,                            -- JSON
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rpm_session ON roleplay_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rpm_role    ON roleplay_messages(session_id, role);
