import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import { CONFIG } from '../src/config/web3.config.js';
import { BonzaiRevenueRouterABI } from '../src/contracts/abi/BonzaiRevenueRouter.abi.js';

const wallet = '0x0000000000000000000000000000000000000001';
const other = '0x0000000000000000000000000000000000000002';
const currency = '0x0000000000000000000000000000000000000003';
const route = ethers.id('a contribution route');
const iface = new ethers.Interface([...BonzaiRevenueRouterABI, 'function decimals() view returns(uint8)', 'function symbol() view returns(string)']);
let rawAmount = 123456789012345678901234567n;
let decimals = 18;
let actualChain = Number(CONFIG.stakingEconomy.chainId);
let request = null;
let failRead = false;
let afterBalanceRead = null;
const reads = [];
const provider = {
  send: async method => { assert.equal(method, 'eth_chainId'); return ethers.toBeHex(actualChain); },
  call: async ({ to, data }) => {
    if (failRead) throw new Error('Royalty RPC unavailable');
    const method = iface.getFunction(data.slice(0, 10));
    const args = iface.decodeFunctionData(method, data);
    reads.push({ to, method: method.name, args });
    if (method.name === 'tokenClaimable') { afterBalanceRead?.(); return iface.encodeFunctionResult(method, [rawAmount]); }
    if (method.name === 'decimals') return iface.encodeFunctionResult(method, [decimals]);
    if (method.name === 'symbol') return iface.encodeFunctionResult(method, ['AGENT']);
    throw new Error(`Unexpected call ${method.name}`);
  },
};
const signer = {
  provider, call: provider.call, getAddress: async () => wallet,
  sendTransaction: async value => { request = value; throw new Error('Stopped at wallet review'); },
};
const web3 = {
  state: { walletAddress: wallet, currentChainId: Number(CONFIG.stakingEconomy.chainId) },
  switchNetwork: async () => {}, getProvider: async () => provider,
  getBrowserProvider: async () => ({ getSigner: async () => signer }),
};
CONFIG.stakingEconomy.revenueRouterAddress = other;

async function loadService(filename, replacements = {}) {
  const url = new URL(`../src/services/${filename}`, import.meta.url);
  let source = await readFile(url, 'utf8');
  globalThis.__royaltyWeb3 = web3;
  source = source.replace(/^import \{ web3Service \} from .*;?$/m, 'const web3Service = globalThis.__royaltyWeb3;');
  source = source.replace(/^import \{ walletProviderService \} from .*;?$/m, 'const walletProviderService = {};');
  for (const [pattern, replacement] of Object.entries(replacements)) source = source.replace(new RegExp(pattern, 'm'), replacement);
  source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const royalties = await loadService('bonzaiRevenueRouter.service.js');
const { knownSmartAgentRoyaltyRoutes } = await loadService('smartAgentJobs.service.js');

test('contributor royalties preserve exact integer units and each currency precision', async () => {
  for (const precision of [6, 18]) {
    decimals = precision;
    const value = await royalties.getTokenRoyaltyEntitlement(route, currency, wallet);
    assert.equal(value.rawAmount, rawAmount.toString());
    assert.equal(value.amount, ethers.formatUnits(rawAmount, precision));
    assert.equal(value.decimals, precision);
    const read = reads.findLast(item => item.method === 'tokenClaimable');
    assert.equal(read.to.toLowerCase(), other);
    assert.deepEqual([...read.args], [route, currency, wallet]);
  }
});

test('royalty claim uses the generated token selector and pays only the reviewed contributor', async () => {
  request = null;
  await assert.rejects(royalties.claimTokenRoyalties(route, currency, { expectedWallet: wallet }), /Stopped at wallet review/);
  assert.equal(request.to.toLowerCase(), other);
  const args = iface.decodeFunctionData('claimToken', request.data);
  assert.deepEqual([...args], [route, currency, wallet]);
  assert.equal(request.value ?? 0n, 0n);
  assert.equal(BigInt(request.chainId), BigInt(CONFIG.stakingEconomy.chainId));
  assert.equal(request.from.toLowerCase(), wallet);
});

test('changed wallet or actual chain blocks token claims before wallet submission', async () => {
  request = null;
  await assert.rejects(royalties.claimTokenRoyalties(route, currency, { expectedWallet: other }), /Wallet changed/);
  assert.equal(request, null);
  actualChain = 1;
  if (Number(CONFIG.stakingEconomy.chainId) === 1) actualChain = 8453;
  try {
    await assert.rejects(royalties.claimTokenRoyalties(route, currency, { expectedWallet: wallet }), /Network changed/);
    assert.equal(request, null);
  } finally { actualChain = Number(CONFIG.stakingEconomy.chainId); }
  afterBalanceRead = () => { web3.state.walletAddress = other; };
  try {
    await assert.rejects(royalties.claimTokenRoyalties(route, currency, { expectedWallet: wallet }), /Wallet changed/);
    assert.equal(request, null);
  } finally { afterBalanceRead = null; web3.state.walletAddress = wallet; }
});

test('unavailable reads and empty royalties never become a successful claim', async () => {
  failRead = true;
  try { await assert.rejects(royalties.getTokenRoyaltyEntitlement(route, currency, wallet), /Royalty RPC unavailable/); }
  finally { failRead = false; }
  const previous = rawAmount;
  rawAmount = 0n;
  request = null;
  try {
    await assert.rejects(royalties.claimTokenRoyalties(route, currency, { expectedWallet: wallet }), /No contributor royalties/);
    assert.equal(request, null);
  } finally { rawAmount = previous; }
  await assert.rejects(royalties.claimTokenRoyalties(ethers.ZeroHash, currency), /verified contribution route/);
  await assert.rejects(royalties.claimTokenRoyalties(route, ethers.ZeroAddress), /valid social-token currency/);
});

test('locally known job royalty routes require matching live terms and are deduplicated per currency', () => {
  const job = { agentName: 'Ava', terms: { routeAssetId: route, currency }, live: { routeAssetId: route, currency } };
  const otherCurrency = '0x0000000000000000000000000000000000000004';
  const rows = knownSmartAgentRoyaltyRoutes([
    job, { ...job, jobId: 'second job' },
    { ...job, terms: { ...job.terms, routeAssetId: ethers.id('tampered') } },
    { ...job, live: { ...job.live, currency: otherCurrency } },
    { ...job, live: undefined },
    { ...job, terms: { routeAssetId: route, currency: otherCurrency }, live: { routeAssetId: route, currency: otherCurrency } },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].jobCount, 2);
  assert.equal(rows[0].assetId, route);
  assert.equal(rows[1].currency, otherCurrency);
});
