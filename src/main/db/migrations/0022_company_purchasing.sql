-- Purchasing has its own local workspace. Business records are versioned snapshots;
-- issued orders, receipts, stock movements and decisions are immutable evidence.
CREATE TABLE IF NOT EXISTS purchasing_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS purchasing_records (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchasing_records_scope ON purchasing_records(company_id,kind,updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS purchasing_shared_request ON purchasing_records(company_id,json_extract(data,'$.conversationId')) WHERE kind='request' AND json_extract(data,'$.conversationId') IS NOT NULL;
CREATE TABLE IF NOT EXISTS purchasing_events (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_id TEXT REFERENCES purchasing_records(id) ON DELETE CASCADE, action TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchasing_events_scope ON purchasing_events(company_id,created_at);
CREATE TABLE IF NOT EXISTS purchasing_sequences (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY(company_id,kind)
);
