/**
 * Shared Uniswap V4 Utilities
 *
 * Common ABIs, contract accessors, and helpers used by both
 * companionToken.service.js and fineTuneToken.service.js.
 *
 * Extracted to eliminate duplication between the two token factory services
 * that share identical hook/pool/URL logic.
 */

import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED ABIs
// ═══════════════════════════════════════════════════════════════════════════

/** BonzaiUniswapHook ABI (fee queries and claiming) */
export const HOOK_ABI = [
  'function unclaimedBeneficiary(address) view returns (uint256)',
  'function getUnclaimedFees(address beneficiary) view returns (uint256)',
  'function claimBeneficiaryFees()',
  'function getPoolConfig(bytes32 poolId) view returns (address beneficiary, address companionOwner, uint8 poolType, uint8 mintPoolIndex, bool active)',
];

/** Uniswap V4 StateView ABI (pool queries) */
export const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint16 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ACCESSORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get hook contract instance
 * @param {boolean} withSigner - Whether to attach signer
 * @returns {Promise<ethers.Contract|null>}
 */
export async function getHookContract(withSigner = false) {
  const hookAddress = CONFIG.uniswap?.[ECONOMY_NETWORK_KEY]?.feeHook;
  if (!hookAddress || hookAddress === ethers.ZeroAddress) return null;

  if (withSigner) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(hookAddress, HOOK_ABI, signer);
  }

  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(hookAddress, HOOK_ABI, provider);
}

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
// FEE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get unclaimed hook fees for a beneficiary address
 * @param {string} beneficiaryAddress - Address to check
 * @param {string} logPrefix - Log prefix for error messages
 * @returns {Promise<string>} Unclaimed fees in ETH (formatted)
 */
export async function getUnclaimedFees(beneficiaryAddress, logPrefix = 'UniswapV4') {
  try {
    const hook = await getHookContract(false);
    if (!hook) return '0';

    const unclaimed = await hook.getUnclaimedFees(beneficiaryAddress);
    return ethers.formatEther(unclaimed);
  } catch (e) {
    console.error(`[${logPrefix}] getUnclaimedFees failed:`, e);
    return '0';
  }
}

/**
 * Claim accumulated beneficiary fees from the hook
 * @param {string} logPrefix - Log prefix for messages
 * @returns {Promise<Object>} Claim result
 */
export async function claimFees(logPrefix = 'UniswapV4') {
  try {
    const hook = await getHookContract(true);
    if (!hook) throw new Error('Fee hook not configured');

    const tx = await hook.claimBeneficiaryFees();
    const receipt = await tx.wait();

    console.log(`[${logPrefix}] Fees claimed, tx: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    console.error(`[${logPrefix}] claimFees failed:`, e);
    return { success: false, error: e.message };
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
