-- 0003_zhc_core.sql
-- BonzAI Phase 3: ZHC core — companies, goals, issues, treasury,
-- approvals, distribution, connectors, human roster.

CREATE TABLE IF NOT EXISTS companies (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  mode         TEXT NOT NULL,
  status       TEXT NOT NULL,
  mission      TEXT,
  template_id  TEXT,
  demo_mode    INTEGER NOT NULL DEFAULT 0,
  charter      TEXT,                                 -- JSON
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_mode   ON companies(mode);

CREATE TABLE IF NOT EXISTS goals (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL,
  title              TEXT NOT NULL,
  rationale          TEXT,
  mission_alignment  TEXT,
  deadline           TEXT,
  status             TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  created_by_role    TEXT,
  cancel_reason      TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  completed_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(company_id, status);

CREATE TABLE IF NOT EXISTS issues (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL,
  goal_id            TEXT,
  parent_issue_id    TEXT,
  title              TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL,
  priority           TEXT NOT NULL,
  assignee_role      TEXT,
  assignee_companion TEXT,
  labels             TEXT,                            -- JSON array
  created_by         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues(company_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_goal     ON issues(goal_id);
CREATE INDEX IF NOT EXISTS idx_issues_role     ON issues(assignee_role, status);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(company_id, status, priority);

CREATE TABLE IF NOT EXISTS issue_attempts (
  id           TEXT PRIMARY KEY,
  issue_id     TEXT NOT NULL,
  role         TEXT,
  companion    TEXT,
  status       TEXT,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  tx_or_link   TEXT,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_issue ON issue_attempts(issue_id, started_at);

CREATE TABLE IF NOT EXISTS treasury_state (
  company_id  TEXT PRIMARY KEY,
  balance     INTEGER NOT NULL DEFAULT 0,
  total_in    INTEGER NOT NULL DEFAULT 0,
  total_out   INTEGER NOT NULL DEFAULT 0,
  currency    TEXT    NOT NULL DEFAULT 'USD',
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_entries (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  direction      TEXT NOT NULL,
  role           TEXT,
  action         TEXT,
  amount         INTEGER NOT NULL,
  currency       TEXT NOT NULL,
  source         TEXT,
  recipient      TEXT,
  note           TEXT,
  external_id    TEXT,
  balance_after  INTEGER,
  ts             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_company   ON treasury_entries(company_id, ts);
CREATE INDEX IF NOT EXISTS idx_treasury_direction ON treasury_entries(company_id, direction, ts);

CREATE TABLE IF NOT EXISTS pending_approvals (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL,
  cls             TEXT NOT NULL,
  action          TEXT NOT NULL,                       -- JSON
  role            TEXT,
  requested_by    TEXT,
  requested_at    INTEGER NOT NULL,
  decided_at      INTEGER,
  status          TEXT NOT NULL,
  reject_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON pending_approvals(company_id, status, requested_at);

CREATE TABLE IF NOT EXISTS published_content (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  pipeline    TEXT NOT NULL,
  prompt      TEXT,
  payload     TEXT,
  blob_id     TEXT,
  blob_ext    TEXT,
  role        TEXT,
  companion   TEXT,
  price       INTEGER DEFAULT 0,
  currency    TEXT    DEFAULT 'USD',
  sales       INTEGER DEFAULT 0,
  revenue     INTEGER DEFAULT 0,
  share_link  TEXT,
  meta        TEXT,                                    -- JSON
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pub_company  ON published_content(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pub_pipeline ON published_content(company_id, pipeline);

CREATE TABLE IF NOT EXISTS connectors (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL,
  kind                TEXT NOT NULL,
  label               TEXT,
  auth_type           TEXT NOT NULL,
  scopes              TEXT,                            -- JSON array
  account_identifier  TEXT,
  status              TEXT NOT NULL,
  error               TEXT,
  secret_ref          TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  last_validated_at   INTEGER,
  last_used_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_connectors_company ON connectors(company_id, status);
CREATE INDEX IF NOT EXISTS idx_connectors_kind    ON connectors(company_id, kind);

CREATE TABLE IF NOT EXISTS human_roster (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL,
  name               TEXT NOT NULL,
  title              TEXT,
  contractor_status  TEXT,
  contact            TEXT,                            -- JSON
  skills             TEXT,                            -- JSON
  is_physical        INTEGER DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_humans_company ON human_roster(company_id);
