# Smart-agent slot provisioning

## Deployment boundary

`BonzaiSmartAgents`, `BonzaiAgentTokenFactory`, and `BonzaiNvdaSwap` implement a new deployment path. They do not upgrade an existing `BonzaiCompanions` collection. Legacy deployment scripts still target the previous collection. The renderer and chat commands no longer offer atomic mint-and-token launches. Reserved token issuance has a separate, fail-closed configuration; do not substitute a legacy contract address. Scheduled-drop minting still requires integration before launch. Owned successor slots are discovered separately from legacy agents and can publish approved metadata before issuance.

The new collection implements a scheduled **direct mint**, not SeaDrop. OpenSea scheduled-drop integration and Robinhood-chain support remain unverified. No drop has been published or scheduled by this change. Do not advertise these contracts as SeaDrop-compatible.

## Contract lifecycle

1. Deploy the collection with an immutable proceeds recipient and a public placeholder metadata URI.
2. Deploy the fixed-route NVDA swap adapter with verified canonical NVDA and Universal Router addresses and the actual native ETH/NVDA pool fee and tick spacing.
3. Deploy the factory with that collection, adapter, NVDA, PoolManager, PositionManager and Permit2. Verify all external contracts belong to the configured economy chain and the same Uniswap deployment. The factory and adapter have no administrative setters.
4. Set the collection launcher once. Before opening the drop, verify that the factory's `companionContract` points back to this collection. A wrong immutable deployment cannot be repaired after configuration.
5. Schedule explicit start/end timestamps. Minting stays closed until configured. The schedule becomes immutable once it starts or a slot has been minted.
6. Mint one to three slots at exactly 2 ETH each. The lifetime collection cap is 10,000; each address may mint at most three across all transactions. Transferring a slot does not restore the mint allowance. Multiple addresses are not prevented.
7. Personalize locally in BonzAI. Publish only approved portrait/identity metadata, then have the current NFT owner call `personalize`. This contract records metadata; it does not run GenAI or upload files. The agent wallet receiving the 4% allocation must be reviewed before issuance.
8. The current NFT owner may call `issueToken` once, with a fresh minimum NVDA output and a deadline no more than 30 minutes away. This atomically spends the slot reserve, deploys its token and provisions its pool. Token identity, image reference and agent wallet are locked after issuance.

Before issuing, configure the factory’s liquidity vault with the treasury and reward basket, then admit the factory with `basketRewards.setLiquidityFactory(factory, true)`.

## Accounting and liquidity

- Exactly 1 ETH per unissued slot stays in the collection. The reserve follows NFT ownership and has no administrator withdrawal path. It remains reserved indefinitely if the owner never issues a token.
- The remaining 1 ETH is withdrawable only to the immutable proceeds recipient. Existing protocol distribution is not implicitly reproduced: use a reviewed proceeds recipient/splitter if distribution is required.
- Issuance sends the full reserve to the fixed-route adapter. The adapter submits an exact-input 1 ETH purchase and enforces the owner's minimum received NVDA. The purchase route can charge its own swap fee.
- The social token has a fixed initial supply of one billion, with 18 decimals and no further minting authority. 4% goes to the personalized agent wallet. 96% is budgeted for liquidity against the purchased NVDA. No target dollar market cap is imposed.
- The social-token pool has a 1% LP fee and zero hook address. Its full-range position is held permanently by the factory’s immutable liquidity vault. See [locked-liquidity accounting](LOCKED_LIQUIDITY.md) for fee collection, the 40/40/10/10 split and reward admission.
- Finite-range/wei rounding can leave dust; leftover launch tokens and purchased NVDA are sent to the same dead address. They are not given to the creator or an administrator. Thus 96% is the liquidity allocation budget, not a guarantee that every base unit enters the position.
- The starting price comes from the token/NVDA quantities, respecting currency-address ordering and raw units. Failed conversion, slippage, initialization, position creation or ownership validation reverts the entire issuance and restores the slot reserve.
- Permanent LP custody prevents the creator withdrawing that position; it does not prevent sales of circulating tokens or remove NVDA issuer/transfer restrictions and market risks.

## Required integration checks

The native ETH/NVDA route and canonical NVDA address have **not** been verified on Robinhood. The adapter supports a single hookless native-ETH route only; WETH or multihop routing would require a different verified adapter before configuring the launcher. Do not substitute a similarly named token.

Before a live drop, validate the route, external deployment bindings, NVDA transfer eligibility, actual Uniswap position accounting, and a complete mint/personalize/issue transaction on the target chain. The local mocks verify encoding and rollback but are not a fork test of Uniswap or Robinhood. A SeaDrop integration must separately account for its primary-sale fees while preserving the full 1 ETH reserve; the direct-mint proceeds split cannot simply be assumed to apply there.

## Local verification

```sh
npx hardhat --config hardhat.config.cjs test test/AgentProvisioning.test.js
node scripts/compileContracts.js BonzaiSmartAgents.sol BonzaiAgentTokenFactory.sol BonzaiNvdaSwap.sol
```

Coverage includes reserve isolation, three lifetime mints, the last collection slot, current-owner permissions, callback protection, metadata gating, one-time issuance, 1% hookless pool encoding, LP custody, rounding dust, slippage/deadlines, and atomic failure recovery.

## Renderer eligibility and recovery

Set `VITE_BONZAI_SMART_AGENTS_<NETWORK>_ADDRESS` and `VITE_BONZAI_AGENT_TOKEN_FACTORY_<NETWORK>_ADDRESS` for verified successor deployments (for example, `ROBINHOOD`). Missing configuration disables issuance; there is no legacy paid-liquidity fallback.

A local record must include NFT ID, collection and chain. The service verifies the live owner, provider chain, mutual collection/factory bindings, finalized identity, unspent reserve and absence of a token in both registries. It rechecks the signing wallet before submission and uses onchain identity rather than imported names or payout wallets. The owner reviews an explicit NVDA minimum and deadline; automatic quote sourcing is not implemented.

NFT mint receipts and token issuance receipts are separate. `tokenLaunchTx` and `tokenLaunchStatus` are persisted in SQLite extras and the compact recovery journal before confirmation. An uncertain result stays pending and can be checked without another submission. Imported token addresses do not establish minted status or authorize paid company jobs; those jobs verify collection and chain against escrow's configured registry. Local roleplay and company work remain available without minting.

Markets enumerate both configured factories so migration does not remove existing issued tokens. Existing legacy transaction receipt recovery remains available; legacy atomic mint writes and chat commands are retired.
