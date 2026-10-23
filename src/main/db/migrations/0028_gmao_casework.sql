-- Archives never enter the live work-order state machine or current stock/billing.
CREATE TABLE gmao_case_records (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 work_order_id TEXT REFERENCES gmao_work_orders(id) ON DELETE RESTRICT,
 site_id TEXT REFERENCES gmao_sites(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL, data TEXT NOT NULL, source_id TEXT REFERENCES company_intake_sources(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX gmao_case_scope ON gmao_case_records(company_id,work_order_id,kind);
CREATE TABLE gmao_case_references (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 record_id TEXT NOT NULL REFERENCES gmao_case_records(id) ON DELETE CASCADE,
 scope TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL,
 UNIQUE(company_id,scope,type,value)
);
CREATE TABLE gmao_case_events (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 record_id TEXT NOT NULL REFERENCES gmao_case_records(id) ON DELETE CASCADE,
 data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE company_intake_batches (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
