-- 0014_company_automation_runtime.sql
-- Durable company scheduler state, execution leases, run history and task retries.

ALTER TABLE issues ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE issues ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE issues ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE issues ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_issues_ready
  ON issues(company_id, status, assignee_role, next_attempt_at, priority, created_at);

CREATE TABLE IF NOT EXISTS company_automation_state (
  company_id            TEXT PRIMARY KEY,
  scheduler_status      TEXT NOT NULL DEFAULT 'idle',
  active_lane           TEXT,
  lease_owner           TEXT,
  lease_expires_at      INTEGER,
  last_ceo_at           INTEGER,
  last_roles_at         INTEGER,
  last_success_at       INTEGER,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  next_ceo_at           INTEGER,
  next_roles_at         INTEGER,
  last_error            TEXT,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS company_automation_runs (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  lane           TEXT NOT NULL,
  trigger_type   TEXT NOT NULL,
  status         TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  finished_at    INTEGER,
  result         TEXT,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_company_automation_runs
  ON company_automation_runs(company_id, started_at DESC);
