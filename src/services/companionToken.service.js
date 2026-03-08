/**
 * BonzAI Companion Token Service
 *
 * Manages companion token launches on Base with Uniswap V4 liquidity.
 *
 * Features:
 * - Launch burnable ERC-20 tokens for minted companions
 * - Automatic Uniswap V4 pool creation with hook-based fees
 * - LP position NFT locked at DEAD address (unruggable - permanent liquidity)
 * - Tokens are burnable (deflationary)
 * - 1% swap fee split: 33% treasury, 33% companion owner (NFT holder), 34% companion wallet
 * - Query token, pool, and fee info
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// Factory ABI - V4 interface
const FACTORY_ABI = [
  // Write functions
  'function launchToken(uint256 nftTokenId, string name, string symbol, string imageURI, address agentWallet, address companionOwner) payable returns (address token, bytes32 poolId)',

  // Read functions
  'function companionTokens(uint256 nftTokenId) view returns (address)',
  'function hasToken(uint256 nftTokenId) view returns (bool)',
  'function getToken(uint256 nftTokenId) view returns (address)',
  'function minEthLiquidity() view returns (uint256)',
  'function totalTokensLaunched() view returns (uint256)',
  'function getAllTokens() view returns (address[])',
  'function TOTAL_SUPPLY() view returns (uint256)',

  // Events
  'event CompanionTokenLaunched(uint256 indexed nftTokenId, address indexed token, bytes32 indexed poolId, string symbol, uint256 ethLiquidity, uint256 positionId, uint256 timestamp)',
];

// Companion Token ABI
const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function imageURI() view returns (string)',
  'function agentWallet() view returns (address)',
  'function companionId() view returns (uint256)',
  'function getTokenInfo() view returns (string name_, string symbol_, uint8 decimals_, string image_, address agentWallet_, uint256 companionId_)',
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
  launchingCompanionId: null,
});

/**
 * Get factory contract instance
 * @param {boolean} withSigner - Whether to attach signer
 * @returns {Promise<ethers.Contract>}
 */
async function getFactoryContract(withSigner = false) {
  const factoryAddress = CONFIG.companionTokenFactory?.contractAddress;
  if (!factoryAddress) {
    throw new Error('Companion token factory not deployed. Set CONFIG.companionTokenFactory.contractAddress');
  }

  const provider = await web3Service.getProvider('base');

  if (withSigner) {
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  }

  return new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
}

/**
 * Get hook contract instance
 * @returns {Promise<ethers.Contract|null>}
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
 * Launch a companion token with Uniswap V4 liquidity
 *
 * @param {Object} companion - Companion data object
 * @param {string} companion.id - Unique companion ID
 * @param {string} companion.name - Full companion name
 * @param {string} companion.firstName - First name (becomes symbol)
 * @param {string} companion.agentWallet - Agent wallet address
 * @param {string} companion.imageIPFS - IPFS image URI (optional)
 * @param {number} companion.tokenId - NFT token ID (must be > 0)
 * @param {string} ethAmount - Amount of ETH for liquidity (as string, e.g., "0.1")
 *
 * @returns {Promise<Object>} Launch result with token address and poolId
 */
async function launchToken(companion, ethAmount) {
  if (!companion?.id) {
    throw new Error('Companion ID required');
  }
  if (!companion.agentWallet) {
    throw new Error('Companion must have an agentWallet. Mint the companion first.');
  }
  if (!ethAmount || parseFloat(ethAmount) <= 0) {
    throw new Error('ETH amount required for liquidity');
  }

  state.isLoading = true;
  state.launchingCompanionId = companion.id;
  state.error = null;

  try {
    // Ensure we're on Base network
    const currentChainId = web3Service.state.currentChainId;

    if (currentChainId !== 8453) {
      console.log('[CompanionToken] Switching to Base network...');
      await web3Service.switchNetwork('base');
    }

    const factory = await getFactoryContract(true);

    // Check if token already exists
    const nftTokenId = companion.tokenId || 0;
    if (nftTokenId > 0) {
      const existingToken = await factory.getToken(nftTokenId);
      if (existingToken !== ethers.ZeroAddress) {
        throw new Error(`Token already launched for ${companion.name}. Address: ${existingToken}`);
      }
    }

    // Check minimum ETH
    const minEth = await factory.minEthLiquidity();
    const ethWei = ethers.parseEther(ethAmount);
    if (ethWei < minEth) {
      throw new Error(`Minimum ETH required: ${ethers.formatEther(minEth)} ETH`);
    }

    // Prepare launch parameters
    const name = companion.name || `${companion.firstName} ${companion.familyName || ''}`.trim();
    const symbol = (companion.firstName || companion.name.split(' ')[0]).toUpperCase();
    const imageURI = companion.imageIPFS || companion.image || '';

    console.log(`[CompanionToken] Launching $${symbol} token for ${name}...`);
    console.log(`[CompanionToken] agentWallet: ${companion.agentWallet}`);
    console.log(`[CompanionToken] ETH liquidity: ${ethAmount}`);

    // Get companion owner (connected wallet = NFT holder) for fee split
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    const companionOwner = await signer.getAddress();

    // Launch token (V4: returns token + poolId)
    const tx = await factory.launchToken(
      nftTokenId,
      name,
      symbol,
      imageURI,
      companion.agentWallet,
      companionOwner,
      { value: ethWei }
    );

    console.log(`[CompanionToken] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[CompanionToken] Transaction confirmed in block ${receipt.blockNumber}`);

    // Parse event to get token and poolId
    let tokenAddress = null;
    let poolId = null;
    let launchSymbol = symbol;

    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === 'CompanionTokenLaunched') {
          tokenAddress = parsed.args.token;
          poolId = parsed.args.poolId;
          launchSymbol = parsed.args.symbol;
          console.log(`[CompanionToken] Token deployed: ${tokenAddress}`);
          console.log(`[CompanionToken] Pool ID: ${poolId}`);
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }

    if (!tokenAddress && nftTokenId > 0) {
      tokenAddress = await factory.getToken(nftTokenId);
    }

    return {
      success: true,
      tokenAddress,
      poolId,
      symbol: launchSymbol,
      txHash: receipt.hash,
      ethLiquidity: ethAmount,
      lpLocked: true,  // LP position NFT sent to dead address - unruggable
    };
  } catch (e) {
    console.error('[CompanionToken] Launch failed:', e);
    state.error = e.message;
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
    state.launchingCompanionId = null;
  }
}

/**
 * Check if a companion has a token
 * @param {number} nftTokenId - Companion NFT token ID
 * @returns {Promise<boolean>}
 */
async function hasToken(nftTokenId) {
  try {
    const factory = await getFactoryContract(false);
    return await factory.hasToken(nftTokenId);
  } catch (e) {
    console.error('[CompanionToken] hasToken check failed:', e);
    return false;
  }
}

/**
 * Get token address for a companion
 * @param {number} nftTokenId - Companion NFT token ID
 * @returns {Promise<string|null>} Token address or null
 */
async function getCompanionToken(nftTokenId) {
  try {
    const factory = await getFactoryContract(false);
    const tokenAddress = await factory.getToken(nftTokenId);
    return tokenAddress === ethers.ZeroAddress ? null : tokenAddress;
  } catch (e) {
    console.error('[CompanionToken] getToken failed:', e);
    return null;
  }
}

/**
 * Get token info for display
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<Object>} Token info
 */
async function getTokenInfo(tokenAddress) {
  try {
    const provider = await web3Service.getProvider('base');
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

    const [name, symbol, decimals, imageURI, agentWallet, companionId] = await token.getTokenInfo();

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      imageURI,
      agentWallet,
      companionId: companionId.toString(),
    };
  } catch (e) {
    console.error('[CompanionToken] getTokenInfo failed:', e);
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
    console.error('[CompanionToken] getPoolInfo failed:', e);
    return null;
  }
}

/**
 * Get unclaimed hook fees for an agent wallet
 * @param {string} agentWallet - Agent wallet address
 * @returns {Promise<string>} Unclaimed fees in ETH (formatted)
 */
async function getUnclaimedFees(agentWallet) {
  try {
    const hook = await getHookContract(false);
    if (!hook) return '0';

    const unclaimed = await hook.getUnclaimedFees(agentWallet);
    return ethers.formatEther(unclaimed);
  } catch (e) {
    console.error('[CompanionToken] getUnclaimedFees failed:', e);
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

    console.log(`[CompanionToken] Fees claimed, tx: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    console.error('[CompanionToken] claimFees failed:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get minimum ETH required for liquidity
 * @returns {Promise<string>} Minimum ETH formatted
 */
async function getMinEthLiquidity() {
  try {
    const factory = await getFactoryContract(false);
    const minEth = await factory.minEthLiquidity();
    return ethers.formatEther(minEth);
  } catch (e) {
    console.error('[CompanionToken] getMinEthLiquidity failed:', e);
    return '0.01'; // Default fallback
  }
}

/**
 * Get all token addresses from factory
 * @returns {Promise<string[]>} Array of token addresses
 */
async function getAllTokenAddresses() {
  try {
    const factory = await getFactoryContract(false);
    return await factory.getAllTokens();
  } catch (e) {
    console.error('[CompanionToken] getAllTokenAddresses failed:', e);
    return [];
  }
}

/**
 * Get total number of tokens launched
 * @returns {Promise<number>}
 */
async function getTotalTokensLaunched() {
  try {
    const factory = await getFactoryContract(false);
    const total = await factory.totalTokensLaunched();
    return Number(total);
  } catch (e) {
    console.error('[CompanionToken] getTotalTokensLaunched failed:', e);
    return 0;
  }
}

/**
 * Build Uniswap trade URL for the token (V4 frontend)
 * @param {string} tokenAddress - Token address
 * @returns {string} Uniswap swap URL
 */
function getUniswapTradeUrl(tokenAddress) {
  return `https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddress}`;
}

/**
 * Build BaseScan token URL
 * @param {string} tokenAddress - Token address
 * @returns {string} BaseScan URL
 */
function getBaseScanUrl(tokenAddress) {
  return `https://basescan.org/token/${tokenAddress}`;
}

/**
 * Build DexScreener URL for the token
 * @param {string} tokenAddress - Token address
 * @returns {string} DexScreener URL
 */
function getDexScreenerUrl(tokenAddress) {
  return `https://dexscreener.com/base/${tokenAddress}`;
}

// Computed values
const isLaunching = computed(() => state.isLoading);
const launchingId = computed(() => state.launchingCompanionId);
const hasError = computed(() => !!state.error);
const errorMessage = computed(() => state.error);

// Check if factory is configured
const isConfigured = computed(() => {
  return !!CONFIG.companionTokenFactory?.contractAddress;
});

// Export service
export const companionTokenService = {
  // State
  state: readonly(state),

  // Computed
  isLaunching,
  launchingId,
  hasError,
  errorMessage,
  isConfigured,

  // Token launch
  launchToken,

  // Queries
  hasToken,
  getCompanionToken,
  getTokenInfo,
  getPoolInfo,
  getUnclaimedFees,
  getMinEthLiquidity,
  getTotalTokensLaunched,
  getAllTokenAddresses,

  // Fee claiming
  claimFees,

  // URL builders
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
};

export default companionTokenService;
