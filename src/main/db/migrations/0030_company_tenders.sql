CREATE TABLE company_tenders_records (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('notice','response','document','search')),
 data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX company_tenders_records_company ON company_tenders_records(company_id, kind, updated_at);
CREATE INDEX company_tenders_notice_source ON company_tenders_records(company_id, kind, json_extract(data,'$.source'), json_extract(data,'$.sourceId'));
