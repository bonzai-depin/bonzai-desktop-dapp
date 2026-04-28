# Arbitrum Migration — Removal Checklist

Decision: BonzAI consolidates to Arbitrum One (42161). Base is frozen, LUKSO UP
is removed from companion flows, Chainlink CRE is removed, x402 is removed,
cross-chain balance attestation is never implemented.

This document enumerates every file and code path that must be deleted or
rewritten. Changes land in a single PR to avoid intermediate half-migrated
state.

---

## 1. Chainlink CRE (cross-chain balance oracle)

Already removed from `BonzaiMintPool.sol` in this commit (rewritten to be
Arbitrum-local). Delete the remaining CRE code:

**Delete whole directory:**
- `src/contracts/cre/` — contains `IReceiver.sol`, `config.production.json`, `main.ts`, `workflow.ts`

**Delete file:**
- `scripts/sync-attestation-signer.js`

**Remove references:**
- `hardhat.config.cjs` — any `./src/contracts/cre` include, any CRE workflow config
- `package.json` — remove any `@chainlink/ccip`, `@chainlink/cre-*` deps if present
  (keep `@chainlink/contracts` only if still used elsewhere — it is for interfaces only)

**Remove from any deploy script:**
- `scripts/deploy-base-mvp.js` — deprecated anyway; delete (see Base section)
- `scripts/redeploy-mintpool.js` — delete; new deploy script for Arbitrum replaces it
- `scripts/redeploy-mintpool-skills.js` — delete
- `scripts/verify-args-mintpool.cjs`, `verify-args-mintpool-v2.cjs` — delete

---

## 2. Base chain deprecation

**Config — `src/config/web3.config.js`:**
- Remove the `base` entry from `networks` (keep `ethereum`, `arbitrum`; drop `lukso`, `base`)
- Remove `tokens.BONZAI.base`
- Remove `tokens.usdc.base` (USDC on Base no longer needed)
- Remove `contracts.base.*` entirely; add `contracts.arbitrum` section with new
  Arbitrum addresses (empty strings pre-deploy)
- Remove Uniswap V4 Base addresses (PoolManager, PositionManager, Permit2 on Base)
- Update any link that points to Base (explorer URLs, Uniswap swap URL)

**Services to rewrite to target Arbitrum:**
- `src/services/mintPool.service.js` — switch default chain from `base` to `arbitrum`,
  drop `registerForEpoch → RegistrationRequested → onReport` flow, use the new
  direct `registerForEpoch()` that reads local balance
- `src/services/contentNFT.service.js` — repoint to Arbitrum
- `src/services/companion.service.js` — repoint to Arbitrum (+ UP removal, see sec 3)
- `src/services/companionToken.service.js` — repoint CompanionTokenFactory / V4 addresses
- `src/services/fineTuneToken.service.js` — repoint FineTuneTokenFactory / V4 addresses
- `src/services/skillOwnership.service.js` — repoint
- `src/services/mintStore.js` / `src/stores/mintStore.js` — drop Base-specific branches

**UI references:**
- `src/components/AccessRequirements.vue` — remove Base-specific UI labels
- `src/components/MintModal.vue` — remove Base/LUKSO fork; mint targets Arbitrum only
- `src/components/BonzaiBottomBar.vue` — update chain indicator
- `src/components/NetworkSettings.vue` — drop Base from chain picker
- `src/config/social.config.js` — audit for Base references

**Scripts to rewrite for Arbitrum redeploy:**
- `scripts/deploy-base-mvp.js` → delete; create `scripts/deploy-arbitrum.js`
- `scripts/redeploy-content.cjs` → update or delete
- `scripts/redeploy-factories.js` → update or delete

**Hardhat network config:**
- `hardhat.config.cjs` — add `arbitrum` network with RPC, remove `base` network

**Docs:**
- `CLAUDE.md` — update "Networks" section: Ethereum + Arbitrum only, remove Base, remove LUKSO
- `CLAUDE.md` — replace every `Base (chainId 8453)` mention
- Any release notes / README that mention Base deployments

---

## 3. LUKSO Universal Profile removal (companion flows)

**Delete whole file:**
- `src/services/lukso.service.js`
- `scripts/deploy-lsp8.js`

**Services:**
- `src/services/companion.service.js`
  - Remove import `import { luksoService } from './lukso.service.js'`
  - Remove `luksoService.isUPExtensionAvailable()` check (lines ~169)
  - Remove `luksoService.deployCompanionUniversalProfile()` call (lines ~1002)
  - Remove `lukso: luksoService` and `deployCompanionUPCrossChain` exports (lines ~1060–1062)
  - Simplify companion mint path to: ERC-721 + ERC-8004 on Arbitrum + agent wallet EOA
- `src/services/web3.service.js`
  - Remove `registerWeb3ServiceForLukso` call (line ~960)
  - Remove LUKSO chain entry wiring, UP detection via `supportsInterface('0x24871b3d')`
- `src/services/walletProvider.service.js` — drop LUKSO branches
- `src/services/agentWallet.service.js` — drop LUKSO-aware branches (EOA on Arbitrum only)

**UI:**
- `src/components/skills/RoleplayChat.vue` — drop UP-related UI
- `src/components/MintModal.vue` — drop LSP8 mint path (already noted in memory as not-supported)
- `src/components/Generative3D.vue` — remove any LUKSO references
- `src/components/skills/BrowseAgents.vue` — drop UP labels / deploy UP CTA

**Config:**
- `src/config/web3.config.js` — remove `lukso` network entry
- `src/config/social.config.js` — remove LUKSO-specific identities
- `src/preload.js` — drop any `lukso:*` IPC bridge methods
- `src/main.js` — drop LUKSO RPC pre-flight, remove LUKSO store keys
- `src/constants/index.js` — drop LUKSO / LSP constants

**Deps (`package.json`):**
- Remove `@lukso/lsp-smart-contracts`
- Remove `@erc725/erc725.js`

**Composables / hooks:**
- `src/composables/useLuksoPreFlight.js` — already `D` (deleted) in git status; confirm gone
- `src/composables/useBonzaiNFT.js` — already `D`; confirm gone

---

## 4. x402 payment protocol removal

x402 per-request payments are replaced by the free inference + service-time model.

**Delete files:**
- `src/services/x402.service.js`
- `src/services/x402Executor.service.js`
- `src/services/owsSigner.adapter.js` — x402 EIP-712 adapter
- `src/services/purchaseExecutor.service.js` — autonomous per-request paying
- `src/services/coinbaseAgentWallet.service.js` — only existed for x402/CDP
- `src/services/sellerRegistry.service.js` — audit: if only used for x402, delete
- `src/services/pipeline.orchestrator.js` — audit: x402 inbound? rewrite or drop
- `src/services/pipeline.protocol.js` — audit

**Services to update:**
- `src/services/p2p.contract.service.js` — remove payment contract ABI section;
  keep provider registry only (identity/discovery still useful)
- `src/services/agent.service.js` — drop payment signature generation

**Contracts:**
- Keep but do not redeploy: `src/contracts/BonzaiP2PPayment.sol`, `BonzaiPayment.sol`,
  `BonzaiPipelinePayment.sol`, `BonzaiFanPayment.sol` — mark as Base-only / EOL,
  do not deploy to Arbitrum
- `src/contracts/BonzaiProviderRegistry.sol` — redeploy to Arbitrum; remove `stakedAmount`
  + staking-related functions (`withdrawStake`, `slashProvider`, `minStakeAmount`,
  `InsufficientStake*`, `stakeWithdrawn` event). Retain `recordEarnings`? No — drop;
  earnings accounting moves to `BonzaiServiceTime`. Also drop `heartbeat()` (not needed
  for free inference) and `pricePerToken` (no per-token pricing)

**Deps (`package.json`):**
- Remove `@coinbase/cdp-sdk` (only used by coinbaseAgentWallet for x402 flows)
- Audit `@privy-io/js-sdk-core` — keep for wallet abstraction, no x402 dependency

**IPC:**
- `src/preload.js` — drop `x402:*` methods
- `src/main.js` — drop x402 IPC handlers

**UI:**
- `src/components/SmartAgent.vue` — drop per-request payment confirmation
- `src/components/ContextBanner.vue` — drop payment banners
- `src/components/GenerativeText.vue`, `GenerativeImage.vue`, etc. — drop x402 headers;
  call the P2P provider freely after session-open

---

## 5. Cross-chain balance attestor (never implemented, remove references)

Any doc, comment, or TODO that mentions:
- "EIP-712 attestor"
- "signed balance attestation"
- "multi-chain balance verification via backend"
- "attestation signer rotation"

Grep the repo and delete. Memory file `arbitrum_migration.md` is the canonical
record that this approach was rejected.

---

## 6. New code landing in this migration

Already added in this commit:
- `src/contracts/BonzaiServiceTime.sol` — service-time accounting + EIP-712 session
- `src/contracts/BonzaiMintPool.sol` — rewritten: Arbitrum-local, 50/50 provider split
- `src/services/serviceTime.service.js` — client EIP-712 open/sign + provider submit/claim

Still to add:
- `scripts/deploy-arbitrum.js` — deploys the full stack to Arbitrum in correct order
- `src/services/mintPool.service.js` rewrite — drop CRE, target Arbitrum, use direct
  `registerForEpoch()`
- `src/services/provider.service.js` — replace `p2p.contract.service.js` provider bits
- Test suite update: all tests under `test/` currently target Base — repoint to a local
  Arbitrum fork

---

## 7. Order of operations

1. **Contracts**: deploy full stack to Arbitrum, wire cross-contract references.
2. **Client cutover (feature-flagged)**: new services coexist until addresses land.
3. **Delete**: execute every file deletion above in one PR once Arbitrum is live.
4. **Freeze Base**: keep Base contracts in-repo but remove from deploy pipeline;
   mark explorer links as "legacy" in docs.
5. **Base sunset**: after a grace window, remove Base contract source files entirely.

---

## 8. Dependency diff summary (`package.json`)

Remove:
- `@chainlink/contracts` (only if nothing imports it after CRE removal)
- `@lukso/lsp-smart-contracts`
- `@erc725/erc725.js`
- `@coinbase/cdp-sdk`

Keep:
- `ethers@6.x` (Arbitrum RPC)
- `@openzeppelin/contracts` (service-time contract uses EIP712, ECDSA, Ownable, etc.)
- `@privy-io/js-sdk-core` (wallet abstraction, still relevant)
- libp2p stack (P2P still used, just no payment layer)
