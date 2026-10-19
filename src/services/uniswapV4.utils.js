/**
 * Shared Uniswap V4 Utilities
 *
 * Common ABIs, contract accessors, and helpers used by both
 * companionToken.service.js and fineTuneToken.service.js.
 *
 * Extracted to eliminate duplication between the two token factory services
 * that share pool/URL logic. Trading-fee operations live in liquidityVault.service.js.
 */

import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED ABIs
// ═══════════════════════════════════════════════════════════════════════════

/** Uniswap V4 StateView ABI (pool queries) */
export const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint16 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
];

// ═══════════════════════════════════════════════════════════════════════════
// POOL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get pool info via StateView contract
 * @param {string} poolId - V4 pool ID hash (bytes32)
 * @param {string} logPrefix - Log prefix for error messages
 * @returns {Promise<Object|null>} Pool info with sqrtPrice and liquidity
 */
export async function getPoolInfo(poolId, logPrefix = 'UniswapV4') {
  try {
    const stateViewAddress = CONFIG.uniswap?.[ECONOMY_NETWORK_KEY]?.stateView;
    if (!stateViewAddress) return null;

    const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
    const stateView = new ethers.Contract(stateViewAddress, STATE_VIEW_ABI, provider);

    const [slot0, liquidity] = await Promise.all([
      stateView.getSlot0(poolId),
      stateView.getLiquidity(poolId),
    ]);

    return {
      poolId,
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      tick: slot0.tick,
      lpFee: slot0.lpFee,
      liquidity: liquidity.toString(),
    };
  } catch (e) {
    console.error(`[${logPrefix}] getPoolInfo failed:`, e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// URL BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build Uniswap trade URL for a token on Base
 * @param {string} tokenAddress - Token address
 * @returns {string} Uniswap swap URL
 */
export function getUniswapTradeUrl(tokenAddress) {
  return `https://app.uniswap.org/swap?chain=${ECONOMY_NETWORK_KEY === 'ethereum' ? 'mainnet' : ECONOMY_NETWORK_KEY}&outputCurrency=${tokenAddress}`;
}

/**
 * Build BaseScan token URL
 * @param {string} tokenAddress - Token address
 * @returns {string} BaseScan URL
 */
export function getBaseScanUrl(tokenAddress) {
  return `${CONFIG.networks[ECONOMY_NETWORK_KEY].explorer}/token/${tokenAddress}`;
}

/**
 * Build DexScreener URL for a token on Base
 * @param {string} tokenAddress - Token address
 * @returns {string} DexScreener URL
 */
export function getDexScreenerUrl(tokenAddress) {
  return `https://dexscreener.com/${ECONOMY_NETWORK_KEY}/${tokenAddress}`;
}
