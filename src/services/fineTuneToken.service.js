/**
 * BonzAI Fine-Tune Token Service
 *
 * Manages token launches for fine-tuned AI models on Base with Uniswap V4 liquidity.
 *
 * Features:
 * - Launch burnable ERC-20 tokens for minted fine-tune model NFTs
 * - Automatic Uniswap V4 pool creation with hook-based fees
 * - LP position NFT locked at DEAD address (unruggable - permanent liquidity)
 * - Tokens are burnable (deflationary)
 * - 1% swap fee split: 80% creator, 10% treasury, 10% MintPool(LVL6)
 * - Query token, pool, and fee info
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// Factory ABI - V4 interface (FineTuneTokenFactory)
const FACTORY_ABI = [
  // Write functions
  'function launchToken(uint256 contentTokenId, string name, string symbol, string modelIrysHash, address creator) payable returns (address token, bytes32 poolId)',

  // Read functions
  'function modelTokens(uint256 contentTokenId) view returns (address)',
  'function hasToken(uint256 contentTokenId) view returns (bool)',
  'function getToken(uint256 contentTokenId) view returns (address)',
  'function minEthLiquidity() view returns (uint256)',
  'function totalTokensLaunched() view returns (uint256)',
  'function getAllTokens() view returns (address[])',
  'function TOTAL_SUPPLY() view returns (uint256)',

  // Events
  'event ModelTokenLaunched(uint256 indexed contentTokenId, address indexed token, bytes32 indexed poolId, string symbol, uint256 ethLiquidity, uint256 positionId, address creator, uint256 timestamp)',
];

// FineTuneToken ABI
const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function contentTokenId() view returns (uint256)',
  'function modelIrysHash() view returns (string)',
  'function creator() view returns (address)',
  'function getTokenInfo() view returns (string name_, string symbol_, uint8 decimals_, uint256 contentTokenId_, string modelIrysHash_, address creator_)',
];

// BonzaiUniswapHook ABI (for fee queries and claiming)
const HOOK_ABI = [
  'function unclaimedBeneficiary(address) view returns (uint256)',
  'function getUnclaimedFees(address beneficiary) view returns (uint256)',
  'function claimBeneficiaryFees()',
  'function getPoolConfig(bytes32 poolId) view returns (address beneficiary, address companionOwner, uint8 poolType, uint8 mintPoolIndex, bool active)',
];

// Uniswap V4 StateView ABI (for pool queries)
const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint16 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
];

// Service state
const state = reactive({
  isLoading: false,
  error: null,
  launchingContentTokenId: null,
});

/**
 * Get factory contract instance
 */
async function getFactoryContract(withSigner = false) {
  const factoryAddress = CONFIG.fineTuneTokenFactory?.contractAddress;
  if (!factoryAddress) {
    throw new Error('Fine-tune token factory not deployed. Set CONFIG.fineTuneTokenFactory.contractAddress');
  }

  if (withSigner) {
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  }

  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
}

/**
 * Get hook contract instance
 */
async function getHookContract(withSigner = false) {
  const hookAddress = CONFIG.uniswap?.base?.feeHook;
  if (!hookAddress) return null;

  if (withSigner) {
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(hookAddress, HOOK_ABI, signer);
  }

  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(hookAddress, HOOK_ABI, provider);
}

/**
 * Launch a fine-tune model token with Uniswap V4 liquidity
 *
 * @param {number|string} contentTokenId - BonzaiContent NFT token ID for the model
 * @param {string} name - Token name (e.g., "BonzAI Fine-Tune: My Custom Model")
 * @param {string} symbol - Token symbol (e.g., "BZCUSTOM")
 * @param {string} modelIrysHash - Irys/Arweave hash of the model weights
 * @param {string} ethAmount - Amount of ETH for liquidity (e.g., "0.01")
 *
 * @returns {Promise<Object>} Launch result with token address and poolId
 */
async function launchFineTuneToken(contentTokenId, name, symbol, modelIrysHash, ethAmount) {
  if (!contentTokenId) {
    throw new Error('Content NFT token ID required');
  }
  if (!name || !symbol) {
    throw new Error('Token name and symbol required');
  }
  if (!ethAmount || parseFloat(ethAmount) <= 0) {
    throw new Error('ETH amount required for liquidity');
  }

  state.isLoading = true;
  state.launchingContentTokenId = contentTokenId;
  state.error = null;

  try {
    // Ensure we're on Base network
    await web3Service.switchNetwork?.('base');

    const factory = await getFactoryContract(true);

    // Check if token already exists
    const existingToken = await factory.getToken(contentTokenId);
    if (existingToken !== ethers.ZeroAddress) {
      throw new Error(`Token already launched for content NFT #${contentTokenId}. Address: ${existingToken}`);
    }

    // Check minimum ETH
    const minEth = await factory.minEthLiquidity();
    const ethWei = ethers.parseEther(ethAmount);
    if (ethWei < minEth) {
      throw new Error(`Minimum ETH required: ${ethers.formatEther(minEth)} ETH`);
    }

    // Get creator address
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    const creator = await signer.getAddress();

    console.log(`[FineTuneToken] Launching $${symbol} token for model NFT #${contentTokenId}...`);
    console.log(`[FineTuneToken] Creator: ${creator}`);
    console.log(`[FineTuneToken] ETH liquidity: ${ethAmount}`);

    // Launch token (V4: returns token + poolId)
    const tx = await factory.launchToken(
      contentTokenId,
      name,
      symbol,
      modelIrysHash || '',
      creator,
      { value: ethWei },
    );

    console.log(`[FineTuneToken] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[FineTuneToken] Transaction confirmed in block ${receipt.blockNumber}`);

    // Parse event to get token and poolId
    let tokenAddress = null;
    let poolId = null;
    let launchSymbol = symbol;

    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === 'ModelTokenLaunched') {
          tokenAddress = parsed.args.token;
          poolId = parsed.args.poolId;
          launchSymbol = parsed.args.symbol;
          console.log(`[FineTuneToken] Token deployed: ${tokenAddress}`);
          console.log(`[FineTuneToken] Pool ID: ${poolId}`);
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }

    if (!tokenAddress) {
      tokenAddress = await factory.getToken(contentTokenId);
    }

    return {
      success: true,
      tokenAddress,
      poolId,
      symbol: launchSymbol,
      txHash: receipt.hash,
      ethLiquidity: ethAmount,
      lpLocked: true,  // LP position NFT sent to DEAD address
    };
  } catch (e) {
    console.error('[FineTuneToken] Launch failed:', e);
    state.error = e.message;
    return { success: false, error: e.message };
  } finally {
    state.isLoading = false;
    state.launchingContentTokenId = null;
  }
}

/**
 * Check if a content NFT has a model token
 */
async function hasToken(contentTokenId) {
  try {
    const factory = await getFactoryContract(false);
    return await factory.hasToken(contentTokenId);
  } catch (e) {
    console.error('[FineTuneToken] hasToken check failed:', e);
    return false;
  }
}

/**
 * Get token address for a content NFT
 */
async function getModelToken(contentTokenId) {
  try {
    const factory = await getFactoryContract(false);
    const tokenAddress = await factory.getToken(contentTokenId);
    return tokenAddress === ethers.ZeroAddress ? null : tokenAddress;
  } catch (e) {
    console.error('[FineTuneToken] getToken failed:', e);
    return null;
  }
}

/**
 * Get token info for display
 */
async function getTokenInfo(tokenAddress) {
  try {
    const provider = await web3Service.getProvider('base');
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

    const [name, symbol, decimals, contentTokenId, modelIrysHash, creator] = await token.getTokenInfo();

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      contentTokenId: contentTokenId.toString(),
      modelIrysHash,
      creator,
    };
  } catch (e) {
    console.error('[FineTuneToken] getTokenInfo failed:', e);
    return null;
  }
}

/**
 * Get pool info via StateView contract
 * @param {string} poolId - V4 pool ID hash (bytes32)
 * @returns {Promise<Object>} Pool info with sqrtPrice and liquidity
 */
async function getPoolInfo(poolId) {
  try {
    const stateViewAddress = CONFIG.uniswap?.base?.stateView;
    if (!stateViewAddress) return null;

    const provider = await web3Service.getProvider('base');
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
    console.error('[FineTuneToken] getPoolInfo failed:', e);
    return null;
  }
}

/**
 * Get unclaimed hook fees for a creator
 * @param {string} creatorAddress - Creator address
 * @returns {Promise<string>} Unclaimed fees in ETH (formatted)
 */
async function getUnclaimedFees(creatorAddress) {
  try {
    const hook = await getHookContract(false);
    if (!hook) return '0';

    const unclaimed = await hook.getUnclaimedFees(creatorAddress);
    return ethers.formatEther(unclaimed);
  } catch (e) {
    console.error('[FineTuneToken] getUnclaimedFees failed:', e);
    return '0';
  }
}

/**
 * Claim accumulated beneficiary fees from the hook
 * @returns {Promise<Object>} Claim result
 */
async function claimFees() {
  try {
    const hook = await getHookContract(true);
    if (!hook) throw new Error('Fee hook not configured');

    const tx = await hook.claimBeneficiaryFees();
    const receipt = await tx.wait();

    console.log(`[FineTuneToken] Fees claimed, tx: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    console.error('[FineTuneToken] claimFees failed:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get minimum ETH required for liquidity
 */
async function getMinEthLiquidity() {
  try {
    const factory = await getFactoryContract(false);
    const minEth = await factory.minEthLiquidity();
    return ethers.formatEther(minEth);
  } catch (e) {
    console.error('[FineTuneToken] getMinEthLiquidity failed:', e);
    return '0.01';
  }
}

/**
 * Get total number of tokens launched
 */
async function getTotalTokensLaunched() {
  try {
    const factory = await getFactoryContract(false);
    const total = await factory.totalTokensLaunched();
    return Number(total);
  } catch (e) {
    console.error('[FineTuneToken] getTotalTokensLaunched failed:', e);
    return 0;
  }
}

// URL builders
function getUniswapTradeUrl(tokenAddress) {
  return `https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddress}`;
}

function getBaseScanUrl(tokenAddress) {
  return `https://basescan.org/token/${tokenAddress}`;
}

function getDexScreenerUrl(tokenAddress) {
  return `https://dexscreener.com/base/${tokenAddress}`;
}

// Computed values
const isLaunching = computed(() => state.isLoading);
const launchingId = computed(() => state.launchingContentTokenId);
const hasError = computed(() => !!state.error);
const errorMessage = computed(() => state.error);
const isConfigured = computed(() => !!CONFIG.fineTuneTokenFactory?.contractAddress);

// Export service
export const fineTuneTokenService = {
  state: readonly(state),

  // Computed
  isLaunching,
  launchingId,
  hasError,
  errorMessage,
  isConfigured,

  // Token launch
  launchFineTuneToken,

  // Queries
  hasToken,
  getModelToken,
  getTokenInfo,
  getPoolInfo,
  getUnclaimedFees,
  getMinEthLiquidity,
  getTotalTokensLaunched,

  // Fee claiming
  claimFees,

  // URL builders
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
};

export default fineTuneTokenService;
