# Chainlink CRE — MintPool Operator Setup

The MintPool uses Chainlink CRE (Cross-Chain Reporting / Compute) as an oracle
to verify a registrant's **BONZAI balance across Ethereum + Arbitrum + Base**
at register- and claim-time. Without CRE wired correctly, `registerForEpoch`
and `confirmClaim` emit their events but the on-chain callback never fires,
so pending requests stall.

This doc is the **operator playbook** to get CRE working end-to-end.

## Preflight

| Requirement | Check |
|---|---|
| `BonzaiMintPool` deployed on Base | `scripts/deploy-base-mvp.js` populates address in `web3.config.js` |
| Contract ABI accessible | `src/contracts/BonzaiMintPool.json` (produced by Hardhat compile) |
| Node >= 20 LTS | matches `node-llama-cpp` constraint from memory |
| Ethereum + Arbitrum RPC endpoints (non-rate-limited) | Infura / Alchemy / QuickNode keys |

## Step 0 — Install the CRE SDK + CLI

Workflow imports `@chainlink/cre-sdk`, `viem`, and `zod` (see
`src/contracts/cre/workflow.ts`), none of which are in `package.json` yet.

```bash
npm install --save-dev @chainlink/cre-sdk viem zod
```

Install the CRE CLI (binary — not an npm package):

```bash
# macOS (Apple Silicon)
curl -L -o cre https://github.com/smartcontractkit/cre-cli/releases/latest/download/cre-darwin-arm64
chmod +x cre
sudo mv cre /usr/local/bin/cre
```

Verify: `cre --version` should print >= 1.10.

## Step 1 — Generate typed bindings for the contract

The workflow expects `src/contracts/cre/generated/BonzaiMintPool.ts` (imports
at lines 50-55 of `workflow.ts`). That file doesn't exist yet and causes
workflow compilation to fail.

```bash
# From the repo root, after `npx hardhat compile`:
cre generate \
  --abi artifacts/src/contracts/BonzaiMintPool.sol/BonzaiMintPool.json \
  --out src/contracts/cre/generated \
  --lang ts
```

Verify `src/contracts/cre/generated/BonzaiMintPool.ts` exists and exports the
types used by `workflow.ts` (`onRegistrationRequested`, `onConfirmClaimRequested`,
`writeReport`).

## Step 2 — Fix the deploy script (missing forwarder arg)

`BonzaiMintPool.sol` constructor takes a `_forwarder` address (line 160-175),
but `scripts/deploy-base-mvp.js:374-385` doesn't pass it. This causes
deployment to revert with `ZeroAddress()`.

```diff
  // scripts/deploy-base-mvp.js — inside deployMintPool()
- const args = [bonzaiTokenBase, poolThresholds, epochDuration, treasury];
+ const forwarder = process.env.CRE_FORWARDER_BASE;
+ if (!forwarder) throw new Error("Set CRE_FORWARDER_BASE before deploying MintPool");
+ const args = [bonzaiTokenBase, poolThresholds, epochDuration, treasury, forwarder];
```

For the forwarder address:

- **If Chainlink provides a pre-deployed CRE forwarder on Base**: ask the
  Chainlink integration team for its address, set
  `CRE_FORWARDER_BASE=0x...` before running the deploy.
- **Otherwise**: deploy your own authorized forwarder per CRE docs,
  then use that address. Post-deploy you can always rotate via
  `BonzaiMintPool.setForwarder(newAddress)` (owner-only).

## Step 3 — Move RPC endpoints out of the workflow

`src/contracts/cre/workflow.ts:78-92` hardcodes public rate-limited RPCs:

```ts
const ETHEREUM_RPC = "https://ethereum.publicnode.com";
const ARBITRUM_RPC = "https://arbitrum.publicnode.com";
```

These will fail under real load. Replace with config-driven values read from
the workflow manifest:

```diff
- const ETHEREUM_RPC = "https://ethereum.publicnode.com";
- const ARBITRUM_RPC = "https://arbitrum.publicnode.com";
+ const ETHEREUM_RPC = config.ethereumRpc;
+ const ARBITRUM_RPC = config.arbitrumRpc;
```

Wire `ethereumRpc` / `arbitrumRpc` into `cre/config.production.json`, pointing
at Infura/Alchemy endpoints with paid quotas.

## Step 4 — Fill the production config

`src/contracts/cre/config.production.json`:

```json
{
  "version": "1",
  "forAddress": "0x_FILL_AFTER_DEPLOYMENT",     // ← MintPool address on Base
  "ethereumRpc": "https://mainnet.infura.io/v3/<KEY>",
  "arbitrumRpc": "https://arbitrum-mainnet.infura.io/v3/<KEY>",
  "bonzaiEthereum": "0xDdA9Ff241C7160be8295EF9Eca2e782361467666",
  "bonzaiArbitrum": "0x0a84edf70f30325151631ce7a61307d1f4d619a3",
  "callbackGasLimit": 250000
}
```

Populate `forAddress` with the deployed MintPool address right after Step 2.

## Step 5 — Simulate locally

Before uploading to production, run the workflow against a local anvil fork:

```bash
anvil --fork-url $BASE_RPC_URL --fork-block-number <recent> &
cre simulate \
  --workflow src/contracts/cre/workflow.ts \
  --config src/contracts/cre/config.production.json \
  --event RegistrationRequested \
  --event-data "0x<abi-encoded-test-event>"
```

Verify the simulator calls `writeReport` with a sane cross-chain sum.

## Step 6 — Deploy the workflow

```bash
cre deploy \
  --workflow src/contracts/cre/workflow.ts \
  --config src/contracts/cre/config.production.json \
  --network base-mainnet
```

Capture the returned **workflow ID** — that's what Chainlink uses to route
callbacks. Save it alongside the MintPool deployment record.

## Step 7 — Authorize the forwarder in the contract

If you didn't pass the forwarder at construction, set it now:

```bash
npx hardhat run scripts/set-mintpool-forwarder.js \
  --network base
# The script should read $CRE_FORWARDER_BASE and call setForwarder(...).
```

## Step 8 — Fund the signer + watch events

CRE requires a funded signer on Base for the callback transactions.
Chainlink documents the exact funding procedure per workflow tier; at
minimum keep the signer balance above `callbackGasLimit * baseFee * 100` to
absorb burst traffic.

Monitor the first few callbacks:

```bash
# Subscribe to callback events on Base
npx hardhat run scripts/watch-mintpool-events.js --network base
```

Expected sequence per registration:

1. `RegistrationRequested(epochId, wallet)` — frontend transaction
2. …~10-60s delay (CRE picks up event, fetches ETH+ARB balances)…
3. `onReport` call into MintPool, contract adds Base balance, stores total
4. `RegistrationCompleted(epochId, wallet, totalBalance)` — emitted

If step 3 never happens, check:
- CRE workflow logs (via CRE dashboard or `cre tail --workflow <id>`)
- Forwarder address mismatch (`BonzaiMintPool.forwarder()` vs. actual caller)
- Signer balance / gas limit

## Step 9 — Add a contract-side timeout (optional safety net)

Currently, a registration without a CRE callback sits indefinitely. Worth
adding an admin-callable `cancelRegistration(epochId, wallet)` function to
refund gas if CRE is down for extended periods. Not blocking for launch but
recommended before mainnet rewards are live.

## Open questions for Chainlink integration team

1. **Forwarder address**: is there a pre-deployed forwarder on Base for
   public use, or do projects deploy their own?
2. **SLA / expected latency** between event emission and callback?
3. **Signer key management**: does CRE inject the signer at runtime or does
   the project provision its own key?
4. **Workflow update procedure**: how are hot fixes deployed — redeploy with
   same workflow ID or new ID + re-point?

## Summary — what's blocking "working out of the box"

| Blocker | Fix in this doc |
|---|---|
| `@chainlink/cre-sdk` not installed | Step 0 |
| Generated bindings missing | Step 1 |
| Deploy script missing forwarder arg | Step 2 |
| RPC endpoints hardcoded to public nodes | Step 3 |
| `forAddress` placeholder in config | Step 4 |
| Workflow never uploaded | Step 6 |
| Forwarder address never authorized on-chain | Step 7 |
| Signer unfunded | Step 8 |

Once all 8 steps are executed, `registerForEpoch` → `onReport` callback
round-trips should complete within the CRE latency SLA, unblocking
multi-chain MintPool rewards.
