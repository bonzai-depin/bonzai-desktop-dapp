import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateEconomy } from "../src/shared/economySimulation.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
test("one-million goal is a cumulative acquisition target, not one million paying users", () => {
  const s = simulateEconomy();
  assert.equal(s.rows.at(-1).cumulative, 1000000);
  assert.equal(s.q4.downloads, 168300);
  assert.equal(s.gap, 0);
  assert.ok(s.rows.at(-1).payers < 10000);
  assert.equal(s.rows[0].days, 13);
});
test("every collected fee has exactly one destination, without counting GMV or locked reserves as treasury income", () => {
  for (const approvedCapture of [0, 1]) for (const coverage of [0, 0.5, 1])
    for (const r of simulateEconomy({ approvedCapture, contributionCoverage: coverage }).rows) {
      near(
        r.workflowGMV,
        r.worker + r.creators + r.workflowTreasury + r.workflowRewards,
      );
      near(
        r.feeRevenue,
        r.creators +
          r.tradingBeneficiaries +
          r.treasury +
          r.holderRewards +
          r.providerPool +
          r.liquidityReserve,
      );
    }
});
test("no monetization is inferred merely from free downloads", () => {
  const s = simulateEconomy({
    workflowConversion: 0,
    unlockConversion: 0,
    mintConversion: 0,
    tradingPerActive: 0,
  });
  assert.equal(s.total.treasury, 0);
  assert.equal(s.total.feeRevenue, 0);
  assert.ok(s.total.acquisitionCost > 0);
});
test("retention applies to prior activated cohorts, and each license is sold only once", () => {
  const s = simulateEconomy({ retention: 0, workspacePaymentsEnabled: 1 });
  for (const r of s.rows) near(r.active, r.newActive);
  near(s.total.licenses, s.total.newActive * s.assumptions.unlockConversion);
});
test("baseline and missed distribution do not silently claim the target was achieved", () => {
  const s = simulateEconomy({ baselineDownloads: 200000, attainment: 0.5 });
  assert.equal(s.rows.at(-1).cumulative, 600000);
  assert.equal(s.gap, 400000);
  assert.equal(
    simulateEconomy({ baselineDownloads: 1000000 }).total.downloads,
    0,
  );
});
test("invalid or overlapping channel assumptions are rejected", () => {
  for (const p of [
    { retention: 2 },
    { workflowSpend: -1 },
    { targetDownloads: Infinity },
    { paidShare: 0.9 },
    { creatorDownloads: 0 },
    { approvedCapture: 2 },
  ])
    assert.throws(() => simulateEconomy(p));
});

test("approved capture is 20% of workflow spending and 20% of the 1% trading fee", () => {
  const s = simulateEconomy();
  assert.equal(s.workflowAllocationPending, false);
  assert.ok(s.total.worker > 0);
  for (const r of s.rows) {
    near(r.workflowTreasury, r.workflowGMV * 0.2);
    near(r.tradingTreasury, r.tradingVolume * 0.002);
    near(r.workflowTreasury + r.workflowRewards + r.worker + r.creators, r.workflowGMV);
    near(r.workflowRewards, r.workflowGMV * 0.1);
    near(r.worker + r.creators, r.workflowGMV * 0.7);
    near(r.tradingRewards, r.tradingFees * 0.1);
    near(r.tradingBeneficiaries + r.tradingTreasury + r.tradingRewards, r.tradingFees);
    near(r.treasury + r.creators + r.tradingBeneficiaries + r.holderRewards + r.providerPool + r.liquidityReserve, r.feeRevenue);
    assert.ok(r.worker > 0);
    assert.ok(r.creators > 0);
  }
  const implemented = simulateEconomy({ approvedCapture: 0 });
  assert.equal(implemented.workflowAllocationPending, false);
  assert.ok(implemented.total.worker > 0);
  assert.ok(implemented.total.treasury < s.total.treasury);
  const sharedPool = simulateEconomy({ vaultFeeShare: 0.25 });
  near(sharedPool.total.tradingTreasury, s.total.tradingTreasury / 4);
});

test("the user budget supports only 1000 illustrative paid downloads at $2 each", () => {
  const s = simulateEconomy();
  near(s.total.acquisitionCost, 2000);
  assert.equal(s.assumptions.baselineDownloads, 10000);
  near(s.budgetGap, 0);
  assert.ok(s.rows[0].referralTarget > s.rows[0].referralCapacity);
});

test("October recurring spending covers only the remaining 13 days, while one-time purchases are counted once", () => {
  const { rows, assumptions: p } = simulateEconomy({
      workspacePaymentsEnabled: 1,
    }),
    oct = rows[0];
  near(oct.workflowGMV, (oct.payers * p.workflowSpend * 13) / 31);
  near(oct.tradingVolume, (oct.active * p.tradingPerActive * 13) / 31);
  near(oct.licenseReceipts, oct.newActive * p.unlockConversion * p.unlockPrice);
  assert.equal(rows[1].periodFraction, 1);
});

test("temporary free workspace access produces no license revenue or assumed legacy liquidity allocation", () => {
  assert.equal(simulateEconomy().total.licenseReceipts, 0);
  const paid = simulateEconomy({ workspacePaymentsEnabled: 1 });
  assert.ok(paid.total.licenseReceipts > 0);
  assert.equal(paid.total.liquidityReserve, 0);
  const reserved = simulateEconomy({
    workspacePaymentsEnabled: 1,
    workspaceLiquidityShare: 0.5,
  });
  near(reserved.total.liquidityReserve, paid.total.licenseReceipts / 2);
  near(
    paid.total.treasury - reserved.total.treasury,
    reserved.total.liquidityReserve,
  );
});
