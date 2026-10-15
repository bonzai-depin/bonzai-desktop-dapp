CREATE TABLE company_grants_records (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('dossier','document','browser_event')),
 data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX company_grants_records_company ON company_grants_records(company_id,kind);
