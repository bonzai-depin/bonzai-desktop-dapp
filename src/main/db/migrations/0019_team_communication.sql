-- Team workspaces remain isolated. Only explicitly addressed exchanges are shared.
CREATE TABLE team_threads (
  id TEXT PRIMARY KEY,
  source_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_team_name TEXT NOT NULL,
  target_team_name TEXT NOT NULL,
  target_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
  request_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(source_company_id, request_key),
  CHECK(source_company_id <> target_company_id)
);
CREATE INDEX team_threads_target ON team_threads(target_company_id,created_at);
CREATE TABLE team_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES team_threads(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  author_member_id TEXT,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  request_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(company_id,request_key)
);
CREATE INDEX team_messages_thread ON team_messages(thread_id,created_at);
CREATE TABLE team_effects (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  input TEXT NOT NULL,
  result TEXT NOT NULL,
  PRIMARY KEY(company_id,request_key)
);
CREATE TABLE team_conversation_archives (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- These were generated for an in-team purchasing role. Keep the records for
-- review; the owner chooses the actual receiving team for a new handoff.
UPDATE issues SET status='blocked', last_error='Select a receiving purchasing team and share the parts request.', updated_at=strftime('%s','now')*1000
WHERE created_by='maintenance' AND assignee_role='PurchasingManager' AND status='open'
AND EXISTS(SELECT 1 FROM json_each(issues.labels) WHERE value='gmao_purchasing');
