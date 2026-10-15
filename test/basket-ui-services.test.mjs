import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { readRewardBasket, closedEpochPage, assertClaimableRow } from '../src/services/rewardBasket.js';
import { buildSmartAgentJobTerms, verifySmartAgentQuote } from '../src/services/smartAgentJobTerms.js';
import { restrictAgentJobSigner } from '../src/services/agentJobSigner.js';

const address = n => ethers.getAddress(`0x${String(n).padStart(40, '0')}`);

test('USDC and social-token rewards keep independent exact units and exclude open periods', async () => {
  const calls = [];
  const contract = {
    currentEpoch: async () => 3n, rewardCurrencyCount: async () => 2n, epochDuration: async () => 604800n, genesisTime: async () => 100n,
    getRewardCurrencies: async () => [address(1), address(2)],
    claimable: async (_, token, epoch) => { calls.push(epoch); return token === address(1) ? 1234567n : 900719925474099312345678n; },
  };
  const basket = await readRewardBasket(contract, address(3), async token => ({ symbol: token === address(1) ? 'USDC' : 'AGENT', decimals: token === address(1) ? 6 : 18 }));
  assert.equal(basket.rows[0].amount, '3.703701');
  assert.equal(basket.rows[1].amount, '2702159.776422297937037034');
  assert.equal(basket.rows[1].rawAmount, '2702159776422297937037034');
  assert.ok(calls.every(epoch => epoch < 3));
  assert.equal('total' in basket, false, 'unlike currencies cannot be summed');
  assert.deepEqual(closedEpochPage(60, 20), { start: 12, end: 20, epochs: [12,13,14,15,16,17,18,19] });
});

test('a failed currency stays unavailable instead of displaying zero or hiding other rewards', async () => {
  const basket = await readRewardBasket({ currentEpoch: async () => 1, rewardCurrencyCount: async () => 2, epochDuration: async () => 10, genesisTime: async () => 0,
    getRewardCurrencies: async () => [address(1), address(2)], claimable: async () => 1n,
  }, address(3), async token => { if (token === address(1)) throw Error('RPC unavailable'); return { symbol: 'AGENT', decimals: 18 }; });
  assert.equal(basket.rows[0].amount, null);
  assert.throws(() => assertClaimableRow(basket.rows[0]), /No claimable/);
  assert.doesNotThrow(() => assertClaimableRow(basket.rows[1]));
});

const agent = { tokenId: '12', tokenAddress: address(1), worker: address(2), arbitrator: address(3), escrow: address(4), decimals: 18, chainId: 4663, platformBps: 250, contributionBps: 250, acceptWindow: 7, deliveryWindow: 30, reviewWindow: 7, disputeWindow: 14 };
test('job terms bind exact social-token amount, delivery scope, fees and arbitration', () => {
  const first = buildSmartAgentJobTerms(agent, { title: 'Reconcile invoices', outcome: 'A reviewed CSV report', amount: '9007199254740993.000000000000000001' });
  assert.equal(first.amount, 9007199254740993000000000000000001n);
  assert.equal(first.terms.contributionBps, 0, 'no implied royalty route');
  assert.notEqual(first.termsHash, buildSmartAgentJobTerms(agent, { title: 'Reconcile invoices', outcome: 'A different report', amount: '9007199254740993.000000000000000001' }).termsHash);
  assert.throws(() => buildSmartAgentJobTerms(agent, { title: 'Job', outcome: 'Done', amount: '1e9' }));
  assert.throws(() => buildSmartAgentJobTerms(agent, { title: 'Job', outcome: 'Done', amount: '-1' }));
  assert.throws(() => verifySmartAgentQuote(agent, { ...agent, worker: address(9) }), /terms changed/);
  assert.throws(() => verifySmartAgentQuote(agent, { ...agent, tokenAddress: address(9) }), /terms changed/);
});

test('agent job approval authorizes one exact zero-value call and no token transfers', async () => {
  const sent = [];
  const delegate = { getAddress: async () => address(2), sendTransaction: async tx => { sent.push(tx); return { hash: '0xtest' }; } };
  const signer = restrictAgentJobSigner(delegate, { escrowAddress: address(4), chainId: 4663, data: '0x12345678' });
  for (const tx of [{ to: address(9), data: '0x12345678' }, { to: address(4), data: '0x87654321' }, { to: address(4), data: '0x12345678', value: 1n }, { to: address(4), data: '0x12345678', chainId: 1 }]) await assert.rejects(signer.sendTransaction(tx), /outside/);
  assert.equal(sent.length, 0);
  await signer.sendTransaction({ to: address(4), data: '0x12345678' });
  assert.equal(sent[0].chainId, 4663);
  await assert.rejects(signer.sendTransaction({ to: address(4), data: '0x12345678' }), /already been used/);
  assert.equal(signer.signMessage, undefined);
});
