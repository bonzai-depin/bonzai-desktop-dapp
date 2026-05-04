-- 0001_audit.sql
-- BonzAI Phase 1: audit_entries — the live-feed source.

CREATE TABLE IF NOT EXISTS audit_entries (
  id            TEXT    PRIMARY KEY,
  company_id    TEXT    NOT NULL,
  ts            INTEGER NOT NULL,

  kind          TEXT    NOT NULL,
  role          TEXT,
  action        TEXT,
  status        TEXT,
  note          TEXT,
  tx_or_link    TEXT,

  llm           TEXT,                      -- JSON: { response, durationMs, parseOk, parseError, truncated }

  direction     TEXT,                      -- in | out (treasury entries)
  amount        INTEGER,                   -- cents
  currency      TEXT,

  pending_id    TEXT,
  goal_id       TEXT,
  issue_id      TEXT,
  connector_id  TEXT,
  content_id    TEXT,

  extra         TEXT                       -- free-form JSON
);

CREATE INDEX IF NOT EXISTS idx_audit_company_ts ON audit_entries(company_id, ts);
CREATE INDEX IF NOT EXISTS idx_audit_kind       ON audit_entries(company_id, kind);
CREATE INDEX IF NOT EXISTS idx_audit_role       ON audit_entries(company_id, role);
CREATE INDEX IF NOT EXISTS idx_audit_goal       ON audit_entries(goal_id);
CREATE INDEX IF NOT EXISTS idx_audit_issue      ON audit_entries(issue_id);
CREATE INDEX IF NOT EXISTS idx_audit_connector  ON audit_entries(connector_id);
