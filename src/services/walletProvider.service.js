/**
 * Wallet Provider Abstraction — routes agent wallet ops to Privy or OWS
 * based on auth provider, so downstream consumers don't need to know which backend is active.
 */

import { agentWalletService } from './agentWallet.service.js';
import { privyService } from './privy.service.js';
import { owsService } from './ows.service.js';
import { OWSEthersSigner } from './owsSigner.adapter.js';
import { owsMigrationService } from './owsMigration.service.js';
import { CONFIG } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// AUTH PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

// Lazy ref to break circular import with web3.service.js
let _web3ServiceRef = null;

export function registerWeb3Service(service) {
  _web3ServiceRef = service;
}

function getAuthProvider() {
  return _web3ServiceRef?.state?.authProvider || null;
}

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

    return { address: walletResult.address, provider: 'ows' };
  } catch (owsErr) {
    throw new Error(`[WalletProvider] OWS wallet creation failed: ${owsErr.message}`);
  }
}

async function autoMigrateLegacyWallet(companionId) {
  try {
    const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
    if (owsMapping) return false; // Already has OWS wallet

    const hasLegacy = await agentWalletService.hasAgentWallet(companionId);
    if (!hasLegacy) return false; // No legacy wallet to migrate

    await owsMigrationService.migrateCompanion(companionId);
    return true;
  } catch (err) {
    console.warn(`[WalletProvider] Auto-migration failed for ${companionId}:`, err.message);
    return false;
  }
}

async function hasAgentWallet(companionId) {
  await autoMigrateLegacyWallet(companionId);

  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) return true;

  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) return true;

  return false;
}

async function getAgentWalletAddress(companionId) {
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping?.address) return owsMapping.address;

  const privyAddress = await privyService.getServerWalletAddress(companionId);
  if (privyAddress) return privyAddress;

  return null;
}

/** Primary integration point for x402Executor and purchaseExecutor. Priority: OWS then Privy. */
async function getAgentWalletSigner(companionId, chainId = CONFIG.agentWallet.defaultChainId) {
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

  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) {
    return privyService.getServerWalletSigner(companionId, chainId);
  }

  throw new Error(`No agent wallet found for companion ${companionId}. Only OWS and Privy wallets are supported.`);
}

async function getAgentWalletBalance(companionId, chainId = CONFIG.agentWallet.defaultChainId) {
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping?.address) {
    const { ethers } = await import('ethers');
    const chainConfig = agentWalletService.getChainConfig(chainId);
    if (!chainConfig) throw new Error(`Chain ${chainId} not supported`);
    const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    const balance = await provider.getBalance(owsMapping.address);
    return ethers.formatEther(balance);
  }

  const hasPrivyWallet = await privyService.hasServerWallet(companionId);
  if (hasPrivyWallet) {
    return privyService.getServerWalletBalance(companionId, chainId);
  }

  throw new Error(`No agent wallet found for companion ${companionId}`);
}

async function getAgentWalletCredentials(companionId) {
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) {
    return {
      address: owsMapping.address,
      walletName: owsMapping.walletName,
      provider: 'ows',
    };
  }

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

// OWS and Privy enforce limits via their own policies; deny if no recognized provider
async function checkSpendingLimit(companionId, amountWei) {
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) return { allowed: true };

  const hasPrivy = await privyService.hasServerWallet(companionId);
  if (hasPrivy) return { allowed: true };

  return { allowed: false, reason: 'No OWS or Privy wallet found for this companion' };
}

async function recordSpend(companionId, amountWei) {
  // no-op: OWS and Privy track spending via their own policies
}

// no-op rate limits: OWS and Privy handle rate limiting via policies
function checkTxRateLimit(companionId) { return { allowed: true }; }
function checkSigRateLimit(companionId) { return { allowed: true }; }

// Passthrough from agentWalletService
const { storeCompanionUP, getCompanionUP, deleteCompanionUP } = agentWalletService;
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
