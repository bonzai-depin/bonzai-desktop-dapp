CREATE TABLE IF NOT EXISTS public_agent_sessions (
  agent_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  settings TEXT NOT NULL,
  started_at TEXT NOT NULL,
  since_id TEXT,
  next_page TEXT,
  page_high TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS public_agent_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public_agent_sessions(agent_id),
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error TEXT,
  reply_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_public_agent_requests ON public_agent_requests(agent_id, status, created_at);
CREATE TABLE IF NOT EXISTS public_agent_optouts (
  agent_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  PRIMARY KEY(agent_id, author_id)
);
