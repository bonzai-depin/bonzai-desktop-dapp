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
import { CONFIG } from '../config/web3.config.js';

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
 * Set up user wallet via BrowserView bridge to bonzai.sh/wallet.
 *
 * Non-custodial: the user's embedded wallet lives in the browser (bonzai.sh).
 * The desktop app delegates all signing to the BrowserView via postMessage.
 * BonzAI never has access to the user's keys.
 *
 * @param {Object} user - Privy authenticated user object
 * @private
 */
async function _extractEmbeddedWallet(user) {
  if (!user?.id) return;

  try {
    // Open BrowserView to bonzai.sh/wallet for embedded wallet
    const email = user.linked_accounts?.find(a => a.type === 'email')?.address || '';
    const result = await window.electronAPI?.wallet?.open?.({ email });
    if (!result?.ok) {
      console.warn('[Privy] BrowserView open failed');
      return;
    }

    // Listen for wallet address from BrowserView
    const cleanup = window.electronAPI?.onWalletAddress?.((address) => {
      state.embeddedWalletAddress = address;
      embeddedProvider = _createBrowserViewProvider(address);
    });

    // Check if address was already cached from a previous session
    const cached = await window.electronAPI?.wallet?.getAddress?.();
    if (cached) {
      state.embeddedWalletAddress = cached;
      embeddedProvider = _createBrowserViewProvider(cached);
    }
  } catch (err) {
    console.warn('[Privy] Wallet bridge failed:', err.message);
  }
}

/**
 * Create an EIP-1193 compatible provider backed by the BrowserView bridge.
 * Signing requests are delegated to bonzai.sh/wallet (user confirms in browser).
 * Read-only RPC calls go directly through a public provider.
 * @private
 */
function _createBrowserViewProvider(address) {
  return {
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [address];

        case 'eth_chainId':
          return '0x2105'; // Base (8453)

        case 'eth_sendTransaction':
        case 'eth_signTypedData_v4':
        case 'personal_sign':
          // Delegate to BrowserView — user confirms in bonzai.sh/wallet
          return window.electronAPI.wallet.signRequest({ method, params });

        default: {
          // Read-only RPC calls — direct to public provider
          const { ethers } = await import('ethers');
          const rpc = new ethers.JsonRpcProvider(_getRpcUrl(8453));
          return rpc.send(method, params || []);
        }
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION WALLET (Session Signer — non-custodial autonomous actions)
//
// The user creates the companion wallet on bonzai.sh/wallet (embedded wallet,
// user owns the keys). They authorize BonzAI's session signer key to act
// within spending rules. The desktop app uses the session signer to sign
// companion transactions via IPC → main process → Privy Wallet API.
//
// BonzAI NEVER owns the companion wallet. The user can revoke at any time.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the BonzAI session signer public key.
 * This key must be registered on bonzai.sh/wallet by the user.
 */
async function getSessionSignerId() {
  const result = await window.electronAPI?.privy?.getSessionSignerId?.();
  return result?.signerId || null;
}

/**
 * Get the companion wallet address for a companion.
 * Stored locally when the user links it from bonzai.sh/wallet.
 */
async function getCompanionWalletAddress(companionId) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  const data = await window.electronAPI?.store?.get(key, null);
  return data?.address || null;
}

/**
 * Store the companion wallet mapping (address + wallet ID from bonzai.sh/wallet).
 */
async function setCompanionWallet(companionId, { address, walletId }) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  await window.electronAPI?.store?.set(key, { address, walletId, linkedAt: Date.now() });
}

/**
 * Get ETH balance for a companion's wallet.
 */
async function getCompanionBalance(companionId, chainId = 8453) {
  const address = await getCompanionWalletAddress(companionId);
  if (!address) return '0';

  const { ethers } = await import('ethers');
  const rpcUrl = _getRpcUrl(chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

/**
 * Get an ethers-compatible signer for a companion wallet.
 * Uses the session signer key to authorize transactions via Privy Wallet API.
 * The user must have authorized this key on bonzai.sh/wallet.
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<CompanionSigner>}
 */
async function getCompanionSigner(companionId, chainId = 8453) {
  const key = `${WALLET_MAPPING_PREFIX}${companionId}`;
  const mapping = await window.electronAPI?.store?.get(key, null);
  if (!mapping?.walletId || !mapping?.address) {
    throw new Error(`Companion wallet not linked for ${companionId}. Set it up on bonzai.sh/wallet.`);
  }

  return new CompanionSigner(mapping.walletId, mapping.address, chainId);
}

/**
 * Ethers-compatible signer backed by Privy session signer.
 * Transactions are authorized by BonzAI's session signer key
 * and executed via the Privy Wallet API. The user owns the wallet.
 */
class CompanionSigner {
  constructor(walletId, address, chainId) {
    this._walletId = walletId;
    this.address = address;
    this._chainId = chainId;
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

  async sendTransaction(tx) {
    const caip2 = `eip155:${this._chainId}`;
    const result = await window.electronAPI.privy.companionRpc(
      this._walletId,
      'eth_sendTransaction',
      caip2,
      {
        transaction: {
          to: tx.to,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
          data: tx.data || '0x',
          ...(tx.gasLimit ? { gas: `0x${BigInt(tx.gasLimit).toString(16)}` } : {}),
        },
      },
    );

    if (result.error) throw new Error(result.error);

    const txHash = result.hash;
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(_getRpcUrl(this._chainId));

    return {
      hash: txHash,
      from: this.address,
      to: tx.to,
      wait: async () => provider.waitForTransaction(txHash, 1, 60000),
    };
  }

  async signTypedData(domain, types, value) {
    const caip2 = `eip155:${this._chainId}`;
    const result = await window.electronAPI.privy.companionRpc(
      this._walletId,
      'eth_signTypedData_v4',
      caip2,
      { domain, types, message: value },
    );

    if (result.error) throw new Error(result.error);
    return result.signature;
  }

  connect(provider) {
    const s = new CompanionSigner(this._walletId, this.address, this._chainId);
    s.provider = provider;
    return s;
  }
}

// Policy building helper (used by bonzai.sh/wallet for display purposes)
function buildAgentWalletPolicy(options = {}) {
  const maxTx = options.maxTransactionEth || '0.001';
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
    8453: CONFIG?.networks?.base?.rpc || 'https://mainnet.base.org',
    42161: CONFIG?.networks?.arbitrum?.rpc || 'https://arb1.arbitrum.io/rpc',
    1: CONFIG?.networks?.ethereum?.rpc || 'https://eth.llamarpc.com',
    42: CONFIG?.networks?.lukso?.rpc || 'https://rpc.mainnet.lukso.network',
  };
  return RPC_URLS[chainId] || RPC_URLS[8453];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

// Server-wallet stubs — Privy server wallets are WIP (see MEMORY.md
// "Privy Integration"). walletProvider.service.js calls these on every
// getAgentWalletCredentials / checkSpendingLimit, so they must exist
// even before the @privy-io/js-sdk-core wiring lands. Returning
// null/false is the same shape as "no Privy wallet for this companion".
async function hasServerWallet() { return false; }
async function getServerWalletMapping() { return null; }
async function getServerWalletAddress() { return null; }
async function getServerWalletBalance() { return null; }
async function getServerWalletSigner() {
  throw new Error("Privy server wallets not yet enabled");
}
async function createServerWallet() {
  throw new Error("Privy server wallets not yet enabled");
}
async function setWalletPolicy() { /* no-op */ }

export const privyService = {
  state,

  // Initialization
  initialize,

  // Auth (embedded wallet via BrowserView bridge)
  loginWithEmail,
  verifyOtp,
  loginWithSocial,
  completeOAuthLogin,
  logout,
  getEmbeddedProvider,

  // Companion wallet (session signer — non-custodial)
  getSessionSignerId,
  getCompanionWalletAddress,
  setCompanionWallet,
  getCompanionBalance,
  getCompanionSigner,

  // Server wallet (WIP — stubbed to return null/false)
  hasServerWallet,
  getServerWalletMapping,
  getServerWalletAddress,
  getServerWalletBalance,
  getServerWalletSigner,
  createServerWallet,
  setWalletPolicy,

  // Policies
  buildAgentWalletPolicy,
  buildMintOnlyPolicy,

  // Signer class (for type checking)
  CompanionSigner,
};

export default privyService;
