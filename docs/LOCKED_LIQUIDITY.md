# Locked liquidity and trading revenue

No swap-hook address is required for new token issuance or production verification. All agent, model and game token factories create hookless Uniswap v4 pools with a static fee of 10,000 millionths (1%). The pool fee applies to swaps in either direction. Agent launches pair with purchased NVDA; model and game launches pair with native ETH. The older companion factory also uses the same vault architecture.

Each factory creates one immutable `BonzaiLiquidityVault` during its one-time configuration. Every position NFT is minted directly to that vault and registered atomically with issuance. There is no vault upgrade, arbitrary call, NFT transfer, operator approval, or principal withdrawal function. Fee collection uses `DECREASE_LIQUIDITY` with zero liquidity, followed by `TAKE_PAIR` to the vault. Rounding dust from issuance is sent to the dead address; the position itself is not burned.

| Asset | Initial supply | Allocation | Collected trading-fee split |
| --- | --- | --- | --- |
| Smart agent | 1 billion | 96% liquidity budget; 4% agent wallet | 35% current execution wallet, 35% current NFT owner, 20% treasury, 10% reward basket |
| Model, including fine-tunes and abliterations | 1 billion | 96% liquidity budget; 4% declared creator | 70% declared creator, 20% treasury, 10% reward basket |
| Game | 1 billion | 96% liquidity budget; 4% issuing creator | 70% issuing creator, 20% treasury, 10% reward basket |

Model/game creators may irrevocably assign their 70% creator allocation to up to 64 explicit recipients with `setCreatorRecipients`, once per position. The Training screen uses the saved contributor plan; the vault does not infer attribution. Before assignment, fees accrue to the launch creator. Assignment affects future collections only, never existing credits, and incurs no second protocol deduction. Agent recipients are resolved at collection, and already credited fees never move when the NFT or execution wallet changes. Integer rounding is conserved in the reward remainder (and within the agent creator allocation).

Trading fees bypass both the old fee hook and the asset revenue router: no second treasury or rewards deduction. Paid workflow escrow separately distributes 70% to provider/contributors, 20% treasury and 10% holder rewards. Contributor royalties are included in the 70%, with no second router fee. Other asset revenues keep their separate accounting paths. Token ownership alone does not create a dividend entitlement.

## Configuration and operation

1. Deploy verified pool infrastructure and token factories.
2. Deploy the staking vault and `BonzaiBasketRewards`.
3. Configure agent/model/companion factories with `configureLiquidityVault(treasury, basketRewards)`. Configure games with `configureLiquidity(poolManager, positionManager, permit2, treasury, basketRewards)`. These calls are owner-only and irreversible.
4. As basket owner, call `setLiquidityFactory(factory, true)` for each audited factory. Its canonical vault can then admit the currencies of newly registered positions automatically. Governance-disabled currencies stay disabled.
5. Use `scripts/check-web3-production.mjs` to verify factory/vault/position-manager/treasury/basket bindings and admission. Vault addresses are discovered from factory getters, not duplicated in environment variables. Public deployment addresses belong in `config/protocol.local.env`; GitHub uses `BONZAI_PROTOCOL_CONFIG_ENV` as documented in `PROTOCOL_CONFIGURATION.md`.
6. Anyone may call `collect(positionId)`, then `claim(currency, beneficiary)` and `flushRewards(currency)`. Permissionless claim callers cannot redirect funds. A beneficiary can use `claimTo(currency, recipient)` to recover their own credit to another wallet, including when their contract rejects native currency. Markets → selected asset → trading-fee controls expose that receiving address. Reward deposits invoke the basket's accounting methods rather than transferring unaccounted tokens. A failing beneficiary or disabled reward currency does not block fee collection; its credit remains retryable.

Game issuance now requires an explicit ETH liquidity contribution, at least 0.01 ETH, shown before the wallet transaction. Model minimum liquidity remains configurable. Agent issuance spends the existing reserved 1 ETH through its NVDA adapter.

## Verification boundary

Local contract tests exercise allocation, native/ERC20 accounting, claim isolation, ownership changes, immutable configuration, launch rollback and zero-principal collection encoding. They are not proof of target-chain Uniswap deployment compatibility. Verify the configured external contracts and execute a funded target-chain rehearsal before production. No deployment or funding is performed by local tests.
