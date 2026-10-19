// Shared by Vite, Hardhat and the read-only preflight. Public settings only.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function parseProtocolConfig(text) {
  const values = dotenv.parse(text);
  for (const key of Object.keys(values)) {
    if (!/^(VITE_BONZAI_(ECONOMY_CHAIN_ID|SKILL_ID_MAP_JSON|[A-Z_]+_ADDRESS)|VITE_DEFAULT_COMPANION_TOKENS_JSON|VITE_(ROBINHOOD|ROBINHOOD_TESTNET|ETHEREUM|BASE|ARBITRUM)_RPC_URL|VITE_UNISWAP_V4_[A-Z0-9_]+|BONZAI_(TREASURY|SERVICE_TIME_ATTESTOR|GOVERNANCE)_ADDRESS)$/.test(key)) {
      throw new Error(`Unsupported public protocol setting: ${key}. Keep credentials in secrets, outside this file.`);
    }
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
}

function loadProtocolConfig({ root = path.resolve(__dirname, '..'), env = process.env } = {}) {
  const read = name => fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), 'utf8') : '';
  // Explicit CI configuration replaces local configuration. Never mix addresses
  // from a developer checkout with a different release deployment.
  const values = env.BONZAI_PROTOCOL_CONFIG_ENV?.trim()
    ? parseProtocolConfig(env.BONZAI_PROTOCOL_CONFIG_ENV)
    : { ...parseProtocolConfig(read('config/protocol.env')), ...parseProtocolConfig(read('config/protocol.local.env')) };
  for (const [key, value] of Object.entries(values)) {
    if (env[key]?.trim() && env[key] !== value) throw new Error(`Conflicting protocol setting: ${key}. Remove the stale environment override.`);
    env[key] = value;
  }
  // Deployment scripts use unprefixed names. Derive them from the selected
  // chain only, and reject conflicting legacy values instead of deploying wrong.
  const network = { 1: 'ETHEREUM', 8453: 'BASE', 42161: 'ARBITRUM', 4663: 'ROBINHOOD', 46630: 'ROBINHOODTESTNET' }[env.VITE_BONZAI_ECONOMY_CHAIN_ID];
  if (!network) throw new Error('Unsupported protocol economy chain');
  for (const [key, value] of Object.entries(values)) {
    const match = key.match(new RegExp(`^VITE_BONZAI_(.+)_${network}_ADDRESS$`));
    if (!match) continue;
    const alias = `BONZAI_${match[1]}_ADDRESS`;
    if (env[alias]?.trim() && env[alias] !== value) throw new Error(`Conflicting protocol setting: ${alias}`);
    env[alias] = value;
  }
  const rpcKey = network === 'ROBINHOODTESTNET' ? 'ROBINHOOD_TESTNET' : network;
  const rpc = env[`VITE_${rpcKey}_RPC_URL`];
  if (rpc) {
    if (env[`${rpcKey}_RPC_URL`]?.trim() && env[`${rpcKey}_RPC_URL`] !== rpc) throw new Error(`Conflicting protocol setting: ${rpcKey}_RPC_URL`);
    env[`${rpcKey}_RPC_URL`] = rpc;
  }
  return values;
}

module.exports = { parseProtocolConfig, loadProtocolConfig };
