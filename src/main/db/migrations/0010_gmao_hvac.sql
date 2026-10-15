-- 0010_gmao_hvac.sql
-- Local-first GMAO domain for multi-site HVAC maintenance contracts.

CREATE TABLE IF NOT EXISTS gmao_contracts (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  market_number         TEXT,
  engagement_number     TEXT,
  holder_name           TEXT,
  department            TEXT NOT NULL DEFAULT 'Martinique',
  starts_at             INTEGER,
  ends_at               INTEGER,
  renewal_type          TEXT NOT NULL DEFAULT 'annual',
  obligation_of_result  INTEGER NOT NULL DEFAULT 1,
  emergency_phone       TEXT,
  timezone              TEXT NOT NULL DEFAULT 'America/Martinique',
  currency              TEXT NOT NULL DEFAULT 'EUR',
  vat_rate              REAL NOT NULL DEFAULT 8.5,
  status                TEXT NOT NULL DEFAULT 'active',
  config                TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gmao_sites (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id   TEXT REFERENCES gmao_contracts(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  trigram       TEXT NOT NULL,
  department    TEXT NOT NULL DEFAULT '972',
  commune       TEXT,
  address       TEXT,
  kind          TEXT NOT NULL DEFAULT 'tertiary',
  scope         TEXT,
  exclusions    TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  metadata      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(company_id, trigram)
);
CREATE INDEX IF NOT EXISTS idx_gmao_sites_company ON gmao_sites(company_id, active, name);

CREATE TABLE IF NOT EXISTS gmao_assets (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id            TEXT NOT NULL REFERENCES gmao_sites(id) ON DELETE CASCADE,
  asset_code         TEXT NOT NULL,
  building_code      TEXT,
  building_name      TEXT,
  occupant           TEXT,
  technical_section  TEXT NOT NULL DEFAULT 'ST1',
  domain_code        TEXT NOT NULL DEFAULT 'IFC',
  equipment_type     TEXT NOT NULL,
  quantity           INTEGER NOT NULL DEFAULT 1,
  power_kw           REAL,
  capacity_liters    REAL,
  brand              TEXT,
  model_reference    TEXT,
  serial_number      TEXT,
  condition          TEXT NOT NULL DEFAULT '2',
  operational        INTEGER NOT NULL DEFAULT 1,
  criticality        TEXT NOT NULL DEFAULT 'P2',
  location           TEXT,
  photo_ref          TEXT,
  comments           TEXT,
  last_service_at    INTEGER,
  next_service_at    INTEGER,
  metadata           TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(company_id, asset_code)
);
CREATE INDEX IF NOT EXISTS idx_gmao_assets_site ON gmao_assets(company_id, site_id, technical_section);
CREATE INDEX IF NOT EXISTS idx_gmao_assets_due ON gmao_assets(company_id, next_service_at);

CREATE TABLE IF NOT EXISTS gmao_maintenance_plans (
  id                     TEXT PRIMARY KEY,
  company_id             TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id               TEXT REFERENCES gmao_assets(id) ON DELETE CASCADE,
  technical_section      TEXT NOT NULL,
  equipment_type         TEXT,
  name                   TEXT NOT NULL,
  description            TEXT,
  periodicity_months     INTEGER NOT NULL DEFAULT 12,
  checklist              TEXT NOT NULL,
  evidence_requirements  TEXT,
  active                 INTEGER NOT NULL DEFAULT 1,
  next_due_at            INTEGER,
  last_generated_at      INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_plans_due ON gmao_maintenance_plans(company_id, active, next_due_at);

CREATE TABLE IF NOT EXISTS gmao_work_orders (
  id                       TEXT PRIMARY KEY,
  company_id               TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id              TEXT REFERENCES gmao_contracts(id) ON DELETE SET NULL,
  site_id                  TEXT NOT NULL REFERENCES gmao_sites(id) ON DELETE CASCADE,
  asset_id                 TEXT REFERENCES gmao_assets(id) ON DELETE SET NULL,
  maintenance_plan_id      TEXT REFERENCES gmao_maintenance_plans(id) ON DELETE SET NULL,
  issue_id                 TEXT,
  work_order_number        TEXT NOT NULL,
  type                     TEXT NOT NULL DEFAULT 'corrective',
  status                   TEXT NOT NULL DEFAULT 'reported',
  priority                 TEXT NOT NULL DEFAULT 'P2',
  title                    TEXT NOT NULL,
  description              TEXT,
  source                   TEXT NOT NULL DEFAULT 'manual',
  reported_at              INTEGER NOT NULL,
  acknowledged_at          INTEGER,
  intervention_due_at      INTEGER,
  intervention_started_at  INTEGER,
  restoration_due_at       INTEGER,
  restored_at              INTEGER,
  completed_at             INTEGER,
  unavailable_from         INTEGER,
  unavailable_until        INTEGER,
  assignee_role            TEXT,
  assignee_companion       TEXT,
  assignee_human           TEXT,
  on_call                  INTEGER NOT NULL DEFAULT 0,
  quote_status             TEXT NOT NULL DEFAULT 'not_required',
  purchase_order           TEXT,
  service_acceptance       INTEGER NOT NULL DEFAULT 0,
  campaign_color           TEXT,
  result                   TEXT,
  cost                     TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  UNIQUE(company_id, work_order_number)
);
CREATE INDEX IF NOT EXISTS idx_gmao_wo_status ON gmao_work_orders(company_id, status, priority, reported_at);
CREATE INDEX IF NOT EXISTS idx_gmao_wo_sla ON gmao_work_orders(company_id, intervention_due_at, restoration_due_at);
CREATE INDEX IF NOT EXISTS idx_gmao_wo_asset ON gmao_work_orders(asset_id, reported_at);

CREATE TABLE IF NOT EXISTS gmao_work_order_events (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id  TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT,
  actor_role     TEXT,
  actor_name     TEXT,
  note           TEXT,
  evidence       TEXT,
  happened_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_wo_events ON gmao_work_order_events(work_order_id, happened_at);

CREATE TABLE IF NOT EXISTS gmao_documents (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_id       TEXT REFERENCES gmao_contracts(id) ON DELETE SET NULL,
  site_id           TEXT REFERENCES gmao_sites(id) ON DELETE SET NULL,
  asset_id          TEXT REFERENCES gmao_assets(id) ON DELETE SET NULL,
  work_order_id     TEXT REFERENCES gmao_work_orders(id) ON DELETE SET NULL,
  category          TEXT NOT NULL,
  filename          TEXT NOT NULL,
  original_name     TEXT,
  mime_type         TEXT,
  blob_id           TEXT,
  blob_ext          TEXT,
  storage_ref       TEXT,
  sha256            TEXT,
  status            TEXT NOT NULL DEFAULT 'valid',
  valid_from        INTEGER,
  valid_until       INTEGER,
  metadata          TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_documents ON gmao_documents(company_id, category, valid_until);

CREATE TABLE IF NOT EXISTS gmao_compliance_records (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id           TEXT REFERENCES gmao_sites(id) ON DELETE SET NULL,
  subcontractor_id  TEXT,
  document_id       TEXT REFERENCES gmao_documents(id) ON DELETE SET NULL,
  record_type       TEXT NOT NULL,
  subject_name      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  valid_from        INTEGER,
  valid_until       INTEGER,
  owner_role        TEXT,
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_compliance ON gmao_compliance_records(company_id, status, valid_until);

CREATE TABLE IF NOT EXISTS gmao_subcontractors (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  registration       TEXT,
  contact            TEXT,
  declared           INTEGER NOT NULL DEFAULT 0,
  dc4_status         TEXT NOT NULL DEFAULT 'missing',
  payment_approved   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending',
  personnel          TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_subcontractors ON gmao_subcontractors(company_id, status);

CREATE TABLE IF NOT EXISTS gmao_rate_rules (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,
  technical_section  TEXT,
  equipment_type     TEXT,
  rate_type          TEXT NOT NULL,
  amount_cents       INTEGER,
  coefficient        REAL,
  vat_rate           REAL NOT NULL DEFAULT 8.5,
  included           INTEGER NOT NULL DEFAULT 0,
  effective_from     INTEGER,
  effective_until    INTEGER,
  metadata           TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_rates ON gmao_rate_rules(company_id, rate_type, effective_from);

CREATE TABLE IF NOT EXISTS gmao_quotes (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id         TEXT NOT NULL REFERENCES gmao_work_orders(id) ON DELETE CASCADE,
  quote_number          TEXT NOT NULL,
  quote_type            TEXT NOT NULL DEFAULT 'outside_bpu',
  status                TEXT NOT NULL DEFAULT 'draft',
  parts_cents           INTEGER NOT NULL DEFAULT 0,
  labor_cents           INTEGER NOT NULL DEFAULT 0,
  travel_cents          INTEGER NOT NULL DEFAULT 0,
  access_cents          INTEGER NOT NULL DEFAULT 0,
  franchise_cents       INTEGER NOT NULL DEFAULT 0,
  coefficient           REAL NOT NULL DEFAULT 1,
  subtotal_cents        INTEGER NOT NULL DEFAULT 0,
  vat_rate              REAL NOT NULL DEFAULT 8.5,
  vat_cents             INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL DEFAULT 0,
  purchase_order        TEXT,
  calculation           TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE(company_id, quote_number)
);
CREATE INDEX IF NOT EXISTS idx_gmao_quotes ON gmao_quotes(company_id, status, created_at);

CREATE TABLE IF NOT EXISTS gmao_penalties (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id    TEXT REFERENCES gmao_work_orders(id) ON DELETE SET NULL,
  document_id      TEXT REFERENCES gmao_documents(id) ON DELETE SET NULL,
  penalty_key      TEXT NOT NULL,
  label            TEXT NOT NULL,
  rate_cents       INTEGER NOT NULL,
  unit             TEXT NOT NULL,
  quantity         REAL NOT NULL,
  amount_cents     INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'potential',
  reason           TEXT,
  detected_at      INTEGER NOT NULL,
  resolved_at      INTEGER,
  notes            TEXT,
  UNIQUE(company_id, penalty_key)
);
CREATE INDEX IF NOT EXISTS idx_gmao_penalties ON gmao_penalties(company_id, status, detected_at);

CREATE TABLE IF NOT EXISTS gmao_on_call_shifts (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id      TEXT REFERENCES gmao_sites(id) ON DELETE SET NULL,
  person_name  TEXT NOT NULL,
  phone        TEXT NOT NULL,
  starts_at    INTEGER NOT NULL,
  ends_at      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'planned',
  notes        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmao_on_call ON gmao_on_call_shifts(company_id, starts_at, ends_at);
