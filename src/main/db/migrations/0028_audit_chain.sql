-- 0028_audit_chain.sql
-- Tamper-evident audit trail. Each entry carries its per-company sequence
-- number and a SHA-256 hash chained to the previous entry, so an edited,
-- removed or back-inserted row is detectable. Rows written before this
-- migration keep NULLs until the main process seals them (repos/audit.js).

ALTER TABLE audit_entries ADD COLUMN seq INTEGER;
ALTER TABLE audit_entries ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_entries ADD COLUMN hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_company_seq ON audit_entries(company_id, seq);
