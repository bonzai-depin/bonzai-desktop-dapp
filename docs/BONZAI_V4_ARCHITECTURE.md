# BonzAI v4: Product and Economic Architecture

BonzAI v4 turns private local AI activity into durable, attributable assets without making a wallet mandatory for ordinary use. Local chat, generation, memory, teams, and training work on their own. A wallet gives publishable work an economic identity; staking and contribution records determine access, trust, and additional rewards.

## Implemented layers and verification boundaries

1. **Local continuity.** User, companion, team-role, job, generation, and training memories use the SQL memory graph. Recall combines lexical and local embedding search. Each companion has a private identity memory and isolated team/job contexts. The graph can be browsed and exported as an Obsidian-compatible vault.
2. **Staking utility.** `BonzaiStakingVault` records active stake, lock duration, utility weight, and evidence-backed contribution score. Locks can be extended. Authorized score oracles attest contribution evidence.
3. **Proof of Contribution.** Dataset, contribution, evaluation, and model registries connect source hashes, licenses, evaluators, owners, and derived assets. Base revenue shares become immutable after activation. Staking adds a separate bonus and never reduces a contributor's royalty.
4. **Asset economies.** A companion mint atomically creates its fixed-supply token and requests locked Uniswap V4 liquidity. Model issuance requires identity metadata and a nonzero validation hash. The contract does not independently validate the artifact; production pool integration remains a release gate.
5. **Work economy.** Businesses hire smart agents into teams for outcomes. A smart agent combines its identity, skills and social token. `BonzaiJobEscrow` funds new engagements in the exact token issued for that smart agent, verifies its controller and retains bounded cancellation, evidence, review and dispute recovery. Native funding is a compatibility path disabled once the new economy is configured.
6. **Production operations.** Company skills use encrypted local connector credentials and an allowlisted Electron network proxy. Stripe, HubSpot, QuickBooks, Sage Accounting, and Slack actions call real APIs in production mode; demo mode remains explicitly simulated.
7. **Markets and observability.** Protocol > Markets discovers issued companion, fine-tuned, and abliterated tokens, follows their Uniswap pools, retains local price observations, charts activity, and explains each revenue path.

## Companion mint economics

The default companion mint is **0.30 ETH**. When production contracts are wired, **0.05 ETH** becomes initial token liquidity and the protocol remainder follows the configured treasury/MintPool split. Minting, token deployment, and liquidity creation are one transaction.

Issued agent, model and game tokens use the shared [locked-liquidity vault architecture](LOCKED_LIQUIDITY.md). Each token has a fixed one-billion supply: 96% goes to liquidity and 4% to the agent wallet or creator. Unused token dust is retired; the LP NFT is held permanently by the immutable vault, never burned. Pools use a static 1% trading fee without an additional fee hook. Collected fees are split 40% agent wallet / 40% current NFT owner / 10% treasury / 10% basket rewards for agents, and 80% creator/contributors / 10% treasury / 10% basket rewards for models and games. Anyone may collect; beneficiaries claim their own credits. Workflow payments remain separate. Target-chain pool integration still requires verification before deployment.

## Model publication lifecycle

```text
Contribution packs -> local training or abliteration -> artifact validation
-> model identity and provenance -> model NFT/registry record
-> optional token and permanent liquidity -> routed downstream revenue
```

The local workflow checks the resulting GGUF or adapter, metrics, and model kind. Token issuance is a separate action after testing and requires a name, ticker, description, image, metadata URI, model kind, and validation hash. This hash is supplied by the publisher: it is not an independent validation attestation. Legacy issuance without the metadata/hash gate is disabled by default.

The contribution route records the inputs and people that made the model possible. Immutable base shares pay data owners, trainers, evaluators, and other recorded contributors. Active staking can add a separate utility bonus.

## Staking and currency-basket rewards

Rewards is a full workspace view (`RewardsView.vue`), reached from the sidebar, command palette, and Ownership reward links. It includes the six-level explorer, exact stake top-up previews, inline membership-action review, and independent per-currency claims. Previous reward pools expand within the page. Disconnected users can explore membership; missing deployment addresses disable staking and expose a configuration status instead of fabricated balances or yield. Wallet signing remains explicit.

Membership retains the six BONZAI thresholds: **1,000 / 5,000 / 10,000 / 25,000 / 33,000 / 50,000**. `BonzaiBasketRewards` accounts each received currency separately. Native legacy fees, verified USDC and factory-issued smart-agent social tokens can enter the basket. There is no required conversion, common token-denominated balance, promised yield or token emission.

Every fee received funds six equal LVL tranches, with indivisible-unit remainder assigned to LVL 1. Members participate cumulatively in LVLs 1 through their attained level. Each tranche uses the member's **committed BONZAI × eligible seconds** divided by the corresponding total during the weekly receipt epoch. Additional BONZAI increases proportional participation even between thresholds. Vault checkpoints settle stake changes prospectively; contribution scores and optional lock multipliers do not alter these rewards. Thresholds freeze after the first rewards activation so governance cannot rewrite historical eligibility.

`stakeForRewards(amount)` is the default new commitment. Existing positions use `activateRewards()` explicitly; their original withdrawal terms are not silently changed. `requestRewardExit()` ends future reward accrual immediately and starts a 90-day withdrawal notice. A longer original lock still applies. Reactivating cancels the withdrawal path and restores the commitment. Claims for closed epochs remain available after withdrawal and do not expire. Claiming one currency is independent of any other currency; batches contain at most 32 epochs. Tranches with no eligible members can roll forward through a permissionless call; earned allocations cannot be swept. Rounding residue remains in the basket.

This is a **receipt-period** revenue pool. Late entry receives only its actual time in that epoch and never modifies a closed epoch. Fees retained upstream by the liquidity vault, or queued while a payment destination is unavailable, enter an epoch only when the basket actually receives them. Historical work or trading volume is not represented as already-funded rewards. Native MintPool holder allocations and social-token job platform allocations attempt delivery when collected; permissionless retry retains failed liabilities. Low gas in optional MintPool delivery does not revert the mandatory holder/provider accounting.

| Revenue source | Basket connection | Preserved allocation |
| --- | --- | --- |
| Collectible and smart-agent mint fees, secondary royalties | Existing MintPool holder slice flows to all basket LVLs regardless of media category. | MintPool provider allocation and already-accrued legacy holder claims remain separate. |
| Contribution routes in native currency, USDC or an admitted social token | New routes send their agreed staking allocation to the basket; default 10% of routed revenue. | Default 80% base contributors and 10% treasury; existing native routes keep their recorded terms. |
| Completed social-token jobs | Half of the existing 2.5% platform fee funds the basket, in the job's token. | Other half pays treasury. The worker receives 95% when a 2.5% royalty route applies, otherwise 97.5%. Refunds carry no fee. |
| Legacy inference payment names / x402 | No USDC fee producer is active in this RC. The historical payment contracts referenced in comments are absent. | P2P inference remains free; x402 payment execution is disabled and its retained adapter is ETH-only. No fictitious fee is counted. |

USDC support therefore means real token-aware fee deposits and accounting, not a claim that disabled inference rails generate USDC revenue. Any future producer must transfer its explicit, agreed fee allocation through `depositTokenRevenue` or `depositToken`; unrelated transfers to providers or treasury are not automatically captured. Native and USDC address provenance, denomination and contract wiring remain deployment gates.

Old MintPool registration/confirmation/self-mint conditions apply only to historical allocations kept there; the basket does not require those actions. `BonzaiRevenueRouter` snapshots its basket destination per new route, preserving older route terms. All changes require newly deployed reviewed contracts and explicit wiring; editing the renderer cannot migrate live funds.

## Smart-agent job settlement

The customer reviews a token-denominated quote, the smart agent and controlling wallet, an independent arbitrator, deadlines and an optional explicit contribution route. The escrow resolves the exact social token through the canonical factory and verifies the proposed worker against the NFT owner or registered agent wallet. Tokens are approved and escrowed in exact units; transfer-tax tokens are rejected. Funding snapshots the worker, currency, amount, terms hash, arbitrator and fallback contributor shares. The factory's smart-agent registry freezes after issuance, and escrow/basket also reject a registry mismatch.

All accepted work, settlements, cancellations and refunds use that snapshotted social token. A later token price change never changes owed units. Token balances, pending royalties, platform fees and recipient credits are separate per currency. Workers, employers and treasury withdraw independently. No extra BONZAI commitment per smart agent is required. An optional royalty route is an agreed quote term; its presence does not prove the lineage of every skill used.

The desktop job panel starts from the device's saved job journal and verifies status against escrow. Contributor balances are deduplicated by verified route and currency. It is not a network-wide job index: automatic cross-device discovery and handoff of private job terms remain marketplace integration work. Local company execution stays available without issuing a token or funding a job.

The existing deadline/default policy below still applies, including the important distinction between submitted and unsubmitted disputed work. It must be visible before funding. All evidence hashes and evaluation records remain assertions; the escrow does not independently judge work quality.

The source review also found that failed native MintPool calls previously redirected holder/provider allocations to treasury. Collectibles, smart-agent mints and the royalty splitter now reserve configured-but-failed payments by original pool and category, expose permissionless `retryPoolFees`, and exclude those liabilities from administrative withdrawals or redistribution. A later pool configuration change cannot redirect them. Creator and treasury amounts remain unchanged. An intentionally unconfigured pool retains the older no-pool behavior and remains a production wiring failure.

Verified on 2026-09-27: `npm test` reports **623 passing contract tests**, including the new basket, token job and fee-recovery suites. `node --test test/v4-deployment-plan.test.mjs test/web3-production.test.mjs test/economy-abi.test.mjs` reports **26 passing checks**. Solidity sources compile and affected ABIs are regenerated through `scripts/compileContracts.js`. The largest changed deployed runtime is 16,650 bytes, below the EIP-170 limit. Robinhood offline preflight still reports **32 missing or invalid configuration requirements**, including canonical BONZAI, verified USDC, basket, escrow and DEX addresses. No deployment or financial transaction was executed.

## Storage and privacy

Private artifacts stay local. Publishable metadata and content use the configured decentralized storage path, while contracts store hashes, licenses, ownership, validation, and revenue routes. Private memory, generation, training, and company operations require no chain transaction.

## Deployment

`scripts/deploy-v4-economy.js` deploys the staking vault, currency basket, revenue router, contribution score oracle, contribution, dataset, model and evaluation registries, and job escrow. It requires explicit canonical BONZAI and USDC addresses, checks their 18/6 decimals, enables USDC in the basket and binds the canonical social-token factory. It wires MintPool holder fees and the job platform allocation, writes `deployments/v4-<chainId>.json` plus environment values, configures factory vaults and their basket currency-registration permissions, and disables legacy unvalidated model launches.

Production deployment requires canonical token/core addresses, verified RPC identity, complete wiring, a reviewed trusted service-time attestor, real-pool integration tests, and resolution of the contract issues below. A passing mock suite alone does not establish production readiness.

These Solidity changes require deployments built from the reviewed sources; changing the renderer ABI does not update an existing contract. The v4 deployment script checks chain identity, canonical collection capabilities, ownership of privileged wiring targets and MintPool vault compatibility before spending gas. It rejects an already-frozen vault rather than replacing the holder balance source. Historical content/factory/MintPool redeploy scripts and legacy Base/Arbitrum MVP scripts fail explicitly because their wiring is incompatible with this release.

## RC economy audit — 2026-09-26

The dated audit below records the earlier RC state. The 2026-09-27 currency-basket and social-token job changes described above supersede its new-holder reward and new-job settlement paths. Historical MintPool claims still use their original rules. Live-chain and native application acceptance remain separate release requirements.

**Release decision: blocked.** Robinhood is the requested target. The configured mainnet ID is 4663, matching [Robinhood's official network configuration](https://docs.robinhood.com/chain/connecting/). The checked environment has no configured canonical BONZAI token, core protocol or Uniswap deployments for this network. `npm run web3:verify:offline` intentionally reports 29 missing configuration requirements. The official public RPC hostname also failed DNS resolution during the live check; no live bytecode or wiring was certified. No transactions were submitted during this audit.

Scope: all top-level Solidity contracts; their deployment and ABI paths; economy configuration; wallet/network, staking, MintPool, service-time, companion/model market, revenue-route and payment services; corresponding financial UI. The comparison used 33 public pages from [the documentation index](https://docs.bonzai.sh/llms.txt), including ownership/network, contribution, wallet and approval references. This is a source and regression-test review, not an independent external audit or a proof that every economic design is safe.

### Corrected defects

| Area | Defect and corrected behavior |
| --- | --- |
| Uniswap factories | Replaced nonexistent `PositionManager.mint` calls with `modifyLiquidities` actions; fixed currency order, token/ETH initialization price, actual liquidity, locked recipient and allowance cleanup. Strict mocks reject the previous invented API. |
| Trading fees | New issuance uses hookless 1% pools and the shared immutable liquidity vault. The old hook is not required by production configuration. Principal stays locked and fee distributions are accounted once. |
| Revenue routes | Publisher namespaces prevent route-name theft; recipients and split parameters are fixed at registration; duplicate recipients and rounding defects are rejected/corrected. |
| Provider rewards | Unsigned self-reporting now reverts. Receipts require a configured trusted attestor, a unique ID, the current epoch, a registered provider and active stake. Claims start paused. |
| MintPool | Provider payouts cannot spend swept/recirculated epochs or exceed their allocation. Recirculation no longer double-counts liabilities. Holder registration requires stake locked through the entire following claim epoch, with a matching-token vault frozen after the first registration. Claims recheck the confirmed balance. Epochs start Monday UTC; closed/claimed rewards are not previewed as payable. |
| Legacy unlock | Both proceeds transfers must succeed atomically; retries cannot repeatedly divert a failed recipient's share to the other recipient. |
| Staking and registries | The chosen lock multiplier lasts through expiration. Empty proofs are rejected and editing verified metadata clears verification. |
| Companion wallet | A missing launch wallet uses and persists the same owner fallback for initial token allocation and future fees. |
| Job escrow | Unaccepted/undelivered work can expire to refunds; submitted work has a review deadline; either party can dispute or agree a split. Funding binds an independent arbitrator. Pull payments isolate rejecting recipients, and queued royalties have bounded retry/fallback recovery. Low-gas callers cannot force a working route into fallback. |
| Model identity | Issuance uses `(collection, tokenId)` and requires factory membership plus current NFT ownership. Transfers preserve publication rights without allowing duplicate issuance. Profile reads target the issued token. Legacy global-ID issuance is disabled. |
| Wallet credentials | OWS, legacy agent/master, attestation and Privy signing secrets use OS-protected encryption with readback verification before deleting legacy plaintext. Generic preference IPC cannot access secret namespaces. Receive-only legacy signing rejects before key access. Migration runs when credentials are accessed; unused old records are not claimed to be migrated. |
| Publication recovery | Local file checks commit artifact bytes; old size-only checks must be refreshed. The UI identifies publisher assertions and preserves a successful token launch if the separate revenue-route transaction fails. Invalid or duplicate royalty recipients fail instead of silently reallocating their shares; model trading-fee assignments bind the original token creator and vault beneficiary. |
| Payments | Disabled inference payment rails remain disabled. Approved x402 spending uses durable accounting and serialized authorization; ordinary local agent execution no longer reports a fictitious fee payment. |
| Desktop DHT | The installed DHT server's unbounded record-storage path is removed by forcing client mode, including relay/public-address configurations. The installed library's inbound-handler behavior is covered by a focused regression; outbound discovery remains available. |
| Network selection | Shared chain selection rejects unknown chains and cross-chain address fallback. Write paths switch and verify the wallet chain; RPC identity is queried instead of trusted from a static provider. |
| Financial UI | Staking forms require wallet/network/configuration. Rewards use economy-chain stake and persisted confirmation/block-gap status. Skill revenue reads and claims native ETH through the actual contract ABI; nonexistent USDC methods fail explicitly. Markets enumerate smart-agent, model and game factories on the economy chain, with search, sorting and a device-local watchlist. Prices use each base token’s highest-liquidity indexed pool on that chain. Charts contain only locally observed prices; USD totals disclose reporting-pool coverage. Registry, metadata and price-feed failures stay distinct from empty markets. Buy/sell shortcuts open the official Uniswap interface for quotes and wallet confirmation; no swap executes from the market explorer. |

### Unresolved launch gates

| Severity | Evidence | Required resolution |
| --- | --- | --- |
| High, advertised capability | `FineTuneTokenFactory.launchValidatedToken` retains its historical method name, but metadata and hashes are publisher assertions. The local check establishes file structure/identity, not model quality, training rights or provenance. | Keep the explicit publisher-asserted scope. Independent validation requires a reviewed verifier bound to the artifact and collection/token identity before that capability can be advertised. |
| High | `BonzaiServiceTime`: attestor authorization is explicit but a production validator for useful inference receipts is not delivered by the contract. | Keep claims paused until the validator, replay handling and operational signing boundary are reviewed. This is trusted attestation, not permissionless proof of compute. |
| Operational | Canonical Robinhood token/DEX/protocol addresses and live wiring are absent; mocks do not execute the actual PoolManager. | Verify chain, deployment provenance, bytecode, factory/vault/Permit2/PositionManager wiring, permissions and a real-pool mint/swap/claim on the intended chain or representative fork. |
| Medium | Contribution/dataset/model/evaluation registries store lineage IDs and licenses without proving upstream references, ownership or compatible permissions. | Treat records as assertions; enforce the advertised provenance policy in a validator and disclose its trust boundary. |
| Medium | `BonzaiUniswapHook.adminRecoverBeneficiaryFees` can redirect accrued fees. MintPool owners can replace ServiceTime (provider allocation authority) and the collectibles factory (activity-authorizer authority); routing/admin addresses remain mutable. | Define multisig/timelock and recovery authority before funding; immutable contributor shares do not remove all administrator trust. |
| Medium | Companion wallet setters lack new-wallet control signatures and transfers retain the old wallet. | Reconcile the interface with the [current ERC-8004 draft](https://eips.ethereum.org/EIPS/eip-8004); do not claim full interoperability before conformance tests. |
| Legacy accounting | MintPool's historical denominator includes registrants who cannot claim a given category. | Preserve already-accrued legacy claims. New holder allocations use basket checkpoints with the eligible denominator for each LVL, without category/self-mint dilution. |
| Operational | JobBoard currently uses local IPC and is experimental; it has no end-to-end onchain escrow adapter. | Do not expose funded job execution until the agreed arbiter, deadlines, evidence, withdrawals and recovery actions have wallet/UI integration and acceptance coverage. Contract recovery tests alone do not establish that product flow. |
| Operational | Native keychain lifecycle, packaged IPC, real OWS commands, cross-platform inference and the remaining UI acceptance matrix are not verified by browser/stub tests. | Complete native release acceptance; see the [UI/UX checklist](V4_UI_UX_RELEASE_CHECKLIST.md). |
| High, dependency gate | `npm audit --omit=dev --json` reports 135 dependency findings: 5 critical, 67 high, 49 moderate and 14 low. These are package/advisory classifications, not 135 confirmed application exploits. The desktop DHT storage path is mitigated, but this does not patch the dependency graph. | Upgrade and retest affected runtime stacks with reachability review. Do not apply broad forced major-version/downgrade changes as an untested launch fix. |

### Public documentation discrepancies

| Public source | Current behavior to reconcile |
| --- | --- |
| [Levels & Utility](https://docs.bonzai.sh/ownership-and-network/token-levels.md) | Documented last tiers are 50,000/100,000; configured and deployed-source defaults are 33,000/50,000. Do not silently change economic thresholds during deployment. |
| [Companion economy](https://docs.bonzai.sh/ownership-and-network/companion-economy.md) | Unlock-based free minting is described; the contract charges the mint fee. |
| [Uniswap markets](https://docs.bonzai.sh/ownership-and-network/uniswap-hooks.md) | Historical hook documentation must be updated to describe the new hookless 1% pools and permanent fee vault. |
| [Rewards](https://docs.bonzai.sh/ownership-and-network/reward-structure.md) and [provider rewards](https://docs.bonzai.sh/ownership-and-network/provider-rewards.md) | Historical holder registration requires a vault lock through the following claim epoch. The new basket replaces registration/self-mint conditions for future allocations with explicit commitment, LVL stake-time and separate currency balances. Paid-inference language needs reconciliation with free local/shared inference, disabled payment rails and attested contribution rewards. The registry has no recurring skill running fee; SkillOwnership and historical pool payouts remain native ETH. |
| [Registries](https://docs.bonzai.sh/proof-of-contribution/registries.md) and [token markets](https://docs.bonzai.sh/ownership-and-network/token-markets.md) | Stored hashes and publisher-submitted validation do not establish verified lineage or artifact quality. |
| [Agent wallets](https://docs.bonzai.sh/ownership-and-network/agent-wallets.md) | Autonomous spending is described, while this RC is configured to receive only. Signing must obey the configured capability boundary. ERC-8004 differences are listed above. |

### Dependency reachability review

The dependency scan above includes inherited severity and build/install tooling. No critical exploit was reproduced. The concrete DHT server exposure matches the [maintainer's unbounded record-storage advisory](https://github.com/libp2p/js-libp2p/security/advisories/GHSA-32mq-hpph-xfvr); BonzAI's default in-memory datastore makes memory exhaustion the relevant consequence. Forced client mode removes that inbound handler. The separate [peer-store identity advisory](https://github.com/libp2p/js-libp2p/security/advisories/GHSA-vrf4-mx87-p53w) remains a package-level concern: configured Identify checks the signer/payload/remote-peer identities, and no caller of the vulnerable `consumePeerRecord` API was found in the configured services. Client mode is not a patch for that issue.

| Critical package entry | Observed path and remaining work |
| --- | --- |
| `protobufjs 6.11.4` | Transitive TikTok dependency. The installed connector uses generated `@bufbuild/protobuf` decoders; attacker-controlled schema loading was not found. Upgrade/remove the obsolete dependency; see the [schema code-execution advisory](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg). |
| `form-data 2.3.3` / `request 2.88.2` | Deprecated legacy LUKSO/Truffle dependency chain, with no runtime application caller established. `request` inherits the critical severity. Remove the unused chain and update the separately affected root multipart dependency; [boundary-generation advisory](https://github.com/form-data/form-data/security/advisories/GHSA-fjxv-7rqg-78g4). |
| `shell-quote 1.8.3` | React Native/devtools and development command-runner dependencies. No app path from attacker-controlled `.op` tokens into shell execution was established. Update the affected chain; [maintainer advisory](https://github.com/ljharb/shell-quote/security/advisories/GHSA-w7jw-789q-3m8p). |
| `tar 4.4.19` | Legacy `swarm-js` archive extraction through Web3/Truffle; no BonzAI caller was found. Remove unused tooling or replace it with bounded extraction; [archive parsing advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw). |

Other affected direct dependencies include Axios, Drizzle, systeminformation and undici. Inspected usage did not establish their reported exploit preconditions, but compatible upgrades still need regression testing. `ffmpeg-static-electron-forge` performs downloaded ZIP extraction during installation, so its inherited `adm-zip` findings are an actual provisioning boundary requiring a maintained, integrity-checked replacement. PostCSS and appdmg findings concern build/packaging paths. No blanket `npm audit fix --force`, dependency downgrade or untested major upgrade was applied.

### Verification

Verified on 2026-09-26:

- `npm test`: 598 passing contract tests, including holder capital reuse/lock boundaries, 16 escrow recovery tests, collection identity/transfers, mocked V4 settlement, immutable routes, provider attestations and liability conservation.
- `npm run test:web3`: 60 passing service/security tests, including compiled ABI comparisons, network/configuration rejection, royalty routing, durable replay protection and 15 credential tests with injected storage/keychain stubs.
- `BONZAI_UI_URL=http://127.0.0.1:5178 npm run test:ui`: 18 passing UI tests including the browser keyboard/layout matrix. `npm run test:i18n`: 7 locales, 397 semantic keys and 5 catalog tests. `npm run build:vite`: successful main, preload and renderer builds.
- `python3 test/training-capabilities.test.py` and `python3 test/trained-model-validation.test.py`: 6 passing isolated actual-handler tests; `node --test test/v4-deployment-plan.test.mjs`: 2 passing deployment-plan tests with no transactions.
- Game runtime, connector and demo suites: 14 passing tests.
- `node --test test/p2p-dht-policy.test.mjs`: 2 passing no-network tests of forced client mode and the installed DHT's handler removal; main-process build repeated successfully after the mitigation.
- All 25 top-level Solidity sources and actual compiler dependencies match compiled inputs; 43 generated ABIs match artifacts. Largest runtime is 15,681 bytes, below EIP-170. One unused historical `IBonzaiSkillOwnership.abi.js` has no current source or callers and was left untouched.

Hardhat warns that the local Node 25 runtime is unsupported; use a supported CI runtime for release. Vite reports large bundles. Browser and mocked checks do not certify native lifecycle, model inference or deployed-chain execution. Both offline and online production preflight remain failing as described above.

Holder policy: liquid holdings and flexible stake do not earn legacy holder rewards. Registration snapshots an amount locked in the canonical vault at least until `epochEndTime(epochId + 1)`. A 30-day lock is sufficient for normal weekly epochs if it still covers that deadline; otherwise extend it. The confirmation block gap remains an additional condition, not evidence of continuous ownership.

Escrow policy: funding explicitly names the current owner as the expected arbitrator, who must differ from both job parties; that address is immutable for the job. Acceptance is due within 7 days, delivery within 30 days of acceptance, review within 7 days of submission and arbitration within 14 days of dispute. Anyone can finalize an expired deadline, but credits always belong to the parties. If arbitration expires, previously submitted work pays the worker and unsubmitted work refunds the employer. This deterministic fallback does not judge evidence; both parties must understand that trust and default policy. A gross worker award pays 2.5% platform fees and, when a contribution route exists, 2.5% contribution royalties; refunds have no fee. After 30 days of failed routing, the original base contributors receive the royalty pool through pull credits, bypassing optional router bonuses/fees. All liability classes are covered by conservation tests.

The deployment gate is a necessary configuration/wiring check. It does not resolve the economic and trust findings in this section. Keep the release blocked until those have explicit resolutions and regression evidence.
