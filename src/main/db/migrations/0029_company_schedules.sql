-- Recurring business work, enforced deadlines and confirmed goal outcomes.
ALTER TABLE goals ADD COLUMN deadline_at INTEGER;
ALTER TABLE goals ADD COLUMN success_criteria TEXT;
ALTER TABLE goals ADD COLUMN outcome TEXT;
ALTER TABLE goals ADD COLUMN overdue_notified_at INTEGER;
ALTER TABLE issues ADD COLUMN due_at INTEGER;
CREATE TABLE IF NOT EXISTS company_schedules (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT, assignee_role TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal',
 cadence TEXT NOT NULL, next_run_at INTEGER NOT NULL, last_run_at INTEGER, last_issue_id TEXT,
 enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_schedules_due ON company_schedules(company_id, enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_goals_deadline ON goals(company_id, status, deadline_at);
