# Companion Wallet Security Hardening Plan

Rollout plan for securing companion agent wallets before production use with autonomous social network interactions.

## Current State

Companion wallets are deterministic EOAs derived from a master secret in Electron Store. They can sign ETH transactions, EIP-712 messages, and execute calls via Universal Profiles (LSP6). The architecture has the right primitives but enforcement gaps.

---

## P0 — Must Fix Before External Interactions

### 1. Enforce Spending Limits

**Problem**: `defaultMaxTransaction` (0.001 ETH) and `defaultDailyLimit` (0.005 ETH) are defined in config but never checked before signing.

**Fix**:
- `agentWallet.service.js`: Add `checkSpendingLimit(companionId, amountWei)` guard
- Track daily spend per companion in Electron Store (`agent-daily-spend-{companionId}-{date}`)
- Call guard before every `sendEthFromAgentWallet()` and `signPayment()`
- Hard reject if over limit, require user confirmation to override
- Coinbase CDP wallets already have this — mirror the pattern for local wallets

**Files**: `src/services/agentWallet.service.js`, `src/config/web3.config.js`

### 2. Persist x402 Nonces

**Problem**: Used nonces stored in an in-memory `Set` — lost on app restart, enabling signature replay.

**Fix**:
- Move `usedNonces` to Electron Store (`x402-used-nonces`)
- Load on startup, persist after each addition
- Add TTL cleanup: remove nonces older than 24 hours (signatures expire in 5 minutes anyway)
- Cap stored nonces at 10,000 with LRU eviction

**Files**: `src/services/x402.service.js`

### 3. Require User Confirmation for Transactions Above Threshold

**Problem**: No human-in-the-loop for fund transfers. A compromised companion can drain its wallet silently.

**Fix**:
- Add IPC channel `confirm-transaction` that shows a native Electron dialog
- Any transaction > 0.0005 ETH (~$1) requires explicit user approval
- Show: recipient, amount, chain, companion name, calling context
- Auto-reject after 60 second timeout
- Whitelist specific addresses (e.g., known skill registry contracts) for auto-approve below daily limit

**Files**: `src/main.js` (IPC handler), `src/preload.js` (expose), `src/services/agentWallet.service.js`

---

## P1 — Required Before Multi-Agent Interactions

### 4. Isolate Signers Per Service

**Problem**: Same agent wallet key signs everything — x402 payments, wallet changes, UP execution, social interactions. One compromised integration exposes all capabilities.

**Fix**:
- Derive sub-keys per service: `keccak256(masterSecret + companionId + serviceId)`
- Service IDs: `x402-payment`, `social-signing`, `skill-registry`, `up-execution`
- Social signing key can only sign messages (no ETH transfer capability)
- x402 key has spending limits baked in
- UP execution key requires user confirmation for value transfers
- Migration: existing wallets keep current key as `legacy` signer, new interactions use isolated keys

**Files**: `src/services/agentWallet.service.js` (new `deriveServiceSigner()`)

### 5. Add Password to Vault Encryption

**Problem**: MEK (Master Encryption Key) derived from one-time wallet signature only. No user password. Filesystem compromise = all keys exposed.

**Fix**:
- Derive MEK from: `HKDF(walletSignature + userPassword)`
- Prompt password on first setup and on each app unlock
- Store password hash (argon2) for validation
- Auto-lock vault after 15 minutes inactivity
- Keep current signature-only flow as "low security" option in settings

**Files**: `src/services/authVault.service.js`

---

## P2 — Hardening for Production

### 6. Rate-Limit Signing Requests

**Problem**: No throttle on signature requests. A rapid-fire attack could drain funds before daily limit resets.

**Fix**:
- Max 5 transactions per minute per companion
- Max 20 signatures (any type) per minute per companion
- Exponential backoff on repeated failures
- Alert user after 3 rejected transactions in a row

**Files**: `src/services/agentWallet.service.js`

### 7. Sandbox LLM Output from Fund Transfers

**Problem**: If companion processes external messages through LLM, prompt injection could trick it into calling `sendEthFromAgentWallet()`.

**Fix**:
- LLM response handler must NEVER have direct access to signing functions
- Introduce an "intent layer": LLM outputs structured intents (`{action: "pay", to: "...", amount: "..."}`)
- Intent validator checks: is this action allowed for this companion? Is the amount within limits?
- User approval required for any financial intent from LLM context
- Separate code paths: chat/roleplay context vs. transaction context

**Files**: `src/components/skills/RoleplayChat.vue`, new `src/services/intentValidator.service.js`

### 8. Complete Attestation Backend

**Problem**: `requestAttestation()` in skillOwnership.service.js returns `'0x'` placeholder. No real attestation verification.

**Fix**:
- Implement attestation signer backend (can be a simple Express endpoint or serverless function)
- Verify: companion NFT ownership on Base, spending profile score in category, BONZAI balance
- Sign EIP-191 message with trusted signer key
- Rate-limit attestation requests per companion (1 per skill per hour)

**Files**: `src/services/skillOwnership.service.js`, new backend service

---

## Verification Checklist

- [ ] Local wallet rejects transactions over `maxTransaction` without user approval
- [ ] Daily spend tracked and enforced per companion
- [ ] App restart does not allow x402 nonce replay
- [ ] Native dialog appears for transactions > 0.0005 ETH
- [ ] Social signing key cannot transfer ETH
- [ ] Vault requires password on unlock
- [ ] Auto-lock after 15 min inactivity
- [ ] Rate limiter blocks >5 tx/min
- [ ] LLM cannot directly call signing functions
- [ ] Attestation returns real EIP-191 signature
