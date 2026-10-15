// Shared by the renderer and the read-only production preflight.
export const DEFAULT_ECONOMY_CHAIN_ID = 4663;
export const ECONOMY_NETWORK_KEYS = Object.freeze({
  1: 'ethereum',
  42161: 'arbitrum',
  8453: 'base',
  4663: 'robinhood',
  46630: 'robinhoodTestnet',
});

export function economyChainId(env = {}) {
  const id = Number(env.VITE_BONZAI_ECONOMY_CHAIN_ID || DEFAULT_ECONOMY_CHAIN_ID);
  if (!ECONOMY_NETWORK_KEYS[id]) throw new Error(`Unsupported VITE_BONZAI_ECONOMY_CHAIN_ID: ${id}`);
  return id;
}

export function economyAddress(env, name, chainId = economyChainId(env)) {
  const key = ECONOMY_NETWORK_KEYS[chainId];
  if (!key) throw new Error(`Unsupported economy chain: ${chainId}`);
  // Never reuse another chain's address, even when that address contains code.
  return env[`VITE_BONZAI_${name}_${key.toUpperCase()}_ADDRESS`]
    || env[`VITE_BONZAI_${name}_ADDRESS`] || null;
}
