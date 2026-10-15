-- Record-scoped communication, reminders and explicit contract-included parts.
CREATE TABLE IF NOT EXISTS gmao_record_activity (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 record_kind TEXT NOT NULL, record_id TEXT NOT NULL, kind TEXT NOT NULL,
 data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gmao_record_activity_scope ON gmao_record_activity(company_id,record_kind,record_id,kind);
CREATE UNIQUE INDEX IF NOT EXISTS gmao_record_reminder ON gmao_record_activity(company_id,record_kind,record_id) WHERE kind='reminder';
CREATE TABLE IF NOT EXISTS gmao_part_dispositions (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 procurement_id TEXT NOT NULL REFERENCES gmao_procurements(id) ON DELETE CASCADE,
 part_key TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(company_id,procurement_id,part_key)
);
