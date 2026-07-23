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
import { canMintContentType, checkAllLevels } from './level.service.js';
import {
  getPoolInfo as _getPoolInfo,
  getUnclaimedFees as _getUnclaimedFees,
  claimFees as _claimFees,
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
} from './uniswapV4.utils.js';

// Factory ABI - V4 interface (FineTuneTokenFactory)
const FACTORY_ABI = [
  // Write functions
  'function launchToken(uint256 contentTokenId, string name, string symbol, string modelIrysHash, address creator) payable returns (address token, bytes32 poolId)',
  'function launchValidatedToken(uint256 contentTokenId,string name,string symbol,string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash,address creator) payable returns (address token,bytes32 poolId)',

  // Read functions
  'function modelTokens(uint256 contentTokenId) view returns (address)',
  'function hasToken(uint256 contentTokenId) view returns (bool)',
  'function getToken(uint256 contentTokenId) view returns (address)',
  'function minEthLiquidity() view returns (uint256)',
  'function totalTokensLaunched() view returns (uint256)',
  'function getAllTokens() view returns (address[])',
  'function getModelProfile(uint256 contentTokenId) view returns (string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash)',
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

// Service state
const state = reactive({
  isLoading: false,
  error: null,
  launchingContentTokenId: null,
});
const economyNetwork = () => ({ 1: 'ethereum', 42161: 'arbitrum', 8453: 'base' }[Number(CONFIG.contributionEconomy?.chainId || CONFIG.fineTuneTokenFactory?.chainId || 1)] || 'ethereum');

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

  const provider = await web3Service.getProvider(economyNetwork());
  return new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
}

/**
 * Launch a fine-tune model token with Uniswap V4 liquidity
 *
 * @param {number|string} contentTokenId - BonzaiContent NFT token ID for the model
 * @param {string} name - Token name (e.g., "BonzAI Fine-Tune: My Custom Model")
 * @param {string} symbol - Token symbol (e.g., "BZCUSTOM")
 * @param {string|Object} modelMetadataRef - IPFS/Pinata hash or metadata object for the model weights/provenance
 * @param {string} ethAmount - Amount of ETH for liquidity (e.g., "0.01")
 *
 * @returns {Promise<Object>} Launch result with token address and poolId
 */
async function launchFineTuneToken(contentTokenId, name, symbol, modelMetadataRef, ethAmount, options = {}) {
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
    await checkAllLevels();
    const gate = canMintContentType('training');
    if (!gate.canMint) {
      throw new Error(`${gate.levelRequired || 'LVL6'} required to launch model tokens. ${gate.reason || ''}`.trim());
    }

    // Ensure we're on Base network
    await web3Service.switchNetwork?.(economyNetwork());

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
    const provenance = options.modelProvenance || options.provenance || null;
    const revenuePlan = provenance?.attribution?.revenuePlan || options.revenuePlan || null;
    const modelMetadataHash = typeof modelMetadataRef === 'string'
      ? modelMetadataRef
      : modelMetadataRef?.uri || modelMetadataRef?.hash || modelMetadataRef?.cid || '';

    // Launch token (V4: returns token + poolId)
    const profile = options.profile || {}
    const validationHash = options.validationHash || options.validation?.hash
    if (!validationHash || !/^0x[a-fA-F0-9]{64}$/.test(validationHash)) {
      throw new Error('Run and pass model validation before issuing its token.')
    }
    if (!profile.description || !profile.image) {
      throw new Error('Model description and image are required before token issuance.')
    }
    const modelKind = options.modelKind === 'abliterated' ? 'abliterated' : 'fine_tuned'
    const tx = await factory.launchValidatedToken(
      contentTokenId,
      name,
      symbol,
      modelMetadataHash,
      profile.description,
      profile.image,
      modelKind,
      validationHash,
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
      modelMetadataHash,
      modelProvenance: provenance,
      revenuePlan,
      modelKind,
      profile,
      validationHash,
      contributionRouting: revenuePlan
        ? {
          mode: 'metadata-attached',
          note: 'Current FineTuneTokenFactory records one creator on-chain. BonzAI attaches proof-of-contribution revenue routing in model metadata for downstream settlement.',
          revenuePlan,
        }
        : null,
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
    const provider = await web3Service.getProvider(economyNetwork());
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

// Delegate to shared uniswapV4 utils with service-specific log prefix
const LOG_PREFIX = 'FineTuneToken';
const getPoolInfo = (poolId) => _getPoolInfo(poolId, LOG_PREFIX);
const getUnclaimedFees = (addr) => _getUnclaimedFees(addr, LOG_PREFIX);
const claimFees = () => _claimFees(LOG_PREFIX);

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
async function getAllTokenAddresses() {
  try { return await (await getFactoryContract(false)).getAllTokens(); }
  catch (e) { console.error('[FineTuneToken] getAllTokenAddresses failed:', e); return []; }
}
async function getModelProfile(contentTokenId) {
  try {
    const [metadataURI, description, imageURI, modelKind, validationHash] = await (await getFactoryContract(false)).getModelProfile(contentTokenId);
    return { metadataURI, description, imageURI, modelKind, validationHash };
  } catch (e) { console.error('[FineTuneToken] getModelProfile failed:', e); return null; }
}

// URL builders delegated to shared uniswapV4 utils (imported above)

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
  getAllTokenAddresses,
  getModelProfile,

  // Fee claiming
  claimFees,

  // URL builders
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
};

export default fineTuneTokenService;
