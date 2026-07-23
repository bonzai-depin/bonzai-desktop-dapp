# BonzAI Paid Transactions

This document lists every user-facing flow in BonzAI Desktop that can move value, request a wallet signature for payment, or create claimable revenue. It is meant to make the economy auditable before contract addresses are finalized.

## Principles

- Local AI generation is not paywalled by the app.
- Paid flows are tied to ownership, publishing, team expansion, provider payments, token launches, marketplace access, or revenue claiming.
- Wallet actions must be explicit unless the user has enabled companion autonomous purchasing with limits.
- Any transaction that can move money should be documented in-product before signature.

## Direct Payments

| Flow | Current user action | Asset | Amount | Recipient / Contract | Notes |
| --- | --- | --- | --- | --- | --- |
| All-level unlock | Unlock all minting levels | ETH | 1 ETH | `BonzaiUnlock` | Permanent unlock for all levels. Contract routes 50% to Foundation and 50% to Liquidity. |
| Extra Back Office team | Add a second or later workflow team | ETH | 0.1 ETH | Treasury wallet until a dedicated TeamRegistry is deployed | First team is free. Additional teams now request the flat setup payment before opening team setup. |
| Content NFT mint | Mint generated text/audio/image/video/3D/training output | ETH | Per content type | User collection clone / `BonzaiCollectibles` | Free for users with all-level unlock. Otherwise the contract charges the per-type mint fee. |
| Companion mint + token launch | Mint an ERC-8004 companion, issue its token, and seed permanent liquidity | ETH | 0.30 ETH | `BonzaiCompanions` | Atomically creates identity and economy; 0.05 ETH seeds liquidity when the factory is wired. |
| LUKSO content mint | Mint LUKSO content asset | LYX | Configured LYX mint price | LUKSO LSP8 contract | Available through LUKSO-specific minting paths. |
| Skill purchase | Buy a paid skill | USDC | Skill price, default 9.99 USDC | `BonzaiSkillRegistry` | Service-level guard blocks paid skills until purchased. |
| P2P inference | Pay a provider for remote inference | ETH | Provider price | Provider / x402 payment flow | User or companion agent wallet sends payment proof before provider fulfills the request. |
| Fine-tune token launch | Launch ERC-20 token for a minted trained model | ETH | User-supplied liquidity, minimum from factory | `FineTuneTokenFactory` | Creates token and Uniswap V4 pool. Model provenance and contribution route metadata are attached. |
| Companion token launch | Launch ERC-20 token for a companion | ETH | User-supplied liquidity, minimum 0.01 ETH in UI | `CompanionTokenFactory` | Creates token and liquidity pool for a minted companion. |
| Autonomous companion purchase | Approve or auto-run a companion purchase intent | ETH | User-configured limit | Seller, mint contract, swap route, or x402 provider | Controlled by max-per-transaction and daily spending settings. |
| Live streaming paid generation | Viewer-triggered generation in Live Streamer skill | USDC | Per content type | Local simulated/skill payment flow | Skill tracks streamer/treasury split; contract settlement should be wired before production. |

## Gas-Only / Registration Transactions

These actions may cost network gas but are not product fees by themselves:

- Provider registration and provider metadata updates.
- MintPool epoch registration.
- MintPool or ServiceTime reward claims.
- Revenue route registration for datasets, models, skills, companions, or generated media.
- Dataset, contribution, model, and evaluation registry publishing.
- Skill co-owner registration and companion skill ownership attestations.
- Revenue claims from `BonzaiRevenueRouter`, skill ownership, provider rewards, mint pools, hooks, or royalty splitters.
- Staking, unstaking, lock extension, and reward claims in the staking vault.

## Contract Fee Sources

### Content NFT Fees

`BonzaiCollectibles` initializes per-type fees:

- Text: 0.0005 ETH
- Audio: 0.001 ETH
- Image: 0.0015 ETH
- Video: 0.0025 ETH
- 3D: 0.0035 ETH
- Training: 0.005 ETH

The contract splits fees between treasury and content-type pools. All-level unlocked users mint for free.

### Companion NFT Fees

Companion minting uses a 0.30 ETH default price. The minted NFT anchors identity, memory ownership, spending profile, agent wallet, and ERC-8004 metadata; 0.05 ETH launches its token liquidity atomically when the production factory is configured.

### Skill Marketplace Fees

Skill purchases default to USDC-denominated pricing. The configured split is 80% to co-owners and 20% to the platform. Co-owner distribution is weighted by companion eligibility and token-weighted reputation.

### P2P Provider Fees

P2P inference uses provider-defined pricing. BonzAI configuration reserves a 2.5% platform fee on paid inference trades where the on-chain payment contract is used.

### Token Launches

Fine-tune and companion token launches are not simple fees. They require ETH liquidity supplied by the creator. The factory launches the ERC-20 and pool; hook fees route ongoing activity to the configured creator, companion, treasury, pool, or contribution route.

## Back Office Team Pricing

The Back Office module is designed for multiple workflow teams running simultaneously.

- Team 1: free.
- Team 2 and later: flat 0.1 ETH setup payment.
- Current implementation: sends the setup payment to the configured treasury wallet and stores a local receipt before opening team setup.
- Future contract target: replace direct treasury payment with a `BonzaiTeamRegistry` or equivalent contract so team slots, receipts, and enterprise entitlements are independently queryable.

## Companion Autonomous Spending

Companions can execute purchases only when the user enables the feature and configures limits. Relevant controls include:

- Maximum per transaction.
- Daily spending limit.
- Purchase mode.
- Seller registry.
- User approval or automatic execution mode.

The user-facing risk boundary is that companion memory and purchase intent can propose work, but money movement must remain bound by explicit spending policies.

## Contribution And Reward Transactions

The strategic economy routes revenue to the people and machines that made an asset useful:

- Dataset owners.
- Sample curators.
- Fine-tune co-creators.
- Evaluators and appraisers.
- Companion skill contributors.
- Provider operators.
- Stakers with contribution-weighted utility.

Relevant contracts and services include:

- `BonzaiStakingVault`
- `BonzaiRevenueRouter`
- `BonzaiContributionRegistry`
- `BonzaiDatasetRegistry`
- `BonzaiModelRegistry`
- `BonzaiEvaluationRegistry`
- `BonzaiMintPool`
- `BonzaiServiceTime`
- `BonzaiSkillOwnership`

The current implementation already records contribution manifests and attaches provenance/revenue metadata to training and model-publishing flows. On-chain routes should be activated once final contract addresses are configured.

## Files To Review

- `src/config/web3.config.js`
- `src/services/contentNFT.service.js`
- `src/services/companion.service.js`
- `src/services/fineTuneToken.service.js`
- `src/services/companionToken.service.js`
- `src/services/mintPool.service.js`
- `src/services/bonzaiRevenueRouter.service.js`
- `src/services/staking.service.js`
- `src/services/x402.service.js`
- `src/services/x402Executor.service.js`
- `src/services/purchaseExecutor.service.js`
- `src/services/p2p.contract.service.js`
- `src/components/Company.vue`
- `src/components/MintModal.vue`
- `src/components/AccessRequirements.vue`
- `src/components/skills/RoleplayChat.vue`
- `src/components/skills/LiveStreamerSkill.vue`

## Open Follow-Ups

- Replace the Back Office direct treasury payment with a dedicated TeamRegistry contract after addresses are deployed.
- Surface exact fee preview modals consistently before every wallet signature.
- Add receipt export for all paid actions.
- Ensure NSFW minted generations remain excluded from marketplace discoverability.
- Add automated tests for fee gating and disabled-contract fallback states.
