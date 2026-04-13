/**
 * Privy Wallet Service
 *
 * Provides Privy integration for BonzAI:
 * - Embedded wallets for Privy-native users (owner wallet, replaces MetaMask)
 * - Server-side wallets for companion agents (replaces local deterministic wallets)
 *
 * Architecture:
 * - Embedded wallet: runs in renderer via @privy-io/js-sdk-core, provides EIP-1193 provider
 * - Server wallets: created/signed via IPC to main process (App Secret never in renderer)
 *
 * Two user segments:
 * - Web3-native (Reown): only uses Privy for nothing — local agent wallets stay
 * - Privy-native: embedded wallet = owner, server wallet = agent
 */

import { reactive } from 'vue';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  isInitialized: false,
  isAuthenticated: false,
  isLoggingIn: false,
  user: null,
  embeddedWalletAddress: null,
  error: null,
});

// Privy client instance (lazy-loaded)
let privyClient = null;
let embeddedProvider = null; // EIP-1193 provider from embedded wallet

// Local cache of companionId → Privy server wallet mapping
const WALLET_MAPPING_PREFIX = 'privy-agent-wallet-';

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the Privy client (renderer-side, uses public App ID only)
 * @returns {Promise<void>}
 */
async function initialize() {
  if (state.isInitialized) return;

  try {
    const appId = import.meta.env.VITE_PRIVY_APP_ID;
    if (!appId) {
      console.warn('[Privy] No VITE_PRIVY_APP_ID configured — Privy login disabled');
      return;
    }

    // SDK exports Privy class as default export
    const PrivySDK = await import('@privy-io/js-sdk-core');
    const Privy = PrivySDK.default;

    // Electron: use LocalStorage if available, fall back to InMemoryCache
    let storage;
    try {
      storage = new PrivySDK.LocalStorage();
      storage.put('__privy_test', true);
      storage.del('__privy_test');
    } catch {
      console.warn('[Privy] localStorage not available, using InMemoryCache');
      storage = new PrivySDK.InMemoryCache();
    }

    privyClient = new Privy({
      appId,
      storage,
    });

    await privyClient.initialize();

    state.isInitialized = true;
    console.log('[Privy] Client initialized');
  } catch (err) {
    console.error('[Privy] Initialization failed:', err);
    state.error = err.message;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION (Embedded Wallet)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Login with email (sends OTP)
 * @param {string} email
 * @returns {Promise<{success: boolean, needsOtp?: boolean, error?: string}>}
 */
async function loginWithEmail(email) {
  await initialize();
  if (!privyClient) return { success: false, error: 'Privy not configured. Set VITE_PRIVY_APP_ID in your .env file.' };

  state.isLoggingIn = true;
  state.error = null;

  try {
    await privyClient.auth.email.sendCode(email);
    return { success: true, needsOtp: true };
  } catch (err) {
    state.error = err.message;
    return { success: false, error: err.message };
  } finally {
    state.isLoggingIn = false;
  }
}

/**
 * Verify OTP and complete login
 * @param {string} email
 * @param {string} code - OTP code
 * @returns {Promise<{success: boolean, address?: string, error?: string}>}
 */
async function verifyOtp(email, code) {
  if (!privyClient) return { success: false, error: 'Privy not configured. Set VITE_PRIVY_APP_ID in your .env file.' };

  state.isLoggingIn = true;
  state.error = null;

  try {
    const authResult = await privyClient.auth.email.loginWithCode(email, code);
    state.isAuthenticated = true;
    state.user = authResult.user;

    await _extractEmbeddedWallet(authResult.user);

    console.log('[Privy] Logged in as', state.embeddedWalletAddress);
    return { success: true, address: state.embeddedWalletAddress };
  } catch (err) {
    state.error = err.message;
    return { success: false, error: err.message };
  } finally {
    state.isLoggingIn = false;
  }
}

/**
 * Login with social provider (opens external browser for OAuth)
 * @param {'google'|'apple'} provider
 * @returns {Promise<{success: boolean, address?: string, error?: string}>}
 */
async function loginWithSocial(provider) {
  await initialize();
  if (!privyClient) return { success: false, error: 'Privy not configured. Set VITE_PRIVY_APP_ID in your .env file.' };

  state.isLoggingIn = true;
  state.error = null;

  try {
    // Generate OAuth URL and open in external browser
    const redirectURI = 'bonzai://auth/callback';
    const { url, state: oauthState } = await privyClient.auth.oauth.generateURL(provider, redirectURI);

    // Open URL in system browser
    const { shell } = await import('electron');
    shell.openExternal(url);

    // The callback will be handled by the Electron deep link handler
    // For now, return a pending state — the user completes auth in browser
    return {
      success: false,
      error: 'Complete sign-in in your browser, then return to BonzAI.',
      pending: true,
      oauthState,
    };
  } catch (err) {
    state.error = err.message;
    return { success: false, error: err.message };
  } finally {
    state.isLoggingIn = false;
  }
}

/**
 * Complete OAuth login after redirect callback
 * @param {string} authorizationCode
 * @param {string} returnedStateCode
 * @param {string} provider
 * @returns {Promise<{success: boolean, address?: string, error?: string}>}
 */
async function completeOAuthLogin(authorizationCode, returnedStateCode, provider) {
  if (!privyClient) return { success: false, error: 'Privy not configured' };

  state.isLoggingIn = true;
  state.error = null;

  try {
    const authResult = await privyClient.auth.oauth.loginWithCode(
      authorizationCode, returnedStateCode, provider
    );
    state.isAuthenticated = true;
    state.user = authResult.user;

    await _extractEmbeddedWallet(authResult.user);

    console.log('[Privy] OAuth login as', state.embeddedWalletAddress);
    return { success: true, address: state.embeddedWalletAddress };
  } catch (err) {
    state.error = err.message;
    return { success: false, error: err.message };
  } finally {
    state.isLoggingIn = false;
  }
}

/**
 * Logout
 */
async function logout() {
  try {
    if (privyClient) await privyClient.auth.logout();
  } catch (err) {
    console.warn('[Privy] Logout error:', err);
  }

  state.isAuthenticated = false;
  state.user = null;
  state.embeddedWalletAddress = null;
  embeddedProvider = null;
}

/**
 * Get the EIP-1193 provider from the embedded wallet.
 * This is the key integration point — it plugs into ethers BrowserProvider
 * exactly like MetaMask/Reown does.
 *
 * @returns {Object|null} EIP-1193 provider
 */
function getEmbeddedProvider() {
  return embeddedProvider;
}

/**
 * Ensure the user has a Privy server wallet and create an IPC-backed provider.
 *
 * In Electron, Privy's iframe-based embedded wallet doesn't work (no iframe).
 * Instead, we use a server-side wallet created via the Privy Wallet API.
 * The main process holds the App Secret and signs transactions on behalf of the user.
 *
 * @param {Object} user - Privy authenticated user object
 * @private
 */
async function _extractEmbeddedWallet(user) {
  if (!user?.id) return;

  try {
    // Get or create a server wallet for this Privy user
    const walletInfo = await window.electronAPI?.privy?.ensureUserWallet?.({ userId: user.id });

    if (walletInfo?.walletId && walletInfo?.address) {
      state.embeddedWalletAddress = walletInfo.address;
      embeddedProvider = _createIpcProvider(walletInfo.walletId, walletInfo.address);
      console.log('[Privy] Server wallet ready:', walletInfo.address);
    } else {
      console.warn('[Privy] Failed to provision user wallet:', walletInfo?.error || 'unknown');
    }
  } catch (err) {
    console.warn('[Privy] Failed to set up wallet:', err.message);
  }
}

/**
 * Create an EIP-1193 compatible provider backed by Privy API via IPC.
 * Routes eth_sendTransaction and eth_signTypedData_v4 through the main process.
 * @private
 */
function _createIpcProvider(walletId, address) {
  return {
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [address];

        case 'eth_chainId':
          return '0x2105'; // Base (8453)

        case 'eth_sendTransaction': {
          const tx = params[0];
          const result = await window.electronAPI.privy.sendTransaction(walletId, {
            caip2: 'eip155:8453',
            method: 'eth_sendTransaction',
            params: { transaction: tx },
          });
          if (result.error) throw new Error(result.error);
          return result.hash;
        }

        case 'eth_signTypedData_v4': {
          const typedData = JSON.parse(params[1]);
          const result = await window.electronAPI.privy.signTypedData(walletId, {
            caip2: 'eip155:8453',
            method: 'eth_signTypedData_v4',
            params: { domain: typedData.domain, types: typedData.types, message: typedData.message },
          });
          if (result.error) throw new Error(result.error);
          return result.signature;
        }

        case 'personal_sign': {
          // Not yet supported via Privy API — fall through
          throw new Error('personal_sign not supported for Privy embedded wallets');
        }

        default:
          // For read-only RPC calls, use a public provider
          const { ethers } = await import('ethers');
          const rpc = new ethers.JsonRpcProvider('https://base.llamarpc.com');
          return rpc.send(method, params || []);
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER WALLETS (Agent Wallets — via IPC to main process)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Privy server-side wallet for a companion agent.
 * The wallet is created via the main process (which holds the App Secret).
 *
 * @param {string} companionId - Companion identifier
 * @returns {Promise<{address: string, walletId: string}>}
 */
async function createServerWallet(companionId) {
  const existing = await getServerWalletMapping(companionId);
  if (existing) {
    console.log('[Privy] Server wallet already exists for', companionId, ':', existing.address);
    return existing;
  }

  const result = await window.electronAPI.privy.createServerWallet({ companionId });

  if (!result?.address || !result?.walletId) {
    throw new Error(result?.error || 'Failed to create Privy server wallet');
  }

  // Store the mapping locally
  await _storeWalletMapping(companionId, {
    walletId: result.walletId,
    address: result.address,
    createdAt: Date.now(),
  });

  console.log('[Privy] Created server wallet for', companionId, ':', result.address);
  return { address: result.address, walletId: result.walletId };
}

/**
 * Get the server wallet address for a companion
 * @param {string} companionId
 * @returns {Promise<string|null>}
 */
async function getServerWalletAddress(companionId) {
  const mapping = await getServerWalletMapping(companionId);
  return mapping?.address || null;
}

/**
 * Check if a server wallet exists for a companion
 * @param {string} companionId
 * @returns {Promise<boolean>}
 */
async function hasServerWallet(companionId) {
  const mapping = await getServerWalletMapping(companionId);
  return !!mapping;
}

/**
 * Get server wallet mapping from Electron Store
 * @param {string} companionId
 * @returns {Promise<{walletId: string, address: string, createdAt: number}|null>}
 */
async function getServerWalletMapping(companionId) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  return await window.electronAPI?.store?.get(key, null);
}

/**
 * Get ETH balance for a companion's server wallet
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<string>} Balance in ETH
 */
async function getServerWalletBalance(companionId, chainId = 8453) {
  const mapping = await getServerWalletMapping(companionId);
  if (!mapping) throw new Error(`No Privy server wallet for companion ${companionId}`);

  // Use direct RPC provider for balance query (no need for Privy API)
  const { ethers } = await import('ethers');
  const rpcUrl = _getRpcUrl(chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const balance = await provider.getBalance(mapping.address);
  return ethers.formatEther(balance);
}

/**
 * Delete server wallet mapping (does not delete the Privy wallet itself)
 * @param {string} companionId
 */
async function deleteServerWalletMapping(companionId) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  await window.electronAPI?.store?.delete(key);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY SERVER SIGNER (ethers Signer interface via IPC)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get an ethers-compatible signer for a companion's Privy server wallet.
 * This object implements the subset of the ethers Signer interface used by
 * x402Executor and purchaseExecutor — all signing goes through IPC → main → Privy API.
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<PrivyServerSigner>}
 */
async function getServerWalletSigner(companionId, chainId = 8453) {
  const mapping = await getServerWalletMapping(companionId);
  if (!mapping) throw new Error(`No Privy server wallet for companion ${companionId}`);

  return new PrivyServerSigner(mapping.walletId, mapping.address, chainId);
}

/**
 * Ethers-compatible signer backed by Privy server wallet.
 * All operations are proxied through IPC to the main process.
 */
class PrivyServerSigner {
  constructor(walletId, address, chainId) {
    this._walletId = walletId;
    this.address = address;
    this._chainId = chainId;
    // ethers compatibility
    this.provider = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'getNetwork') return async () => ({ chainId: BigInt(chainId) });
        return undefined;
      }
    });
  }

  async getAddress() {
    return this.address;
  }

  /**
   * Send a transaction via Privy server wallet
   * @param {Object} tx - { to, value, data, gasLimit }
   * @returns {Promise<Object>} Transaction response with .wait()
   */
  async sendTransaction(tx) {
    const caip2 = `eip155:${this._chainId}`;
    const result = await window.electronAPI.privy.sendTransaction(this._walletId, {
      caip2,
      method: 'eth_sendTransaction',
      params: {
        transaction: {
          to: tx.to,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
          data: tx.data || '0x',
          ...(tx.gasLimit ? { gas: `0x${BigInt(tx.gasLimit).toString(16)}` } : {}),
        },
      },
    });

    if (result.error) throw new Error(result.error);

    const txHash = result.hash;
    const rpcUrl = _getRpcUrl(this._chainId);
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Return object compatible with ethers TransactionResponse
    return {
      hash: txHash,
      from: this.address,
      to: tx.to,
      wait: async () => {
        const receipt = await provider.waitForTransaction(txHash, 1, 60000);
        return receipt;
      },
    };
  }

  /**
   * Sign EIP-712 typed data via Privy server wallet
   */
  async signTypedData(domain, types, value) {
    const caip2 = `eip155:${this._chainId}`;
    const result = await window.electronAPI.privy.signTypedData(this._walletId, {
      caip2,
      method: 'eth_signTypedData_v4',
      params: { domain, types, message: value },
    });

    if (result.error) throw new Error(result.error);
    return result.signature;
  }

  /**
   * Connect to a provider (ethers compatibility)
   */
  connect(provider) {
    const signer = new PrivyServerSigner(this._walletId, this.address, this._chainId);
    signer.provider = provider;
    return signer;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set a spending policy on a companion's server wallet.
 * Policies are enforced server-side by Privy — no local spending limit checks needed.
 *
 * @param {string} companionId
 * @param {Object} policy - Privy policy configuration
 * @returns {Promise<{success: boolean}>}
 */
async function setWalletPolicy(companionId, policy) {
  const mapping = await getServerWalletMapping(companionId);
  if (!mapping) throw new Error(`No Privy server wallet for companion ${companionId}`);

  const result = await window.electronAPI.privy.setPolicy(mapping.walletId, policy);
  if (result.error) throw new Error(result.error);

  console.log('[Privy] Policy set for', companionId);
  return { success: true };
}

/**
 * Build default agent wallet policy (spending limits only)
 * @param {Object} options
 * @param {string} options.maxTransactionEth - Max per-tx (default: 0.001)
 * @param {string} options.dailyLimitEth - Max daily (default: 0.005)
 * @returns {Object} Privy policy config
 */
function buildAgentWalletPolicy(options = {}) {
  const maxTx = options.maxTransactionEth || '0.001';
  // dailyLimitEth reserved for Privy's time-based policy rules when available
  void options.dailyLimitEth;

  return {
    rules: [
      {
        name: 'max_transaction_value',
        conditions: [
          {
            field_source: 'ethereum_transaction',
            field: 'value',
            operator: 'lte',
            value: `${parseFloat(maxTx) * 1e18}`,
          },
        ],
        action: 'ALLOW',
      },
      {
        name: 'deny_all_else',
        conditions: [],
        action: 'DENY',
      },
    ],
  };
}

/**
 * Build mint-only policy for OpenClaw bare companion minting
 * @param {string} contractAddress - BonzaiCompanions contract address
 * @returns {Object} Privy policy config
 */
function buildMintOnlyPolicy(contractAddress) {
  return {
    rules: [
      {
        name: 'allow_mint',
        conditions: [
          {
            field_source: 'ethereum_transaction',
            field: 'to',
            operator: 'eq',
            value: contractAddress,
          },
          {
            field_source: 'ethereum_calldata',
            field: 'function_name',
            operator: 'eq',
            value: 'mintCompanion',
          },
        ],
        action: 'ALLOW',
      },
      {
        name: 'deny_all',
        conditions: [],
        action: 'DENY',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING (Coinbase Onramp for USDC on Base)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a Coinbase onramp URL to fund the embedded wallet with USDC on Base.
 * Opens in external browser — user pays with credit card / bank.
 *
 * @param {string} amount - Amount in USDC (e.g. "20")
 * @returns {Promise<{url: string} | {error: string}>}
 */
async function getFundingUrl(amount = '20') {
  if (!privyClient) return { error: 'Privy not initialized' };
  if (!state.embeddedWalletAddress) return { error: 'No embedded wallet' };

  try {
    const PrivySDK = await import('@privy-io/js-sdk-core');

    // Initialize Coinbase onramp session via Privy
    const initResult = await privyClient.funding.coinbase.initOnRampSession({
      addresses: [{
        address: state.embeddedWalletAddress,
        blockchains: ['base'],
      }],
    });

    // Generate the onramp URL
    const { url } = PrivySDK.getCoinbaseOnRampUrl({
      appId: import.meta.env.VITE_PRIVY_APP_ID,
      input: initResult,
      amount,
      blockchain: 'base',
      asset: 'USDC',
      experience: 'buy',
    });

    return { url: url.toString() };
  } catch (err) {
    console.error('[Privy] Funding URL failed:', err);
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function _storeWalletMapping(companionId, data) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  await window.electronAPI?.store?.set(key, data);
}

function _getRpcUrl(chainId) {
  const RPC_URLS = {
    8453: 'https://base.llamarpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    1: 'https://eth.llamarpc.com',
    42: 'https://rpc.mainnet.lukso.network',
  };
  return RPC_URLS[chainId] || RPC_URLS[8453];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const privyService = {
  state,

  // Initialization
  initialize,

  // Auth (embedded wallet)
  loginWithEmail,
  verifyOtp,
  loginWithSocial,
  completeOAuthLogin,
  logout,
  getEmbeddedProvider,

  // Server wallets (agent wallets)
  createServerWallet,
  getServerWalletAddress,
  hasServerWallet,
  getServerWalletMapping,
  getServerWalletBalance,
  getServerWalletSigner,
  deleteServerWalletMapping,

  // Funding
  getFundingUrl,

  // Policies
  setWalletPolicy,
  buildAgentWalletPolicy,
  buildMintOnlyPolicy,

  // Signer class (for type checking)
  PrivyServerSigner,
};

export default privyService;
