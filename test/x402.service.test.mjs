import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createPaymentRequest, validatePayment } from '../src/services/x402.service.js';

const providerWallet = ethers.Wallet.createRandom();
const consumerWallet = ethers.Wallet.createRandom();
const ROBINHOOD_CHAIN_ID = 4663;

function mockProvider({ from = consumerWallet.address, to = providerWallet.address, value = 1000n } = {}) {
  return {
    getNetwork: async () => ({ chainId: BigInt(ROBINHOOD_CHAIN_ID) }),
    getTransactionReceipt: async () => ({ status: 1, blockNumber: 100 }),
    getTransaction: async () => ({ from, to, value }),
  };
}

test('creates payment requests only for valid payout addresses', () => {
  assert.throws(
    () => createPaymentRequest({ provider: null, amount: '1000', service: 'llm' }),
    /valid provider payment address/,
  );
  const request = createPaymentRequest({ provider: providerWallet.address, amount: '1000', service: 'llm' });
  assert.equal(request.chainId, ROBINHOOD_CHAIN_ID);
});

test('accepts a confirmed direct-payment proof once and rejects replay', async () => {
  const txHash = ethers.hexlify(ethers.randomBytes(32));
  const payment = {
    version: 'x402-eth/1.0',
    chainId: ROBINHOOD_CHAIN_ID,
    txHash,
    consumer: consumerWallet.address,
  };
  const options = {
    expectedProviderId: providerWallet.address,
    minAmount: '1000',
    pipeline: 'llm',
    provider: mockProvider(),
  };

  const first = await validatePayment(payment, options);
  assert.equal(first.valid, true);
  assert.equal(first.consumer, consumerWallet.address);

  const replay = await validatePayment(payment, options);
  assert.deepEqual(replay, { valid: false, error: 'transaction_reused' });
});

test('rejects transaction proofs paid by a different consumer', async () => {
  const txHash = ethers.hexlify(ethers.randomBytes(32));
  const result = await validatePayment({
    version: 'x402-eth/1.0',
    chainId: ROBINHOOD_CHAIN_ID,
    txHash,
    consumer: consumerWallet.address,
  }, {
    expectedProviderId: providerWallet.address,
    minAmount: '1000',
    provider: mockProvider({ from: ethers.Wallet.createRandom().address }),
  });
  assert.deepEqual(result, { valid: false, error: 'wrong_sender' });
});

test('rejects unsigned authorizations that have not settled on-chain', async () => {
  const result = await validatePayment({ version: 'x402-eth/1.0', chainId: ROBINHOOD_CHAIN_ID }, {
    expectedProviderId: providerWallet.address,
    minAmount: '1000',
  });
  assert.deepEqual(result, { valid: false, error: 'payment_not_settled' });
});
