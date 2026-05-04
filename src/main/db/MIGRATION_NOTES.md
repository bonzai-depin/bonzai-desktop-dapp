# BonzAI Local Data Layer — Migration Notes

Status: Phases 0-9 backend complete. Phase 5b adapter registered (auto-loads if `nomic-embed-text-v1.5.Q4_K_M.gguf` is present in `~/bonzai-models`). Phase 7b/8b: openclaw sessions, x402 payments, content-NFT mints, and MintPool claims are wired to SQL. Skill execution history reads/writes SQL with electron-store mirror.

## Tables shipped (24 across 6 migrations)

| Migration | Tables |
|-----------|--------|
| `0001_audit.sql` | `audit_entries` |
| `0002_generations_blobs.sql` | `blobs`, `generations` |
| `0003_zhc_core.sql` | `companies`, `goals`, `issues`, `issue_attempts`, `treasury_state`, `treasury_entries`, `pending_approvals`, `published_content`, `connectors`, `human_roster` |
| `0004_companions_roleplay.sql` | `companions`, `companion_memory`, `roleplay_sessions`, `roleplay_messages` |
| `0005_embeddings.sql` | `embeddings` (vec0), `embedding_meta`, `embedding_queue` |
| `0006_skills_social_web3.sql` | `skills`, `skill_runs`, `skill_ownership`, `moltbook_posts`, `moltbook_engagements`, `openclaw_conversations`, `openclaw_messages`, `mint_records`, `x402_payments`, `mintpool_epochs`, `mintpool_claims` |

## Renderer adapters wired

Phase 1+3b+4b complete. Service modules now read/write through `electronAPI.db.*`:

- `src/services/company/auditLog.js`
- `src/services/company/goals.js`
- `src/services/company/issues.js`
- `src/services/company/treasury.solo.js`
- `src/services/company/governance.solo.js`
- `src/services/company/distribution.solo.js`
- `src/services/company/connectors.js`
- `src/services/company.service.js` (charter persistence)
- `src/services/roleplayStore.service.js` (companions + sessions, with bonzai-blob:// URLs for media)
- `src/components/skills/RoleplayChat.vue` (5 STORAGE_KEY call sites + 2 COMPANIONS_KEY call sites swapped)

## Renderer adapters NOT yet wired (legacy electron-store fallback in effect)

These still write to `electron-store` directly. The data layer is ready (schema/repo/IPC live); the wiring is mechanical follow-up:

- Skills marketplace UI (`SmartAgent.vue`, BrowseAgents skill section) — should call `electronAPI.db.skills.*`
- Moltbook posting / engagement service — should call `electronAPI.db.moltbook.*`
- OpenClaw multichannel router (`openclaw.handler.js`) — should call `electronAPI.db.openclaw.*`
- Web3 mint record cache (`contentNFT.service.js`, `companion.service.js` mint flows) — should call `electronAPI.db.web3.*`
- x402 payment recording (`x402Executor.service.js`) — should call `electronAPI.db.web3.paymentRecord/Settle`
- MintPool poller (`mintPool.service.js`) — should call `electronAPI.db.web3.epochUpsert / claimRecord`
- Scenarios storage (`roleplayScenarios` electron-store key) — small enough that staying in electron-store is fine

## Phase 5b — embedding adapter (open)

`src/main/db/embed-worker.js` registered + idle. Phase 5b registers an adapter implementing:

```js
{ name, dim, embed: async (texts) => Float32Array[] }
```

Recommended path: bundle `nomic-embed-text-v1.5-Q4_K_M.gguf` (~80MB) and route through the multi-instance llama-server pool's `/v1/embeddings` endpoint. Once registered, the worker drains `embedding_queue` (already populated by the first-boot backfill) and `electronAPI.db.embeddings.search(...)` becomes live.

## Legacy electron-store keys still being mirrored to (Phase 9 cleanup target)

These keys are written to BOTH SQLite and the legacy electron-store key during the migration window so any code path still reading from electron-store sees the same data. After 1 release of validation, drop the mirrors:

| Module | Legacy key |
|--------|-----------|
| `company.service.js` | `companies/index`, `companies/<id>/charter` |
| `roleplayStore.service.js` | `roleplayCompanions`, `roleplaySessions` |
| `connectors.js` | `secret:<companyId>:<connId>` (move to OS keychain via keytar — Phase 6 of the original plan) |

## What stays in electron-store (preferences only)

After Phase 9 cleanup, electron-store should hold ~10 keys totaling <10KB:

- `ui.theme`, `ui.locale`, `ui.lastActiveTab`, `ui.lastActiveCompanyId`, `ui.lastSelectedCompanion`
- `llm.lastLoadedModel`, `llm.lastLoadedSpec`, `llm.alwaysLoaded`
- `p2p.networkMode`, `p2p.pipeline.enabled`
- `wallet.lastChain`, `auth.privacyConsent`
- `db.schemaVersion`, `db.migrated.<table>` flags

## ESLint guard (Phase 9)

A future ESLint rule should fail any new `electron-store.set/get` call against keys NOT in the prefs allowlist. Until then, code review is the gate.
