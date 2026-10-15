-- Continuation of the corrective workflow: customer quote approval, purchase
-- order, service acceptance and invoicing.

ALTER TABLE gmao_work_orders ADD COLUMN service_acceptance_reference TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN service_acceptance_received_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'not_billable';

ALTER TABLE gmao_quotes ADD COLUMN purchase_order_received_at INTEGER;
ALTER TABLE gmao_quotes ADD COLUMN rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS gmao_invoices (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id   TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  quote_id        TEXT REFERENCES gmao_quotes(id) ON DELETE SET NULL,
  invoice_number  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  vat_rate        REAL NOT NULL DEFAULT 0,
  vat_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  issued_at       INTEGER NOT NULL,
  sent_at         INTEGER,
  recipient       TEXT,
  document_id     TEXT REFERENCES gmao_documents(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE(company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_gmao_invoices
  ON gmao_invoices(company_id, status, issued_at);
