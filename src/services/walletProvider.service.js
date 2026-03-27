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
import { owsService } from './ows.service.js';
import { OWSEthersSigner } from './owsSigner.adapter.js';
import { owsMigrationService } from './owsMigration.service.js';

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
 * Priority: Privy (if Privy user) → OWS (default)
 *
 * @param {string} companionId
 * @param {Object} [opts] - Optional companion info for wallet naming
 * @param {string} [opts.firstName] - Companion first name
 * @param {string} [opts.lastName] - Companion last name
 * @returns {Promise<{address: string, privateKey?: string, walletId?: string, provider: string}>}
 */
async function createAgentWallet(companionId, opts = {}) {
  if (isPrivyUser()) {
    const result = await privyService.createServerWallet(companionId);

    // Apply default spending policy
    try {
      const policy = privyService.buildAgentWalletPolicy();
      await privyService.setWalletPolicy(companionId, policy);
    } catch (err) {
      console.warn('[WalletProvider] Failed to set default policy (non-fatal):', err.message);
    }

    return { address: result.address, walletId: result.walletId, provider: 'privy' };
  }

  // OWS: primary provider for non-Privy users
  try {
    const firstName = (opts.firstName || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'companion';
    const lastName = (opts.lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '') || companionId;
    const walletName = `bonzai-companion-${firstName}-${lastName}`;

    // Generate passphrase (32-char random)
    const passphraseBytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(passphraseBytes);
    const passphrase = btoa(String.fromCharCode(...passphraseBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const walletResult = await owsService.createWallet(walletName, passphrase);
    if (walletResult.error) {
      throw new Error(walletResult.error);
    }

    // Store passphrase in Electron Store
    await window.electronAPI?.store?.set(`ows-passphrase-${companionId}`, passphrase);

    // Create default spending policy
    try {
      const policyResult = await owsService.createPolicy({
        allowed_chains: ['eip155:8453'],
        daily_limit_eth: '0.005',
        expires_at: '2027-12-31T23:59:59Z',
      });

      // Create API key
      const policyIds = policyResult?.id ? [policyResult.id] : ['base-spending'];
      const apiKeyResult = await owsService.createApiKey(
        `${walletName}-agent`,
        [walletName],
        policyIds,
        passphrase,
        '2027-12-31T23:59:59Z'
      );
      if (apiKeyResult && !apiKeyResult.error) {
        await window.electronAPI?.store?.set(`ows-api-key-${companionId}`, apiKeyResult.token);
      }
    } catch (policyErr) {
      console.warn('[WalletProvider] OWS policy/API key creation failed (non-fatal):', policyErr.message);
    }

    // Store wallet mapping
    await window.electronAPI?.store?.set(`ows-wallet-${companionId}`, {
      walletName,
      address: walletResult.address,
      provider: 'ows',
    });

    console.log('[WalletProvider] OWS wallet created:', walletResult.address);
    return { address: walletResult.address, provider: 'ows' };
  } catch (owsErr) {
    throw new Error(`[WalletProvider] OWS wallet creation failed: ${owsErr.message}`);
  }
}

/**
 * Auto-migrate a legacy wallet to OWS if one exists and no OWS wallet is present.
 *
 * @param {string} companionId
 * @returns {Promise<boolean>} true if migration was performed
 */
async function autoMigrateLegacyWallet(companionId) {
  try {
    const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
    if (owsMapping) return false; // Already has OWS wallet

    const hasLegacy = await agentWalletService.hasAgentWallet(companionId);
    if (!hasLegacy) return false; // No legacy wallet to migrate

    console.log(`[WalletProvider] Auto-migrating legacy wallet for companion ${companionId} to OWS`);
    await owsMigrationService.migrateCompanion(companionId);
    return true;
  } catch (err) {
    console.warn(`[WalletProvider] Auto-migration failed for ${companionId}:`, err.message);
    return false;
  }
}

/**
 * Check if an agent wallet exists for a companion.
 * Checks OWS → Privy. Auto-migrates legacy wallets to OWS if found.
 *
 * @param {string} companionId
 * @returns {Promise<boolean>}
 */
async function hasAgentWallet(companionId) {
  // Auto-migrate legacy wallet if it exists but no OWS wallet does
  await autoMigrateLegacyWallet(companionId);

  // Check OWS
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) return true;

  // Check Privy
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) return true;

  return false;
}

/**
 * Get the agent wallet address for a companion.
 *
 * @param {string} companionId
 * @returns {Promise<string|null>}
 */
async function getAgentWalletAddress(companionId) {
  // Check OWS first
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping?.address) return owsMapping.address;

  // Check Privy
  const privyAddress = await privyService.getServerWalletAddress(companionId);
  if (privyAddress) return privyAddress;

  return null;
}

/**
 * Get an ethers-compatible signer for a companion's agent wallet.
 * This is the primary integration point for x402Executor and purchaseExecutor.
 * Priority: OWS → Privy
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<Object>} Signer (OWSEthersSigner or PrivyServerSigner)
 */
async function getAgentWalletSigner(companionId, chainId = 8453) {
  // Check OWS wallet first
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) {
    const passphrase = await window.electronAPI?.store?.get(`ows-passphrase-${companionId}`)
      || await window.electronAPI?.store?.get(`ows-api-key-${companionId}`);
    if (passphrase) {
      const chainConfig = agentWalletService.getChainConfig(chainId);
      const provider = chainConfig
        ? new (await import('ethers')).ethers.JsonRpcProvider(chainConfig.rpc)
        : undefined;
      return new OWSEthersSigner(owsMapping.walletName, passphrase, provider);
    }
  }

  // Check Privy server wallet
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    return privyService.getServerWalletSigner(companionId, chainId);
  }

  throw new Error(`No agent wallet found for companion ${companionId}. Only OWS and Privy wallets are supported.`);
}

/**
 * Get agent wallet ETH balance.
 *
 * @param {string} companionId
 * @param {number} chainId
 * @returns {Promise<string>} Balance in ETH
 */
async function getAgentWalletBalance(companionId, chainId = 8453) {
  // OWS: use address from mapping with standard provider
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping?.address) {
    const { ethers } = await import('ethers');
    const chainConfig = agentWalletService.getChainConfig(chainId);
    if (!chainConfig) throw new Error(`Chain ${chainId} not supported`);
    const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    const balance = await provider.getBalance(owsMapping.address);
    return ethers.formatEther(balance);
  }

  // Check Privy
  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    return privyService.getServerWalletBalance(companionId, chainId);
  }

  throw new Error(`No agent wallet found for companion ${companionId}`);
}

/**
 * Get stored agent wallet credentials (for display / backwards compat).
 * Returns a normalized object with at minimum { address }.
 *
 * @param {string} companionId
 * @returns {Promise<{address: string, walletId?: string, privateKey?: string, provider: 'ows'|'privy'|'local'}|null>}
 */
async function getAgentWalletCredentials(companionId) {
  // Check OWS first
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) {
    return {
      address: owsMapping.address,
      walletName: owsMapping.walletName,
      provider: 'ows',
    };
  }

  // Check Privy
  const privyMapping = await privyService.getServerWalletMapping(companionId);
  if (privyMapping) {
    return {
      address: privyMapping.address,
      walletId: privyMapping.walletId,
      provider: 'privy',
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPENDING LIMIT CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check spending limit for a transaction.
 * - OWS wallets: limits enforced by OWS policies, always allow locally
 * - Privy wallets: limits enforced server-side by Privy policies, always allow locally
 * - Local wallets: enforce local spending limits
 *
 * @param {string} companionId
 * @param {bigint|string} amountWei
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkSpendingLimit(companionId, amountWei) {
  // OWS enforces limits via policies
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) return { allowed: true };

  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    // Privy enforces limits server-side via policies
    return { allowed: true };
  }

  // No recognized wallet provider — deny by default
  return { allowed: false, reason: 'No OWS or Privy wallet found for this companion' };
}

/**
 * Record a spend (only relevant for local wallets)
 */
async function recordSpend(companionId, amountWei) {
  // OWS and Privy track spending via their own policies — no-op locally
  return;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (only for local wallets — Privy has its own rate limits)
// ═══════════════════════════════════════════════════════════════════════════

function checkTxRateLimit(companionId) {
  // OWS and Privy handle rate limiting via policies
  return { allowed: true };
}

function checkSigRateLimit(companionId) {
  // OWS and Privy handle rate limiting via policies
  return { allowed: true };
}

/**
 * Check if a companion uses OWS wallet (synchronous check via cached store)
 * @param {string} companionId
 * @returns {boolean}
 */
function isOWSUser(companionId) {
  // This is a sync check — for async confirmation, use hasOWSWallet()
  // We rely on the store call in the caller to have already resolved
  return false; // Rate limiting will be checked after async lookup in checkSpendingLimit
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

// ═══════════════════════════════════════════════════════════════════════════
// OWS-SPECIFIC OPERATIONS (exposed for BrowseAgents UI)
// ═══════════════════════════════════════════════════════════════════════════

async function listOWSWallets() {
  return owsService.listWallets();
}

async function getOWSPolicies() {
  return owsService.listPolicies();
}

async function createOWSPolicy(policyJson) {
  return owsService.createPolicy(policyJson);
}

async function getOWSApiKeys() {
  return owsService.listApiKeys();
}

export const walletProviderService = {
  // Registration (for breaking circular imports)
  registerWeb3Service,

  // Auth detection
  getAuthProvider,
  isPrivyUser,

  // Migration
  autoMigrateLegacyWallet,

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

  // OWS-specific
  listOWSWallets,
  getOWSPolicies,
  createOWSPolicy,
  getOWSApiKeys,

  // Passthrough
  storeCompanionUP,
  getCompanionUP,
  deleteCompanionUP,
  getChainConfig,
  getSupportedChains,
  isChainSupported,
};

export default walletProviderService;
