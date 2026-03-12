/**
 * Wallet Provider Abstraction
 *
 * Routes agent wallet operations based on auth provider:
 * - Privy-native users → Privy server wallets (created/signed via Privy API)
 * - Web3-native users (Reown) → Local deterministic wallets (existing behavior)
 *
 * This layer ensures that downstream consumers (x402Executor, purchaseExecutor,
 * companion.service) don't need to know which wallet backend is active.
 */

import { agentWalletService } from './agentWallet.service.js';
import { privyService } from './privy.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// AUTH PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

// Lazy reference to avoid circular import with web3.service.js
let _web3ServiceRef = null;

/**
 * Register the web3Service reference (called by web3.service.js on init)
 */
export function registerWeb3Service(service) {
  _web3ServiceRef = service;
}

/**
 * Get the current auth provider.
 *
 * @returns {'reown'|'privy'|null}
 */
function getAuthProvider() {
  return _web3ServiceRef?.state?.authProvider || null;
}

/**
 * Check if the current user is Privy-authenticated
 * @returns {boolean}
 */
function isPrivyUser() {
  return getAuthProvider() === 'privy';
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT WALLET OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an agent wallet for a companion.
 * - Privy users: creates a Privy server-side wallet
 * - Reown users: creates a local deterministic wallet
 *
 * @param {string} companionId
 * @returns {Promise<{address: string, privateKey?: string, walletId?: string}>}
 */
async function createAgentWallet(companionId) {
  if (isPrivyUser()) {
    const result = await privyService.createServerWallet(companionId);

    // Apply default spending policy
    try {
      const policy = privyService.buildAgentWalletPolicy();
      await privyService.setWalletPolicy(companionId, policy);
    } catch (err) {
      console.warn('[WalletProvider] Failed to set default policy (non-fatal):', err.message);
    }

    return { address: result.address, walletId: result.walletId };
  }

  // Reown / local: generate deterministic wallet
  const wallet = await agentWalletService.generateAgentWallet(companionId);
  await agentWalletService.storeAgentWalletCredentials(companionId, wallet);
  return wallet;
}

/**
 * Check if an agent wallet exists for a companion.
 * Checks both Privy server wallets and local wallets.
 *
 * @param {string} companionId
 * @returns {Promise<boolean>}
 */
async function hasAgentWallet(companionId) {
  // Check Privy first (works for both user types if they previously created one)
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) return true;

  // Fall back to local
  return agentWalletService.hasAgentWallet(companionId);
}

/**
 * Get the agent wallet address for a companion.
 *
 * @param {string} companionId
 * @returns {Promise<string|null>}
 */
async function getAgentWalletAddress(companionId) {
  // Check Privy first
  const privyAddress = await privyService.getServerWalletAddress(companionId);
  if (privyAddress) return privyAddress;

  // Fall back to local
  const credentials = await agentWalletService.getAgentWalletCredentials(companionId);
  return credentials?.address || null;
}

/**
 * Get an ethers-compatible signer for a companion's agent wallet.
 * This is the primary integration point for x402Executor and purchaseExecutor.
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<Object>} Signer (ethers Wallet or PrivyServerSigner)
 */
async function getAgentWalletSigner(companionId, chainId = 8453) {
  // Check Privy server wallet first
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    return privyService.getServerWalletSigner(companionId, chainId);
  }

  // Fall back to local deterministic wallet
  const hasLocal = await agentWalletService.hasAgentWallet(companionId);
  if (hasLocal) {
    return agentWalletService.getAgentWalletSignerForChain(companionId, chainId);
  }

  throw new Error(`No agent wallet found for companion ${companionId}`);
}

/**
 * Get agent wallet ETH balance.
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<string>} Balance in ETH
 */
async function getAgentWalletBalance(companionId, chainId = 8453) {
  // Check Privy first
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    return privyService.getServerWalletBalance(companionId, chainId);
  }

  // Fall back to local
  return agentWalletService.getAgentWalletBalance(companionId, chainId);
}

/**
 * Get stored agent wallet credentials (for display / backwards compat).
 * Returns a normalized object with at minimum { address }.
 *
 * @param {string} companionId
 * @returns {Promise<{address: string, walletId?: string, privateKey?: string, provider: 'privy'|'local'}|null>}
 */
async function getAgentWalletCredentials(companionId) {
  // Check Privy first
  const privyMapping = await privyService.getServerWalletMapping(companionId);
  if (privyMapping) {
    return {
      address: privyMapping.address,
      walletId: privyMapping.walletId,
      provider: 'privy',
    };
  }

  // Fall back to local
  const local = await agentWalletService.getAgentWalletCredentials(companionId);
  if (local) {
    return { ...local, provider: 'local' };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPENDING LIMIT CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check spending limit for a transaction.
 * - Privy wallets: limits enforced server-side by Privy policies, always allow locally
 * - Local wallets: enforce local spending limits
 *
 * @param {string} companionId
 * @param {bigint|string} amountWei
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkSpendingLimit(companionId, amountWei) {
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    // Privy enforces limits server-side via policies
    return { allowed: true };
  }

  return agentWalletService.checkSpendingLimit(companionId, amountWei);
}

/**
 * Record a spend (only relevant for local wallets)
 */
async function recordSpend(companionId, amountWei) {
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) return; // Privy tracks spending server-side

  return agentWalletService.recordSpend(companionId, amountWei);
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (only for local wallets — Privy has its own rate limits)
// ═══════════════════════════════════════════════════════════════════════════

function checkTxRateLimit(companionId) {
  // Privy handles rate limiting server-side
  if (isPrivyUser()) return { allowed: true };
  return agentWalletService.checkTxRateLimit(companionId);
}

function checkSigRateLimit(companionId) {
  if (isPrivyUser()) return { allowed: true };
  return agentWalletService.checkSigRateLimit(companionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSTHROUGH (features unchanged by wallet provider)
// ═══════════════════════════════════════════════════════════════════════════

// Companion UP storage is independent of wallet provider
const { storeCompanionUP, getCompanionUP, deleteCompanionUP } = agentWalletService;

// Chain support is shared
const { getChainConfig, getSupportedChains, isChainSupported } = agentWalletService;

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const walletProviderService = {
  // Registration (for breaking circular imports)
  registerWeb3Service,

  // Auth detection
  getAuthProvider,
  isPrivyUser,

  // Agent wallet CRUD
  createAgentWallet,
  hasAgentWallet,
  getAgentWalletAddress,
  getAgentWalletSigner,
  getAgentWalletBalance,
  getAgentWalletCredentials,

  // Spending limits & rate limiting
  checkSpendingLimit,
  recordSpend,
  checkTxRateLimit,
  checkSigRateLimit,

  // Passthrough
  storeCompanionUP,
  getCompanionUP,
  deleteCompanionUP,
  getChainConfig,
  getSupportedChains,
  isChainSupported,
};

export default walletProviderService;
