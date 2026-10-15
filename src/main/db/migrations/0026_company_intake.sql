CREATE TABLE company_intake_sources (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', cursor INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(company_id,fingerprint)
);
CREATE INDEX company_intake_queue ON company_intake_sources(company_id,status,next_at);
CREATE TABLE company_intake_actions (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL REFERENCES company_intake_sources(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'review',
 result TEXT, error TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 UNIQUE(source_id,ordinal)
);
CREATE TABLE company_intake_mailboxes (
 id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 data TEXT NOT NULL, updated_at INTEGER NOT NULL
);
