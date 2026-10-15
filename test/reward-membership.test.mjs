import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config/web3.config.js';
import { rewardStakePreview, amountToReachLevel, rewardWithdrawalReady } from '../src/services/rewardMembership.js';

const tiers = CONFIG.stakingEconomy.utilityTiers;
test('membership preview includes existing stake and preserves the exact top-up', () => {
  const current = '999.999999999999999999';
  const topUp = amountToReachLevel(current, 1000);
  assert.equal(topUp, '0.000000000000000001');
  assert.deepEqual(rewardStakePreview(topUp, current, tiers), { amount: topUp, total: '1000.0', tier: 1 });
  assert.equal(amountToReachLevel('33000', 50000), '17000.0');
  assert.equal(amountToReachLevel('33000', 10000), '');
});
test('a stake below LVL1 cannot be presented as reward eligible', () => {
  assert.equal(rewardStakePreview('999', '0', tiers).tier, 0);
  assert.equal(rewardStakePreview('50000', '0', tiers).tier, 6);
  for (const value of ['1e3', '-1000', '1,000', '0', '1.0000000000000000001', 'invalid']) {
    assert.equal(rewardStakePreview(value, '0', tiers), null);
  }
});
test('withdrawal requires rewards to stop and both notice and lock to expire', () => {
  const state = { rewardActive: true, rewardExitAt: 200, position: { amountExact: '1000', lockedUntil: 300 } };
  assert.equal(rewardWithdrawalReady(state, 500), false);
  state.rewardActive = false;
  assert.equal(rewardWithdrawalReady(state, 299), false);
  assert.equal(rewardWithdrawalReady(state, 300), true);
  state.position.amountExact = '0';
  assert.equal(rewardWithdrawalReady(state, 500), false);
});
