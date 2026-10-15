/**
 * Smart-agent wallets live in the local OWS vault, independently of the
 * owner's login method. Existing wallet mappings remain recoverable.
 */

import { agentWalletService } from './agentWallet.service.js';
import { privyService } from './privy.service.js';
import { owsService } from './ows.service.js';
import { OWSEthersSigner } from './owsSigner.adapter.js';
import { owsMigrationService } from './owsMigration.service.js';
import { CONFIG } from '../config/web3.config.js';
import { walletCredentials, ensureOWSPassphrase } from './walletCredentials.service.js';
import { restrictAgentJobSigner } from './agentJobSigner.js';

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
 * New wallets always use the local OWS vault. Owner email authentication
 * does not imply that a Privy server-wallet service is available.
 *
 * @param {string} companionId
 * @param {Object} [opts] - Optional companion info for wallet naming
 * @param {string} [opts.firstName] - Companion first name
 * @param {string} [opts.lastName] - Companion last name
 * @returns {Promise<{address: string, privateKey?: string, walletId?: string, provider: string}>}
 */
async function createAgentWallet(companionId, opts = {}) {
  if (!companionId) throw new Error('A smart-agent identity is required.');
  const existing = await getAgentWalletCredentials(companionId);
  if (existing) return existing;
  if (await agentWalletService.hasAgentWallet(companionId)) {
    await autoMigrateLegacyWallet(companionId);
    const migrated = await getAgentWalletCredentials(companionId);
    if (migrated) return migrated;
    throw new Error('Recover the existing agent wallet before retrying the launch.');
  }

  try {
    const { ethers } = await import('ethers');
    // Stable identity survives renaming and prevents equal names sharing a key.
    const walletName = `bonzai-agent-${ethers.id(String(companionId)).slice(2, 26)}`;

    // Persist and verify the passphrase before creating an encrypted OWS wallet.
    const passphrase = await ensureOWSPassphrase(companionId);

    // A launch can be retried after the vault write but before mapping persistence.
    const retained = await owsService.getWallet(walletName);
    const walletResult = retained?.address ? retained : await owsService.createWallet(walletName, passphrase);
    if (walletResult.error) {
      throw new Error(walletResult.error);
    }
    if (!ethers.isAddress(walletResult.address || '')) throw new Error('OWS returned an invalid wallet address.');

    // Receive-only companions do not need spending policies or API tokens.
    if (CONFIG.agentWallet.enabledOperations?.includes('pay')) {
      let apiKeyResult;
      try {
        const policyResult = await owsService.createPolicy({
          allowed_chains: [`eip155:${CONFIG.agentWallet.defaultChainId}`],
          daily_limit_eth: '0.005',
          expires_at: '2027-12-31T23:59:59Z',
        });

        // Create API key
        const policyIds = policyResult?.id ? [policyResult.id] : ['base-spending'];
        apiKeyResult = await owsService.createApiKey(
          `${walletName}-agent`,
          [walletName],
          policyIds,
          passphrase,
          '2027-12-31T23:59:59Z'
        );
        if (apiKeyResult && !apiKeyResult.error) {
          await walletCredentials.setOWS(companionId, 'apiKey', apiKeyResult.token);
        }
      } catch (policyErr) {
        if (apiKeyResult?.id) await owsService.revokeApiKey(apiKeyResult.id).catch(() => {});
        console.warn('[WalletProvider] Optional OWS spending capability was not provisioned');
      }
    }

    // Store wallet mapping
    const mappingSaved = await window.electronAPI?.store?.set(`ows-wallet-${companionId}`, {
      walletName,
      address: walletResult.address,
      provider: 'ows',
    });
    if (mappingSaved !== true) throw new Error('The OWS wallet mapping could not be saved');

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

    const result = await owsMigrationService.migrateCompanion(companionId);
    return result.success === true;
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
  if (!CONFIG.agentWallet.enabledOperations?.includes('pay')) {
    throw new Error('Companion wallets are receive-only in this release.');
  }
  return resolveAgentSigner(companionId, chainId);
}

async function getAgentWorkerRequestSigner(companionId, { approved, message, chainId } = {}) {
  if (approved !== true || typeof message !== 'string' || !/^BonzAI worker request v1\n0x[0-9a-f]{64}$/.test(message)) throw new Error('Approve this exact worker request first.');
  const signer = await resolveAgentSigner(companionId, chainId);
  return { getAddress: () => signer.getAddress(), signMessage: value => {
    if (value !== message) throw new Error('Worker request changed after approval.');
    return signer.signMessage(value);
  } };
}

async function getAgentJobSigner(companionId, { approved, action, jobId, evidenceHash, currency } = {}) {
  if (approved !== true || !['acceptJob', 'submitWork', 'withdrawTokenPayments'].includes(action)) throw new Error('Explicit approval is required for this smart-agent job action.');
  const { ethers } = await import('ethers');
  const escrowAddress = CONFIG.contributionEconomy?.jobEscrowAddress;
  const chainId = CONFIG.contributionEconomy?.chainId;
  if (!ethers.isAddress(escrowAddress || '') || !chainId) throw new Error('Smart-agent job settlement is not configured.');
  const signer = await resolveAgentSigner(companionId, chainId);
  const abi = new ethers.Interface(['function acceptJob(bytes32)', 'function submitWork(bytes32,bytes32)', 'function withdrawTokenPayments(address,address)']);
  const args = action === 'acceptJob' ? [jobId] : action === 'submitWork' ? [jobId, evidenceHash] : [currency, await signer.getAddress()];
  const data = abi.encodeFunctionData(action, args);
  return restrictAgentJobSigner(signer, { escrowAddress, chainId, data });
}

async function resolveAgentSigner(companionId, chainId) {
  const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${companionId}`);
  if (owsMapping) {
    const passphrase = await walletCredentials.getOWS(companionId, 'passphrase')
      || await walletCredentials.getOWS(companionId, 'apiKey');
    if (passphrase) {
      const chainConfig = agentWalletService.getChainConfig(chainId);
      if (!chainConfig?.rpc) throw new Error(`No RPC configured for chain ${chainId}.`);
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
  getAgentJobSigner,
  getAgentWorkerRequestSigner,
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
