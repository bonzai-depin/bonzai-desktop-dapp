import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import { CONFIG } from '../src/config/web3.config.js';

const address = n => `0x${String(n).padStart(40, '0')}`;
const wallet = address(1), other = address(2), vault = address(3), token = address(4);
CONFIG.stakingEconomy.stakingVaultAddress = vault;
CONFIG.stakingEconomy.tokenAddress = token;
CONFIG.stakingEconomy.basketRewardsAddress = address(5);
const iface = new ethers.Interface([
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'function stakeForRewards(uint256)', 'function unstake(uint256)',
  'function positionOf(address) view returns(uint256 amount,uint256 lockedUntil,uint32 contributionScore,uint16 lockMultiplier,uint16 contributionMultiplier,uint8 tier,uint256 weight)',
  'function totalStaked() view returns(uint256)', 'function rewardActive(address) view returns(bool)',
  'function rewardExitAt(address) view returns(uint256)', 'function REWARD_EXIT_DELAY() view returns(uint256)',
]);
const exactAmount = ethers.parseEther('9007199.254740993123456789');
let signerWallet = wallet, allowance = 0n, switchFails = false, signerCalls = 0, changeAfterFirstSigner = false;
const sent = [];
const runner = {
  getAddress: async () => signerWallet,
  call: async ({ data }) => {
    const fn = iface.getFunction(data.slice(0, 10));
    if (fn.name === 'positionOf') return iface.encodeFunctionResult(fn, [exactAmount, 0, 0, 10000, 10000, 6, exactAmount]);
    const values = { allowance, totalStaked: exactAmount, rewardActive: false, rewardExitAt: 0n, REWARD_EXIT_DELAY: 7776000n };
    return iface.encodeFunctionResult(fn, [values[fn.name]]);
  },
  sendTransaction: async transaction => { sent.push(iface.parseTransaction(transaction)); throw new Error('Stopped before wallet signing'); },
};
const web3 = {
  state: { walletAddress: wallet },
  switchNetwork: async () => { if (switchFails) throw new Error('Wrong network'); },
  getProvider: async () => runner,
  getBrowserProvider: async () => ({ getSigner: async () => {
    signerCalls++;
    if (changeAfterFirstSigner && signerCalls > 1) signerWallet = other;
    return runner;
  } }),
};
const url = new URL('../src/services/bonzaiStaking.service.js', import.meta.url);
globalThis.__stakingBasketWallet = web3;
let source = (await readFile(url, 'utf8')).replace(/^import \{ web3Service \} from .*$/m, 'const web3Service = globalThis.__stakingBasketWallet');
source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
const { bonzaiStakingService: service } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function reset() { signerWallet = wallet; allowance = 0n; switchFails = false; signerCalls = 0; changeAfterFirstSigner = false; sent.length = 0; }

test('reward staking never grants an allowance from a different wallet', async () => {
  reset(); signerWallet = other;
  const result = await service.stakeForRewards('1000');
  assert.equal(result.success, false);
  assert.match(result.error, /Wallet changed/);
  assert.equal(sent.length, 0);
});

test('reward staking approves only the exact reviewed amount and verifies the signer again before staking', async () => {
  reset();
  await service.stakeForRewards('1000.000000000000000001');
  assert.equal(sent[0].name, 'approve');
  assert.equal(sent[0].args[0].toLowerCase(), vault);
  assert.equal(sent[0].args[1], ethers.parseEther('1000.000000000000000001'));
  reset(); allowance = ethers.MaxUint256; changeAfterFirstSigner = true;
  const result = await service.stakeForRewards('1000');
  assert.match(result.error, /Wallet changed/);
  assert.equal(sent.length, 0);
});

test('withdrawals preserve the onchain stake precision and require the reviewed wallet and network', async () => {
  reset();
  const position = await service.fetchPosition(wallet);
  assert.equal(position.amountExact, '9007199.254740993123456789');
  await service.unstake(position.amountExact);
  assert.equal(sent[0].name, 'unstake');
  assert.equal(sent[0].args[0], exactAmount);
  reset(); signerWallet = other;
  assert.match((await service.unstake(position.amountExact)).error, /Wallet changed/);
  assert.equal(sent.length, 0);
  reset(); switchFails = true;
  assert.match((await service.unstake(position.amountExact)).error, /Wrong network/);
  assert.equal(sent.length, 0);
});
