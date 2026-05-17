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
import {
  getPoolInfo as _getPoolInfo,
  getUnclaimedFees as _getUnclaimedFees,
  claimFees as _claimFees,
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
} from './uniswapV4.utils.js';

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
    // Ensure we're on Ethereum network
    const currentChainId = web3Service.state.currentChainId;
    const targetChainId = CONFIG.companionTokenFactory?.chainId || 1;

    if (currentChainId !== targetChainId) {
      console.log('[CompanionToken] Switching to Ethereum network...');
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

// Delegate to shared uniswapV4 utils with service-specific log prefix
const LOG_PREFIX = 'CompanionToken';
const getPoolInfo = (poolId) => _getPoolInfo(poolId, LOG_PREFIX);
const getUnclaimedFees = (addr) => _getUnclaimedFees(addr, LOG_PREFIX);
const claimFees = () => _claimFees(LOG_PREFIX);

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

// URL builders delegated to shared uniswapV4 utils (imported above)

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
