# BonzAI and Robinhood: Integration and Ecosystem Plan

Status: implementation in progress  
Owner: BonzAI product, protocol, and partnerships  
Target: staged release after security, legal, and funded mainnet verification  
Last reviewed: 2026-07-23

## Executive Decision

BonzAI should pursue Robinhood through one coherent product thesis:

> BonzAI is the private, locally powered agentic team layer for Robinhood accounts and Robinhood Chain.

The integration has two mutually reinforcing parts:

1. **Robinhood Portfolio Council:** a local multi-agent investment team using Robinhood's official Trading MCP.
2. **Robinhood Chain economy:** Robinhood Chain becomes the default execution and product-economy network for new BonzAI activity.

Robinhood Chain is now the default configured economy target. Production write actions remain unavailable until the contract, bridge, audit, and deployment gates in this document pass. Ethereum remains the canonical origin of `$BONZAI`, the trustless bridge origin, and the fallback security anchor.

## Implementation Status

Implemented:

- Robinhood Chain mainnet (`4663`) and testnet (`46630`) configuration.
- Default economy selection, AppKit wallet support, balance aggregation, RPC fallbacks, and Blockscout verification targets.
- Official Robinhood Chain USDG and WETH addresses.
- Secure Desktop Trading MCP client with operating-system encrypted OAuth state.
- Runtime tool discovery and deny-by-default mutation classification.
- Featured Portfolio Council marketplace skill with deterministic mandate controls.
- Shared dark-theme contrast correction across Desktop, Web, and BonzAI+.
- GitBook product, Agentic Trading, chain-economy, and architecture documentation.

Still gated:

- Canonical `$BONZAI` bridge deposit and verified L2 token address.
- Testnet and mainnet protocol deployment, wiring, multisig transfer, source verification, audits, and smoke tests.
- Production order execution until Robinhood OAuth and exact-payload approval are validated in signed release builds.
- AMM-dependent companion/model token factories until Robinhood Chain Uniswap deployment compatibility is verified.

This is not a Robinhood endorsement or token-listing plan. Robinhood Chain is permissionless. Deploying or bridging `$BONZAI` does not make the asset available in the Robinhood brokerage or crypto product.

## Strategic Fit

Robinhood is opening two surfaces at the same time:

- Its Trading MCP allows third-party agents to inspect accounts, analyze markets, review orders, and place supported trades in a dedicated Agentic account.
- Robinhood Chain is a live EVM-compatible Arbitrum L2 focused on financial assets, account abstraction, wallets, and onchain markets.

BonzAI contributes something Robinhood does not provide itself: private local inference, configurable specialist teams, independent policy checks, durable memory, multimodal reporting, and onchain ownership.

The integration should lead with utility and safety. A token-first approach would make BonzAI look opportunistic and reduce the probability of a serious partnership conversation.

## Product 1: Robinhood Portfolio Council

### User promise

Connect a Robinhood Agentic account and assign a local team to research, challenge, preview, execute, and report against a user-defined investment policy.

### Default team

| Role | Responsibility | Trading authority |
|---|---|---|
| Research Analyst | Fundamentals, market data, watchlists, scans, and thesis construction | Read only |
| Portfolio Strategist | Allocation proposals, rebalancing plans, and scenario analysis | Read only |
| Risk Officer | Concentration, liquidity, sizing, drawdown, and policy checks | Veto only |
| Execution Specialist | Order review, submission, cancellation, and status monitoring | Explicitly approved actions |
| Performance Reporter | Decision journal, realized P&L, attribution, and policy deviations | Read only |

These are roles, not five mandatory model processes. The user may run them sequentially through one local model or concurrently where hardware permits.

### Initial workflows

- Explain current portfolio exposure and concentration.
- Build a watchlist from user-defined criteria.
- Produce bull, bear, and invalidation cases for selected securities.
- Draft a rebalance and compare before/after risk.
- Backtest a user-defined rule using available historical data.
- Review an equity or options order and surface pre-trade warnings.
- Execute an approved order within the dedicated Agentic account.
- Produce a daily or weekly activity and performance brief.

The first release must not advertise unattended high-frequency trading, guaranteed returns, personalized financial advice, tax advice, or assets that Robinhood's discovered MCP tools do not support.

## Trading MCP Architecture

BonzAI currently exposes local skills for MCP use but does not contain a generic remote MCP client. Build that platform capability first.

```text
Vue Portfolio Council
        |
        | typed IPC
        v
Electron main process
  RemoteMcpManager
  OAuth/session vault
  tool allowlist
  policy engine
  approval ledger
        |
        | Streamable HTTP MCP
        v
https://agent.robinhood.com/mcp/trading
```

### Implementation boundaries

- Use the official Model Context Protocol SDK and Streamable HTTP transport.
- Keep OAuth tokens and MCP sessions in the Electron main process.
- Store credentials with Electron `safeStorage`; never expose bearer tokens to the renderer or local LLM.
- Hard-allowlist the Robinhood MCP origin. Reject redirects or tool-provided URLs outside approved Robinhood origins.
- Discover tools dynamically after authentication. Do not reproduce Robinhood's private request schemas.
- Snapshot tool names and schemas per session so the approval screen matches the actual call.
- Treat unknown or changed tools as unavailable until classified.
- Send only the minimum tool output required for the current role.
- Redact Robinhood account numbers from model context, logs, exports, screenshots, and demos.
- Provide Disconnect and Revoke controls that clear local credentials and end the MCP session.

### Tool policy

| Tool class | Default | Required control |
|---|---|---|
| Account and portfolio reads | Allowed after connection | Visible data-scope disclosure |
| Market data and scanners | Allowed | Source timestamp and stale-data warning |
| Watchlist mutation | Ask once per workflow | Preview changed symbols |
| Order review/simulation | Allowed | No execution side effect |
| Place, replace, or cancel order | Blocked by default | Fresh human confirmation for exact payload |
| Unknown future Robinhood tool | Blocked | Product and security classification |

### Local policy object

The user can define:

- Maximum capital allocated to the Agentic account.
- Maximum order notional and maximum daily notional.
- Allowed asset classes, symbols, order types, and trading sessions.
- Maximum position concentration and sector concentration.
- Options permissions, maximum premium, and maximum defined loss.
- Minimum cash reserve.
- Mandatory order preview and confirmation policy.
- Cooldown after repeated losses or rejected orders.
- Daily loss and drawdown stop.
- Expiry date for the agent mandate.

Policy enforcement happens deterministically before the LLM tool call reaches Robinhood. The LLM may explain a rejection but cannot override it.

### Audit model

Each material action records:

- User mandate version and hash.
- Role and local model that proposed the action.
- Source timestamps and Robinhood tool calls used.
- Proposed order and Robinhood review response.
- Risk Officer verdict and policy-engine verdict.
- Exact payload approved by the user.
- Robinhood execution response and final status.

The local audit log is authoritative for private reasoning. An optional onchain receipt may commit a hash of the mandate and outcome without publishing account data, strategy text, positions, or order details.

## Product 2: Robinhood Chain as Default Economy

### Recommended chain posture

| Function | Canonical network after migration |
|---|---|
| `$BONZAI` origin and maximum-supply authority | Ethereum |
| Default BonzAI application network | Robinhood Chain |
| Active staking and access levels | Robinhood Chain |
| New content NFT minting | Robinhood Chain |
| New companion minting and ERC-8004 identity | Robinhood Chain |
| New companion and model token issuance | Robinhood Chain |
| Skill marketplace purchases | Robinhood Chain |
| Company team packages and service sales | Robinhood Chain |
| Existing Ethereum assets and withdrawals | Ethereum, indefinitely supported |
| Permanent model bytes | Arweave plus IPFS/Filecoin |

Robinhood Chain mainnet is chain ID `4663`; testnet is `46630`; gas is ETH. Production RPC traffic must use a provisioned provider rather than relying only on the rate-limited public endpoint.

### Why Ethereum remains the token origin

- The existing Ethereum token remains the single supply authority.
- The Arbitrum canonical bridge can create the canonical L2 representation without issuing a second unrelated `$BONZAI`.
- Ethereum provides an independently legible origin for exchanges, auditors, wallets, and users.
- Returning to Ethereum remains possible through the standard challenge-period withdrawal path.

Never deploy an independently mintable Robinhood Chain `$BONZAI`. Resolve and verify the canonical L2 token address through the gateway router, publish the mapping, and continuously reconcile L1 escrow against L2 supply.

## Economy Migration by Capability

### Staking and access

Deploy a new `BonzaiStakingVault` on Robinhood Chain using the canonical bridged `$BONZAI`. Preserve the 1K, 5K, 10K, 25K, 33K, and 50K thresholds unless governance deliberately changes them.

Do not copy Ethereum stake balances into the Robinhood vault. A snapshot would let the same tokens produce utility on both chains. Instead:

1. Stop new Ethereum-only utility accrual at an announced cutover block.
2. Keep Ethereum unstaking and withdrawals available indefinitely.
3. Let users withdraw, bridge canonical `$BONZAI`, and stake on Robinhood Chain.
4. Offer an optional, capped migration incentive without duplicating principal or historical rewards.
5. Show both positions during the migration period, but calculate new product access from Robinhood staking after cutover.

### Content NFTs

- Existing Ethereum content NFTs remain valid and visible.
- New content minting targets Robinhood Chain after cutover.
- Global identity is `(originChainId, contractAddress, tokenId)`, never `tokenId` alone.
- Metadata and media remain permanently retrievable according to the decentralized model-distribution and content-storage policy.
- Do not bridge historical NFTs in the first release. Aggregate them in the UI instead.

### Companions

- Existing Ethereum companions remain valid identities and revenue recipients.
- New companion mints use Robinhood Chain and create Robinhood-compatible agent wallets.
- Companion wallets remain receive-only for protocol revenue in this release.
- Companion minting must preserve the human-only, age-validation, per-wallet cap, and ERC-8004 rules.
- Cross-chain identity links must be explicit attestations, not name matching.

### Companion and model tokens

- Deploy factories only after validating the available Robinhood Chain AMM contracts and hook compatibility.
- Do not assume the existing Ethereum/Base Uniswap V4 hook addresses or deployment mechanics transfer unchanged.
- Preserve fixed supply, atomic issuance, locked liquidity, ownership checks, and revenue routing.
- Prefer canonical `$BONZAI` and USDG quote pools where liquidity and oracle support are adequate.
- Publish pool addresses, initial price assumptions, liquidity ownership, fee routing, and lock proofs.
- Fine-tuned and abliterated model tokens still require validated permanent artifacts and complete provenance.

### Marketplace and company teams

- Deploy the skill registry, ownership registry, and revenue router on Robinhood Chain.
- Price user-facing packages in USDG where stable denomination matters; optionally accept ETH through a deterministic quote path.
- Company connectors and ordinary local team operation remain offchain and private.
- A sale can issue an onchain license, entitlement, or revenue route; it must not publish customer data or connector credentials.
- Refund, dispute, tax, and invoicing behavior must be defined before company-team sales are enabled.

### Mint pools and royalties

- Deploy Robinhood-native pools and royalty routing rather than forwarding every small payment to Ethereum.
- Preserve contribution ownership separately from staking bonuses.
- Include service-time provider rewards without charging users for inference.
- Define the treatment of legacy Ethereum pool epochs before cutover.

## Robinhood Chain Application Work

### Configuration

- Add `robinhood` and `robinhoodTestnet` network definitions.
- Extend economy-chain maps to `4663` only after all required contract addresses are configured.
- Add chain-specific environment variables for every deployed protocol contract.
- Add Robinhood Chain to Reown, embedded-wallet, agent-wallet, and balance aggregation paths.
- Add production RPC, fallback RPC, explorer, canonical bridge, gateway routers, USDG, WETH, and verified AMM addresses.
- Keep testnet assets and addresses impossible to load in a production build.

### Product surfaces

- Wallet and network selector.
- Ownership and staking.
- Content and companion minting.
- Markets and issued-token detail.
- Skill marketplace and company team purchases.
- Mint pool and royalty claims.
- Robinhood Stock Token discovery, pricing, corporate-action context, and portfolio intelligence.
- Robinhood MCP connection and mandate controls.

Brokerage data and Robinhood Chain wallet data are separate surfaces. The UI must never imply that an Agentic brokerage account controls, custodies, or automatically corresponds to a Robinhood Chain wallet.

## Contract Deployment Matrix

| Contract or subsystem | Robinhood action | Gate |
|---|---|---|
| Canonical bridged `$BONZAI` | Resolve through L1/L2 gateway routers | Supply reconciliation |
| `BonzaiStakingVault` | Deploy | Threshold and migration tests |
| `BonzaiRevenueRouter` | Deploy and wire | Recipient and share invariants |
| Contribution, dataset, model, evaluation registries | Deploy | Permanent metadata requirements |
| Contribution score oracle | Deploy | Signer and evidence policy |
| Collectibles factory and collections | Deploy | Six-media preview and mint tests |
| Companion NFT | Deploy | ERC-8004, wallet, cap, identity tests |
| Companion/model token factories | Adapt and deploy | AMM and liquidity-lock audit |
| Skill registry and ownership | Deploy | Package hashes and payout tests |
| MintPool and royalty splitter | Deploy and wire | Epoch and claim invariants |
| Service time | Deploy | Free-inference reward tests |
| Job escrow | Defer | Remains experimental |

All contracts require source verification, deterministic deployment records, multisig ownership, timelocks where appropriate, independent audit, and funded mainnet smoke tests.

## Cutover Strategy

### Stage 0: no economic change

- Add Robinhood Trading MCP support.
- Add Robinhood Chain wallet, read-only Stock Token data, and testnet support.
- Produce the public demo and partnership package.

### Stage 1: parallel chain deployment

- Bridge a controlled treasury amount of canonical `$BONZAI`.
- Deploy and verify the protocol on testnet, then mainnet.
- Keep Ethereum as the production economy while Robinhood contracts run in restricted beta.

### Stage 2: opt-in Robinhood economy

- Let selected users stake, mint, and purchase on Robinhood Chain.
- Reconcile bridge supply, revenue routes, pool accounting, and indexer behavior daily.
- Keep Ethereum minting open until migration metrics and audits pass.

### Stage 3: default-chain cutover

- Set `VITE_BONZAI_ECONOMY_CHAIN_ID=4663` in production.
- Route new staking utility, mints, issuance, and sales to Robinhood Chain.
- Preserve discovery, claims, and withdrawals for historical Ethereum assets.
- Publish a signed deployment manifest and migration guide.

### Stage 4: ecosystem expansion

- Add community liquidity and additional bridge routes only after canonical bridging is stable.
- Pursue wallet discovery, ecosystem directories, grants, buildathons, and formal partnership conversations.
- Discuss Robinhood product support or token listing only after usage, security, and liquidity are measurable.

## Release Gates

Robinhood Chain cannot become the default unless all gates pass:

1. Robinhood MCP authentication, reconnect, revocation, and tool discovery pass in packaged Desktop builds.
2. Every trading mutation is deterministically classified and approval-gated.
3. Account identifiers are absent from model context, telemetry, logs, screenshots, and exports.
4. Canonical `$BONZAI` L1 escrow equals the recognized L2 supply.
5. All protocol contracts are verified, wired, independently audited, and multisig-controlled.
6. Staking thresholds and access checks agree onchain and in every application.
7. All six content types and companion mints render and mint correctly.
8. Token factories create valid pools with permanently locked liquidity and correct fee routes.
9. Skill and company-team purchases settle and distribute correctly in USDG/ETH.
10. Ethereum historical assets, claims, and withdrawals remain accessible.
11. Desktop, Web, and BonzAI+ recognize chain `4663` consistently.
12. Legal review covers brokerage-agent presentation, financial promotions, token bridging, staking, sales, and jurisdiction restrictions.

## Risk Register

| Risk | Consequence | Mitigation |
|---|---|---|
| Robinhood Chain is operationally young | RPC, indexing, bridge, or ecosystem instability | Parallel beta, multiple providers, disaster recovery, delayed default cutover |
| Sequencer, validator, or Security Council concentration | Liveness or governance actions outside BonzAI control | Preserve Ethereum token origin, monitor governance, keep L1 exits documented |
| Canonical bridge or retryable-ticket failure | Delayed or stranded user migration | Small initial limits, retry tooling, reconciliation, explicit seven-day withdrawal UX |
| Liquidity fragmentation across Ethereum, Arbitrum, Base, and Robinhood | Poor execution and confusing prices | Declare one canonical origin, one default market, publish verified addresses, avoid duplicate tokens |
| Robinhood MCP changes tools or schemas | Broken workflows or unsafe reclassification | Runtime discovery, schema snapshots, unknown-tool deny policy, contract tests |
| Agentic Trading eligibility is jurisdiction-limited | Feature unavailable to many BonzAI users | Capability detection, honest regional messaging, keep Robinhood Chain features independent |
| Product appears to provide investment advice | Regulatory and partnership risk | User-authored mandates, neutral analysis, explicit disclosures, legal review, no return claims |
| Public chain deployment is mistaken for Robinhood endorsement | Trademark and reputational risk | Precise language and written approval before co-branding |
| `$BONZAI` factory or AMM assumptions do not hold | Broken issuance, locks, or fee routing | Dedicated compatibility audit and no-go gate before deployment |

## Partnership Package

Robinhood outreach should contain evidence, not aspiration:

1. A working Portfolio Council connected through the official Trading MCP.
2. A concise architecture diagram showing local inference and deterministic risk controls.
3. A 60-90 second cinematic film and a separate unedited product demo.
4. Verified Robinhood Chain deployments and a public deployment manifest.
5. A bridge and `$BONZAI` supply reconciliation dashboard.
6. Security documentation for OAuth, account-data handling, approvals, and revocation.
7. Usage metrics: connected Agentic accounts, analyses, reviewed orders, approval rate, policy rejections, and zero unauthorized execution incidents.
8. A specific partnership ask: technical review, ecosystem inclusion, co-marketing consideration, and discussion of deeper wallet/token support after demonstrated adoption.

Use Robinhood's partnership form, Robinhood Chain developer channels, relevant Arbitrum programs, and public technical launch material. Do not use Robinhood trademarks in a way that implies endorsement before written approval.

## Delivery Phases

### Phase A: foundation

- Generic remote MCP client and secure OAuth/session vault.
- Robinhood Chain mainnet/testnet configuration.
- Read-only Stock Token and wallet experience.

### Phase B: controlled product beta

- Portfolio Council roles and policy engine.
- Order review and explicit execution approval.
- Robinhood Chain testnet protocol deployment.

### Phase C: economic beta

- Canonical `$BONZAI` bridge and reconciliation.
- Robinhood mainnet protocol deployment.
- Opt-in staking, minting, issuance, marketplace, and company-team sales.
- Independent contract and integration audit.

### Phase D: default-chain release

- Robinhood Chain becomes the production economy default.
- Ethereum historical support remains available.
- Partnership package and public technical launch.
- Formal ecosystem and product discussions with Robinhood.

## Success Metrics

- Robinhood MCP connection completion and reconnect success.
- Percentage of sessions processed entirely with local inference.
- Order reviews, approvals, rejections, and policy violations prevented.
- No unauthorized trade or credential-exposure incidents.
- Robinhood Chain active wallets, stakes, mints, sales, and claims.
- Canonical bridge reconciliation with zero unexplained supply variance.
- Partnership responses, ecosystem placement, developer engagement, and qualified referrals.

## No-Go Conditions

- Remote MCP authorization cannot be isolated from the renderer.
- BonzAI cannot reliably distinguish read, review, and execution tools.
- A local model can bypass deterministic order policy.
- Canonical bridged `$BONZAI` supply cannot be independently reconciled.
- Robinhood AMM infrastructure cannot preserve token-factory liquidity and fee invariants.
- Existing Ethereum users would lose withdrawal, claim, or discovery access.
- Legal review rejects the intended brokerage-agent, staking, token, or sales presentation.

## Official References

- [Robinhood Agentic Trading](https://robinhood.com/us/en/agentic-trading/)
- [Robinhood Agentic Trading overview and MCP setup](https://robinhood.com/us/en/support/articles/agentic-trading-overview/)
- [Robinhood Trading MCP tools](https://robinhood.com/us/en/support/articles/trading-with-your-agent/)
- [Robinhood Chain overview](https://docs.robinhood.com/chain/)
- [Robinhood Chain connection details](https://docs.robinhood.com/chain/connecting/)
- [Robinhood Chain bridging](https://docs.robinhood.com/chain/bridging/)
- [Robinhood Chain Stock Token APIs](https://docs.robinhood.com/chain/stock-token-apis/)
