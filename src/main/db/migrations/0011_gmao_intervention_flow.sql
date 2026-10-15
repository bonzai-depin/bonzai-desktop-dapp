-- Explicit client OI workflow: receipt, scheduling, field attachment,
-- repair/proforma procurement and customer information traceability.

ALTER TABLE gmao_contracts ADD COLUMN client_contact_name TEXT;
ALTER TABLE gmao_contracts ADD COLUMN client_email TEXT;
ALTER TABLE gmao_contracts ADD COLUMN client_phone TEXT;

ALTER TABLE gmao_work_orders ADD COLUMN client_oi_number TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN received_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN receipt_confirmed_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN scheduled_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN repair_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE gmao_work_orders ADD COLUMN closure_status TEXT NOT NULL DEFAULT 'not_ready';
CREATE INDEX IF NOT EXISTS idx_gmao_wo_client_oi ON gmao_work_orders(company_id, client_oi_number);
CREATE INDEX IF NOT EXISTS idx_gmao_wo_schedule ON gmao_work_orders(company_id, scheduled_at, status);

ALTER TABLE gmao_quotes ADD COLUMN procurement_id TEXT;
ALTER TABLE gmao_quotes ADD COLUMN supplier_proforma_ref TEXT;
ALTER TABLE gmao_quotes ADD COLUMN sent_at INTEGER;
ALTER TABLE gmao_quotes ADD COLUMN accepted_at INTEGER;

CREATE TABLE IF NOT EXISTS gmao_attachment_sheets (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id         TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  visit_number          INTEGER NOT NULL DEFAULT 1,
  technician_name       TEXT NOT NULL,
  started_at            INTEGER,
  ended_at              INTEGER NOT NULL,
  diagnosis             TEXT,
  work_performed        TEXT NOT NULL,
  measurements          TEXT,
  parts_used            TEXT,
  photo_refs            TEXT,
  resolved              INTEGER NOT NULL DEFAULT 0,
  repair_required       INTEGER NOT NULL DEFAULT 0,
  repair_mode           TEXT NOT NULL DEFAULT 'none',
  customer_signatory    TEXT,
  customer_signature    TEXT,
  status                TEXT NOT NULL DEFAULT 'recorded',
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_attachments ON gmao_attachment_sheets(work_order_id, ended_at);

CREATE TABLE IF NOT EXISTS gmao_procurements (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id         TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  attachment_sheet_id   TEXT REFERENCES gmao_attachment_sheets(id) ON DELETE SET NULL,
  request_type          TEXT NOT NULL,
  supplier_name         TEXT,
  description           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'requested',
  requested_at          INTEGER NOT NULL,
  proforma_received_at  INTEGER,
  ordered_at            INTEGER,
  received_at           INTEGER,
  proforma_reference    TEXT,
  proforma_document_id  TEXT REFERENCES gmao_documents(id) ON DELETE SET NULL,
  amount_cents          INTEGER,
  notes                 TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_procurements ON gmao_procurements(company_id, status, requested_at);

CREATE TABLE IF NOT EXISTS gmao_customer_notifications (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id     TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'email',
  recipient         TEXT,
  subject           TEXT NOT NULL,
  message           TEXT NOT NULL,
  delivery_status   TEXT NOT NULL DEFAULT 'ready',
  prepared_at       INTEGER NOT NULL,
  sent_at           INTEGER,
  error             TEXT,
  metadata          TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE(company_id, work_order_id, notification_type)
);
CREATE INDEX IF NOT EXISTS idx_gmao_notifications ON gmao_customer_notifications(company_id, delivery_status, prepared_at);

-- Existing HVAC companies receive the franchise thresholds shown in the
-- contract workbook. New companies receive the same rules in bootstrap().
INSERT OR IGNORE INTO gmao_rate_rules (
  id, company_id, label, technical_section, equipment_type, rate_type,
  amount_cents, coefficient, vat_rate, included, effective_from, effective_until,
  metadata, created_at, updated_at
)
SELECT 'std-franchise-st1-froid-' || company_id, company_id, 'Franchise groupes froids', 'ST1', 'groupe froid', 'franchise', 150000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st1-clim-' || company_id, company_id, 'Franchise climatiseurs et déshumidificateurs', 'ST1', 'climat', 'franchise', 50000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st1-other-' || company_id, company_id, 'Franchise autres équipements ST1', 'ST1', NULL, 'franchise', 10000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st2-hotte-' || company_id, company_id, 'Franchise hottes de cuisine', 'ST2', 'hotte', 'franchise', 30000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st2-cta-' || company_id, company_id, 'Franchise CTA', 'ST2', 'cta', 'franchise', 30000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st2-other-' || company_id, company_id, 'Franchise autres équipements ST2', 'ST2', NULL, 'franchise', 10000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st3-gaz-' || company_id, company_id, 'Franchise équipements gaz', 'ST3', 'gaz', 'franchise', 30000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts
UNION ALL SELECT 'std-franchise-st3-comp-' || company_id, company_id, 'Franchise compresseurs', 'ST3', 'compresseur', 'franchise', 30000, NULL, vat_rate, 1, created_at, NULL, '{"source":"cahier_parametrage"}', created_at, updated_at FROM gmao_contracts;
