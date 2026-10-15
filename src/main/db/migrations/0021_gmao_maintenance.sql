-- Contract-specific maintenance evidence stays inside the company boundary.
CREATE TABLE IF NOT EXISTS gmao_maintenance_records (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, kind TEXT NOT NULL,
 site_id TEXT REFERENCES gmao_sites(id) ON DELETE CASCADE, asset_id TEXT REFERENCES gmao_assets(id) ON DELETE CASCADE, work_order_id TEXT REFERENCES gmao_work_orders(id) ON DELETE CASCADE, data TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gmao_maintenance_scope ON gmao_maintenance_records(company_id,kind,site_id);
CREATE INDEX IF NOT EXISTS gmao_maintenance_work_order ON gmao_maintenance_records(company_id,work_order_id);
CREATE TABLE IF NOT EXISTS gmao_maintenance_events (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, record_id TEXT NOT NULL REFERENCES gmao_maintenance_records(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, evidence TEXT NOT NULL, happened_at INTEGER NOT NULL
);
ALTER TABLE gmao_maintenance_plans ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE gmao_attachment_sheets ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
