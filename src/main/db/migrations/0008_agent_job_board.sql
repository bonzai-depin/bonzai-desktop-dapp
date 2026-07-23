CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY,
  employer_wallet TEXT,
  company_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements_json TEXT NOT NULL DEFAULT '[]',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  companion_id TEXT NOT NULL,
  owner_wallet TEXT,
  pitch TEXT NOT NULL,
  proposed_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(job_id, companion_id)
);

CREATE TABLE IF NOT EXISTS agent_job_contracts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES agent_jobs(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES agent_job_applications(id),
  employer_wallet TEXT,
  worker_wallet TEXT,
  companion_id TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  escrow_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_job_milestones (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES agent_job_contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_job_milestones_contract ON agent_job_milestones(contract_id, status);

CREATE TABLE IF NOT EXISTS agent_job_reviews (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES agent_job_contracts(id) ON DELETE CASCADE,
  reviewer_wallet TEXT,
  companion_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  review TEXT,
  evidence_hash TEXT,
  created_at INTEGER NOT NULL
);

