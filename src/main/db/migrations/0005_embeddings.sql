-- 0005_embeddings.sql
-- BonzAI Phase 5: sqlite-vec virtual table for cross-app semantic search.

-- The vec0 virtual table holds the embedding vector itself. Source
-- attribution lives in a sidecar row (`embedding_meta`) rather than
-- inside the vec table because vec0 is column-restricted — auxiliary
-- columns there hurt write throughput.

CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding FLOAT[768]
);

-- Sidecar that maps vec rowid → (source_table, source_id) + tracks
-- when the source row was last embedded so we can detect staleness.
CREATE TABLE IF NOT EXISTS embedding_meta (
  rowid          INTEGER PRIMARY KEY,
  source_table   TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  embedded_at    INTEGER NOT NULL,
  source_hash    TEXT,
  model          TEXT,
  dim            INTEGER NOT NULL DEFAULT 768
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emb_meta_source ON embedding_meta(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_emb_meta_embedded ON embedding_meta(embedded_at);

-- Pending queue — rows that have been written / mutated and need a
-- (re-)embedding pass. The worker drains this in batches.
CREATE TABLE IF NOT EXISTS embedding_queue (
  source_table   TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  source_text    TEXT NOT NULL,
  enqueued_at    INTEGER NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_emb_queue_enqueued ON embedding_queue(enqueued_at);
