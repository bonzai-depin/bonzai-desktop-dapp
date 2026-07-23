# BonzAI Web3 Production Audit

Date: 2026-07-22

## Release decision

**NO-GO until `npm run web3:verify` passes against the production Ethereum deployment.**

Local builds and contract tests verify the implementation. They do not prove that production addresses contain the expected bytecode or that the contracts are wired to the same staking vault. The release workflow enforces that check.

An independent smart-contract audit and a funded mainnet smoke test remain required for a production launch.

## Release capability matrix

| Capability | Production behavior | Status |
| --- | --- | --- |
| Wallet sign-in and connection | Existing Reown/production wallet connection | Preserved; no sign-in redesign |
| Multi-chain wallet display | Ethereum, Arbitrum, Base, and LUKSO balances shown independently | Fixed |
| Canonical protocol economy | One chain set by `VITE_BONZAI_ECONOMY_CHAIN_ID`; defaults to Ethereum (`1`) | Fixed |
| BONZAI access levels | LVL1-LVL6 are based on staked BONZAI: 1K, 5K, 10K, 25K, 33K, 50K | Enforced in UI and content NFT contract |
| Content NFT minting | ERC-721 minting only on the configured economy chain | Native previews cover text, audio, image, video, 3D, and training metadata; contract tests cover all six types |
| Companion identity | Human companions only; revenue-receiving agent wallet; ERC-8004 identity | Legacy non-human defaults are migrated out; companion spending is unavailable |
| Skill marketplace | Registry purchase and ownership revenue routing | Implemented; production skill ID map required |
| Mint pools and royalties | Staking-weighted holder eligibility plus service-time provider allocation | Implemented; production vault wiring required |
| Staking and contribution economy | Utility staking, contribution scoring, registries, and revenue routes | Implemented |
| P2P inference | Free to users; providers accrue service time and receive a share of reward pools | Paid request path removed |
| Autonomous companion payments | Wallet can receive protocol revenue but cannot initiate payments | Removed from production behavior |
| Uniswap V4 protocol liquidity | Token factory pool creation and fee routing | Retained; required for companion and fine-tune token launches |
| Autonomous V4 swaps | Former companion spending path through Universal Router | Removed, not merely hidden; it is outside the current product |
| Agent job board | Experimental local/on-chain work | Disabled unless `VITE_ENABLE_EXPERIMENTAL_JOB_BOARD=1`; excluded from release gate |

## Material fixes

- Defaulted the canonical economy to Ethereum and routed economy services through the configured chain.
- Restricted minting to `VITE_BONZAI_ECONOMY_CHAIN_ID`; removed secondary mint network choices.
- Replaced balance and permanent-unlock access with staking positions.
- Added on-chain staking-tier enforcement to all six collectible content types.
- Made MintPool registration and claim eligibility use staking positions when the production vault is wired.
- Made provider eligibility use staking while preserving free inference for consumers.
- Added a preflight assertion that both CollectiblesFactory and MintPool point to the configured staking vault.
- Removed autonomous purchase orchestration and its x402/Universal Router imports from production code paths.
- Kept Uniswap V4 pool creation and fee routing used by protocol token factories.
- Removed non-human default companions and added migration filtering for stored and NFT companions.
- Replaced the default scenario catalog with varied, work, culture, travel, learning, and creative settings.
- Put the job board behind an explicit experimental build flag.

## Required release gates

1. Set `VITE_BONZAI_ECONOMY_CHAIN_ID=1` explicitly in every production build environment.
2. Deploy the complete Ethereum protocol and configure every required `VITE_BONZAI_*_ETHEREUM_ADDRESS` secret.
3. Wire `BonzaiCollectiblesFactory.stakingVault` and `BonzaiMintPool.stakingVault` to the same production vault. The preflight checks both values.
4. Verify the vault thresholds are exactly 1K, 5K, 10K, 25K, 33K, and 50K BONZAI.
5. Configure and independently verify the Ethereum Uniswap V4 PoolManager, PositionManager, Universal Router, Quoter, and StateView addresses.
6. Upload real skill packages, register them, and configure `VITE_BONZAI_SKILL_ID_MAP_JSON`.
7. Run `npm run web3:verify` against the production RPC.
8. Run funded-wallet smoke tests for connect, chain switch, stake, each of the six mint types, companion mint, skill purchase, pool registration/claim, and provider service-time claim.
9. Keep `VITE_ENABLE_EXPERIMENTAL_JOB_BOARD=0` for the release.

## Verification notes

Run and record the final results immediately before release:

```bash
npm test
npm run build:vite
npm run lint
npm run test:i18n
npm run web3:verify
git diff --check
```

Hardhat warns that Node.js 25 is unsupported. Repeat contract and deployment verification on a supported Node LTS release before sending production transactions.
