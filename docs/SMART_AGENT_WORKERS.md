# Smart-agent worker execution

Local companions remain usable without an NFT, token, wallet or network. Public workers use minted identities and the existing peer network. No hosted directory, facilitator, new dependency or centralized execution service is required.

## Discovery and authorization

In a company's **Team → Peer workers**, refresh connected/LAN peers, or authorize a minted local agent under **Manage my workers**. Discovery reads signed advertisements from the existing health protocol. Calls and media chunks use the existing inference protocol (`kind: bonzai-worker`). Private mode neither advertises workers nor sends/serves worker requests. Consumer mode can request work; Provider mode serves it. Non-provider health responses do not expose installed model names.

The NFT owner signs a seven-day delegation containing collection, chain, token ID, control epoch, provider peer, capabilities and workflow IDs. The provider verifies live ownership and epoch before execution. A grant can be signed for another device; that operator imports it against their local representation of the NFT. No wallet private key, company memory, chat history or credentials accompany the grant. The owner can unpublish locally or revoke grants onchain. NFT transfer and execution-wallet changes invalidate previous grants.

Worker grants and request envelopes support EOA signatures and onchain ERC-1271 verification on the configured chain. Paid job briefs and token EIP-3009 authorizations retain their existing EOA signature requirements; contract-wallet envelope support does not change those payment paths.

## Paid requests and agent-to-agent use

1. Discover a verified worker, choose a capability and inputs, then review its social-token job quote. Funding commits the exact execution hash and provider peer, in addition to the existing price, token and acceptance terms.
2. The employer explicitly sends the signed agreed brief from **Smart-agent jobs**. Receipt is not acceptance. The NFT owner accepts the funded job using the existing approved transaction flow. Delegating compute does not delegate custody or transaction authority; operators do not automatically accept jobs or withdraw funds.
3. Refresh after acceptance and select **Run accepted job**. Execution requires the signed employer brief, live accepted/unexpired escrow, correct worker token and exact committed inputs. A named requesting agent wallet can be authorized in the funded terms; it cannot change the inputs or spend additional funds.
4. Company actions use `smartAgent.runWorker` with `worker: { key, peerId }`, `capability`, `input`, and `job` (the signed brief). The harness requires owner approval. It assigns a deterministic request ID from its task/step, polls the saved ticket, imports media, and adds results to company deliverables. Optional `callerAgent` is checked against its live owner/execution wallet.
5. A receipt is a durable execution ticket. Status is `running`, `completed`, `failed`, `requires_input` or `interrupted`. Retries reconcile the existing ticket. One paid job cannot create a second execution on the chosen provider. Restart marks interrupted work for review rather than silently replaying it.
6. Provider execution results are visible under **Work on this device**. Review delivery submission through the existing approval flow, or copy compact delivery evidence containing text and artifact hashes. Receiving output does not settle payment. Refunds, disputes and settlement remain the existing escrow mechanisms.

Old manually funded briefs without an execution commitment still support manual backlog assignment; they do not authorize the new automatic worker-execution route.

## Capabilities and media

Workers reuse the local Create adapters for text, image, audio, music, video, vision, 3D source, skills and configured training. Assigned headless workflows reuse company adapters. Meditation Forge reuses the existing script/narration/cover pipeline and returns its actual media. Public workflow grants filter out interactive-only workflows. An unsupported interactive execution reports `requires_input`; it does not claim a completed deliverable.

3D jobs construct built-in Three.js geometry in an isolated, preload-free Electron renderer, then deliver source and GLB. Network and file access are denied during generated code execution; a main-process timeout destroys hung renderers. This does not provide the full interactive game runtime. Training requires owner-chosen local mode/model/dataset defaults and delivers eligible weights and configuration, excluding datasets, logs and symlinks. Interactive workspaces still require dedicated remote adapters.

Media is copied from generation output directories into the existing content-addressed blob store. Remote requests never resolve arbitrary local paths. Deliveries expose job-scoped manifests and 192 KiB chunks; the recipient validates SHA-256 and stores a local blob used by company deliverables. Requests are limited to 2 MiB, text to 1 MiB and a standard media delivery to 128 MiB. Training delivery is limited to 32 GiB and 128 files. Incoming files stream through bounded IPC chunks to disk, with SHA-256 verification before blob registration. URLs and local paths supplied by callers are rejected; remote inputs do not authorize filesystem or connector access. 3D JavaScript is evaluated only in the isolated export renderer; receiving its source does not execute it in the recipient workspace.

The original customer and the snapshotted NFT owner can retrieve a delivery by signing a request. A later NFT buyer does not inherit access to historical customer outputs. Provider receipts persist in the local SQLite agent_worker_runs table, with transactional migration from the previous settings journal. There is no 1,000-run cutoff. Paid-job uniqueness survives restarts. Back up the database and blobs together; company-only exports do not migrate worker execution receipts.

## Ownership and revenue

`BonzaiSmartAgents.controlEpoch` changes on personalization, transfer, execution-wallet changes and explicit revocation. Transfer clears the execution wallet. The buyer can bind their own wallet after issuance without changing the token, metadata or vault-held liquidity position. Unissued reserves follow the NFT.

Existing escrow jobs retain their snapshotted worker and payouts. Previously distributed tokens, including the initial 4% allocation, remain in their holders' wallets; ERC-721 transfer cannot move another wallet's ERC-20 balance or private keys. New job quotes use the current collection owner/execution wallet. `CompanionToken.agentWallet` identifies the wallet at issuance, not current NFT ownership; consumers must read the collection for current control.

## x402 on Robinhood

Robinhood is EVM chain 4663 (`eip155:4663`); see [Robinhood connecting documentation](https://docs.robinhood.com/chain/connecting/). [The x402 exact specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) supports EIP-3009 tokens and Permit2 for other ERC-20s. [Coinbase's hosted facilitator table](https://docs.cdp.coinbase.com/x402/seller/facilitator) does not list Robinhood as of the 2026-10-04 review. [Hood402](https://hood402.com/docs) documents a third-party Robinhood/USDG implementation; its existence does not verify BonzAI's social-token deployments.

New `CompanionToken` deployments support native EIP-3009 signed transfers/cancellation with chain-bound EIP-712 domains and one-use nonces. `x402Exact.js` implements v2 exact requirements, signing, onchain verification/simulation and settlement through a caller-supplied local relayer. No Permit2 approval, external facilitator account or new dependency is required for these new tokens. The existing legacy ETH receipt implementation remains separate; it is not standard x402 v2 exact.

These x402 primitives do not expose a public HTTP facilitator or automatically charge worker requests. Workers continue to use social-token escrow so review, fees and disputes are preserved. A future HTTP integration must not replace escrow with direct payments silently. Existing already-deployed tokens do not gain EIP-3009 retroactively.

## Validation and deployment

- `node --test test/agent-worker-host.test.mjs test/agent-worker-media.test.mjs test/worker-job-authorization.test.mjs test/company-runtime-host.test.mjs test/company-execution.test.mjs test/company-persistence.test.mjs`
- `BONZAI_PEER_TEST=1 node --test test/smart-agent-peer.test.mjs` tests two actual encrypted loopback peers and binary integrity. The generation adapter and chain identity are test doubles in this transport test.
- `BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/agent-workers-panel.browser.test.mjs test/smart-agent-worker.browser.test.mjs`
- `npx hardhat --config hardhat.config.cjs test test/AgentX402.test.js test/AgentProvisioning.test.js test/BonzaiTokenJobs.test.js test/BonzaiJobEscrow.test.js`
- `node --test test/worker-journal.test.mjs test/worker-transfers.test.mjs`
- `BONZAI_LIVE_WORKER=1 node --test test/worker-live-generation.test.mjs` uses installed local language/audio/image models, without downloads.
- `npx electron test/worker3d-electron.mjs` requires the local Vite fixture on port 5187; verifies export isolation and timeout.
- `npx hardhat --config hardhat.config.cjs test test/WorkerLifecycle.test.js` validates the local contract-to-worker lifecycle with simulated provisioning infrastructure.
- `npm run build:vite`

Main/preload changes require restarting BonzAI. Robinhood collection/factory/escrow/NVDA addresses can remain unset during local implementation; public onchain identity verification fails closed until configured. No real funds were moved. An opt-in local meditation run validates real installed models. The suite does not certify a production Robinhood deployment, OpenSea scheduling, model availability on other devices, or every interactive workflow. Deploy the updated contracts, configure addresses/RPC, and validate the live mint → issue → accept → execute → deliver → settle/refund cycle before enabling paid public use.
