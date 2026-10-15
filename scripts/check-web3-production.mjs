import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { ethers } from 'ethers';
import { CONFIG } from '../src/config/web3.config.js';
import { economyChainId, economyAddress, ECONOMY_NETWORK_KEYS } from '../src/config/economy.config.js';

export const requiredContracts = [
  'SKILL_REGISTRY', 'SKILL_OWNERSHIP', 'COLLECTIBLES', 'COLLECTIBLES_FACTORY',
  'MINT_POOL', 'ROYALTY_SPLITTER', 'FINE_TUNE_TOKEN_FACTORY', 'COMPANIONS',
  'COMPANION_TOKEN_FACTORY', 'PROVIDER_REGISTRY', 'SERVICE_TIME', 'STAKING_VAULT',
  'REVENUE_ROUTER', 'CONTRIBUTION_REGISTRY', 'DATASET_REGISTRY', 'MODEL_REGISTRY',
  'EVALUATION_REGISTRY', 'CONTRIBUTION_SCORE_ORACLE', 'UNISWAP_HOOK',
  'GAME_REGISTRY', 'GAME_TOKEN_FACTORY', 'BASKET_REWARDS', 'JOB_ESCROW',
  'SMART_AGENTS', 'AGENT_TOKEN_FACTORY', 'NVDA_SWAP', 'NVDA',
];
const uniswapFields = { POOL_MANAGER: 'poolManager', POSITION_MANAGER: 'positionManager', UNIVERSAL_ROUTER: 'universalRouter', QUOTER: 'quoter', STATE_VIEW: 'stateView', PERMIT2: 'permit2' };

export function productionConfiguration(env = process.env) {
  const chainId = economyChainId(env);
  const networkKey = ECONOMY_NETWORK_KEYS[chainId];
  const key = networkKey.toUpperCase();
  const rpc = env[`VITE_${key.replace('ROBINHOODTESTNET', 'ROBINHOOD_TESTNET')}_RPC_URL`]
    || env[`${key.replace('ROBINHOODTESTNET', 'ROBINHOOD_TESTNET')}_RPC_URL`]
    || (chainId === 1 && env.MAINNET_RPC_URL) || CONFIG.networks[networkKey].rpc;
  const failures = [];
  const addresses = new Map();
  const add = (name, value, label) => {
    if (!value) failures.push(`Missing ${label}`);
    else if (!ethers.isAddress(value) || value.toLowerCase() === ethers.ZeroAddress) failures.push(`Invalid ${label}`);
    else addresses.set(name, ethers.getAddress(value));
  };
  for (const name of requiredContracts) add(name, economyAddress(env, name, chainId), `VITE_BONZAI_${name}_${key}_ADDRESS`);
  add('TOKEN', economyAddress(env, 'TOKEN', chainId) || CONFIG.tokens.BONZAI[networkKey], `VITE_BONZAI_TOKEN_${key}_ADDRESS`);
  // Require an explicit verified settlement currency; legacy UI aliases have
  // historically called another stablecoin "usdc" on some networks.
  add('USDC', economyAddress(env, 'USDC', chainId), `VITE_BONZAI_USDC_${key}_ADDRESS`);
  for (const [suffix, field] of Object.entries(uniswapFields)) {
    add(`UNISWAP_V4_${suffix}`, env[`VITE_UNISWAP_V4_${suffix}_${key}`] || env[`VITE_UNISWAP_V4_${suffix}`] || CONFIG.uniswap[networkKey]?.[field], `VITE_UNISWAP_V4_${suffix}`);
  }
  const hook = addresses.get('UNISWAP_HOOK');
  if (hook && (BigInt(hook) & 0x3fffn) !== 0x44n) failures.push('UNISWAP_HOOK address must encode afterSwap + afterSwapReturnDelta (0x0044)');
  try {
    const map = JSON.parse(env.VITE_BONZAI_SKILL_ID_MAP_JSON || '{}');
    if (!map || Array.isArray(map) || typeof map !== 'object' || !Object.keys(map).length) throw new Error('expected a nonempty object');
    for (const [localId, skillId] of Object.entries(map)) {
      if (!localId || !ethers.isHexString(skillId, 32) || skillId === ethers.ZeroHash) failures.push(`Invalid skill ID for ${localId}`);
    }
  } catch (error) { failures.push(`Invalid VITE_BONZAI_SKILL_ID_MAP_JSON: ${error.message}`); }
  return { chainId, networkKey, key, rpc, addresses, failures };
}

export const wiringChecks = [
  ['SMART_AGENTS', 'launcher', 'AGENT_TOKEN_FACTORY'],
  ['AGENT_TOKEN_FACTORY', 'companionContract', 'SMART_AGENTS'],
  ['AGENT_TOKEN_FACTORY', 'nvda', 'NVDA'],
  ['AGENT_TOKEN_FACTORY', 'swapper', 'NVDA_SWAP'],
  ['AGENT_TOKEN_FACTORY', 'poolManager', 'UNISWAP_V4_POOL_MANAGER'],
  ['AGENT_TOKEN_FACTORY', 'positionManager', 'UNISWAP_V4_POSITION_MANAGER'],
  ['AGENT_TOKEN_FACTORY', 'permit2', 'UNISWAP_V4_PERMIT2'],
  ['NVDA_SWAP', 'nvda', 'NVDA'],
  ['NVDA_SWAP', 'router', 'UNISWAP_V4_UNIVERSAL_ROUTER'],
  ['STAKING_VAULT', 'bonzaiToken', 'TOKEN'],
  ['BASKET_REWARDS', 'stakingVault', 'STAKING_VAULT'],
  ['BASKET_REWARDS', 'socialTokenFactory', 'COMPANION_TOKEN_FACTORY'],
  ['BASKET_REWARDS', 'smartAgents', 'COMPANIONS'],
  ['REVENUE_ROUTER', 'basketRewards', 'BASKET_REWARDS'],
  ['MINT_POOL', 'basketRewards', 'BASKET_REWARDS'],
  ['JOB_ESCROW', 'socialTokenFactory', 'COMPANION_TOKEN_FACTORY'],
  ['JOB_ESCROW', 'smartAgents', 'COMPANIONS'],
  ['JOB_ESCROW', 'basketRewards', 'BASKET_REWARDS'],
  ['JOB_ESCROW', 'revenueRouter', 'REVENUE_ROUTER'],
  ['REVENUE_ROUTER', 'stakingVault', 'STAKING_VAULT'],
  ['CONTRIBUTION_SCORE_ORACLE', 'stakingVault', 'STAKING_VAULT'],
  ['COLLECTIBLES_FACTORY', 'implementation', 'COLLECTIBLES'],
  ['COLLECTIBLES_FACTORY', 'stakingVault', 'STAKING_VAULT'],
  ['COLLECTIBLES_FACTORY', 'mintPool', 'MINT_POOL'],
  ['COLLECTIBLES_FACTORY', 'royaltySplitter', 'ROYALTY_SPLITTER'],
  ['MINT_POOL', 'bonzaiToken', 'TOKEN'],
  ['MINT_POOL', 'stakingVault', 'STAKING_VAULT'],
  ['MINT_POOL', 'royaltySplitter', 'ROYALTY_SPLITTER'],
  ['MINT_POOL', 'collectiblesFactory', 'COLLECTIBLES_FACTORY'],
  ['MINT_POOL', 'companionContract', 'COMPANIONS'],
  ['MINT_POOL', 'feeHook', 'UNISWAP_HOOK'],
  ['MINT_POOL', 'serviceTimeContract', 'SERVICE_TIME'],
  ['ROYALTY_SPLITTER', 'mintPool', 'MINT_POOL'],
  ['SERVICE_TIME', 'bonzaiToken', 'TOKEN'],
  ['SERVICE_TIME', 'mintPool', 'MINT_POOL'],
  ['SERVICE_TIME', 'providerRegistry', 'PROVIDER_REGISTRY'],
  ['PROVIDER_REGISTRY', 'paymentContract', 'SERVICE_TIME'],
  ['COMPANIONS', 'mintPool', 'MINT_POOL'],
  ['COMPANIONS', 'companionTokenFactory', 'COMPANION_TOKEN_FACTORY'],
  ['COMPANION_TOKEN_FACTORY', 'companionContract', 'COMPANIONS'],
  ['FINE_TUNE_TOKEN_FACTORY', 'contentContract', 'COLLECTIBLES_FACTORY'],
  ['SKILL_REGISTRY', 'skillOwnershipContract', 'SKILL_OWNERSHIP'],
  ['SKILL_OWNERSHIP', 'skillRegistry', 'SKILL_REGISTRY'],
  ['SKILL_OWNERSHIP', 'companionNFT', 'COMPANIONS'],
  ['SKILL_OWNERSHIP', 'companionTokenFactory', 'COMPANION_TOKEN_FACTORY'],
  ['SKILL_OWNERSHIP', 'bonzaiToken', 'TOKEN'],
  ['UNISWAP_HOOK', 'poolManager', 'UNISWAP_V4_POOL_MANAGER'],
  ['UNISWAP_HOOK', 'mintPool', 'MINT_POOL'],
  ['UNISWAP_HOOK', 'revenueRouter', 'REVENUE_ROUTER'],
  ...['COMPANION_TOKEN_FACTORY', 'FINE_TUNE_TOKEN_FACTORY'].flatMap(name => [
    [name, 'poolManager', 'UNISWAP_V4_POOL_MANAGER'], [name, 'positionManager', 'UNISWAP_V4_POSITION_MANAGER'],
    [name, 'permit2', 'UNISWAP_V4_PERMIT2'], [name, 'feeHook', 'UNISWAP_HOOK'],
  ]),
];

export async function verifyProduction(config, { provider, offline = false } = {}) {
  const failures = [...config.failures];
  if (offline) return { ...config, failures, offline: true, deployedContractsVerified: 0 };
  let ownsProvider = false;
  if (!provider) {
    const request = new ethers.FetchRequest(config.rpc);
    request.timeout = 12000;
    provider = new ethers.JsonRpcProvider(request, config.chainId, { batchMaxCount: 1, staticNetwork: true });
    ownsProvider = true;
  }
  let deployedContractsVerified = 0;
  const read = async (name, signature, method, args = []) => new ethers.Contract(config.addresses.get(name), [signature], provider)[method](...args);
  const check = async (label, task) => {
    try { await task(); } catch (error) { failures.push(`${label}: ${error.shortMessage || error.message}`); }
  };
  try {
    // getNetwork() with staticNetwork merely echoes the configured ID.
    const actualChainId = Number(await provider.send('eth_chainId', []));
    if (actualChainId !== config.chainId) {
      failures.push(`RPC returned chain ${actualChainId}, expected ${config.chainId}`);
      return { ...config, failures, offline: false, deployedContractsVerified };
    }
    const deployed = new Set();
    await Promise.all([...config.addresses].map(([name, address]) => check(name, async () => {
      if (await provider.getCode(address) === '0x') failures.push(`${name} has no deployed bytecode at ${address}`);
      else { deployed.add(name); deployedContractsVerified += 1; }
    })));
    for (const [name, getter, legacyExpected] of wiringChecks) {
      const expected = ['JOB_ESCROW', 'BASKET_REWARDS'].includes(name) && config.addresses.has('SMART_AGENTS')
        ? ({ COMPANIONS: 'SMART_AGENTS', COMPANION_TOKEN_FACTORY: 'AGENT_TOKEN_FACTORY' }[legacyExpected] || legacyExpected) : legacyExpected;
      if (!deployed.has(name) || !config.addresses.has(expected)) continue;
      await check(`${name}.${getter}`, async () => {
        const actual = ethers.getAddress(await read(name, `function ${getter}() view returns(address)`, getter));
        if (actual !== config.addresses.get(expected)) failures.push(`${name}.${getter} is ${actual}, expected ${config.addresses.get(expected)}`);
      });
    }
    for (const [name, getter, expected] of [
      ['SMART_AGENTS', 'MAX_SUPPLY', 10000n], ['SMART_AGENTS', 'MAX_PER_WALLET', 3n],
      ['SMART_AGENTS', 'MINT_PRICE', ethers.parseEther('2')], ['SMART_AGENTS', 'LP_RESERVE', ethers.parseEther('1')],
      ['AGENT_TOKEN_FACTORY', 'TOTAL_SUPPLY', ethers.parseEther('1000000000')],
      ['AGENT_TOKEN_FACTORY', 'POOL_SUPPLY', ethers.parseEther('960000000')],
    ]) {
      if (deployed.has(name)) await check(`${name}.${getter}`, async () => {
        if (await read(name, `function ${getter}() view returns(uint256)`, getter) !== expected) failures.push(`${name}.${getter} does not match the approved agent economy`);
      });
    }
    for (const [index, value] of [1000, 5000, 10000, 25000, 33000, 50000].entries()) {
      for (const [name, getter] of [['STAKING_VAULT', 'utilityTierThresholds'], ['MINT_POOL', 'poolThresholds']]) {
        if (!deployed.has(name)) continue;
        await check(`${name} tier ${index + 1}`, async () => {
          if (await read(name, `function ${getter}(uint256) view returns(uint256)`, getter, [index]) !== ethers.parseEther(String(value))) failures.push(`${name} tier ${index + 1} threshold is incorrect`);
        });
      }
    }
    if (deployed.has('SERVICE_TIME')) await check('provider rewards safety', async () => {
      const paused = await read('SERVICE_TIME', 'function claimsPaused() view returns(bool)', 'claimsPaused');
      const attestor = await read('SERVICE_TIME', 'function serviceTimeAttestor() view returns(address)', 'serviceTimeAttestor');
      if (!paused && attestor === ethers.ZeroAddress) failures.push('Provider claims are enabled without a service-time attestor');
      // No independently validated receipt producer ships with this RC.
      if (!paused) failures.push('Provider claims must remain paused until the independent service receipt attestor is deployed and audited');
    });
    if (deployed.has('TOKEN')) await check('TOKEN.decimals', async () => {
      if (await read('TOKEN', 'function decimals() view returns(uint8)', 'decimals') !== 18n) failures.push('BONZAI must have 18 decimals');
    });
    if (deployed.has('USDC')) await check('USDC.decimals', async () => {
      if (await read('USDC', 'function decimals() view returns(uint8)', 'decimals') !== 6n) failures.push('USDC must have 6 decimals');
    });
    if (deployed.has('BASKET_REWARDS') && config.addresses.has('USDC')) await check('USDC basket rewards', async () => {
      if (!await read('BASKET_REWARDS', 'function rewardCurrencyEnabled(address) view returns(bool)', 'rewardCurrencyEnabled', [config.addresses.get('USDC')])) failures.push('USDC rewards are not enabled in the currency basket');
    });
    if (deployed.has('STAKING_VAULT')) await check('reward withdrawal commitment', async () => {
      if (await read('STAKING_VAULT', 'function REWARD_EXIT_DELAY() view returns(uint256)', 'REWARD_EXIT_DELAY') !== 90n * 86400n) failures.push('BONZAI basket membership must use the agreed 90-day exit notice');
    });
    if (deployed.has('COLLECTIBLES_FACTORY')) await check('collection membership registry', async () => {
      if (await read('COLLECTIBLES_FACTORY', 'function isCollection(address) view returns(bool)', 'isCollection', [ethers.ZeroAddress])) failures.push('Invalid collection membership registry');
    });
    if (deployed.has('FINE_TUNE_TOKEN_FACTORY')) await check('model publisher attestation gate', async () => {
      if (await read('FINE_TUNE_TOKEN_FACTORY', 'function legacyLaunchEnabled() view returns(bool)', 'legacyLaunchEnabled')) failures.push('Legacy model launches without publisher attestations remain enabled');
      await read('FINE_TUNE_TOKEN_FACTORY', 'function getToken(address,uint256) view returns(address)', 'getToken', [ethers.ZeroAddress, 0n]);
    });
    if (deployed.has('STAKING_VAULT') && config.addresses.has('CONTRIBUTION_SCORE_ORACLE')) await check('score attestor authorization', async () => {
      if (!await read('STAKING_VAULT', 'function scoreAttestors(address) view returns(bool)', 'scoreAttestors', [config.addresses.get('CONTRIBUTION_SCORE_ORACLE')])) failures.push('Contribution score oracle is not authorized by the staking vault');
    });
    for (const factory of ['COMPANION_TOKEN_FACTORY', 'FINE_TUNE_TOKEN_FACTORY']) {
      if (!deployed.has('UNISWAP_HOOK') || !config.addresses.has(factory)) continue;
      await check(`${factory} hook authorization`, async () => {
        if (!await read('UNISWAP_HOOK', 'function authorizedFactories(address) view returns(bool)', 'authorizedFactories', [config.addresses.get(factory)])) failures.push(`${factory} cannot register hook pools`);
      });
    }
  } catch (error) { failures.push(`RPC verification failed: ${error.shortMessage || error.message}`); }
  finally { if (ownsProvider) provider.destroy(); }
  return { ...config, failures, offline: false, deployedContractsVerified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyProduction(productionConfiguration(), { offline: process.argv.includes('--offline') });
    if (result.failures.length) {
      console.error(`Web3 production preflight failed for ${result.key} (${result.chainId}):`);
      result.failures.forEach(failure => console.error(`- ${failure}`));
      process.exitCode = 1;
    } else if (result.offline) {
      console.log(`Web3 configuration checks passed for ${result.key} (${result.chainId}). Offline mode did not verify deployment or wiring.`);
    } else {
      console.log(`Web3 production preflight passed for ${result.key} (${result.chainId}); checked bytecode at ${result.deployedContractsVerified} addresses and protocol wiring.`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
