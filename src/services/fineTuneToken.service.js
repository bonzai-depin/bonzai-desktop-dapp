import { confirmedReceipt } from './transactionReceipt.js';
import {getLiquidityVault,transactLiquidityFees} from './liquidityVault.service.js';
/**
 * BonzAI Fine-Tune Token Service
 *
 * Manages token launches on the configured economy chain with Uniswap V4 liquidity.
 *
 * Features:
 * - Launch burnable ERC-20 tokens for minted fine-tune model NFTs
 * - Automatic hookless Uniswap V4 pool creation with a 1% trading fee
 * - LP position NFT held permanently by the immutable fee vault
 * - Tokens are burnable (deflationary)
 * - 1% swap fee split: 70% creator, 20% treasury, 10% basket rewards
 * - Query token, pool, and fee info
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { canMintContentType, checkAllLevels } from './level.service.js';
import {
  getPoolInfo as _getPoolInfo,
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
} from './uniswapV4.utils.js';

// Factory ABI - V4 interface (FineTuneTokenFactory)
const FACTORY_ABI = [
  // Write functions
  'function launchToken(uint256 contentTokenId, string name, string symbol, string modelIrysHash, address creator) payable returns (address token, bytes32 poolId)',
  'function launchValidatedToken(address contentCollection,uint256 contentTokenId,string name,string symbol,string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash,address creator) payable returns (address token,bytes32 poolId)',

  // Read functions
  'function modelTokens(address contentCollection,uint256 contentTokenId) view returns (address)',
  'function hasToken(address contentCollection,uint256 contentTokenId) view returns (bool)',
  'function getToken(address contentCollection,uint256 contentTokenId) view returns (address)',
  'function minEthLiquidity() view returns (uint256)',
  'function totalTokensLaunched() view returns (uint256)',
  'function getAllTokens() view returns (address[])',
  'function TOTAL_SUPPLY() view returns (uint256)',

  // Events
  'event ModelTokenLaunched(address contentCollection,uint256 indexed contentTokenId, address indexed token, bytes32 indexed poolId, string symbol, uint256 ethLiquidity, uint256 positionId, address creator, uint256 timestamp)',
];

// FineTuneToken ABI
const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function contentTokenId() view returns (uint256)',
  'function contentCollection() view returns (address)',
  'function modelIrysHash() view returns (string)',
  'function getModelProfile() view returns (string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash)',
  'function creator() view returns (address)',
  'function getTokenInfo() view returns (string name_, string symbol_, uint8 decimals_, uint256 contentTokenId_, string modelIrysHash_, address creator_)',
];

// Service state
const state = reactive({
  isLoading: false,
  error: null,
  launchingContentTokenId: null,
});
const economyNetwork = () => ECONOMY_NETWORK_KEY;

/**
 * Get factory contract instance
 */
async function getFactoryContract(withSigner = false) {
  const factoryAddress = CONFIG.fineTuneTokenFactory?.contractAddress;
  if (!factoryAddress) {
    throw new Error('Fine-tune token factory not deployed. Set CONFIG.fineTuneTokenFactory.contractAddress');
  }

  if (withSigner) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
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
 * @param {string} contentCollection - Factory-registered collection that holds the model NFT
 * @param {number|string} contentTokenId - Model NFT ID within that collection
 * @param {string} name - Token name (e.g., "BonzAI Fine-Tune: My Custom Model")
 * @param {string} symbol - Token symbol (e.g., "BZCUSTOM")
 * @param {string|Object} modelMetadataRef - IPFS/Pinata hash or metadata object for the model weights/provenance
 * @param {string} ethAmount - Amount of ETH for liquidity (e.g., "0.01")
 *
 * @returns {Promise<Object>} Launch result with token address and poolId
 */
async function launchFineTuneToken(contentCollection, contentTokenId, name, symbol, modelMetadataRef, ethAmount, options = {}) {
  requireCollection(contentCollection);
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

    // Ensure we're on the configured economy network.
    await web3Service.switchNetwork?.(economyNetwork());

    const factory = await getFactoryContract(true);

    // Check if token already exists
    const existingToken = await factory.getToken(contentCollection, contentTokenId);
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
      contentCollection,
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
    const receipt = await confirmedReceipt(tx);
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
      tokenAddress = await factory.getToken(contentCollection, contentTokenId);
    }

    return {
      success: true,
      contentCollection,
      contentTokenId: String(contentTokenId),
      tokenAddress,
      poolId,
      symbol: launchSymbol,
      txHash: receipt.hash,
      ethLiquidity: ethAmount,
      lpLocked: true, // Position NFT is owned by the immutable vault; principal stays locked.
      modelMetadataHash,
      modelProvenance: provenance,
      revenuePlan,
      modelKind,
      profile,
      validationHash,
      contributionRouting: revenuePlan
        ? {
          mode: 'allocation-pending',
          note: 'Token launched. Confirm the contributor allocation in the liquidity vault before fees are collected; metadata alone does not distribute revenue.',
          revenuePlan,
        }
        : null,
    };
  } catch (e) {
    console.error('[FineTuneToken] Launch failed:', e);
    state.error = e.message;
    return { success: false, error: e.message, transactionHash: e.transactionHash, confirmationPending: e.confirmationPending };
  } finally {
    state.isLoading = false;
    state.launchingContentTokenId = null;
  }
}

/**
 * Check if a content NFT has a model token
 */
function requireCollection(contentCollection) {
  if (!ethers.isAddress(contentCollection) || contentCollection === ethers.ZeroAddress) {
    throw new Error('The original model NFT collection address is required.');
  }
}

async function hasToken(contentCollection, contentTokenId) {
  requireCollection(contentCollection);
  const factory = await getFactoryContract(false);
  return await factory.hasToken(contentCollection, contentTokenId);
}

/**
 * Get token address for a content NFT
 */
async function getModelToken(contentCollection, contentTokenId) {
  requireCollection(contentCollection);
  const factory = await getFactoryContract(false);
  const tokenAddress = await factory.getToken(contentCollection, contentTokenId);
  return tokenAddress === ethers.ZeroAddress ? null : tokenAddress;
}

/** Recover a submitted launch without sending another transaction. */
async function recoverLaunch(contentCollection, contentTokenId, transactionHash) {
  requireCollection(contentCollection);
  const provider = await web3Service.getProvider(economyNetwork());
  const receipt = await provider.getTransactionReceipt(transactionHash);
  if (!receipt) return { pending: true };
  if (Number(receipt.status) === 0) return { reverted: true };
  const factory = await getFactoryContract(false);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CONFIG.fineTuneTokenFactory.contractAddress.toLowerCase()) continue;
    let event;
    try { event = factory.interface.parseLog(log); } catch { continue; }
    if (event?.name !== 'ModelTokenLaunched' || event.args.contentCollection.toLowerCase() !== contentCollection.toLowerCase() || String(event.args.contentTokenId) !== String(contentTokenId)) continue;
    if ((await factory.getToken(contentCollection, contentTokenId)).toLowerCase() !== event.args.token.toLowerCase()) throw new Error('The confirmed token does not match its factory record.');
    return { contentCollection, contentTokenId: String(contentTokenId), tokenAddress: event.args.token, poolId: event.args.poolId, symbol: event.args.symbol, ethLiquidity: ethers.formatEther(event.args.ethLiquidity), txHash: receipt.hash, contributionRouting: { mode: 'allocation-pending' } };
  }
  throw new Error('No matching model launch in this receipt. Check the transaction before retrying.');
}

/**
 * Get token info for display
 */
async function getTokenInfo(tokenAddress) {
  try {
    const provider = await web3Service.getProvider(economyNetwork());
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

    const [name, symbol, decimals, contentTokenId, modelIrysHash, creator] = await token.getTokenInfo();
    const contentCollection = await token.contentCollection();

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      contentTokenId: contentTokenId.toString(),
      contentCollection,
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
const getUnclaimedFees = (addr, token) => getLiquidityVault(token, 'fine_tuned', addr);
const claimFees = (token, currency) => transactLiquidityFees({token, kind:'fine_tuned', action:'claim', currency, expectedWallet:web3Service.state.walletAddress});

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
async function getAllTokenAddresses({ strict = false } = {}) {
  try { return await (await getFactoryContract(false)).getAllTokens(); }
  catch (e) { if (strict) throw e; console.error('[FineTuneToken] getAllTokenAddresses failed:', e); return []; }
}
async function getModelProfile(contentCollection, contentTokenId) {
  const tokenAddress = await getModelToken(contentCollection, contentTokenId);
  return tokenAddress ? await getTokenProfile(tokenAddress) : null;
}

async function getTokenProfile(tokenAddress) {
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, await web3Service.getProvider(economyNetwork()));
  const [metadataURI, description, imageURI, modelKind, validationHash] = await token.getModelProfile();
  return { metadataURI, description, imageURI, modelKind, validationHash };
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
  recoverLaunch,
  getTokenInfo,
  getPoolInfo,
  getUnclaimedFees,
  getMinEthLiquidity,
  getTotalTokensLaunched,
  getAllTokenAddresses,
  getModelProfile,
  getTokenProfile,

  // Fee claiming
  claimFees,

  // URL builders
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
};

export default fineTuneTokenService;
