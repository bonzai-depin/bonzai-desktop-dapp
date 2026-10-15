-- Persist the exact plan, resolved inputs and receipts across owner approvals.
ALTER TABLE issues ADD COLUMN execution TEXT;
ALTER TABLE issues ADD COLUMN execution_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pending_approvals ADD COLUMN issue_id TEXT;
ALTER TABLE pending_approvals ADD COLUMN step_id TEXT;
CREATE UNIQUE INDEX idx_approval_task_step ON pending_approvals(company_id, issue_id, step_id)
  WHERE issue_id IS NOT NULL AND step_id IS NOT NULL;
