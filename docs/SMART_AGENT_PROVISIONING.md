# Smart Agent minting and setup

## Local creation lifecycle

Identity and portrait generation have one application-scoped activity record. Navigation detaches the view without cancelling the request; reopening Create Agent restores its prompt, preview and current stage. Completed profiles merge into the latest local roster under the companion storage lock, without a manual Save action. A failed save retains the completed profile for Retry completion. App shutdown still interrupts inference; this is navigation continuity, not process-restart recovery.

My Agents lists local profiles independently of wallet configuration and enriches verified holdings without inventing NFT ownership. Portrait regeneration updates the local record; publishing an onchain identity remains a separate wallet action. Smart Workflows routes local staffing through the existing team role editor. Public sessions default to automatic replies and a generation limit of zero (unlimited), but activation and platform approval remain explicit.

## Deployment status

No BonzAI contracts have been deployed. There is one planned Smart Agent collection and one social-token factory, configured through `SMART_AGENTS` and `AGENT_TOKEN_FACTORY`. There is no collection migration or second deployment to preserve. The obsolete Arbitrum/Base deployment entry points have been removed. Contract design and OpenSea integration remain under review; nothing here constitutes a live drop.

## Agreed product flow

1. **OpenSea event:** users purchase an unpersonalized Smart Agent slot in the BonzAI collection. Its public placeholder artwork and metadata explain that creation takes place in BonzAI Desktop.
2. **After the event:** remaining supply stays mintable directly in Desktop, in the same collection. OpenSea and Desktop must share supply accounting and per-wallet limits. The scheduled event end must not expire the ability to mint remaining supply.
3. **Connect in Desktop:** Smart Agents → My Agents reads the connected wallet's actual onchain holdings. An unpersonalized slot offers **Set up agent**, which opens creation with that slot selected.
4. **Generate:** describe the role; inference creates the profile, personality and portrait. Generation is local by default and is not an onchain operation. The slot is revalidated before generation and carried into the generated local record.
5. **Review and save:** revise the generated identity and save it locally. A failed generation or rejected publication does not consume the slot again.
6. **Publish identity:** review public metadata, upload approved profile/artwork and sign the identity update. Never publish private prompts, model weights, company memory or keys by implication. Public content links must remain retrievable outside Desktop, including by OpenSea.
7. **Launch social token:** separately review and confirm token issuance using the slot's reserve. This is not performed automatically by inference or saving. The resulting token appears in My Agents, with reported market cap where indexed.
8. **Augment:** attach licensed tokenized content, model capabilities and service fees. Local creation remains usable without a wallet or paid publishing.

## Economics retained for contract review

The present prototype uses 10,000 slots, 2 ETH per mint, three lifetime mints per wallet and a 1 ETH issuance reserve per slot. The reserve follows the slot and is retained until issuance. **No refund path is required by the operator.** The other 1 ETH accrues as proceeds. SeaDrop fees must be accounted for without underfunding reserves.

Issuance atomically converts the reserve through the configured native ETH/NVDA route and creates a social token and permanently held LP position. Initial supply is one billion: 4% to the configured agent wallet and 96% budgeted for liquidity. No target market cap is promised. Failed issuance reverts and restores the reserve. Canonical NVDA, transfer eligibility, routes and actual pool operations still need target-chain validation. See [locked liquidity](LOCKED_LIQUIDITY.md).

## Identity: ERC-8004 on Robinhood

The [ERC-8004 maintainers](https://github.com/erc-8004/erc-8004-contracts) publish Robinhood mainnet deployments:

- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

These are published deployment references, not evidence that this application has verified deployed bytecode or integrated those registries. Verify chain 4663, bytecode, implementation and supported interfaces before configuring contracts. ERC-8004 is therefore part of the intended design, not an unavailable-network exception.

The existing `BonzaiSmartAgents` prototype is ERC-721 with custom identity methods. Metadata shaped like an ERC-8004 registration does not register an agent. The integration must bind each collectible to one canonical registry agent ID and publish the full registry reference. The two IDs need not be equal.

**Proposed design for joint review:** keep the BonzAI collection as the transferable collectible and hold its canonical registry identity under a contract controller. All identity updates and execution authorization derive from the current collectible owner. The canonical identity must not be independently transferable by a previous owner. Review external registry ownership/tooling implications before implementation. The alternative is using the canonical registry NFT directly, which changes the branded OpenSea collection and primary-drop model.

Current prototype transfers clear the execution wallet and increment the control epoch, revoking old worker grants. Preserve that behavior across registry integration. Seller keys, existing token balances and private data do not transfer automatically. Already-funded jobs retain their snapshotted settlement terms. Wallet replacement requires proof of control when setting the ERC-8004 agent wallet.

## Contract work remaining

- Implement and validate the OpenSea primary-drop adapter and fee accounting. OpenSea supports Robinhood trading, but the current contract only implements direct `mintSlots`, not `mintSeaDrop`. Never forward an ordinary mint as an adapter: current mint ownership and limits use `msg.sender`.
- Finalize canonical-registry binding, transfer behavior, wallet proof and metadata updates before deploying.
- Finalize sale-phase policy. The prototype direct mint remains available after `mintEnd`; this is the promoted event end, not a supply expiry. Venue exclusivity during the promoted event is not yet enforced.
- Use a single collection/factory in escrow, rewards, skill ownership and market discovery. Production preflight and economy deployment inputs now target the single pair.
- Verify metadata/artwork on OpenSea and rehearse mint → setup → publication → issuance → transfer → paid job → payout/claim against the actual target contracts.
- Review and approve deployment addresses, economics, fees and event dates before deployment or publication.

## Verification

```sh
npx hardhat --config hardhat.config.cjs test test/AgentProvisioning.test.js
node --test test/agent-slot-mint.test.mjs test/web3-production.test.mjs test/v4-deployment-plan.test.mjs
npm run web3:verify:offline
```

Local tests cover reserve accounting, ownership, token issuance rollback, transfer revocation, and continued minting after the event. They do not demonstrate live OpenSea integration or Robinhood liquidity. Missing deployment addresses correctly fail the production preflight.

References: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), [SeaDrop](https://github.com/ProjectOpenSea/seadrop), [OpenSea chains](https://support.opensea.io/en/articles/8867082-which-blockchains-are-compatible-with-opensea), [Robinhood RPC](https://docs.robinhood.com/chain/connecting/).
