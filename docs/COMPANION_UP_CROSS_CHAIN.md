# Companion Universal Profile — Cross-Chain Deployment

## Today's state

| Chain | UP deployment status |
|---|---|
| LUKSO (42) | **Production-ready** — LSP23 factory wired, post-deployment calldata sets LSP3 profile + LSP1 UniversalReceiverDelegate + agent wallet LSP6 permissions |
| Base (8453) | **Untested stub** — `deployCompanionUPCrossChain()` exists but never successfully exercised |
| Ethereum (1) | **Untested stub** — same |

Companion minting on Base (`companion.service.js:mintCompanionBase`) does
**not** auto-trigger UP deployment on LUKSO. The UP deployment is a separate
user action via `companionService.deployCompanionUP(companionId)`. That is
intentional today — minting succeeds even if the user never deploys a UP.

## What works end-to-end (LUKSO)

1. `companionService.mintCompanionBase()` (`companion.service.js:202-332`):
   mints ERC-8004 NFT on Base, creates agent wallet (OWS or Privy), writes
   agent wallet address into the contract via `setAgentWallet()`.
2. User clicks "Deploy UP" → `deployCompanionUP()` at
   `companion.service.js:995-1009` delegates to `lukso.service.js:664-758`.
3. LSP23 factory at `0x2300000A84D25dF63081feAa37ba6b62C4c89a30` is called
   with:
   - Deterministic `salt = keccak256("bonzai-companion-" + companionId)` so
     the UP address is the same across chains for the same companion
   - Post-deployment calldata that sets `LSP3Profile`, `LSP1UniversalReceiverDelegate`,
     `AddressPermissions[]` array with 1 entry (the agent wallet), and the
     agent wallet's `AddressPermissions:Permissions` key to `0x…240a00`
     (CALL + TRANSFERVALUE + SETDATA + SIGN)
4. Record is persisted to Electron store under `companion-up-{companionId}`
   with schema:
   ```js
   {
     upAddress,
     keyManagerAddress,
     deployedChains: [42],
     deploymentCalldata: tx.data,
     salt,
     companionId,
     agentWalletAddress,
     txHash,
     createdAt,
   }
   ```
5. Agent wallet controls the UP via `executeViaUP()`
   (`lukso.service.js:809-820`) — standard LSP20 flow; no extra signing
   needed because the agent wallet has CALL permission on the UP.

## What's not verified / not wired (Base + Ethereum)

### Issue 1 — LSP23 factory presence on Base and Ethereum

The cross-chain replay at `lukso.service.js:834-860` assumes the
factory and the implementation addresses (`UP` proxy, `KeyManager` proxy,
`postDeploymentModule`) are **deployed at the same addresses** on Base and
Ethereum as on LUKSO. We haven't verified this.

**To verify** (~30min work):

```bash
# Check each factory/implementation address on each chain
npx hardhat run scripts/verify-lsp23-on-chains.js --network base
npx hardhat run scripts/verify-lsp23-on-chains.js --network ethereum
```

Write the script to call `eth_getCode` on each address; if any returns
`0x`, the contract is not deployed and cross-chain replay won't work.

If LSP23 is **not** deployed on Base/Ethereum, options:

1. **Deploy an LSP23-compatible factory to Base/Ethereum** — non-trivial, it's
   a LUKSO-specific contract set.
2. **Use a different cross-chain deploy mechanism** — e.g., CREATE2 with a
   custom factory that produces a UP-compatible minimal proxy on any chain.
   Requires writing that factory.
3. **Scope UPs to LUKSO only** — simpler; documented as a product choice.

### Issue 2 — Post-deployment module execution on non-LUKSO chains

Even if LSP23 is present, the `postDeploymentModule` at
`0x000000000066093407b6704B89793beFfD0D8F00` (called during LSP23 deploy)
may be LUKSO-specific. If it doesn't exist on Base/Ethereum, the
`setDataBatch` call that configures LSP3/LSP1/permissions will **silently
fail**, leaving the UP uninitialized — technically deployed but with no
permissions granted to the agent wallet.

**Mitigation**: after cross-chain deploy, explicitly verify the permissions
were set:

```js
// In lukso.service.js:deployCompanionUPCrossChain, after the deploy tx:
const permissions = await upContract.getData(
  keccak256(toUtf8Bytes('AddressPermissions:Permissions:' + agentWalletAddress))
);
if (permissions === '0x') {
  throw new Error('UP deployed but permissions not set — post-deploy module likely absent on this chain');
}
```

### Issue 3 — Address determinism across chains

CREATE2 produces the same address only if the `init code hash` is identical.
For LSP23 proxies, the init code embeds the `postDeploymentModule` address
and the implementation proxy addresses. If any of those differs between
chains (even slightly — e.g., LSP23 factory itself being at a different
address), the UP addresses will **not match**.

**Mitigation**: compute the expected CREATE2 address off-chain before
deploying, and verify it matches the LUKSO UP address. If they diverge, fall
back to tracking per-chain addresses in the Electron store:

```diff
  deploymentRecord = {
-   upAddress,
+   upAddresses: {
+     42: luksoUpAddress,
+     8453: baseUpAddress,     // if different
+     1: ethUpAddress,
+   },
    ...
  }
```

### Issue 4 — `mintCompanionWithUP` is orphan code

`lukso.service.js:869-907` defines a `mintCompanionWithUP()` that would do
LSP8 mint + UP deploy together. It's **never called** (grep confirms 0
callsites) and has a subtle bug (missing `agentWalletAddress` parameter in
one fallback branch). Safe to delete or finish wiring depending on whether
a single-step mint-on-LUKSO flow is desired.

## Recommended path forward (ordered)

1. **Verify LSP23 factory deployment on Base + Ethereum** (30 min). This
   answers whether cross-chain replay is even possible.
2. **If it's not deployed**: scope companion UPs to LUKSO-only. Update
   `deployCompanionUPCrossChain` to throw a clear error if called with a
   non-42 chain ID, and document the limitation in `COMPANION_DEPLOYMENT_GUIDE.md`.
3. **If it is deployed**: add permission-verification step (Issue 2) and
   per-chain address tracking (Issue 3). Add an end-to-end integration test
   that mints a companion and verifies the UP is usable on all 3 chains.
4. **Decide on auto-trigger**: today the user must click "Deploy UP"
   separately. For a smoother UX, have `mintCompanionBase()` kick off the
   LUKSO deploy in the background on success. Non-blocking — if LUKSO
   deploy fails, the NFT still exists and the user can retry.
5. **Delete or wire `mintCompanionWithUP()`** — it's misleading dead code.

## Risk summary

- **Production LUKSO flow**: solid. Agent wallet controls the UP, permissions
  are set, record is persisted.
- **Production Base flow**: companion NFT works, agent wallet exists, but
  **no UP is deployed** on Base itself. Functions that assume a UP on Base
  will fail. x402 payments via the agent wallet work without a UP (just an
  EOA); UP is only needed if the user wants LSP20/LSP6 semantics.
- **Ethereum flow**: same as Base.

**TL;DR**: today only LUKSO gets a working companion UP. For Base/Ethereum,
decide between (a) confirming LSP23 is live there and wiring the integration
test, or (b) scoping UPs to LUKSO-only and removing the stub cross-chain
code.
