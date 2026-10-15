-- AI-native GMAO: structured inbound documents, proactive recommendations,
-- exception management, explainability, equipment signals and billing detail.

ALTER TABLE gmao_contracts ADD COLUMN lot_number TEXT;

ALTER TABLE gmao_sites ADD COLUMN antenna TEXT;
ALTER TABLE gmao_sites ADD COLUMN reference_organization TEXT;
ALTER TABLE gmao_sites ADD COLUMN g2d_number TEXT;

ALTER TABLE gmao_work_orders ADD COLUMN source_document_id TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN requester_name TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN requester_contact TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN integrated_at INTEGER;
ALTER TABLE gmao_work_orders ADD COLUMN blockage_level TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN location_detail TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN predicted_category TEXT;
ALTER TABLE gmao_work_orders ADD COLUMN ai_confidence REAL;
ALTER TABLE gmao_work_orders ADD COLUMN max_unavailability_at INTEGER;

ALTER TABLE gmao_assets ADD COLUMN health_score INTEGER NOT NULL DEFAULT 100;
ALTER TABLE gmao_assets ADD COLUMN failure_risk TEXT NOT NULL DEFAULT 'low';
ALTER TABLE gmao_assets ADD COLUMN last_risk_evaluated_at INTEGER;

ALTER TABLE gmao_attachment_sheets ADD COLUMN sticker_campaign TEXT;
ALTER TABLE gmao_attachment_sheets ADD COLUMN sticker_color TEXT;
ALTER TABLE gmao_attachment_sheets ADD COLUMN sticker_applied_at INTEGER;

ALTER TABLE gmao_quotes ADD COLUMN valid_until INTEGER;
ALTER TABLE gmao_invoices ADD COLUMN planning_export_status TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS gmao_document_intake (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  blob_id               TEXT,
  original_name         TEXT NOT NULL,
  mime_type             TEXT,
  source_channel        TEXT NOT NULL DEFAULT 'manual',
  sender                TEXT,
  received_at           INTEGER NOT NULL,
  extracted_text        TEXT,
  document_type         TEXT NOT NULL DEFAULT 'unknown',
  confidence            REAL NOT NULL DEFAULT 0,
  extracted_data        TEXT,
  status                TEXT NOT NULL DEFAULT 'to_review',
  matched_work_order_id TEXT REFERENCES gmao_work_orders(id) ON DELETE SET NULL,
  reviewed_by           TEXT,
  reviewed_at           INTEGER,
  error                 TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_document_intake
  ON gmao_document_intake(company_id, status, received_at);

CREATE TABLE IF NOT EXISTS gmao_agent_recommendations (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id     TEXT REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  asset_id          TEXT REFERENCES gmao_assets(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  title             TEXT NOT NULL,
  rationale         TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0,
  priority          TEXT NOT NULL DEFAULT 'normal',
  proposed_action   TEXT,
  status            TEXT NOT NULL DEFAULT 'proposed',
  source_data       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  resolved_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gmao_recommendations
  ON gmao_agent_recommendations(company_id, status, priority, created_at);

CREATE TABLE IF NOT EXISTS gmao_exceptions (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id   TEXT REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  exception_type  TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'warning',
  title           TEXT NOT NULL,
  details         TEXT,
  owner_role      TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  due_at          INTEGER,
  detected_at     INTEGER NOT NULL,
  resolved_at     INTEGER,
  metadata        TEXT,
  UNIQUE(company_id, work_order_id, exception_type)
);
CREATE INDEX IF NOT EXISTS idx_gmao_exceptions
  ON gmao_exceptions(company_id, status, severity, due_at);

CREATE TABLE IF NOT EXISTS gmao_automation_runs (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  status          TEXT NOT NULL,
  actions         TEXT,
  explanation     TEXT,
  started_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_gmao_automation_runs
  ON gmao_automation_runs(company_id, started_at);

CREATE TABLE IF NOT EXISTS gmao_asset_signals (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id        TEXT NOT NULL REFERENCES gmao_assets(id) ON DELETE CASCADE,
  work_order_id   TEXT REFERENCES gmao_work_orders(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL,
  value           REAL,
  unit            TEXT,
  severity        TEXT NOT NULL DEFAULT 'info',
  observed_at     INTEGER NOT NULL,
  metadata        TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_asset_signals
  ON gmao_asset_signals(company_id, asset_id, observed_at);

CREATE TABLE IF NOT EXISTS gmao_billing_lines (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id      TEXT NOT NULL REFERENCES gmao_invoices(id) ON DELETE CASCADE,
  work_order_id   TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  component_code  TEXT,
  component_name  TEXT,
  equipment_number TEXT,
  intervention_at INTEGER,
  comments        TEXT,
  service_acceptance_reference TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_billing_lines
  ON gmao_billing_lines(company_id, invoice_id);
