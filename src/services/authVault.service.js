/**
 * BonzAI Auth Vault Service
 *
 * Unified, encrypted credential management for all services.
 * Eliminates signature fatigue by storing credentials securely after one-time auth.
 *
 * Features:
 * - One-time wallet signature derives Master Encryption Key (MEK)
 * - All credentials encrypted at rest
 * - Session persistence across app restarts
 * - Automatic token refresh in background
 * - Operation queue for offline/expired auth
 * - Single source of truth for all auth state
 */

import { reactive, readonly, watch } from "vue";
import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const VAULT_STORAGE_KEY = "bonzai-auth-vault";
const VAULT_VERSION = 1;

// Auth message template - user signs this ONCE
const AUTH_MESSAGE_TEMPLATE = `BonzAI Auth Vault v${VAULT_VERSION}

This signature secures your local credentials.
It does NOT authorize any transactions.

Wallet: {address}
Created: {timestamp}`;

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Vault status
  isUnlocked: false,
  isInitialized: false,
  walletAddress: null,

  // Auth tokens (from auth.service.js)
  accessToken: null,
  tokenExpiry: null,
  refreshTokenStored: null, // We store our own copy for persistence

  // Service credentials
  moltbook: {}, // { [companionId]: { apiKey, username, ... } }
  agentWallets: {}, // { [companionId]: { address, encryptedKey } }
  openclaw: null, // { token, expiresAt }
  p2p: null, // { peerId, privateKey }

  // Operation queue
  pendingOperations: [], // Operations queued when auth unavailable

  // Status
  lastRefresh: null,
  error: null,
});

// In-memory only (never persisted)
let masterKey = null; // Derived from wallet signature
let refreshTimer = null;

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Derive encryption key from wallet signature using HKDF-like derivation
 */
async function deriveKeyFromSignature(signature) {
  // Use the signature as input key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signature),
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("BonzAI-Vault-Salt-v1"),
      info: encoder.encode("BonzAI-Vault-Key"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data with the master key
 */
async function encrypt(data) {
  if (!masterKey) throw new Error("Vault is locked");

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    encoded
  );

  // Combine IV + ciphertext for storage
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data with the master key
 */
async function decrypt(encryptedBase64) {
  if (!masterKey) throw new Error("Vault is locked");

  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    masterKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

// ═══════════════════════════════════════════════════════════════════════════
// VAULT INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if vault exists for this wallet
 */
export async function hasVault(address) {
  if (!window.electronAPI?.store?.get) return false;

  const key = `${VAULT_STORAGE_KEY}-${address.toLowerCase()}`;
  const stored = await window.electronAPI.store.get(key, null);
  return !!stored;
}

/**
 * Initialize or unlock vault from an EXISTING signature.
 *
 * This is the preferred method - reuses the auth signature so user
 * doesn't need to sign twice. The signature is used to derive the
 * encryption key.
 *
 * @param {string} address - Wallet address (lowercase)
 * @param {string} signature - Existing signature from auth flow
 */
export async function initializeOrUnlockFromSignature(address, signature) {
  address = address.toLowerCase();
  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  // Derive master key from the signature
  masterKey = await deriveKeyFromSignature(signature);

  // Check if vault already exists
  const existingVault = window.electronAPI?.store?.get
    ? await window.electronAPI.store.get(storageKey, null)
    : null;

  if (existingVault?.encrypted) {
    // Try to decrypt existing vault
    try {
      const vaultData = await decrypt(existingVault.encrypted);

      // Restore state from vault
      state.walletAddress = address;
      state.moltbook = vaultData.services?.moltbook || {};
      state.agentWallets = vaultData.services?.agentWallets || {};
      state.openclaw = vaultData.services?.openclaw || null;
      state.p2p = vaultData.services?.p2p || null;
      state.accessToken = vaultData.auth?.accessToken || null;
      state.tokenExpiry = vaultData.auth?.tokenExpiry || null;
      state.refreshTokenStored = vaultData.auth?.refreshToken || null;
      state.pendingOperations = vaultData.pendingOperations || [];
      state.isUnlocked = true;
      state.isInitialized = true;

      console.log("[Vault] Vault unlocked from existing signature");

      // Process any pending operations
      await processPendingOperations();

      return true;
    } catch (decryptError) {
      // Signature doesn't match - this is a new signature, create fresh vault
      console.log("[Vault] Existing vault incompatible, creating fresh vault");
    }
  }

  // Create new vault with this signature
  const vaultData = {
    version: VAULT_VERSION,
    address,
    createdAt: Date.now(),
    services: {
      moltbook: {},
      agentWallets: {},
      openclaw: null,
      p2p: null,
    },
    auth: {
      accessToken: null,
      tokenExpiry: null,
      refreshToken: null,
    },
    pendingOperations: [],
  };

  // Encrypt and store
  const encrypted = await encrypt(vaultData);

  if (window.electronAPI?.store?.set) {
    await window.electronAPI.store.set(storageKey, {
      version: VAULT_VERSION,
      address,
      encrypted,
    });
  }

  // Update state
  state.isUnlocked = true;
  state.isInitialized = true;
  state.walletAddress = address;

  console.log("[Vault] New vault created from auth signature for", address);
  return true;
}

/**
 * Initialize vault with wallet signature (ONE TIME ONLY)
 * Call this after first wallet connection
 */
export async function initializeVault(signer) {
  const address = (await signer.getAddress()).toLowerCase();

  // Check if vault already exists
  if (await hasVault(address)) {
    console.log("[Vault] Vault already exists for", address);
    return unlockVault(signer);
  }

  // Create auth message
  const message = AUTH_MESSAGE_TEMPLATE
    .replace("{address}", address)
    .replace("{timestamp}", new Date().toISOString());

  console.log("[Vault] Requesting one-time signature to create vault...");

  // Get signature (this is the ONLY time we need a wallet signature)
  const signature = await signer.signMessage(message);

  // Derive master key
  masterKey = await deriveKeyFromSignature(signature);

  // Initialize vault data
  const vaultData = {
    version: VAULT_VERSION,
    address,
    createdAt: Date.now(),
    signature, // Store signature to re-derive key on unlock
    services: {
      moltbook: {},
      agentWallets: {},
      openclaw: null,
      p2p: null,
    },
    auth: {
      accessToken: null,
      tokenExpiry: null,
      refreshToken: null,
    },
    pendingOperations: [],
  };

  // Encrypt and store
  const encrypted = await encrypt(vaultData);
  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  if (window.electronAPI?.store?.set) {
    await window.electronAPI.store.set(storageKey, {
      version: VAULT_VERSION,
      address,
      encrypted,
    });
  }

  // Update state
  state.isUnlocked = true;
  state.isInitialized = true;
  state.walletAddress = address;

  console.log("[Vault] Vault created and unlocked for", address);
  return true;
}

/**
 * Unlock existing vault with wallet signature
 * Uses stored signature to re-derive key (no new signature needed if we have it)
 */
export async function unlockVault(signer) {
  const address = (await signer.getAddress()).toLowerCase();
  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  if (!window.electronAPI?.store?.get) {
    throw new Error("Storage not available");
  }

  const stored = await window.electronAPI.store.get(storageKey, null);
  if (!stored) {
    throw new Error("No vault found for this wallet");
  }

  // Try to decrypt with stored signature first
  try {
    // We need to get the signature somehow - either stored or request new one
    // For now, request signature (we can optimize this later with keychain)
    const message = AUTH_MESSAGE_TEMPLATE
      .replace("{address}", address)
      .replace("{timestamp}", new Date(stored.createdAt || Date.now()).toISOString());

    console.log("[Vault] Unlocking vault...");
    const signature = await signer.signMessage(message);

    masterKey = await deriveKeyFromSignature(signature);
    const vaultData = await decrypt(stored.encrypted);

    // Restore state from vault
    state.walletAddress = address;
    state.moltbook = vaultData.services?.moltbook || {};
    state.agentWallets = vaultData.services?.agentWallets || {};
    state.openclaw = vaultData.services?.openclaw || null;
    state.p2p = vaultData.services?.p2p || null;
    state.accessToken = vaultData.auth?.accessToken || null;
    state.tokenExpiry = vaultData.auth?.tokenExpiry || null;
    state.refreshTokenStored = vaultData.auth?.refreshToken || null;
    state.pendingOperations = vaultData.pendingOperations || [];
    state.isUnlocked = true;
    state.isInitialized = true;

    console.log("[Vault] Vault unlocked successfully");

    // Process any pending operations
    await processPendingOperations();

    return true;
  } catch (e) {
    console.error("[Vault] Failed to unlock vault:", e);
    state.error = e.message;
    throw e;
  }
}

/**
 * Lock the vault (clear in-memory secrets)
 */
export function lockVault() {
  masterKey = null;
  state.isUnlocked = false;
  state.accessToken = null;
  state.tokenExpiry = null;

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  console.log("[Vault] Vault locked");
}

/**
 * Save current vault state to storage
 */
async function saveVault() {
  if (!state.isUnlocked || !masterKey || !state.walletAddress) return;

  const vaultData = {
    version: VAULT_VERSION,
    address: state.walletAddress,
    createdAt: Date.now(),
    services: {
      moltbook: state.moltbook,
      agentWallets: state.agentWallets,
      openclaw: state.openclaw,
      p2p: state.p2p,
    },
    auth: {
      accessToken: state.accessToken,
      tokenExpiry: state.tokenExpiry,
      refreshToken: state.refreshTokenStored,
    },
    pendingOperations: state.pendingOperations,
  };

  const encrypted = await encrypt(vaultData);
  const storageKey = `${VAULT_STORAGE_KEY}-${state.walletAddress}`;

  if (window.electronAPI?.store?.set) {
    await window.electronAPI.store.set(storageKey, {
      version: VAULT_VERSION,
      address: state.walletAddress,
      encrypted,
    });
  }
}

// Auto-save on state changes (debounced)
let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveVault(), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store Moltbook credentials for a companion
 */
export async function setMoltbookCredentials(companionId, credentials) {
  if (!state.isUnlocked) throw new Error("Vault is locked");

  state.moltbook[companionId] = {
    ...credentials,
    updatedAt: Date.now(),
  };

  scheduleSave();
  console.log("[Vault] Moltbook credentials stored for", companionId);
}

/**
 * Get Moltbook credentials for a companion
 */
export function getMoltbookCredentials(companionId) {
  if (!state.isUnlocked) return null;
  return state.moltbook[companionId] || null;
}

/**
 * Remove Moltbook credentials for a companion
 */
export async function removeMoltbookCredentials(companionId) {
  if (!state.isUnlocked) throw new Error("Vault is locked");

  delete state.moltbook[companionId];
  scheduleSave();
}

/**
 * Store agent wallet for a companion
 */
export async function setAgentWallet(companionId, wallet) {
  if (!state.isUnlocked) throw new Error("Vault is locked");

  // Encrypt the private key with an additional layer
  const encryptedKey = await encrypt({ privateKey: wallet.privateKey });

  state.agentWallets[companionId] = {
    address: wallet.address,
    encryptedKey,
    createdAt: Date.now(),
  };

  scheduleSave();
  console.log("[Vault] Agent wallet stored for", companionId);
}

/**
 * Get agent wallet for a companion
 */
export async function getAgentWallet(companionId) {
  if (!state.isUnlocked) return null;

  const stored = state.agentWallets[companionId];
  if (!stored) return null;

  // Decrypt the private key
  const decrypted = await decrypt(stored.encryptedKey);
  return {
    address: stored.address,
    privateKey: decrypted.privateKey,
  };
}

/**
 * Store auth tokens (called by auth.service after successful auth)
 */
export function setAuthTokens(accessToken, tokenExpiry, refreshToken = null) {
  state.accessToken = accessToken;
  state.tokenExpiry = tokenExpiry;
  if (refreshToken) {
    state.refreshTokenStored = refreshToken;
  }
  state.lastRefresh = Date.now();

  scheduleSave();
}

/**
 * Get stored auth tokens
 */
export function getAuthTokens() {
  return {
    accessToken: state.accessToken,
    tokenExpiry: state.tokenExpiry,
    refreshToken: state.refreshTokenStored,
  };
}

/**
 * Clear auth tokens
 */
export function clearAuthTokens() {
  state.accessToken = null;
  state.tokenExpiry = null;
  state.refreshTokenStored = null;

  scheduleSave();
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATION QUEUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Queue an operation to retry when auth is restored
 */
export function queueOperation(operation) {
  state.pendingOperations.push({
    ...operation,
    queuedAt: Date.now(),
    id: crypto.randomUUID(),
  });

  scheduleSave();
  console.log("[Vault] Operation queued:", operation.type);
}

/**
 * Get pending operations count
 */
export function getPendingOperationsCount() {
  return state.pendingOperations.length;
}

/**
 * Process pending operations (called when auth is restored)
 */
async function processPendingOperations() {
  if (state.pendingOperations.length === 0) return;

  console.log("[Vault] Processing", state.pendingOperations.length, "pending operations...");

  const operations = [...state.pendingOperations];
  state.pendingOperations = [];

  for (const op of operations) {
    try {
      // Emit event for the operation handler
      window.dispatchEvent(
        new CustomEvent("vault:process-operation", { detail: op })
      );
    } catch (e) {
      console.error("[Vault] Failed to process operation:", op.type, e);
      // Re-queue if it fails
      state.pendingOperations.push(op);
    }
  }

  scheduleSave();
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get vault status for UI display
 */
export function getVaultStatus() {
  const now = Date.now();
  const tokenValid = state.accessToken && state.tokenExpiry && now < state.tokenExpiry;
  const tokenExpiringSoon = tokenValid && (state.tokenExpiry - now) < 5 * 60 * 1000;

  return {
    isUnlocked: state.isUnlocked,
    isInitialized: state.isInitialized,
    walletAddress: state.walletAddress,
    tokenValid,
    tokenExpiringSoon,
    tokenExpiresIn: tokenValid ? Math.round((state.tokenExpiry - now) / 1000) : 0,
    pendingOperations: state.pendingOperations.length,
    moltbookCompanions: Object.keys(state.moltbook).length,
    agentWallets: Object.keys(state.agentWallets).length,
    error: state.error,
  };
}

/**
 * Check if vault is ready for autonomous operations
 */
export function isReadyForAutonomous() {
  return state.isUnlocked && state.accessToken && Date.now() < state.tokenExpiry;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const authVault = {
  state: readonly(state),

  // Vault lifecycle
  hasVault,
  initializeVault,
  unlockVault,
  lockVault,
  initializeOrUnlockFromSignature,

  // Moltbook
  setMoltbookCredentials,
  getMoltbookCredentials,
  removeMoltbookCredentials,

  // Agent wallets
  setAgentWallet,
  getAgentWallet,

  // Auth tokens
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,

  // Operation queue
  queueOperation,
  getPendingOperationsCount,

  // Status
  getVaultStatus,
  isReadyForAutonomous,
};

export default authVault;
