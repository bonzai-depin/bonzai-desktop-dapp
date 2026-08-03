# BonzAI v4: Product and Economic Architecture

BonzAI v4 turns private local AI activity into durable, attributable assets without making a wallet mandatory for ordinary use. Local chat, generation, memory, teams, and training work on their own. A wallet gives publishable work an economic identity; staking and contribution records determine access, trust, and additional rewards.

## The seven delivered layers

1. **Local continuity.** User, companion, team-role, job, generation, and training memories use the SQL memory graph. Recall combines lexical and local embedding search. Each companion has a private identity memory and isolated team/job contexts. The graph can be browsed and exported as an Obsidian-compatible vault.
2. **Staking utility.** `BonzaiStakingVault` records active stake, lock duration, utility weight, and evidence-backed contribution score. Locks can be extended. Authorized score oracles attest contribution evidence.
3. **Proof of Contribution.** Dataset, contribution, evaluation, and model registries connect source hashes, licenses, evaluators, owners, and derived assets. Base revenue shares become immutable after activation. Staking adds a separate bonus and never reduces a contributor's royalty.
4. **Asset economies.** A companion mint atomically creates its fixed-supply token and provisions permanent Uniswap V4 liquidity from the increased mint payment. Validated fine-tuned and abliterated models can issue tokens only after artifact validation and complete identity metadata.
5. **Work economy.** Businesses post outcome-based jobs, companions apply, accepted work receives isolated professional memory, milestones require evidence, and completed work builds reputation. `BonzaiJobEscrow` supports funded ETH engagements and contribution routing.
6. **Production operations.** Company skills use encrypted local connector credentials and an allowlisted Electron network proxy. Stripe, HubSpot, QuickBooks, Sage Accounting, and Slack actions call real APIs in production mode; demo mode remains explicitly simulated.
7. **Markets and observability.** Earn > Markets discovers issued companion, fine-tuned, and abliterated tokens, follows their Uniswap pools, retains local price observations, charts activity, and explains each revenue path.

## Companion mint economics

The default companion mint is **0.30 ETH**. When production contracts are wired, **0.05 ETH** becomes initial token liquidity and the protocol remainder follows the configured treasury/MintPool split. Minting, token deployment, and liquidity creation are one transaction.

Each companion token has a fixed one-billion supply. Ninety-six percent enters permanently locked liquidity and four percent seeds the companion economy. The Uniswap hook's one-percent contribution fee routes 40% to the companion wallet, 40% to its owner, 10% to treasury, and 10% to contribution pools.

## Model publication lifecycle

```text
Contribution packs -> local training or abliteration -> artifact validation
-> model identity and provenance -> model NFT/registry record
-> optional token and permanent liquidity -> routed downstream revenue
```

Validation checks the resulting GGUF or adapter, metrics, and model kind. Token issuance is a separate action after testing. Fine-tuned and abliterated models share this validated issuance gate and require a name, ticker, description, image, metadata URI, model kind, and validation hash.

The contribution route records the inputs and people that made the model possible. Immutable base shares pay data owners, trainers, evaluators, and other recorded contributors. Active staking can add a separate utility bonus.

## Staking and rewards

Staking replaces the hold-only snapshot thesis for v4 utility. Lock duration and evidence-backed contribution can increase utility weight. Contribution ownership and staking rewards remain distinct: ownership pays recorded inputs because they were used; staking rewards compensate durable alignment and participation. A staking bonus cannot rewrite contribution shares.

Legacy MintPool epochs remain a separate content-pool mechanism until deployed contracts are migrated. New contribution routes use `BonzaiRevenueRouter`. Deployment addresses are environment-configured so production addresses can be inserted after deployment without application rewrites.

## Storage and privacy

Private artifacts stay local. Publishable metadata and content use the configured decentralized storage path, while contracts store hashes, licenses, ownership, validation, and revenue routes. Private memory, generation, training, and company operations require no chain transaction.

## Deployment

`scripts/deploy-v4-economy.js` deploys the staking vault, revenue router, contribution score oracle, contribution, dataset, model and evaluation registries, and job escrow. It writes `deployments/v4-<chainId>.json` plus environment values, wires configured factories/hooks, and disables legacy unvalidated model launches.

Production deployment still requires real treasury/core addresses, RPC credentials, verification, and funded transactions. Those are operational inputs, not missing application architecture.
