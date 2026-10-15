-- Additive operational records; legacy contract remains workspace settings.
CREATE TABLE gmao_clients (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT, address TEXT,
 active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_gmao_clients ON gmao_clients(company_id, name);
CREATE TABLE gmao_service_contracts (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES gmao_clients(id), name TEXT NOT NULL, reference TEXT,
 starts_at INTEGER, ends_at INTEGER, vat_rate REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EUR',
 settings TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
ALTER TABLE gmao_sites ADD COLUMN client_id TEXT REFERENCES gmao_clients(id);
ALTER TABLE gmao_sites ADD COLUMN service_contract_id TEXT REFERENCES gmao_service_contracts(id);
ALTER TABLE gmao_work_orders ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE gmao_work_orders ADD COLUMN preventive_due_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX idx_gmao_oi_request ON gmao_work_orders(company_id, request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX idx_gmao_occurrence ON gmao_work_orders(company_id, maintenance_plan_id, asset_id, preventive_due_at) WHERE preventive_due_at IS NOT NULL;
CREATE TABLE gmao_suppliers (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name TEXT NOT NULL, email TEXT, phone TEXT, reference TEXT, notes TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
ALTER TABLE gmao_procurements ADD COLUMN supplier_id TEXT REFERENCES gmao_suppliers(id);
ALTER TABLE gmao_procurements ADD COLUMN items TEXT NOT NULL DEFAULT '[]';
ALTER TABLE gmao_procurements ADD COLUMN order_reference TEXT;
ALTER TABLE gmao_procurements ADD COLUMN receipt_reference TEXT;
ALTER TABLE gmao_procurements ADD COLUMN responsible TEXT;
ALTER TABLE gmao_procurements ADD COLUMN due_at INTEGER;
CREATE TABLE gmao_handoffs (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 work_order_id TEXT NOT NULL REFERENCES gmao_work_orders(id), procurement_id TEXT NOT NULL REFERENCES gmao_procurements(id),
 source_team TEXT NOT NULL, target_team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
 responsible TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(company_id, procurement_id)
);
CREATE TABLE gmao_outbox (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 work_order_id TEXT NOT NULL REFERENCES gmao_work_orders(id), document_id TEXT REFERENCES gmao_documents(id),
 channel TEXT NOT NULL CHECK(channel IN ('email','sms')), recipient TEXT NOT NULL, sender TEXT NOT NULL,
 subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 revision INTEGER NOT NULL DEFAULT 1, approved_revision INTEGER, approved_at INTEGER,
 request_key TEXT NOT NULL, provider_id TEXT, provider_status TEXT, receipt TEXT, error TEXT,
 submitted_at INTEGER, delivered_at INTEGER, attempt_started_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(company_id, request_key)
);
CREATE INDEX idx_gmao_outbox ON gmao_outbox(company_id, status, created_at);
-- Existing client identity is retained; no synthetic clients/sites are seeded.
INSERT INTO gmao_clients(id,company_id,name,contact_name,email,phone,created_at,updated_at)
 SELECT 'legacy-client-'||id,company_id,COALESCE(NULLIF(client_contact_name,''),name),client_contact_name,client_email,client_phone,created_at,updated_at FROM gmao_contracts;
INSERT INTO gmao_service_contracts(id,company_id,client_id,name,reference,starts_at,ends_at,vat_rate,currency,settings,created_at,updated_at)
 SELECT 'legacy-contract-'||id,company_id,'legacy-client-'||id,name,market_number,starts_at,ends_at,vat_rate,currency,COALESCE(config,'{}'),created_at,updated_at FROM gmao_contracts;
UPDATE gmao_sites SET client_id = 'legacy-client-'||contract_id, service_contract_id = 'legacy-contract-'||contract_id WHERE contract_id IS NOT NULL;
