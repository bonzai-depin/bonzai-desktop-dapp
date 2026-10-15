import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ethers } from 'ethers';

const source = fs.readFileSync(new URL('../scripts/deploy-v4-economy.js', import.meta.url), 'utf8');
const body = source.slice(0, source.lastIndexOf('main().catch')).replace(/^import .+;\n/gm, '');
const address = n => ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(n), 20));
const settings = {
  BONZAI_TOKEN_ADDRESS: address(1), BONZAI_TREASURY_ADDRESS: address(2), BONZAI_COMPANIONS_ADDRESS: address(3),
  BONZAI_COMPANION_TOKEN_FACTORY_ADDRESS: address(4), BONZAI_FINE_TUNE_TOKEN_FACTORY_ADDRESS: address(5),
  BONZAI_UNISWAP_HOOK_ADDRESS: address(0x4044), BONZAI_COLLECTIBLES_FACTORY_ADDRESS: address(6),
  BONZAI_MINT_POOL_ADDRESS: address(7), BONZAI_SERVICE_TIME_ADDRESS: address(8), BONZAI_PROVIDER_REGISTRY_ADDRESS: address(9),
  BONZAI_USDC_ADDRESS: address(10), BONZAI_SMART_AGENTS_ADDRESS: address(11), BONZAI_AGENT_TOKEN_FACTORY_ADDRESS: address(12),
  VITE_BONZAI_ECONOMY_CHAIN_ID: '4663',
};

async function scenario({ frozen = false, wrongToken = false, wrongOwner = false, wrongUsdc = false, basketAlreadySet = false } = {}) {
  const envBefore = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const deployments = [];
  const calls = [];
  const writes = new Map();
  const tx = { wait: async () => ({}) };
  const deployer = address(100);
  const facade = {
    ...ethers,
    getSigners: async () => [{ address: deployer }],
    provider: { getNetwork: async () => ({ chainId: 4663n }), send: async () => '0x1237', getCode: async () => '0x1234' },
    Contract: function (contractAddress) {
      return new Proxy({
        decimals: async () => contractAddress === settings.BONZAI_USDC_ADDRESS && !wrongUsdc ? 6n : 18n,
        isCollection: async () => false,
        getToken: async () => ethers.ZeroAddress,
        stakingVaultFrozen: async () => frozen,
        bonzaiToken: async () => wrongToken ? address(999) : settings.BONZAI_TOKEN_ADDRESS,
        basketRewards: async () => basketAlreadySet ? address(999) : ethers.ZeroAddress,
        companionContract: async () => contractAddress === settings.BONZAI_AGENT_TOKEN_FACTORY_ADDRESS ? settings.BONZAI_SMART_AGENTS_ADDRESS : settings.BONZAI_COMPANIONS_ADDRESS,
        launcher: async () => settings.BONZAI_AGENT_TOKEN_FACTORY_ADDRESS,
        owner: async () => wrongOwner ? address(999) : deployer,
        legacyLaunchEnabled: async () => false,
      }, { get: (target, key) => target[key] || (async (...args) => { calls.push({ contractAddress, method: key, args }); return tx; }) });
    },
    getContractFactory: async name => ({ deploy: async (...args) => {
      const deployedAddress = address(500 + deployments.length);
      deployments.push({ name, args, address: deployedAddress });
      return new Proxy({ waitForDeployment: async () => {}, getAddress: async () => deployedAddress }, {
        get: (target, key) => key === 'then' ? undefined : target[key] || (async (...methodArgs) => { calls.push({ contractAddress: deployedAddress, method: key, args: methodArgs }); return tx; }),
      });
    } }),
  };
  // 4663 decimal; keep the RPC identity independent from getNetwork().
  facade.provider.send = async () => ethers.toBeHex(4663);
  const main = new Function('hre', 'fs', 'path', body + '\nreturn main;')(
    { ethers: facade, network: { name: 'robinhood' } },
    { mkdirSync: () => {}, writeFileSync: (file, value) => writes.set(path.basename(file), value) }, path,
  );
  const log = console.log;
  console.log = () => {};
  let error;
  try { await main(); } catch (caught) { error = caught; }
  finally {
    console.log = log;
    for (const [key, value] of Object.entries(envBefore)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  return { deployments, writes, calls, error };
}

test('v4 migration rejects frozen vault, token mismatch and unauthorized wiring before deploying', async () => {
  for (const [options, reason] of [[{ frozen: true }, /vault is frozen/], [{ wrongToken: true }, /different BONZAI token/], [{ wrongOwner: true }, /does not own/], [{ wrongUsdc: true }, /USDC token must have 6/], [{ basketAlreadySet: true }, /already has a basket/]]) {
    const result = await scenario(options);
    assert.match(result.error?.message || '', reason);
    assert.equal(result.deployments.length, 0);
    assert.equal(result.writes.size, 0);
  }
});

test('canonical plan creates escrow with the new router and exports its address', async () => {
  const result = await scenario();
  assert.equal(result.error, undefined);
  const router = result.deployments.find(item => item.name === 'BonzaiRevenueRouter');
  const basket = result.deployments.find(item => item.name === 'BonzaiBasketRewards');
  const escrow = result.deployments.find(item => item.name === 'BonzaiJobEscrow');
  assert.deepEqual(escrow.args, [settings.BONZAI_TREASURY_ADDRESS, router.address]);
  assert.equal(JSON.parse(result.writes.get('v4-4663.json')).jobEscrow, escrow.address);
  assert(result.writes.get('v4-4663.env').includes('VITE_BONZAI_JOB_ESCROW_ADDRESS=' + escrow.address));
  assert(result.writes.get('v4-4663.env').includes('VITE_BONZAI_BASKET_REWARDS_ADDRESS=' + basket.address));
  assert(result.calls.some(call => call.contractAddress === basket.address && call.method === 'setRewardCurrency' && call.args[0] === settings.BONZAI_USDC_ADDRESS));
  assert(result.calls.some(call => call.contractAddress === escrow.address && call.method === 'configureSmartAgentEconomy' && call.args[0] === settings.BONZAI_AGENT_TOKEN_FACTORY_ADDRESS && call.args[1] === basket.address));
  assert(result.calls.some(call => call.contractAddress === settings.BONZAI_MINT_POOL_ADDRESS && call.method === 'setBasketRewards' && call.args[0] === basket.address));
});
