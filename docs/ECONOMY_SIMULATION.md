# Economy simulation reference

`src/shared/economySimulation.js` is a deterministic, editable scenario model.
It does not use observed growth, prices or wallet activity. Run:

```bash
node scripts/simulate-economy.mjs > /tmp/bonzai-economy.json
node scripts/simulate-economy.mjs /path/to/assumptions.json
node --test test/economy-simulation.test.mjs
```

The optional JSON file overrides fields in `ECONOMY_DEFAULTS`. No network request,
telemetry upload, publishing or financial transaction occurs. Output includes
assumptions, monthly rows, Q4, Q1 and combined totals, acquisition-budget overrun
and the gap to the download target.

## User inputs and time horizon

The supplied baseline is 10,000 cumulative downloads, the goal is 1,000,000 by
March 31, 2027, and available acquisition cash is $2,000. October includes only
October 19–31. Recurring October spend is prorated to 13/31 of a month.

Monthly additional-download weights are 2%, 5%, 10%, 18%, 25%, 40%. These
backsolve the target; they are not a forecast. `attainment` scales that target
and exposes any shortfall. Downloads do not equal unique installations, active
users or paying users. Existing users' activity/revenue is excluded because it
was not supplied.

## Editable assumptions

| Field | Default | Meaning |
| --- | --- | --- |
| `approvedCapture` | 1 | Current 70/20/10 allocation; 0 compares the former policy |
| `firstLaunch`, `activation` | 75%, 40% | Download → first launch → useful result |
| `retention` | 65% | Prior active users retained into the next month |
| `workflowConversion`, `workflowSpend` | 3%, $25 | Active users buying remote workflows and monthly spending per payer |
| `workspacePaymentsEnabled` | 0 | Current temporary free access produces no workspace sales |
| `unlockConversion`, `unlockPrice` | 1%, $75 | Hypothetical future purchase conversion and USD price; neither is a live price claim |
| `workspaceLiquidityShare` | 0% | Optional future reserve from workspace receipts; no legacy 50/50 split is assumed |
| `mintConversion`, `mintSpend` | 1%, $2 | Monthly active users minting and fees per minter, in USD equivalents |
| `tradingPerActive` | $10 | Monthly trading volume per active user, not spending or fee revenue |
| `vaultFeeShare` | 100% | Share of pool fees earned by protocol-owned active liquidity; lower this when other liquidity providers participate |
| Creator / partner / referral shares | 45% / 30% / 10% | Required channel contribution to the target |
| `paidShare`, `costPerDownload` | 1,000 / 990,000; $2 | 1,000 paid downloads across the full target ramp consumes the $2,000 budget |
| `creatorDownloads`, `partnerDownloads` | 350; 5,000 | Illustrative yield per placement/partner activation, not measured benchmarks |
| `creatorCost`, `partnerCost` | $0 | Assumes unpaid distribution; staff time is still required |
| `invitations`, `inviteConversion` | 2; 20% | Monthly referral capacity from retained active users |
| `landingConversion` | 20% | Qualified visits needed for the target downloads |

Search and owned distribution take the remaining channel share. The referral
capacity calculation is independent of the referral target; a shortfall is not
silently filled by assumed virality. There is no automatic reinvestment of
projected revenue. A higher cash budget does not automatically generate traffic.

## Accounting

- Local inference is free. BONZAI principal, liquidity principal, token market
  capitalization, token issuance supply and wallet balances are not revenue.
- The approved policy allocates **70% to service beneficiaries, 20% to treasury,
  and 10% to eligible BONZAI holders**. The denominator is settled workflow spending
  for jobs, and collected fees for trading. These rules are implemented in source;
  they require deployment and chain configuration before handling live funds.
- A workflow with a contribution route reserves 2.5% of gross settled spending for
  the snapshotted contributors, leaving 67.5% for the provider. Without a route,
  the provider receives 70%. Royalties are credited directly in escrow, without a
  second revenue-router fee. Refunded amounts incur no fee.
- Trading still charges 1%: 70% of fees for beneficiaries (35% agent wallet and
  35% NFT owner, or 70% model/game creator), 20% treasury and 10% holder rewards.
  Treasury receives 0.2% of trading volume only when the vault earns all fees;
  `vaultFeeShare` accounts for competing LPs. Holders receive 0.1% on that basis.
- With `approvedCapture: 0`, settled social-token workflow payments use the former policy for comparison:
  2.5% platform fees and, where a contribution route exists, another 2.5%.
  With a route, workers receive 95%, creators 2%, treasury 1.5%, holders 1.5%.
  Without one, workers receive 97.5%, treasury and holders 1.25% each.
- `contributionCoverage` is the share of workflow payments with contribution
  routes. Partial coverage weights those two cases. Customer spending is GMV;
  worker payments are pass-through, not protocol fee revenue.
- Former-policy trading fees are 1% of volume: 80% beneficiary credits (agents split 40/40),
  10% treasury and 10% holder rewards. Volume is not revenue.
- Content mint fees use the default 80% treasury / 20% pool split; the pool's
  default half-share creates 10% holder and 10% provider allocations.
- Workspace receipts, if explicitly enabled in a scenario, are separate from
  token fees. The current workspace authority is not `BonzaiUnlock`. An editable
  future reserve does not implement an onchain or payment-processor split.
- Reward allocations are accounting liabilities, not proof that every beneficiary
  is eligible, has claimed, or can convert the token into dollars.

All amounts are USD equivalents at an assumed stable valuation. The model
omits token price movements, slippage, failed jobs, refunds, chargebacks, taxes,
gas, payroll, support, storage, inference costs and operating costs. “Treasury
minus acquisition” is not profit. Monthly new cohorts are counted as active
within their acquisition month; intra-month timing is simplified. Changes in
adoption assumptions do not constitute evidence that a market exists.

Tests verify both policies, allocation conservation, disabled monetization, cohort retention,
one-time license counting, partial October, budget constraints and invalid input.
