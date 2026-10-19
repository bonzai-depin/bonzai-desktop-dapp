import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { economyAddress, economyChainId } from '../src/config/economy.config.js';
import { ensureWalletChain } from '../src/services/walletNetwork.js';
import { productionConfiguration, verifyProduction } from '../scripts/check-web3-production.mjs';
import { selectMarketPair, marketHistoryKey } from '../src/services/marketData.js';

const address = '0x0000000000000000000000000000000000000001';
const other = '0x0000000000000000000000000000000000000002';
const network = { chainId: 4663, chainIdHex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.example', explorer: 'https://explorer.example', currency: { name: 'Ether', symbol: 'ETH', decimals: 18 } };
const minimal = (addresses = new Map()) => ({ chainId: 4663, addresses, failures: [] });

test('renderer and preflight select Robinhood by default without Ethereum address fallback', () => {
  assert.equal(economyChainId({}), 4663);
  assert.equal(productionConfiguration({}).chainId, 4663);
  assert.equal(economyAddress({ VITE_BONZAI_MINT_POOL_ETHEREUM_ADDRESS: address }, 'MINT_POOL'), null);
  assert.equal(economyAddress({ VITE_BONZAI_MINT_POOL_ETHEREUM_ADDRESS: address, VITE_BONZAI_ECONOMY_CHAIN_ID: '1' }, 'MINT_POOL'), address);
  assert.throws(() => economyChainId({ VITE_BONZAI_ECONOMY_CHAIN_ID: '42' }), /Unsupported/);
});

test('adding a wallet chain explicitly selects it and verifies actual selection', async () => {
  let current = 1;
  let switches = 0;
  let added = false;
  await ensureWalletChain({ request: async ({ method }) => {
    if (method === 'eth_chainId') return current;
    if (method === 'wallet_addEthereumChain') { added = true; return; }
    if (method === 'wallet_switchEthereumChain') {
      switches += 1;
      if (!added) throw Object.assign(new Error('unknown chain'), { code: 4902 });
      current = 4663;
    }
  } }, network);
  assert.equal(switches, 2);
  assert.equal(current, 4663);
});

test('wallet success without actual chain change cannot authorize a transaction', async () => {
  await assert.rejects(ensureWalletChain({ request: async ({ method }) => method === 'eth_chainId' ? '0x1' : null }, network), /Wallet is on chain 1/);
});

test('preflight checks actual eth_chainId even if provider reports a static network', async () => {
  const result = await verifyProduction(minimal(), { provider: { send: async () => '0x1', getNetwork: async () => ({ chainId: 4663n }) } });
  assert.match(result.failures.join('\n'), /RPC returned chain 1, expected 4663/);
});

test('missing bytecode and inconsistent cross-contract wiring fail production readiness', async () => {
  const empty = await verifyProduction(minimal(new Map([['COMPANIONS', address]])), { provider: { send: async () => '0x1237', getCode: async () => '0x' } });
  assert.match(empty.failures.join('\n'), /no deployed bytecode/);
  const iface = new ethers.Interface(['function mintPool() view returns(address)', 'function companionTokenFactory() view returns(address)']);
  const wrongWiring = await verifyProduction(minimal(new Map([['COMPANIONS', address], ['MINT_POOL', other]])), { provider: {
    send: async () => '0x1237', getCode: async a => a === address ? '0x01' : '0x',
    call: async () => iface.encodeFunctionResult('mintPool', [address]),
  } });
  assert.match(wrongWiring.failures.join('\n'), /COMPANIONS.mintPool is .* expected/);
});

test('provider claims cannot launch without independently verified receipts', async () => {
  const iface = new ethers.Interface(['function claimsPaused() view returns(bool)', 'function serviceTimeAttestor() view returns(address)']);
  const result = await verifyProduction(minimal(new Map([['SERVICE_TIME', address]])), { provider: {
    send: async () => '0x1237', getCode: async () => '0x01',
    call: async ({ data }) => data === iface.getFunction('claimsPaused').selector
      ? iface.encodeFunctionResult('claimsPaused', [false]) : iface.encodeFunctionResult('serviceTimeAttestor', [ethers.ZeroAddress]),
  } });
  assert.match(result.failures.join('\n'), /enabled without a service-time attestor/);
  assert.match(result.failures.join('\n'), /must remain paused/);
});

test('offline validation never represents a deployment as verified', async () => {
  const result = await verifyProduction(minimal(), { offline: true });
  assert.equal(result.offline, true);
  assert.equal(result.deployedContractsVerified, 0);
});

test('preflight rejects an unsupported swap encoding before checkout can be released',()=>{
  assert.ok(productionConfiguration({VITE_UNISWAP_V4_ROUTER_ABI_VERSION:'unknown'}).failures.some(f=>f.includes('ROUTER_ABI_VERSION')));
  assert.ok(!productionConfiguration({VITE_UNISWAP_V4_ROUTER_ABI_VERSION:'v2'}).failures.some(f=>f.includes('ROUTER_ABI_VERSION')));
});

test('preflight requires a configured currency basket and verifies USDC denomination and admission', async () => {
  const offline = productionConfiguration({});
  assert(offline.failures.some(message => message.includes('BASKET_REWARDS')));
  assert(offline.failures.some(message => message.includes('USDC')));
  const iface = new ethers.Interface(['function decimals() view returns(uint8)', 'function rewardCurrencyEnabled(address) view returns(bool)']);
  const result = await verifyProduction(minimal(new Map([['BASKET_REWARDS', address], ['USDC', other]])), { provider: {
    send: async () => '0x1237', getCode: async () => '0x01',
    call: async ({ data }) => data.startsWith(iface.getFunction('rewardCurrencyEnabled').selector)
      ? iface.encodeFunctionResult('rewardCurrencyEnabled', [false]) : iface.encodeFunctionResult('decimals', [18]),
  } });
  assert(result.failures.some(message => message.includes('USDC must have 6 decimals')));
  assert(result.failures.some(message => message.includes('USDC rewards are not enabled')));
});

test('preflight rejects legacy model factories and missing collection membership support', async () => {
  const iface = new ethers.Interface(['function legacyLaunchEnabled() view returns(bool)']);
  const result = await verifyProduction(minimal(new Map([['FINE_TUNE_TOKEN_FACTORY', address], ['COLLECTIBLES_FACTORY', other]])), { provider: {
    send: async () => '0x1237', getCode: async () => '0x01',
    call: async ({ data }) => {
      if (data === iface.getFunction('legacyLaunchEnabled').selector) return iface.encodeFunctionResult('legacyLaunchEnabled', [false]);
      throw new Error('Legacy deployment lacks collection-aware selector');
    },
  } });
  assert.match(result.failures.join('\n'), /collection membership registry: Legacy deployment/);
  assert.match(result.failures.join('\n'), /model publisher attestation gate: Legacy deployment/);
});

test('Robinhood market data excludes identical token addresses on other chains and quote-token matches', () => {
  const pair = (chainId, baseAddress, liquidity) => ({ chainId, baseToken: { address: baseAddress }, quoteToken: { address }, liquidity: { usd: liquidity } });
  const robinhood = pair('robinhood', address, 10);
  const payload = { pairs: [pair('base', address, 1000000), pair('robinhood', other, 100000), robinhood] };
  assert.equal(selectMarketPair(payload, address, 4663), robinhood);
  assert.equal(selectMarketPair(payload, address, 46630), null);
  assert.equal(selectMarketPair({ pairs: [pair('ethereum', address, 9000)] }, address, 4663), null);
  assert.notEqual(marketHistoryKey(4663), marketHistoryKey(8453));
  assert.notEqual(marketHistoryKey(4663), 'bonzai.market.history.v1');
});

test('release preflight includes the reserved agent collection, factory and canonical NVDA route', () => {
  const failures = productionConfiguration({}).failures.join('\n');
  for (const name of ['SMART_AGENTS', 'AGENT_TOKEN_FACTORY', 'NVDA_SWAP', 'NVDA']) assert.match(failures, new RegExp(`VITE_BONZAI_${name}_ROBINHOOD_ADDRESS`));
});
