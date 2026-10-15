CREATE TABLE company_sales_records (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX company_sales_scope ON company_sales_records(company_id,updated_at);
