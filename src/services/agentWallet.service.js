/**
 * Agent Wallet Service (ETH-Only)
 *
 * Manages deterministic wallet generation and storage for AI companion agents.
 * These wallets receive protocol revenue for companions.
 *
 * Security:
 * - Master secret is generated once and stored encrypted locally
 * - Agent wallets are derived deterministically from master secret + companion ID
 * - Private keys are encrypted with user password before storage
 *
 * Payment Flow:
 * - Uses native ETH transfers (no USDC, no ERC-3009)
 * - Base is primary chain for cheap gas (~$0.001 per tx)
 */

import { ethers } from 'ethers';
import { CONFIG } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MASTER_SECRET_KEY = 'bonzai-agent-master-secret';
const AGENT_WALLET_PREFIX = 'agent-wallet-';
const DERIVATION_PATH_BASE = "m/44'/60'/0'/0/";

// Spending limit defaults (read from config, fallback to hardcoded)
const DEFAULT_MAX_TRANSACTION = CONFIG?.agentWallet?.defaultMaxTransaction || '0.001'; // ETH
const DEFAULT_DAILY_LIMIT = CONFIG?.agentWallet?.defaultDailyLimit || '0.005';         // ETH

// Electron Store key prefix for daily spend tracking
const DAILY_SPEND_PREFIX = 'agent-daily-spend-';

// Confirmation threshold — transactions above this require user approval via native dialog
const CONFIRMATION_THRESHOLD_ETH = '0.0005'; // ~$1

// In-memory fallback for daily spend tracking when Electron Store is unavailable
const _inMemoryDailySpend = new Map();

// ── Rate limiter state (P2 Security) ──────────────────────────────────────────
// Max 5 transactions per minute per companion, max 20 signatures per minute
const _txTimestamps = new Map();    // companionId => number[]
const _sigTimestamps = new Map();   // companionId => number[]
const _failureCounts = new Map();   // companionId => number (consecutive failures)
const TX_RATE_LIMIT = 5;            // max transactions per minute
const SIG_RATE_LIMIT = 20;          // max signatures per minute
const RATE_WINDOW_MS = 60_000;      // 1 minute window

// Supported chains for ETH payments
const SUPPORTED_CHAINS = {
  8453: { // Base (primary - cheap gas)
    name: 'Base',
    rpc: CONFIG?.networks?.base?.rpc || 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  42161: { // Arbitrum
    name: 'Arbitrum',
    rpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
  },
  1: { // Ethereum Mainnet (expensive, but supported)
    name: 'Ethereum',
    rpc: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io',
  },
  42: { // LUKSO Mainnet
    name: 'LUKSO',
    rpc: 'https://rpc.mainnet.lukso.network',
    explorer: 'https://explorer.lukso.network',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SECRET STORAGE (P9 Security) — safeStorage-backed IPC + legacy migration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transactionally migrate a legacy plaintext record (found under the
 * generic electron-store key) to protected storage via the safeStorage-backed
 * wallet-secret IPC (see main.js / src/main/secretStore.js).
 *
 * Verify-before-delete: encrypt + persist, read the protected record back
 * and compare it against the original plaintext, and only then remove the
 * legacy plaintext record. Any failure along the way (encryption, write, or
 * verification — including the OS-encryption-unavailable case, which
 * surfaces as the wallet-secret IPC throwing) leaves the legacy record
 * completely unchanged and never writes a second plaintext copy anywhere.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function _migrateLegacySecret({ storeKey, secretKey, plaintext, address }) {
  try {
    await window.electronAPI?.walletSecret?.set(secretKey, plaintext, { address });
  } catch (error) {
    console.error(`[AgentWallet] Migration failed while encrypting legacy secret for ${secretKey}:`, error?.message || error);
    return { ok: false, reason: 'encrypt-failed' };
  }

  let verified;
  try {
    verified = await window.electronAPI?.walletSecret?.get(secretKey);
  } catch (error) {
    console.error(`[AgentWallet] Migration failed while reading back protected secret for ${secretKey}:`, error?.message || error);
    // The set() above did persist a protected record even though we can't
    // confirm its contents — remove it so the untouched legacy record (not
    // this unverified one) stays canonical on the next access.
    await _rollbackRejectedProtectedRecord(secretKey);
    return { ok: false, reason: 'verify-read-failed' };
  }

  if (!verified || verified.secret !== plaintext) {
    console.error(`[AgentWallet] Migration verification failed for ${secretKey}: decrypted value did not match the original`);
    // Same reasoning: a protected record exists but failed verification, so
    // it must not be left in place to shadow the still-good legacy record.
    await _rollbackRejectedProtectedRecord(secretKey);
    return { ok: false, reason: 'verify-mismatch' };
  }

  try {
    await window.electronAPI?.store?.delete(storeKey);
  } catch (error) {
    console.error(`[AgentWallet] Migration verified ${secretKey} but failed to remove the legacy plaintext copy:`, error?.message || error);
    return { ok: false, reason: 'legacy-delete-failed' };
  }

  console.log(`[AgentWallet] Migrated legacy plaintext secret for ${secretKey} to protected storage`);
  return { ok: true };
}

/**
 * Delete a protected record that migration wrote but then rejected (failed
 * read-back or mismatched verification), so it cannot outrank the preserved
 * legacy record on a later read. Best-effort: if this also fails, the
 * rejected record is left in place and logged loudly, since silently
 * proceeding would let unverified ciphertext become canonical.
 */
async function _rollbackRejectedProtectedRecord(secretKey) {
  try {
    await window.electronAPI?.walletSecret?.delete(secretKey);
  } catch (error) {
    console.error(`[AgentWallet] Failed to roll back rejected protected record for ${secretKey}; it may incorrectly take precedence over the legacy record:`, error?.message || error);
  }
}

/**
 * Best-effort removal of a legacy plaintext record now that a protected
 * record is canonical for `key`. Logs loudly on failure instead of
 * swallowing it silently (A3) — callers that read the protected record
 * retry this on every access, so a transient failure here is not permanent.
 */
async function _clearLegacyPlaintext(key) {
  try {
    await window.electronAPI?.store?.delete(key);
  } catch (error) {
    console.error(`[AgentWallet] Failed to remove legacy plaintext copy for ${key}; will retry on next access:`, error?.message || error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER SECRET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get or generate the master secret for wallet derivation.
 *
 * New secrets are always persisted through the safeStorage-backed
 * wallet-secret IPC — never as plaintext. A pre-existing legacy plaintext
 * record (from before P9) is opportunistically migrated to protected
 * storage on access; if migration cannot complete (e.g. safeStorage is
 * unavailable on this OS session), the legacy record is left untouched and
 * used as-is so wallet derivation keeps working. Because the legacy record
 * is only deleted after a migration verifies successfully, its presence
 * always takes precedence over a protected record (A4) — this guarantees a
 * protected record rejected by verification can never become canonical,
 * even if its own best-effort rollback failed.
 *
 * @deprecated Use OWS vault wallets via walletProvider.service.js instead.
 * @returns {Promise<Uint8Array>} 32-byte master secret
 */
async function getMasterSecret() {
  console.warn('[AgentWallet] getMasterSecret() is deprecated. Use OWS wallets via walletProviderService.');
  try {
    const protectedRecord = await window.electronAPI?.walletSecret?.get(MASTER_SECRET_KEY);
    // Legacy plaintext record from before P9 (stored as a raw hex string).
    const legacyValue = await window.electronAPI?.store?.get(MASTER_SECRET_KEY);

    if (typeof legacyValue === 'string' && legacyValue.length > 0) {
      // The legacy record is only ever deleted after a migration is verified
      // end-to-end (see _migrateLegacySecret), so its continued presence here
      // means any protected record is either not yet migrated or was rejected
      // by verification and its best-effort rollback failed (A4) — in either
      // case the legacy value, never the protected one, is the trustworthy
      // secret. Proactively re-clear a leftover rejected record so we don't
      // keep retrying a migration against stale ciphertext.
      if (protectedRecord) {
        await _rollbackRejectedProtectedRecord(MASTER_SECRET_KEY);
      }
      const migration = await _migrateLegacySecret({
        storeKey: MASTER_SECRET_KEY,
        secretKey: MASTER_SECRET_KEY,
        plaintext: legacyValue,
      });
      if (!migration.ok) {
        console.warn(`[AgentWallet] Continuing with legacy master secret; migration failed (${migration.reason})`);
      }
      return ethers.getBytes(legacyValue);
    }

    // Protected record already exists and no legacy copy remains — canonical
    // source, decrypt or fail closed.
    if (protectedRecord) {
      return ethers.getBytes(protectedRecord.secret);
    }

    // Nothing stored yet — generate and persist a new, protected secret.
    const masterSecret = ethers.randomBytes(32);
    const hexSecret = ethers.hexlify(masterSecret);
    await window.electronAPI?.walletSecret?.set(MASTER_SECRET_KEY, hexSecret);

    console.log('[AgentWallet] Generated new master secret');
    return masterSecret;
  } catch (error) {
    console.error('[AgentWallet] Failed to get master secret:', error);
    throw new Error('Failed to initialize agent wallet system');
  }
}

/**
 * Check if master secret exists (protected or legacy plaintext).
 * @returns {Promise<boolean>}
 */
async function hasMasterSecret() {
  try {
    if (await window.electronAPI?.walletSecret?.has(MASTER_SECRET_KEY)) return true;
    const legacyValue = await window.electronAPI?.store?.get(MASTER_SECRET_KEY);
    return !!legacyValue;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a deterministic wallet for a companion
 * The wallet is derived from master secret + companion ID, ensuring consistency
 *
 * @deprecated Use OWS vault wallets via walletProvider.service.js instead.
 * @param {string|number} companionId - The companion's unique identifier
 * @returns {Promise<{address: string, privateKey: string}>}
 */
export async function generateAgentWallet(companionId) {
  console.warn('[AgentWallet] generateAgentWallet() is deprecated. Use OWS wallets via walletProviderService.');
  const masterSecret = await getMasterSecret();

  // Create deterministic seed from master secret + companion ID
  const seed = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'string'],
      [ethers.hexlify(masterSecret), String(companionId)]
    )
  );

  // Create wallet from the seed
  const wallet = new ethers.Wallet(seed);

  console.log('[AgentWallet] Generated wallet for companion', companionId, ':', wallet.address);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

/**
 * Generate wallet using HD derivation path (alternative method)
 * This provides BIP-44 compliant derivation
 *
 * @param {number} index - The derivation index
 * @returns {Promise<{address: string, privateKey: string}>}
 */
export async function generateAgentWalletHD(index) {
  const masterSecret = await getMasterSecret();

  // Create mnemonic from master secret for HD derivation
  const mnemonic = ethers.Mnemonic.fromEntropy(masterSecret);
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic);
  const childWallet = hdNode.derivePath(`${DERIVATION_PATH_BASE}${index}`);

  return {
    address: childWallet.address,
    privateKey: childWallet.privateKey,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store agent wallet credentials via the safeStorage-backed wallet-secret
 * IPC (P9). Only ciphertext + non-secret metadata is ever persisted; the
 * private key never touches the generic electron-store.
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {{address: string, privateKey: string}} wallet - The wallet to store
 */
export async function storeAgentWalletCredentials(companionId, wallet) {
  const key = `${AGENT_WALLET_PREFIX}${companionId}`;

  await window.electronAPI?.walletSecret?.set(key, wallet.privateKey, { address: wallet.address });

  // Clear any stale legacy plaintext copy now that a protected record is
  // canonical. If this fails, getAgentWalletCredentials retries it on every
  // subsequent read (A3) — it is never left as a silent permanent failure.
  await _clearLegacyPlaintext(key);

  console.log('[AgentWallet] Stored credentials for companion', companionId);
}

/**
 * Get stored agent wallet credentials.
 *
 * A legacy plaintext record is only ever deleted after its migration is
 * verified end-to-end, so its continued presence always takes precedence
 * over any protected record (A4) — it means the protected record is either
 * not yet migrated or was rejected by verification. When no legacy record
 * remains, the protected record is canonical (fails closed — throws — if it
 * exists but OS encryption is unavailable to decrypt it).
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @returns {Promise<{address: string, privateKey: string, createdAt: number}|null>}
 */
export async function getAgentWalletCredentials(companionId) {
  const key = `${AGENT_WALLET_PREFIX}${companionId}`;

  const protectedRecord = await window.electronAPI?.walletSecret?.get(key);
  const legacy = await window.electronAPI?.store?.get(key);

  if (legacy && legacy.privateKey) {
    // As in getMasterSecret, the legacy record only ever gets deleted after a
    // migration is verified end-to-end, so its continued presence means any
    // protected record here is either not yet migrated or was rejected by
    // verification and its best-effort rollback failed (A4) — the legacy
    // value is the only one we can trust. Proactively re-clear a leftover
    // rejected record so we don't keep retrying against stale ciphertext.
    if (protectedRecord) {
      await _rollbackRejectedProtectedRecord(key);
    }
    const migration = await _migrateLegacySecret({
      storeKey: key,
      secretKey: key,
      plaintext: legacy.privateKey,
      address: legacy.address,
    });
    if (!migration.ok) {
      console.warn(`[AgentWallet] Continuing with legacy wallet credentials for companion ${companionId}; migration failed (${migration.reason})`);
    }

    return {
      address: legacy.address,
      privateKey: legacy.privateKey,
      createdAt: legacy.createdAt,
    };
  }

  if (protectedRecord) {
    return {
      address: protectedRecord.address,
      privateKey: protectedRecord.secret,
      createdAt: protectedRecord.createdAt,
    };
  }

  return null;
}

/**
 * Check if agent wallet credentials exist for a companion
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @returns {Promise<boolean>}
 */
export async function hasAgentWallet(companionId) {
  const credentials = await getAgentWalletCredentials(companionId);
  return !!credentials;
}

/**
 * Delete agent wallet credentials (protected record and any legacy remnant).
 *
 * @param {string|number} companionId - The companion's unique identifier
 */
export async function deleteAgentWalletCredentials(companionId) {
  const key = `${AGENT_WALLET_PREFIX}${companionId}`;
  await window.electronAPI?.walletSecret?.delete(key);
  await window.electronAPI?.store?.delete(key);
  console.log('[AgentWallet] Deleted credentials for companion', companionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get an ethers Signer for a companion's agent wallet
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {ethers.Provider} [provider] - Optional provider to connect to
 * @returns {Promise<ethers.Wallet>}
 */
export async function getAgentWalletSigner(companionId, provider = null) {
  const credentials = await getAgentWalletCredentials(companionId);

  if (!credentials) {
    throw new Error(`No agent wallet found for companion ${companionId}`);
  }

  const wallet = new ethers.Wallet(credentials.privateKey);

  if (provider) {
    return wallet.connect(provider);
  }

  return wallet;
}

/**
 * Get agent wallet signer connected to a specific chain
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {number} chainId - The chain ID to connect to
 * @returns {Promise<ethers.Wallet>}
 */
export async function getAgentWalletSignerForChain(companionId, chainId) {
  const chainConfig = SUPPORTED_CHAINS[chainId];
  if (!chainConfig) {
    throw new Error(`Chain ${chainId} not supported`);
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
  return getAgentWalletSigner(companionId, provider);
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get chain configuration
 *
 * @param {number} chainId - The chain ID
 * @returns {Object|null}
 */
export function getChainConfig(chainId) {
  return SUPPORTED_CHAINS[chainId] || null;
}

/**
 * Get all supported chains
 *
 * @returns {Object}
 */
export function getSupportedChains() {
  return { ...SUPPORTED_CHAINS };
}

/**
 * Check if a chain is supported
 *
 * @param {number} chainId - The chain ID
 * @returns {boolean}
 */
export function isChainSupported(chainId) {
  return chainId in SUPPORTED_CHAINS;
}

/**
 * Get agent wallet ETH balance on a specific chain
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {number} chainId - The chain ID (default: Base 8453)
 * @returns {Promise<string>} ETH balance as formatted string
 */
export async function getAgentWalletBalance(companionId, chainId = 8453) {
  const chainConfig = SUPPORTED_CHAINS[chainId];
  if (!chainConfig) {
    throw new Error(`Chain ${chainId} not supported`);
  }

  const credentials = await getAgentWalletCredentials(companionId);
  if (!credentials) {
    throw new Error(`No agent wallet found for companion ${companionId}`);
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
  const ethBalance = await provider.getBalance(credentials.address);

  return ethers.formatEther(ethBalance);
}

// ═══════════════════════════════════════════════════════════════════════════
// SPENDING LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get today's date string in YYYY-MM-DD format (UTC)
 * @returns {string}
 */
function _getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the Electron Store key for daily spend tracking
 * @param {string|number} companionId
 * @returns {string}
 */
function _dailySpendKey(companionId) {
  return `${DAILY_SPEND_PREFIX}${companionId}-${_getTodayKey()}`;
}

/**
 * Read the cumulative daily spend (in wei) for a companion today.
 * Falls back to in-memory Map if Electron Store is unavailable.
 *
 * @param {string|number} companionId
 * @returns {Promise<bigint>} cumulative spend in wei
 */
async function _getDailySpend(companionId) {
  const key = _dailySpendKey(companionId);

  try {
    const stored = await window.electronAPI?.store?.get(key);
    if (stored) {
      return BigInt(stored);
    }
  } catch {
    // Electron Store unavailable — fall through to in-memory
  }

  // In-memory fallback
  return BigInt(_inMemoryDailySpend.get(key) || '0');
}

/**
 * Persist the cumulative daily spend (in wei) for a companion today.
 * Writes to Electron Store if available, otherwise in-memory Map.
 *
 * @param {string|number} companionId
 * @param {bigint} totalWei - new cumulative total for today
 */
async function _setDailySpend(companionId, totalWei) {
  const key = _dailySpendKey(companionId);
  const value = totalWei.toString();

  try {
    await window.electronAPI?.store?.set(key, value);
  } catch {
    // Electron Store unavailable — use in-memory
  }

  // Always keep in-memory in sync (serves as fallback and fast cache)
  _inMemoryDailySpend.set(key, value);
}

/**
 * Check whether a proposed spend is within the spending limits.
 *
 * Rules enforced:
 *   1. Single transaction must not exceed `defaultMaxTransaction` (default 0.001 ETH)
 *   2. Cumulative daily spend + this amount must not exceed `defaultDailyLimit` (default 0.005 ETH)
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {bigint|string} amountWei - Amount to spend, in wei (BigInt or decimal string)
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkSpendingLimit(companionId, amountWei) {
  const amount = BigInt(amountWei);

  // --- Per-transaction limit ---
  const maxTxWei = ethers.parseEther(DEFAULT_MAX_TRANSACTION);
  if (amount > maxTxWei) {
    return {
      allowed: false,
      reason: `Transaction amount (${ethers.formatEther(amount)} ETH) exceeds per-transaction limit of ${DEFAULT_MAX_TRANSACTION} ETH`,
    };
  }

  // --- Daily cumulative limit ---
  const dailyLimitWei = ethers.parseEther(DEFAULT_DAILY_LIMIT);
  const spentToday = await _getDailySpend(companionId);

  if (spentToday + amount > dailyLimitWei) {
    const remainingWei = dailyLimitWei > spentToday ? dailyLimitWei - spentToday : 0n;
    return {
      allowed: false,
      reason: `Daily limit would be exceeded. Already spent ${ethers.formatEther(spentToday)} ETH today, `
        + `attempting ${ethers.formatEther(amount)} ETH, `
        + `but daily limit is ${DEFAULT_DAILY_LIMIT} ETH `
        + `(${ethers.formatEther(remainingWei)} ETH remaining)`,
    };
  }

  return { allowed: true };
}

/**
 * Record a successful spend against a companion's daily tally.
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {bigint|string} amountWei - Amount that was spent, in wei
 */
export async function recordSpend(companionId, amountWei) {
  const amount = BigInt(amountWei);
  const current = await _getDailySpend(companionId);
  await _setDailySpend(companionId, current + amount);
  console.log(
    `[AgentWallet] Recorded spend for companion ${companionId}: `
    + `${ethers.formatEther(amount)} ETH (daily total: ${ethers.formatEther(current + amount)} ETH)`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// USER CONFIRMATION (P0 Security — native Electron dialog)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request user confirmation for a transaction via native Electron dialog.
 * Transactions at or below CONFIRMATION_THRESHOLD_ETH are auto-approved.
 *
 * @param {Object} details
 * @param {string} details.companionName - Display name of the companion
 * @param {string} details.recipientAddress - Recipient address
 * @param {string} details.amountEth - Amount in ETH
 * @param {string} [details.chainName] - Chain name (default: "Base")
 * @param {string} [details.context] - Description of why the tx is needed
 * @returns {Promise<boolean>} true if approved
 */
export async function requestTransactionConfirmation(details) {
  try {
    const result = await window.electronAPI?.confirmTransaction?.(details);
    if (!result) {
      // Fallback: no IPC available (dev/test), auto-approve below threshold
      const amount = parseFloat(details.amountEth) || 0;
      return amount <= parseFloat(CONFIRMATION_THRESHOLD_ETH);
    }
    return result.approved;
  } catch (err) {
    console.error('[AgentWallet] Confirmation dialog error:', err);
    return false; // Fail closed
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (P2 Security)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prune timestamps older than the rate window
 */
function _pruneTimestamps(arr) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

/**
 * Check and record a transaction rate limit
 * @param {string|number} companionId
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkTxRateLimit(companionId) {
  const key = String(companionId);
  if (!_txTimestamps.has(key)) _txTimestamps.set(key, []);
  const stamps = _txTimestamps.get(key);
  _pruneTimestamps(stamps);

  if (stamps.length >= TX_RATE_LIMIT) {
    return { allowed: false, reason: `Rate limited: ${TX_RATE_LIMIT} transactions per minute exceeded for companion ${companionId}` };
  }

  stamps.push(Date.now());
  return { allowed: true };
}

/**
 * Check and record a signature rate limit
 * @param {string|number} companionId
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkSigRateLimit(companionId) {
  const key = String(companionId);
  if (!_sigTimestamps.has(key)) _sigTimestamps.set(key, []);
  const stamps = _sigTimestamps.get(key);
  _pruneTimestamps(stamps);

  if (stamps.length >= SIG_RATE_LIMIT) {
    return { allowed: false, reason: `Rate limited: ${SIG_RATE_LIMIT} signatures per minute exceeded for companion ${companionId}` };
  }

  stamps.push(Date.now());
  return { allowed: true };
}

/**
 * Record a transaction failure and check if we should alert
 * @param {string|number} companionId
 * @returns {boolean} true if alert threshold reached (3+ consecutive failures)
 */
export function recordTxFailure(companionId) {
  const key = String(companionId);
  const count = (_failureCounts.get(key) || 0) + 1;
  _failureCounts.set(key, count);
  if (count >= 3) {
    console.warn(`[AgentWallet] ALERT: ${count} consecutive transaction failures for companion ${companionId}`);
    return true;
  }
  return false;
}

/**
 * Reset failure counter after a successful transaction
 * @param {string|number} companionId
 */
export function resetTxFailures(companionId) {
  _failureCounts.delete(String(companionId));
}

// ═══════════════════════════════════════════════════════════════════════════
// ETH TRANSFERS (Guarded by spending limits + confirmation + rate limiting)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send ETH from agent wallet
 *
 * Enforces per-transaction and daily spending limits before sending.
 * Records the spend after a successful transaction.
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {string} to - Recipient address
 * @param {string} amountEth - Amount in ETH (e.g., "0.01")
 * @param {number} chainId - The chain ID (default: Base 8453)
 * @returns {Promise<Object>} Transaction result
 */
export async function sendEthFromAgentWallet(companionId, to, amountEth, chainId = 8453, options = {}) {
  const { companionName, context } = options;
  const amountWei = ethers.parseEther(amountEth);

  // ── Rate limit check ──────────────────────────────────────────────────
  const rateCheck = checkTxRateLimit(companionId);
  if (!rateCheck.allowed) {
    console.warn(`[AgentWallet] ${rateCheck.reason}`);
    recordTxFailure(companionId);
    return { success: false, error: rateCheck.reason };
  }

  // ── Spending limit check ──────────────────────────────────────────────
  const limitCheck = await checkSpendingLimit(companionId, amountWei);
  if (!limitCheck.allowed) {
    console.warn(`[AgentWallet] Spend rejected for companion ${companionId}: ${limitCheck.reason}`);
    recordTxFailure(companionId);
    return { success: false, error: limitCheck.reason };
  }

  // ── User confirmation (native dialog for amounts > threshold) ─────────
  const chainConfig = SUPPORTED_CHAINS[chainId];
  const approved = await requestTransactionConfirmation({
    companionName: companionName || `Companion #${companionId}`,
    recipientAddress: to,
    amountEth,
    chainName: chainConfig?.name || 'Unknown',
    context: context || 'Agent wallet ETH transfer',
  });
  if (!approved) {
    console.log(`[AgentWallet] Transaction rejected by user for companion ${companionId}`);
    return { success: false, error: 'Transaction rejected by user' };
  }

  // ── Execute transaction ───────────────────────────────────────────────
  try {
    const signer = await getAgentWalletSignerForChain(companionId, chainId);

    const tx = await signer.sendTransaction({
      to,
      value: amountWei,
    });

    const receipt = await tx.wait();

    // ── Record spend after success ──────────────────────────────────────
    await recordSpend(companionId, amountWei);
    resetTxFailures(companionId);

    return {
      success: true,
      txHash: receipt.hash,
      from: signer.address,
      to,
      amount: amountEth,
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    recordTxFailure(companionId);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION UNIVERSAL PROFILE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const COMPANION_UP_PREFIX = 'companion-up-';

/**
 * Store companion UP deployment data
 * @param {string} companionId - The companion's unique identifier
 * @param {Object} data - { upAddress, keyManagerAddress, deployedChains, deploymentCalldata, salt }
 */
export async function storeCompanionUP(companionId, data) {
  await window.electronAPI?.store?.set(`${COMPANION_UP_PREFIX}${companionId}`, data);
  console.log('[AgentWallet] Stored companion UP for', companionId, ':', data.upAddress);
}

/**
 * Get companion UP deployment data
 * @param {string} companionId - The companion's unique identifier
 * @returns {Promise<Object|null>} UP data or null
 */
export async function getCompanionUP(companionId) {
  return await window.electronAPI?.store?.get(`${COMPANION_UP_PREFIX}${companionId}`, null);
}

/**
 * Delete companion UP deployment data
 * @param {string} companionId - The companion's unique identifier
 */
export async function deleteCompanionUP(companionId) {
  await window.electronAPI?.store?.delete(`${COMPANION_UP_PREFIX}${companionId}`);
  console.log('[AgentWallet] Deleted companion UP for', companionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// EIP-712 SIGNATURE FOR WALLET CHANGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign a wallet change authorization for ERC-8004 contract
 *
 * @param {string|number} companionId - The companion's unique identifier
 * @param {string} contractAddress - The ERC-8004 contract address
 * @param {number} chainId - The chain ID
 * @param {number} agentId - The token ID
 * @param {string} newWallet - The new wallet address
 * @param {number} nonce - The current nonce from contract
 * @param {number} [validFor=300] - Validity period in seconds
 * @returns {Promise<Object>} The signed authorization
 */
export async function signWalletChangeAuthorization(
  companionId,
  contractAddress,
  chainId,
  agentId,
  newWallet,
  nonce,
  validFor = 300
) {
  const signer = await getAgentWalletSignerForChain(companionId, chainId);

  const deadline = Math.floor(Date.now() / 1000) + validFor;

  const domain = {
    name: 'BonzaiCompanions',
    version: '1',
    chainId: chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    WalletChange: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newWallet', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    agentId: BigInt(agentId),
    newWallet,
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
  };

  const signature = await signer.signTypedData(domain, types, message);

  return {
    agentId,
    newWallet,
    nonce,
    deadline,
    signature,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const agentWalletService = {
  // Master secret
  getMasterSecret,
  hasMasterSecret,

  // Wallet generation
  generateAgentWallet,
  generateAgentWalletHD,

  // Credential storage
  storeAgentWalletCredentials,
  getAgentWalletCredentials,
  hasAgentWallet,
  deleteAgentWalletCredentials,

  // Signer management
  getAgentWalletSigner,
  getAgentWalletSignerForChain,

  // Chain support
  getChainConfig,
  getSupportedChains,
  isChainSupported,

  // Spending limits
  checkSpendingLimit,
  recordSpend,

  // User confirmation (P0)
  requestTransactionConfirmation,

  // Rate limiting (P2)
  checkTxRateLimit,
  checkSigRateLimit,
  recordTxFailure,
  resetTxFailures,

  // Balance & transfers (ETH only, guarded by spending limits + confirmation + rate limiting)
  getAgentWalletBalance,
  sendEthFromAgentWallet,

  // Companion UP storage
  storeCompanionUP,
  getCompanionUP,
  deleteCompanionUP,

  // EIP-712 signatures
  signWalletChangeAuthorization,

  // Constants
  SUPPORTED_CHAINS,
};

export default agentWalletService;
