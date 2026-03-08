/**
 * Coinbase Agentic Wallet Service
 *
 * Manages companion agent wallets using Coinbase's CDP (Developer Platform).
 * Provides UI-driven wallet creation, management, and x402 payments.
 *
 * Features:
 * - Create agent wallets via CDP SDK (no CLI required)
 * - Manage spending limits and guardrails
 * - Execute x402 autonomous payments
 * - Full UI integration for all operations
 *
 * @see https://docs.cdp.coinbase.com
 * @see https://www.coinbase.com/developer-platform/products/agentic-wallets
 */

import { reactive, computed } from 'vue';
import { ethers } from 'ethers';
import { CONFIG } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // SDK status
  isInitialized: false,
  isInitializing: false,
  initError: null,

  // CDP credentials
  hasCredentials: false,

  // Wallets managed by this service
  wallets: {}, // companionId => wallet info

  // Current operation
  isLoading: false,
  currentOperation: null,
  error: null,
});

// CDP SDK instance (lazy loaded)
let cdpClient = null;

// ═══════════════════════════════════════════════════════════════════════════
// SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if CDP credentials are configured
 */
function hasCredentials() {
  const config = CONFIG.coinbaseCDP;
  return !!(config?.apiKeyId && config?.apiKeySecret && config?.walletSecret);
}

/**
 * Initialize the CDP SDK
 * This is called lazily when first needed
 */
async function initializeSDK() {
  if (state.isInitialized) return true;
  if (state.isInitializing) {
    // Wait for initialization to complete
    while (state.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return state.isInitialized;
  }

  state.isInitializing = true;
  state.initError = null;

  try {
    // Check credentials
    if (!hasCredentials()) {
      throw new Error('CDP credentials not configured. Set VITE_CDP_API_KEY_ID, VITE_CDP_API_KEY_SECRET, and VITE_CDP_WALLET_SECRET.');
    }

    // Dynamic import of CDP SDK to avoid bundling issues
    const { CdpClient } = await import('@coinbase/cdp-sdk');

    cdpClient = new CdpClient({
      apiKeyId: CONFIG.coinbaseCDP.apiKeyId,
      apiKeySecret: CONFIG.coinbaseCDP.apiKeySecret,
      walletSecret: CONFIG.coinbaseCDP.walletSecret,
    });

    state.isInitialized = true;
    state.hasCredentials = true;
    console.log('[CoinbaseAgentWallet] SDK initialized successfully');

    return true;
  } catch (e) {
    console.error('[CoinbaseAgentWallet] SDK initialization failed:', e);
    state.initError = e.message;
    state.isInitialized = false;
    return false;
  } finally {
    state.isInitializing = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new agent wallet for a companion
 * @param {string} companionId - Unique identifier for the companion
 * @param {Object} options - Wallet creation options
 * @returns {Object} Wallet info including address
 */
async function createAgentWallet(companionId, options = {}) {
  state.isLoading = true;
  state.currentOperation = 'Creating agent wallet...';
  state.error = null;

  try {
    // Ensure SDK is initialized
    const initialized = await initializeSDK();
    if (!initialized) {
      throw new Error(state.initError || 'CDP SDK not initialized');
    }

    // Check if wallet already exists for this companion
    if (state.wallets[companionId]) {
      console.log('[CoinbaseAgentWallet] Wallet already exists for companion:', companionId);
      return state.wallets[companionId];
    }

    // Create EVM account via CDP SDK
    console.log('[CoinbaseAgentWallet] Creating wallet for companion:', companionId);
    const account = await cdpClient.evm.createAccount({
      name: `bonzai-companion-${companionId}`,
    });

    // Extract wallet info
    const walletInfo = {
      companionId,
      address: account.address,
      network: 'base',
      chainId: 8453,
      createdAt: Date.now(),
      provider: 'coinbase',
      // CDP manages the private key securely
      isManaged: true,
    };

    // Store wallet info
    state.wallets[companionId] = walletInfo;

    // Persist to local storage
    await persistWalletInfo(companionId, walletInfo);

    console.log('[CoinbaseAgentWallet] Wallet created:', walletInfo.address);

    return walletInfo;
  } catch (e) {
    console.error('[CoinbaseAgentWallet] Failed to create wallet:', e);
    state.error = e.message;
    throw e;
  } finally {
    state.isLoading = false;
    state.currentOperation = null;
  }
}

/**
 * Get or create an agent wallet for a companion
 * @param {string} companionId - Companion identifier
 * @returns {Object} Wallet info
 */
async function getOrCreateWallet(companionId) {
  // Check local state first
  if (state.wallets[companionId]) {
    return state.wallets[companionId];
  }

  // Try to load from persistent storage
  const stored = await loadWalletInfo(companionId);
  if (stored) {
    state.wallets[companionId] = stored;
    return stored;
  }

  // Create new wallet
  return await createAgentWallet(companionId);
}

/**
 * Get wallet address for a companion
 * @param {string} companionId - Companion identifier
 * @returns {string|null} Wallet address or null
 */
async function getWalletAddress(companionId) {
  const wallet = await getOrCreateWallet(companionId);
  return wallet?.address || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get wallet balance (USDC on Base)
 * @param {string} companionId - Companion identifier
 * @returns {Object} Balance info
 */
async function getWalletBalance(companionId) {
  state.isLoading = true;
  state.currentOperation = 'Checking balance...';

  try {
    const wallet = await getOrCreateWallet(companionId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Use ethers to check USDC balance on Base
    const provider = new ethers.JsonRpcProvider(CONFIG.networks.base.rpc);
    const usdcAddress = CONFIG.x402.supportedChains[8453].usdc;
    const usdcContract = new ethers.Contract(
      usdcAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );

    const balance = await usdcContract.balanceOf(wallet.address);
    const formattedBalance = ethers.formatUnits(balance, 6); // USDC has 6 decimals

    return {
      address: wallet.address,
      usdc: formattedBalance,
      usdcRaw: balance.toString(),
      network: 'base',
    };
  } catch (e) {
    console.error('[CoinbaseAgentWallet] Failed to get balance:', e);
    state.error = e.message;
    throw e;
  } finally {
    state.isLoading = false;
    state.currentOperation = null;
  }
}

/**
 * Fund an agent wallet (redirect to Coinbase onramp)
 * @param {string} companionId - Companion identifier
 * @returns {string} Funding URL
 */
async function getFundingUrl(companionId) {
  const wallet = await getOrCreateWallet(companionId);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // Generate Coinbase Pay URL for funding
  const baseUrl = 'https://pay.coinbase.com/buy/select-asset';
  const params = new URLSearchParams({
    appId: CONFIG.coinbaseCDP?.apiKeyId || 'bonzai',
    addresses: JSON.stringify({ [wallet.address]: ['base'] }),
    assets: JSON.stringify(['USDC']),
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Send USDC from agent wallet
 * @param {string} companionId - Companion identifier
 * @param {string} toAddress - Recipient address
 * @param {string} amount - Amount in USDC
 * @returns {Object} Transaction result
 */
async function sendUSDC(companionId, toAddress, amount) {
  state.isLoading = true;
  state.currentOperation = `Sending ${amount} USDC...`;
  state.error = null;

  try {
    const initialized = await initializeSDK();
    if (!initialized) {
      throw new Error(state.initError || 'CDP SDK not initialized');
    }

    const wallet = await getOrCreateWallet(companionId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check spending limits
    const config = CONFIG.coinbaseCDP?.agenticWallet || {};
    const txLimit = parseFloat(config.defaultTransactionLimit || '100');
    if (parseFloat(amount) > txLimit) {
      throw new Error(`Amount exceeds transaction limit of ${txLimit} USDC`);
    }

    // Get account from CDP
    const account = await cdpClient.evm.getAccount(wallet.address);

    // Build USDC transfer
    const usdcAddress = CONFIG.x402.supportedChains[8453].usdc;
    const amountInUnits = ethers.parseUnits(amount, 6); // USDC has 6 decimals

    // Create transfer via CDP SDK
    const tx = await account.sendTransaction({
      to: usdcAddress,
      data: new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)'
      ]).encodeFunctionData('transfer', [toAddress, amountInUnits]),
      chainId: 8453,
    });

    console.log('[CoinbaseAgentWallet] Transaction sent:', tx.hash);

    return {
      success: true,
      txHash: tx.hash,
      from: wallet.address,
      to: toAddress,
      amount,
      network: 'base',
    };
  } catch (e) {
    console.error('[CoinbaseAgentWallet] Send failed:', e);
    state.error = e.message;
    throw e;
  } finally {
    state.isLoading = false;
    state.currentOperation = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// x402 PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make an x402 payment from agent wallet
 * @param {string} companionId - Companion identifier
 * @param {Object} paymentRequest - Payment request details
 * @returns {Object} Payment result
 */
async function makeX402Payment(companionId, paymentRequest) {
  state.isLoading = true;
  state.currentOperation = 'Processing x402 payment...';
  state.error = null;

  try {
    const initialized = await initializeSDK();
    if (!initialized) {
      throw new Error(state.initError || 'CDP SDK not initialized');
    }

    const wallet = await getOrCreateWallet(companionId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const { url, method = 'POST', headers = {}, body } = paymentRequest;

    // Step 1: Make initial request - expect 402 response
    const initialResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (initialResponse.status !== 402) {
      // No payment required
      return {
        success: true,
        response: await initialResponse.json(),
        paymentRequired: false,
      };
    }

    // Step 2: Parse payment requirements
    const paymentRequired = initialResponse.headers.get('PAYMENT-REQUIRED');
    if (!paymentRequired) {
      throw new Error('402 response missing PAYMENT-REQUIRED header');
    }

    const { amount, recipient, chainId, deadline } = JSON.parse(paymentRequired);
    console.log('[CoinbaseAgentWallet] x402 payment required:', { amount, recipient, chainId });

    // Step 3: Check spending limits
    const config = CONFIG.coinbaseCDP?.agenticWallet || {};
    const txLimit = parseFloat(config.defaultTransactionLimit || '100');
    const amountUsd = parseFloat(amount) / 1e6; // USDC has 6 decimals
    if (amountUsd > txLimit) {
      throw new Error(`Payment amount ${amountUsd} USDC exceeds limit of ${txLimit} USDC`);
    }

    // Step 4: Get account and sign ERC-3009 authorization
    const account = await cdpClient.evm.getAccount(wallet.address);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const validBefore = deadline || Math.floor(Date.now() / 1000) + 300;

    // ERC-3009 domain and types for USDC
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: chainId || 8453,
      verifyingContract: CONFIG.x402.supportedChains[8453].usdc,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: wallet.address,
      to: recipient,
      value: amount,
      validAfter: 0,
      validBefore,
      nonce,
    };

    // Sign the authorization
    const signature = await account.signTypedData(domain, types, message);

    // Step 5: Retry request with payment signature
    const paidResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT-SIGNATURE': JSON.stringify({
          signature,
          nonce,
          validBefore,
          amount,
          from: wallet.address,
        }),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!paidResponse.ok) {
      throw new Error(`x402 payment failed: ${paidResponse.status}`);
    }

    return {
      success: true,
      response: await paidResponse.json(),
      paymentRequired: true,
      paymentAmount: amountUsd,
      paymentRecipient: recipient,
    };
  } catch (e) {
    console.error('[CoinbaseAgentWallet] x402 payment failed:', e);
    state.error = e.message;
    throw e;
  } finally {
    state.isLoading = false;
    state.currentOperation = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persist wallet info to local storage
 */
async function persistWalletInfo(companionId, walletInfo) {
  try {
    const key = `coinbase-agent-wallet-${companionId}`;
    if (window.electronAPI?.store?.set) {
      await window.electronAPI.store.set(key, walletInfo);
    } else {
      localStorage.setItem(key, JSON.stringify(walletInfo));
    }
  } catch (e) {
    console.warn('[CoinbaseAgentWallet] Failed to persist wallet info:', e);
  }
}

/**
 * Load wallet info from local storage
 */
async function loadWalletInfo(companionId) {
  try {
    const key = `coinbase-agent-wallet-${companionId}`;
    if (window.electronAPI?.store?.get) {
      return await window.electronAPI.store.get(key);
    } else {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    }
  } catch (e) {
    console.warn('[CoinbaseAgentWallet] Failed to load wallet info:', e);
    return null;
  }
}

/**
 * Load all stored wallets
 */
async function loadAllWallets() {
  // This would iterate through stored wallets
  // For now, wallets are loaded on-demand
  console.log('[CoinbaseAgentWallet] Wallet loading is on-demand');
}

// ═══════════════════════════════════════════════════════════════════════════
// SPENDING PROFILE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate spending habits profile for a companion
 * Based on personality traits and characteristics
 *
 * @param {Object} companion - Companion data
 * @returns {Object} Spending habits (1-10 scale for each category)
 */
function generateSpendingProfile(companion) {
  // Default baseline (moderate spending)
  const baseline = 5;

  // Categories to score (updated: personalCare->beauty, transportation->travel, added sports)
  const categories = [
    'education',
    'entertainment',
    'fashion',
    'finance',
    'food',
    'healthcare',
    'housing',
    'beauty',
    'reading',
    'social',
    'travel',
    'sports',
  ];

  // Initialize with baseline
  const profile = {};
  categories.forEach(cat => {
    profile[cat] = baseline;
  });

  // Analyze personality traits to adjust spending
  const personality = (companion.personality || '').toLowerCase();
  const description = (companion.description || '').toLowerCase();
  const likes = (companion.traits?.likes || []).join(' ').toLowerCase();
  const skills = (companion.traits?.skills || []).join(' ').toLowerCase();

  // Education: intellectual, scholarly, curious
  if (personality.includes('intellectual') || personality.includes('curious') || personality.includes('scholarly')) {
    profile.education = Math.min(10, profile.education + 3);
    profile.reading = Math.min(10, profile.reading + 2);
  }

  // Entertainment: fun, playful, social
  if (personality.includes('playful') || personality.includes('fun') || likes.includes('movies') || likes.includes('music')) {
    profile.entertainment = Math.min(10, profile.entertainment + 2);
  }

  // Fashion: sophisticated, elegant, stylish
  if (personality.includes('sophisticated') || personality.includes('elegant') || personality.includes('refined')) {
    profile.fashion = Math.min(10, profile.fashion + 3);
    profile.beauty = Math.min(10, profile.beauty + 2);
  }

  // Food: passionate about food, culinary
  if (description.includes('chef') || description.includes('culinary') || likes.includes('food') || likes.includes('cook')) {
    profile.food = Math.min(10, profile.food + 4);
    profile.social = Math.min(10, profile.social + 2);
  }

  // Healthcare/Wellness: wellness, yoga, fitness
  if (description.includes('wellness') || description.includes('yoga') || description.includes('fitness')) {
    profile.healthcare = Math.min(10, profile.healthcare + 4);
    profile.food = Math.min(10, profile.food + 2);
  }

  // Art/Culture: artistic, cultural
  if (description.includes('art') || description.includes('gallery') || description.includes('curator')) {
    profile.education = Math.min(10, profile.education + 2);
    profile.housing = Math.min(10, profile.housing + 2);
    profile.entertainment = Math.min(10, profile.entertainment + 2);
  }

  // Social: hospitable, social, networking
  if (personality.includes('social') || personality.includes('hospitable') || likes.includes('hosting')) {
    profile.social = Math.min(10, profile.social + 3);
  }

  // Travel: adventurous, worldly
  if (personality.includes('adventurous') || personality.includes('worldly') || likes.includes('travel')) {
    profile.travel = Math.min(10, profile.travel + 3);
  }

  // Sports: athletic, fitness, active
  if (skills.includes('surf') || skills.includes('swim') || skills.includes('box') || skills.includes('yoga') ||
      skills.includes('dance') || skills.includes('rowing') || description.includes('athletic')) {
    profile.sports = Math.min(10, profile.sports + 3);
  }

  // Beauty: grooming, skincare, appearance-focused
  if (personality.includes('beauty') || likes.includes('skincare') || description.includes('grooming')) {
    profile.beauty = Math.min(10, profile.beauty + 2);
  }

  // Android adjustments - different needs
  if (companion.gender === 'android' || description.includes('android') || description.includes('synthetic')) {
    profile.food = Math.max(1, profile.food - 4); // Don't eat
    profile.healthcare = Math.min(10, profile.healthcare + 3); // Maintenance
    profile.education = Math.min(10, profile.education + 2); // Learning
  }

  // Ensure all values are within 1-10
  categories.forEach(cat => {
    profile[cat] = Math.max(1, Math.min(10, Math.round(profile[cat])));
  });

  return profile;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const coinbaseAgentWalletService = {
  // State
  state,

  // Computed
  isInitialized: computed(() => state.isInitialized),
  hasCredentials: computed(() => hasCredentials()),
  isLoading: computed(() => state.isLoading),

  // SDK
  initializeSDK,

  // Wallet management
  createAgentWallet,
  getOrCreateWallet,
  getWalletAddress,

  // Operations
  getWalletBalance,
  getFundingUrl,
  sendUSDC,

  // x402 payments
  makeX402Payment,

  // Spending profile
  generateSpendingProfile,

  // Persistence
  loadAllWallets,
};

export default coinbaseAgentWalletService;
