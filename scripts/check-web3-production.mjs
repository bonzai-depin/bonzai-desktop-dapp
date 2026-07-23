import 'dotenv/config';
import { ethers } from 'ethers';

const chainId = Number(process.env.VITE_BONZAI_ECONOMY_CHAIN_ID || 1);
const chains = {
  1: { key: 'ETHEREUM', rpc: process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || 'https://ethereum.publicnode.com' },
  42161: { key: 'ARBITRUM', rpc: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com' },
  8453: { key: 'BASE', rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
};
const chain = chains[chainId];
if (!chain) throw new Error(`Unsupported VITE_BONZAI_ECONOMY_CHAIN_ID: ${chainId}`);

const requiredContracts = [
  'SKILL_REGISTRY',
  'SKILL_OWNERSHIP',
  'COLLECTIBLES',
  'COLLECTIBLES_FACTORY',
  'MINT_POOL',
  'ROYALTY_SPLITTER',
  'FINE_TUNE_TOKEN_FACTORY',
  'COMPANIONS',
  'COMPANION_TOKEN_FACTORY',
  'PROVIDER_REGISTRY',
  'SERVICE_TIME',
  'STAKING_VAULT',
  'REVENUE_ROUTER',
  'CONTRIBUTION_REGISTRY',
  'DATASET_REGISTRY',
  'MODEL_REGISTRY',
  'EVALUATION_REGISTRY',
  'CONTRIBUTION_SCORE_ORACLE',
  'UNISWAP_HOOK',
];

const resolveAddress = (name) => process.env[`VITE_BONZAI_${name}_${chain.key}_ADDRESS`]
  || process.env[`VITE_BONZAI_${name}_ADDRESS`]
  || (chainId === 1 ? process.env[`VITE_BONZAI_${name}_ETHEREUM_ADDRESS`] : null);

const failures = [];
const addresses = new Map();
for (const name of requiredContracts) {
  const address = resolveAddress(name);
  if (!address) {
    failures.push(`Missing VITE_BONZAI_${name}_${chain.key}_ADDRESS`);
  } else if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
    failures.push(`Invalid ${name} address: ${address}`);
  } else {
    addresses.set(name, ethers.getAddress(address));
  }
}

if (chainId === 1) {
  for (const name of ['POOL_MANAGER', 'POSITION_MANAGER', 'UNIVERSAL_ROUTER', 'QUOTER', 'STATE_VIEW']) {
    const address = process.env[`VITE_UNISWAP_V4_${name}`];
    if (!address) failures.push(`Missing VITE_UNISWAP_V4_${name}`);
    else if (!ethers.isAddress(address) || address === ethers.ZeroAddress) failures.push(`Invalid VITE_UNISWAP_V4_${name}: ${address}`);
    else addresses.set(`UNISWAP_V4_${name}`, ethers.getAddress(address));
  }
}

const skillMapRaw = process.env.VITE_BONZAI_SKILL_ID_MAP_JSON;
if (!skillMapRaw) {
  failures.push('Missing VITE_BONZAI_SKILL_ID_MAP_JSON');
} else {
  try {
    const skillMap = JSON.parse(skillMapRaw);
    if (!skillMap || Object.keys(skillMap).length === 0) throw new Error('map is empty');
    for (const [localId, skillId] of Object.entries(skillMap)) {
      if (!ethers.isHexString(skillId, 32)) failures.push(`Invalid skill ID for ${localId}`);
    }
  } catch (error) {
    failures.push(`Invalid VITE_BONZAI_SKILL_ID_MAP_JSON: ${error.message}`);
  }
}

if (failures.length === 0 && !process.argv.includes('--offline')) {
  const provider = new ethers.JsonRpcProvider(chain.rpc, chainId, { staticNetwork: true });
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chainId) failures.push(`RPC returned chain ${network.chainId}, expected ${chainId}`);
  const checks = await Promise.all([...addresses].map(async ([name, address]) => [name, address, await provider.getCode(address)]));
  for (const [name, address, code] of checks) {
    if (code === '0x') failures.push(`${name} has no deployed bytecode at ${address}`);
  }
  if (failures.length === 0) {
    const expectedVault = addresses.get('STAKING_VAULT');
    for (const name of ['COLLECTIBLES_FACTORY', 'MINT_POOL']) {
      const contract = new ethers.Contract(
        addresses.get(name),
        ['function stakingVault() view returns (address)'],
        provider,
      );
      const configuredVault = ethers.getAddress(await contract.stakingVault());
      if (configuredVault !== expectedVault) {
        failures.push(`${name}.stakingVault is ${configuredVault}, expected ${expectedVault}`);
      }
    }
    const expectedThresholds = [1000n, 5000n, 10000n, 25000n, 33000n, 50000n]
      .map((amount) => amount * 10n ** 18n);
    const vault = new ethers.Contract(
      expectedVault,
      ['function utilityTierThresholds(uint256) view returns (uint256)'],
      provider,
    );
    const mintPool = new ethers.Contract(
      addresses.get('MINT_POOL'),
      ['function poolThresholds(uint256) view returns (uint256)'],
      provider,
    );
    for (let index = 0; index < expectedThresholds.length; index += 1) {
      const [vaultThreshold, poolThreshold] = await Promise.all([
        vault.utilityTierThresholds(index),
        mintPool.poolThresholds(index),
      ]);
      if (vaultThreshold !== expectedThresholds[index]) failures.push(`STAKING_VAULT tier ${index + 1} threshold is incorrect`);
      if (poolThreshold !== expectedThresholds[index]) failures.push(`MINT_POOL tier ${index + 1} threshold is incorrect`);
    }
    const wiringChecks = [
      ['COLLECTIBLES_FACTORY', 'mintPool', 'MINT_POOL'],
      ['COLLECTIBLES_FACTORY', 'royaltySplitter', 'ROYALTY_SPLITTER'],
      ['MINT_POOL', 'royaltySplitter', 'ROYALTY_SPLITTER'],
      ['MINT_POOL', 'serviceTimeContract', 'SERVICE_TIME'],
      ['SERVICE_TIME', 'providerRegistry', 'PROVIDER_REGISTRY'],
      ['PROVIDER_REGISTRY', 'paymentContract', 'SERVICE_TIME'],
    ];
    for (const [contractName, getter, expectedName] of wiringChecks) {
      const contract = new ethers.Contract(
        addresses.get(contractName),
        [`function ${getter}() view returns (address)`],
        provider,
      );
      const actual = ethers.getAddress(await contract[getter]());
      if (actual !== addresses.get(expectedName)) {
        failures.push(`${contractName}.${getter} is ${actual}, expected ${addresses.get(expectedName)}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Web3 production preflight failed for ${chain.key} (${chainId}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Web3 production preflight passed for ${chain.key} (${chainId}); verified ${addresses.size} contracts.`);
}
