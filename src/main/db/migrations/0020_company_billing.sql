-- Independent billing lifecycle; email delivery never implies invoice acceptance.
CREATE TABLE IF NOT EXISTS company_billing_profiles (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 service_contract_id TEXT REFERENCES gmao_service_contracts(id), name TEXT NOT NULL,
 data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_billing_invoices (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES gmao_clients(id), profile_id TEXT REFERENCES company_billing_profiles(id),
 legacy_invoice_id TEXT REFERENCES gmao_invoices(id), number TEXT, status TEXT NOT NULL DEFAULT 'draft',
 direction TEXT NOT NULL DEFAULT 'receivable', currency TEXT NOT NULL DEFAULT 'EUR', total_cents INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(company_id,number), UNIQUE(company_id,legacy_invoice_id)
);
CREATE TABLE IF NOT EXISTS company_billing_events (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 invoice_id TEXT NOT NULL REFERENCES company_billing_invoices(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS company_billing_sequences (
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, year INTEGER NOT NULL,
 last_number INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(company_id,year)
);
CREATE TABLE IF NOT EXISTS company_billing_subcontractors (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 subcontractor_id TEXT NOT NULL REFERENCES gmao_subcontractors(id), profile_id TEXT REFERENCES company_billing_profiles(id),
 status TEXT NOT NULL DEFAULT 'draft', data TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_billing_status ON company_billing_invoices(company_id,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_company_billing_events ON company_billing_events(company_id,invoice_id,created_at);
