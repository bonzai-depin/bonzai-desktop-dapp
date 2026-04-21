/**
 * Purchase Executor Service
 *
 * Central orchestrator for companion autonomous purchases.
 * Uses Uniswap V4 Universal Router for on-chain swaps:
 * - Content NFT minting
 * - Companion token buyback (Uniswap V4)
 * - Buy other companion tokens (Uniswap V4)
 * - Buy BONZAI token (Uniswap V4)
 * - External x402 sellers
 *
 * Supports two purchase modes:
 * - Default: Uniform random from all enabled sellers
 * - Specialized: Weighted random by companion spending profile
 */

import { ethers } from 'ethers';
import { CONFIG } from '../config/web3.config.js';
import { walletProviderService } from './walletProvider.service.js';
import { companionTokenService } from './companionToken.service.js';
import { storageService } from './storage.service.js';
import { x402ExecutorService } from './x402Executor.service.js';
import { sellerRegistryService } from './sellerRegistry.service.js';
// BonzaiCollectibles clone ABI (mint with contentType)
const BonzaiCollectiblesABI = [
  'function mint(string transactionId, string model, string tokenURI_, uint8 contentType) payable returns (uint256)',
  'function mintFee() view returns (uint256)',
  'function mintFees(uint8 contentType) view returns (uint256)',
  'event ContentMinted(uint256 indexed tokenId, address indexed creator, string transactionId, string model, uint256 timestamp)',
];

// Uniswap V4 Universal Router ABI (minimal for V4_SWAP command)
const UNIVERSAL_ROUTER_ABI = [
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
];

// Uniswap V4 Quoter ABI (for price quotes)
const QUOTER_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint128 amountIn, uint24 fee, uint160 sqrtPriceLimitX96, bytes hookData) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const MAX_RETRIES = 2;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PurchaseIntent
 * @property {string} item - Item to purchase (e.g. "BONZAI token", "content NFT")
 * @property {string} reason - Reason for purchase
 * @property {string} estimatedCost - Estimated cost in ETH
 * @property {string} category - Spending category (e.g. "finance", "entertainment")
 */

/**
 * @typedef {Object} Seller
 * @property {string} id - Unique seller ID
 * @property {string} name - Seller display name
 * @property {string} category - Spending category this seller belongs to
 * @property {string} type - Seller type (e.g. "uniswap", "x402", "mint")
 * @property {boolean} enabled - Whether the seller is enabled
 * @property {string} [address] - On-chain address if applicable
 */

/**
 * @typedef {Object} CompanionData
 * @property {string} id - Companion identifier
 * @property {string} name - Companion name
 * @property {Record<string, number>} [spendingHabits] - Spending profile scores by category (1-10)
 * @property {string} [walletAddress] - Companion's agent wallet address
 */

// ═══════════════════════════════════════════════════════════════════════════
// SELLER SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select a seller based on purchase mode
 * @param {PurchaseIntent} intent - Purchase intent
 * @param {import('./x402Executor.service.js').AutonomousSettings} settings - Autonomous settings
 * @param {CompanionData} companion - Companion data
 * @param {Seller[]} sellers - Enabled sellers list
 * @param {Set<string>} [excludeIds] - Seller IDs to exclude (for retries)
 * @returns {Seller|null} Selected seller
 */
function selectSeller(intent, settings, companion, sellers, excludeIds = new Set()) {
  const available = sellers.filter(s => !excludeIds.has(s.id));
  if (available.length === 0) return null;

  const mode = settings?.purchaseMode || 'default';

  if (mode === 'specialized' && companion?.spendingHabits) {
    // Weighted random by spending profile
    const weights = available.map(seller => {
      const score = companion.spendingHabits[seller.category] || 5;
      return score;
    });
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return available[0];

    let random = Math.random() * totalWeight;
    for (let i = 0; i < available.length; i++) {
      random -= weights[i];
      if (random <= 0) return available[i];
    }
    return available[available.length - 1];
  }

  // Default mode: uniform random
  return available[Math.floor(Math.random() * available.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handler: Mint a content NFT from the latest roleplay image
 */
async function handleContentNFTMint(companionId, companion, session) {
  const contractAddress = CONFIG.contentNFT?.base?.contractAddress;
  if (!contractAddress) {
    return { success: false, error: 'Content NFT contract not deployed' };
  }

  // Find latest roleplay image from session history
  let imageData = null;
  if (session?.history) {
    for (let i = session.history.length - 1; i >= 0; i--) {
      const msg = session.history[i];
      if (msg.role === 'assistant' && msg.image) {
        imageData = msg.image;
        break;
      }
    }
  }

  if (!imageData) {
    return { success: false, error: 'No roleplay image found in session' };
  }

  try {
    // Upload image to IPFS
    if (!storageService.isInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    const imageUpload = await storageService.uploadBase64({
      base64Data: imageData,
      contentType: 'image/png',
      generation: {
        type: 'roleplay-companion',
        model: 'flux',
        timestamp: Date.now(),
      },
      attribution: {
        creator: companion?.agentWallet || '',
      },
    });

    // Build ERC-721 metadata
    const metadata = {
      name: `${companion?.name || 'Companion'} Roleplay`,
      description: `AI-generated roleplay content by ${companion?.name || 'companion'}`,
      image: imageUpload.gatewayUrl,
      attributes: [
        { trait_type: 'Generator', value: 'BonzAI' },
        { trait_type: 'Companion', value: companion?.name || 'Unknown' },
        { trait_type: 'Type', value: 'roleplay-companion' },
      ],
    };

    const metadataUpload = await storageService.uploadMetadata(metadata);

    // Get agent wallet signer for Base
    const signer = await walletProviderService.getAgentWalletSigner(companionId, 8453);

    // Mint content NFT
    const contentContract = new ethers.Contract(contractAddress, BonzaiCollectiblesABI, signer);
    const mintFee = await contentContract.mintFee();

    const tx = await contentContract.mint(
      imageUpload.transactionId,
      'roleplay-companion',
      metadataUpload.gatewayUrl,
      { value: mintFee }
    );

    const receipt = await tx.wait();

    // Parse ContentMinted event for tokenId
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contentContract.interface.parseLog(log);
        if (parsed?.name === 'ContentMinted') {
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }

    console.log(`[PurchaseExecutor] Content NFT minted: tokenId=${tokenId}, tx=${receipt.hash}`);
    return {
      success: true,
      txHash: receipt.hash,
      tokenId,
      type: 'content_nft_mint',
      details: `Minted NFT #${tokenId}`,
    };
  } catch (e) {
    console.error('[PurchaseExecutor] Content NFT mint failed:', e);
    return { success: false, error: e.message, type: 'content_nft_mint' };
  }
}

/**
 * Handler: Buy back own companion token via Uniswap V4
 */
async function handleCompanionTokenBuyback(companionId, companion, ethAmount) {
  try {
    const tokenAddress = await companionTokenService.getCompanionToken(companion?.tokenId || companionId);
    if (!tokenAddress) {
      return { success: false, error: 'No token launched', type: 'companion_token_buyback' };
    }

    return await executeV4Swap(companionId, tokenAddress, ethAmount, 'companion_token_buyback');
  } catch (e) {
    console.error('[PurchaseExecutor] Companion token buyback failed:', e);
    return { success: false, error: e.message, type: 'companion_token_buyback' };
  }
}

/**
 * Handler: Buy a random other companion's token via Uniswap V4
 */
async function handleOtherCompanionTokenBuy(companionId, companion, ethAmount) {
  try {
    const allTokens = await companionTokenService.getAllTokenAddresses();
    if (!allTokens || allTokens.length === 0) {
      return { success: false, error: 'No companion tokens exist', type: 'other_companion_token' };
    }

    // Filter out own token
    const ownToken = await companionTokenService.getCompanionToken(companion?.tokenId || companionId);
    const otherTokens = allTokens.filter(
      t => t !== ethers.ZeroAddress && (!ownToken || t.toLowerCase() !== ownToken.toLowerCase())
    );

    if (otherTokens.length === 0) {
      return { success: false, error: 'No other companion tokens available', type: 'other_companion_token' };
    }

    // Random selection
    const selectedToken = otherTokens[Math.floor(Math.random() * otherTokens.length)];

    const result = await executeV4Swap(companionId, selectedToken, ethAmount, 'other_companion_token');
    if (result.success) {
      result.tokenAddress = selectedToken;
    }
    return result;
  } catch (e) {
    console.error('[PurchaseExecutor] Other companion token buy failed:', e);
    return { success: false, error: e.message, type: 'other_companion_token' };
  }
}

/**
 * Handler: Buy BONZAI token on Base via Uniswap V4
 */
async function handleBonzaiTokenBuy(companionId, ethAmount) {
  const bonzaiAddress = CONFIG.tokens?.BONZAI?.base;
  if (!bonzaiAddress) {
    return { success: false, error: 'BONZAI token address not configured for Base', type: 'bonzai_token' };
  }

  try {
    const result = await executeV4Swap(companionId, bonzaiAddress, ethAmount, 'bonzai_token');
    if (result.success) {
      result.details = `Bought BONZAI tokens`;
    }
    return result;
  } catch (e) {
    console.error('[PurchaseExecutor] BONZAI token buy failed:', e);
    return { success: false, error: e.message, type: 'bonzai_token' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNISWAP V4 SWAP HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a Uniswap V4 ETH→Token swap on Base via Universal Router
 * @param {string} companionId - Companion ID
 * @param {string} tokenAddress - Token to buy
 * @param {string} ethAmount - ETH amount as string (e.g., "0.001")
 * @param {string} type - Handler type for logging
 * @returns {Promise<Object>}
 */
async function executeV4Swap(companionId, tokenAddress, ethAmount, type) {
  const routerAddress = CONFIG.uniswap?.base?.universalRouter;

  if (!routerAddress) {
    return { success: false, error: 'Uniswap V4 Universal Router not configured for Base', type };
  }

  const signer = await walletProviderService.getAgentWalletSigner(companionId, 8453);
  const router = new ethers.Contract(routerAddress, UNIVERSAL_ROUTER_ABI, signer);

  const amountWei = ethers.parseEther(ethAmount);
  const agentAddress = await signer.getAddress();
  const deadlineSeconds = CONFIG.purchaseMode?.swapDeadlineSeconds || 300;
  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;

  // Encode V4_SWAP command for Universal Router
  // Command 0x10 = V4_SWAP
  // The swap path: ETH → token via the pool with our hook
  const hookAddress = CONFIG.uniswap?.base?.feeHook || ethers.ZeroAddress;

  // Build the swap parameters
  // ExactInputSingle: swap exact ETH input for token output
  const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(address,address,uint24,int24,address,uint128,uint128,uint160,bytes)'],
    [[
      ethers.ZeroAddress,    // currencyIn (ETH = address(0))
      tokenAddress,          // currencyOut
      0,                     // fee (0 = hook-only)
      60,                    // tickSpacing
      hookAddress,           // hooks
      amountWei,             // amountIn
      0,                     // amountOutMinimum (0 for simplicity, slippage handled by hook)
      0,                     // sqrtPriceLimitX96 (0 = no limit)
      '0x',                  // hookData
    ]],
  );

  // Universal Router command: 0x10 = V4_SWAP
  const commands = '0x10';
  const inputs = [swapParams];

  const tx = await router.execute(commands, inputs, deadline, { value: amountWei });
  const receipt = await tx.wait();

  console.log(`[PurchaseExecutor] V4 swap executed: ${ethAmount} ETH → token ${tokenAddress}, tx=${receipt.hash}`);
  return {
    success: true,
    txHash: receipt.hash,
    type,
    details: `Swapped ${ethAmount} ETH for tokens via V4`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER DISPATCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dispatch to the appropriate handler based on seller type
 */
async function dispatchHandler(seller, companionId, companion, ethAmount, session) {
  switch (seller.type) {
    case 'content_nft_mint':
      return await handleContentNFTMint(companionId, companion, session);

    case 'companion_token_buyback':
      return await handleCompanionTokenBuyback(companionId, companion, ethAmount);

    case 'other_companion_token':
      return await handleOtherCompanionTokenBuy(companionId, companion, ethAmount);

    case 'bonzai_token':
      return await handleBonzaiTokenBuy(companionId, ethAmount);

    case 'x402_external':
      return await x402ExecutorService.executePayment(
        companionId,
        {
          provider: seller.endpoint,
          service: seller.name,
          amount: ethers.parseEther(ethAmount).toString(),
          endpoint: seller.endpoint,
          params: {},
          chainId: seller.chainId || 8453,
        },
        { enablePurchases: true }
      );

    default:
      return { success: false, error: `Unknown seller type: ${seller.type}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse estimated cost string to ETH amount
 * @param {string} estimatedCost - e.g., "0.001 ETH", "$5", "0.0025"
 * @returns {string} ETH amount as string
 */
function parseCostToEth(estimatedCost) {
  if (!estimatedCost) return '0.001'; // Default
  const str = estimatedCost.toString().toLowerCase();

  // Try to extract numeric value
  const match = str.match(/([\d.]+)/);
  if (!match) return '0.001';

  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0) return '0.001';

  // If it looks like USD, convert roughly
  if (str.includes('$') || str.includes('usd')) {
    return (value / 2000).toFixed(6); // Rough ETH conversion
  }

  // Cap at reasonable amount
  return Math.min(value, 0.01).toString();
}

/**
 * Execute a purchase based on companion intent
 *
 * @param {string} companionId - Companion ID
 * @param {Object} intent - Purchase intent { item, reason, estimatedCost, category }
 * @param {Object} settings - Autonomous settings { enablePurchases, purchaseMode, maxPurchaseAmount, dailySpendingLimit }
 * @param {Object} companion - Companion data (includes spendingHabits)
 * @param {Object} session - Current roleplay session (for content NFT handler)
 * @returns {Promise<Object>} { success, txHash, type, details, error }
 */
async function executePurchase(companionId, intent, settings, companion, session) {
  if (!settings?.enablePurchases) {
    return { success: false, error: 'Purchases disabled' };
  }

  const ethAmount = parseCostToEth(intent?.estimatedCost);
  const amountWei = ethers.parseEther(ethAmount).toString();

  // Spending limit check
  const check = await x402ExecutorService.canMakePurchase(companionId, amountWei, settings);
  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  // Get enabled sellers
  const sellers = await sellerRegistryService.getEnabledSellers();
  if (sellers.length === 0) {
    return { success: false, error: 'No sellers enabled' };
  }

  const excludeIds = new Set();

  // Try up to MAX_RETRIES + 1 times with different sellers
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const seller = selectSeller(intent, settings, companion, sellers, excludeIds);
    if (!seller) {
      return { success: false, error: 'No more sellers to try' };
    }

    console.log(`[PurchaseExecutor] Attempt ${attempt + 1}: ${seller.name} (${seller.type})`);

    try {
      const result = await dispatchHandler(seller, companionId, companion, ethAmount, session);

      if (result.success) {
        // Log transaction
        await x402ExecutorService.logTransaction(companionId, {
          type: result.type || seller.type,
          service: `purchase:${intent?.item || seller.name}`,
          amount: amountWei,
          amountEth: ethAmount,
          provider: seller.contractAddress || seller.endpoint || 'builtin',
          chainId: seller.chainId || 8453,
          txHash: result.txHash,
          status: 'success',
          purchaseType: seller.type,
          sellerName: seller.name,
        });

        return result;
      }

      // Handler failed — exclude this seller and retry
      console.warn(`[PurchaseExecutor] Handler failed: ${result.error}`);
      excludeIds.add(seller.id);
    } catch (e) {
      console.error(`[PurchaseExecutor] Handler threw:`, e);
      excludeIds.add(seller.id);
    }
  }

  return { success: false, error: 'All purchase handlers failed' };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const purchaseExecutorService = {
  executePurchase,
  selectSeller,
  parseCostToEth,
};

export default purchaseExecutorService;
