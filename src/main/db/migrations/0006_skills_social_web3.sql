-- 0006_skills_social_web3.sql
-- BonzAI Phases 6 + 7 + 8: skills marketplace, Moltbook + OpenClaw,
-- web3 mirrors. Bundled into one migration because each individual
-- table set is small + they ship together.

-- ─── Phase 6: Skills ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skills (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT,
  version           TEXT,
  manifest          TEXT,                              -- JSON
  installed_at      INTEGER,
  source            TEXT,
  purchased_at      INTEGER,
  purchase_price    INTEGER,
  purchase_currency TEXT
);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_source   ON skills(source);

CREATE TABLE IF NOT EXISTS skill_runs (
  id                  TEXT PRIMARY KEY,
  skill_id            TEXT NOT NULL,
  action_type         TEXT NOT NULL,
  triggered_by        TEXT,
  company_id          TEXT,
  companion_id        TEXT,
  params              TEXT,
  result              TEXT,
  status              TEXT NOT NULL,
  duration_ms         INTEGER,
  cost_estimate_cents INTEGER,
  tx_hash             TEXT,
  share_link          TEXT,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_skill     ON skill_runs(skill_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_company   ON skill_runs(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_status    ON skill_runs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_companion ON skill_runs(companion_id, created_at);

CREATE TABLE IF NOT EXISTS skill_ownership (
  id                  TEXT PRIMARY KEY,
  skill_id            TEXT NOT NULL,
  companion_id        TEXT NOT NULL,
  weight_snapshot     INTEGER,
  profile_score       INTEGER,
  registered_at       INTEGER,
  last_claim_at       INTEGER,
  total_earned_cents  INTEGER DEFAULT 0,
  chain_attestation   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ownership_skill     ON skill_ownership(skill_id);
CREATE INDEX IF NOT EXISTS idx_ownership_companion ON skill_ownership(companion_id);

-- ─── Phase 7: Social ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS moltbook_posts (
  id              TEXT PRIMARY KEY,
  companion_id    TEXT NOT NULL,
  submolt_key     TEXT,
  title           TEXT,
  body            TEXT,
  image_blob_id   TEXT,
  image_ext       TEXT,
  upvotes         INTEGER DEFAULT 0,
  comment_count   INTEGER DEFAULT 0,
  published_at    INTEGER NOT NULL,
  external_url    TEXT
);
CREATE INDEX IF NOT EXISTS idx_molt_companion ON moltbook_posts(companion_id, published_at);
CREATE INDEX IF NOT EXISTS idx_molt_submolt   ON moltbook_posts(submolt_key, published_at);

CREATE TABLE IF NOT EXISTS moltbook_engagements (
  id             TEXT PRIMARY KEY,
  companion_id   TEXT NOT NULL,
  target_post_id TEXT NOT NULL,
  kind           TEXT NOT NULL,
  body           TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engage_companion ON moltbook_engagements(companion_id);
CREATE INDEX IF NOT EXISTS idx_engage_target    ON moltbook_engagements(target_post_id);

CREATE TABLE IF NOT EXISTS openclaw_conversations (
  id                TEXT PRIMARY KEY,
  channel           TEXT NOT NULL,
  external_chat_id  TEXT NOT NULL,
  companion_id      TEXT,
  customer_handle   TEXT,
  started_at        INTEGER NOT NULL,
  last_active_at    INTEGER,
  archived          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oc_channel   ON openclaw_conversations(channel, last_active_at);
CREATE INDEX IF NOT EXISTS idx_oc_external  ON openclaw_conversations(channel, external_chat_id);
CREATE INDEX IF NOT EXISTS idx_oc_companion ON openclaw_conversations(companion_id);

CREATE TABLE IF NOT EXISTS openclaw_messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL,
  direction           TEXT NOT NULL,
  role                TEXT NOT NULL,
  text                TEXT,
  audio_blob_id       TEXT,
  audio_ext           TEXT,
  image_blob_id       TEXT,
  image_ext           TEXT,
  external_message_id TEXT,
  meta                TEXT,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ocm_conv ON openclaw_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ocm_dir  ON openclaw_messages(conversation_id, direction);

-- ─── Phase 8: Web3 mirrors ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mint_records (
  id                TEXT PRIMARY KEY,
  chain_id          INTEGER NOT NULL,
  contract_address  TEXT NOT NULL,
  token_id          TEXT NOT NULL,
  content_type      TEXT,
  owner_wallet      TEXT,
  generation_id     TEXT,
  ipfs_cid          TEXT,
  tx_hash           TEXT,
  mint_fee_cents    INTEGER,
  royalty_bps       INTEGER,
  minted_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mint_owner   ON mint_records(owner_wallet, minted_at);
CREATE INDEX IF NOT EXISTS idx_mint_content ON mint_records(content_type, minted_at);
CREATE INDEX IF NOT EXISTS idx_mint_chain   ON mint_records(chain_id, contract_address);

CREATE TABLE IF NOT EXISTS x402_payments (
  id            TEXT PRIMARY KEY,
  chain_id      INTEGER NOT NULL,
  payer_wallet  TEXT NOT NULL,
  payee_wallet  TEXT NOT NULL,
  amount_wei    TEXT NOT NULL,
  pipeline      TEXT,
  session_id    TEXT,
  sig_hash      TEXT,
  tx_hash       TEXT,
  status        TEXT NOT NULL,
  paid_at       INTEGER,
  settled_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_x402_payer  ON x402_payments(payer_wallet, paid_at);
CREATE INDEX IF NOT EXISTS idx_x402_payee  ON x402_payments(payee_wallet, paid_at);
CREATE INDEX IF NOT EXISTS idx_x402_status ON x402_payments(status, paid_at);

CREATE TABLE IF NOT EXISTS mintpool_epochs (
  id                  TEXT PRIMARY KEY,
  chain_id            INTEGER NOT NULL,
  pool_index          INTEGER NOT NULL,
  epoch_number        INTEGER NOT NULL,
  start_block         INTEGER,
  end_block           INTEGER,
  holder_share_wei    TEXT,
  provider_share_wei  TEXT,
  finalized           INTEGER NOT NULL DEFAULT 0,
  swept_at            INTEGER,
  fetched_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pool_epoch ON mintpool_epochs(pool_index, epoch_number);
CREATE INDEX IF NOT EXISTS idx_pool_chain ON mintpool_epochs(chain_id, epoch_number);

CREATE TABLE IF NOT EXISTS mintpool_claims (
  id             TEXT PRIMARY KEY,
  chain_id       INTEGER NOT NULL,
  pool_index     INTEGER NOT NULL,
  epoch_number   INTEGER NOT NULL,
  holder_wallet  TEXT NOT NULL,
  weight         TEXT,
  payout_wei     TEXT,
  tx_hash        TEXT,
  claimed_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_claim_holder ON mintpool_claims(holder_wallet, claimed_at);
CREATE INDEX IF NOT EXISTS idx_claim_epoch  ON mintpool_claims(pool_index, epoch_number);
