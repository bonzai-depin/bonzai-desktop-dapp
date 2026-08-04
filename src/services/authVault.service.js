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

// Versioned separately from VAULT_VERSION so a future change to the signed
// message wording doesn't need to bump the outer envelope format.
const DERIVATION_TEMPLATE_VERSION = 1;

// Reason code returned when an envelope's ciphertext cannot be reproduced
// (no derivation metadata to rebuild the signed message, or the metadata/
// signature doesn't match). Callers must go through resetVault() to clear it.
export const LEGACY_VAULT_UNRECOVERABLE = "legacy-vault-unrecoverable";

// Auth message templates - user signs this ONCE per vault. Keyed by
// DERIVATION_TEMPLATE_VERSION so byte-for-byte reconstruction stays possible
// even if the wording changes in a later version.
const AUTH_MESSAGE_TEMPLATES = {
  1: (address, createdAtIso) => `BonzAI Auth Vault v${VAULT_VERSION}

This signature secures your local credentials.
It does NOT authorize any transactions.

Wallet: ${address}
Created: ${createdAtIso}`,
};

function buildAuthMessage(templateVersion, address, createdAtIso) {
  const build = AUTH_MESSAGE_TEMPLATES[templateVersion];
  if (typeof build !== "function") {
    throw new Error(`Unsupported vault message template version: ${templateVersion}`);
  }
  return build(address, createdAtIso);
}

function isValidAddress(address) {
  return typeof address === "string" && /^0x[0-9a-f]{40}$/.test(address);
}

/**
 * Validate persisted derivation metadata against the address it claims to
 * belong to, before it is ever used to request a signature or touch storage.
 */
function isValidDerivationMetadata(derivation, expectedAddress) {
  if (!derivation || typeof derivation !== "object") return false;
  if (derivation.version !== DERIVATION_TEMPLATE_VERSION) return false;
  if (!isValidAddress(derivation.address) || derivation.address !== expectedAddress) return false;
  if (typeof derivation.createdAtIso !== "string" || derivation.createdAtIso === "") return false;
  if (Number.isNaN(Date.parse(derivation.createdAtIso))) return false;
  return true;
}

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
// E6: bumped on every explicit resetVault so an in-flight save started before
// the reset cannot resurrect the deleted vault afterwards.
let resetEpoch = 0;
// F3: addresses whose async reset is currently in flight — saveVault refuses
// to write them so a debounced save cannot resurrect a vault mid-reset.
const resettingAddresses = new Set();
// The derivation metadata backing the CURRENT unlocked session (if the vault
// was created/unlocked via the reproducible message-signing flow). Carried
// forward into every saveVault() write so a later credential save never
// strips the metadata a future unlock depends on. Null when the vault was
// unlocked via a raw externally-supplied signature that never persisted
// message-reconstruction metadata (initializeOrUnlockFromSignature).
let vaultDerivation = null;

/**
 * Clear all in-memory/reactive vault state when a vault switch does not
 * complete (legacy-unrecoverable result, or a decrypt failure). Nulling only
 * masterKey/isUnlocked is not enough: several getters (getMoltbookCredentials,
 * getAgentWallet, etc.) gate on state.isUnlocked, but state.accessToken and
 * getAuthTokens() do not, and the readonly `state` export exposes everything
 * directly regardless of gating. A failed switch must never leave the
 * PREVIOUS wallet's cached credentials or tokens reachable through either
 * path, so every sensitive field is reset here, not just the two flags.
 */
export function clearVaultSwitchFailure() {
  masterKey = null;
  vaultDerivation = null;
  state.isUnlocked = false;
  state.walletAddress = null;
  state.moltbook = {};
  state.agentWallets = {};
  state.openclaw = null;
  state.p2p = null;
  state.accessToken = null;
  state.tokenExpiry = null;
  state.refreshTokenStored = null;
  state.pendingOperations = [];
}

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
 * Attempt to unlock an EXISTING vault using an already-obtained signature
 * (e.g. an auth-challenge signature), without prompting for a new one.
 *
 * This only succeeds if `signature` happens to reproduce the vault's
 * original derivation key, which is NOT guaranteed for a signature over a
 * server-issued challenge - those typically embed a per-login random nonce
 * for replay protection, so they differ on every login. On any decrypt
 * failure this returns a recoverability result (see
 * LEGACY_VAULT_UNRECOVERABLE) rather than throwing or overwriting the
 * vault; callers MUST check `result.ok` - a resolved promise here does not
 * mean the vault is unlocked.
 *
 * This function never creates a new vault: it does not control the signed
 * message, so it has no way to persist derivation metadata that a future
 * login could use to reproduce the same key. Use initializeVault(signer) to
 * create a vault and unlockVault(signer) to unlock one - both sign a
 * message this service controls and persist/reconstruct that exact
 * message, so the derived key is always reproducible.
 *
 * @param {string} address - Wallet address (lowercase)
 * @param {string} signature - Existing signature to try against a stored vault
 */
export async function initializeOrUnlockFromSignature(address, signature) {
  // G2: capture the reset epoch up front — an explicit resetVault that lands
  // while we sign/decrypt must win over this initialization.
  const targetResetEpoch = resetEpoch;
  // Tear down any previously unlocked wallet's cached secrets before doing
  // any lookups for the wallet we're switching to, so an early throw below
  // (invalid address/signature, address mismatch, no vault to recover from)
  // can never leave the previous wallet's secrets reachable. See
  // clearVaultSwitchFailure() and the matching fix in unlockVault().
  clearVaultSwitchFailure();

  address = address.toLowerCase();

  // Validate before touching storage or deriving anything from the signature.
  if (!isValidAddress(address)) {
    throw new Error("Invalid wallet address");
  }
  if (typeof signature !== "string" || signature === "") {
    throw new Error("Invalid signature");
  }

  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  // Check if vault already exists
  const existingVault = window.electronAPI?.store?.get
    ? await window.electronAPI.store.get(storageKey, null)
    : null;

  if (existingVault?.encrypted) {
    // Reject an envelope that claims a different address before deriving or
    // decrypting anything with it.
    if (existingVault.address && existingVault.address !== address) {
      throw new Error("Vault address mismatch");
    }

    // Derive master key from the signature and try to decrypt existing vault
    const candidateKey = await deriveKeyFromSignature(signature);
    // G2: an explicit reset that landed while signing/deriving wins.
    if (resetEpoch !== targetResetEpoch) {
      throw new Error("Vault was reset during recovery");
    }
    try {
      masterKey = candidateKey;
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
      // Carry forward whatever derivation metadata (if any) the envelope
      // already had, so a later saveVault() never drops it.
      vaultDerivation = existingVault.derivation || null;

      console.log("[Vault] Vault unlocked from existing signature");

      // Process any pending operations
      await processPendingOperations();

      return true;
    } catch (decryptError) {
      // The signature doesn't reproduce this vault's key (e.g. the
      // auth-challenge signature rotated since the vault was created, or the
      // ciphertext predates this metadata scheme). We must NOT silently
      // overwrite the existing encrypted record - that would destroy any
      // secrets already stored. Surface a dedicated recoverability result;
      // only an explicitly confirmed resetVault() call may replace it.
      // A previous call may have left the vault unlocked (isUnlocked=true)
      // in this same in-memory session. Without a masterKey nothing can
      // actually be decrypted or persisted, so isUnlocked must reflect that
      // now - otherwise getters keep serving stale cached secrets and
      // setters/saveVault silently no-op instead of failing visibly.
      clearVaultSwitchFailure();
      console.warn("[Vault] Existing vault could not be unlocked with this signature; recovery required");
      return {
        ok: false,
        recoverable: false,
        reason: LEGACY_VAULT_UNRECOVERABLE,
        requiresReset: true,
      };
    }
  }

  // No existing vault. This function cannot create one: it only received an
  // already-computed signature and does not control the message that was
  // signed, so it has no derivation metadata to persist that a future login
  // could use to reproduce this key - a vault created here would decrypt
  // successfully only for the remainder of this in-memory session, then
  // become permanently unrecoverable on the very next unlock attempt.
  // Callers must go through initializeVault(signer), which signs its own
  // deterministic message and persists reproducible derivation metadata.
  throw new Error(
    "No vault exists for this wallet; call initializeVault(signer) to create one with a reproducible key derivation"
  );
}

/**
 * Initialize vault with wallet signature (ONE TIME ONLY)
 * Call this after first wallet connection
 */
export async function initializeVault(signer) {
  // G2: capture the reset epoch up front — an explicit resetVault that lands
  // while we sign must win over this initialization.
  const targetResetEpoch = resetEpoch;
  // Tear down any previously unlocked wallet's cached secrets before doing
  // any lookups for the wallet we're switching to. Without this, creating a
  // brand-new vault for wallet B while wallet A is still unlocked would set
  // state.walletAddress/isUnlocked to B while leaving A's moltbook/
  // agentWallets/openclaw/p2p/auth-token state in place, exposing A's
  // secrets under B's now-"unlocked" session. Mirrors the same-named fix in
  // unlockVault() / initializeOrUnlockFromSignature() - see
  // clearVaultSwitchFailure() above.
  clearVaultSwitchFailure();

  const address = (await signer.getAddress()).toLowerCase();

  if (!isValidAddress(address)) {
    throw new Error("Invalid wallet address");
  }

  // Check if vault already exists
  if (await hasVault(address)) {
    console.log("[Vault] Vault already exists for", address);
    return unlockVault(signer);
  }

  // Build the exact derivation metadata that will be persisted alongside the
  // ciphertext, and validate it BEFORE requesting a signature or writing
  // anything - the timestamp used here is the one substituted into the
  // signed message and must never be recomputed later.
  const derivation = {
    version: DERIVATION_TEMPLATE_VERSION,
    address,
    createdAtIso: new Date().toISOString(),
  };

  if (!isValidDerivationMetadata(derivation, address)) {
    throw new Error("Failed to build valid vault derivation metadata");
  }

  const message = buildAuthMessage(derivation.version, derivation.address, derivation.createdAtIso);

  console.log("[Vault] Requesting one-time signature to create vault...");

  // Get signature (this is the ONLY time we need a wallet signature)
  const signature = await signer.signMessage(message);

  // G2: an explicit reset that landed while the user was signing wins.
  if (resetEpoch !== targetResetEpoch) {
    throw new Error("Vault was reset during initialization");
  }

  // Derive master key
  masterKey = await deriveKeyFromSignature(signature);
  vaultDerivation = derivation;

  // Initialize vault data
  const vaultData = {
    version: VAULT_VERSION,
    address,
    createdAt: derivation.createdAtIso,
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
      derivation,
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
 * Unlock existing vault with wallet signature.
 *
 * Reconstructs the EXACT message signed at creation time from persisted
 * derivation metadata (address, template version, creation timestamp) so the
 * re-signed message - and the key derived from it - are byte-for-byte
 * identical to the original. Never recomputes the timestamp itself.
 */
export async function unlockVault(signer) {
  // G2: capture the reset epoch up front — an explicit resetVault that lands
  // while we sign/decrypt must win over this unlock.
  const targetResetEpoch = resetEpoch;
  // Tear down any previously unlocked wallet's cached secrets BEFORE doing
  // any lookups for the wallet we're switching to. If we waited until a
  // failure branch below to call this, an early throw (invalid address,
  // storage unavailable, no vault found, address mismatch) would skip
  // cleanup entirely and leave the previous wallet fully unlocked.
  clearVaultSwitchFailure();

  const address = (await signer.getAddress()).toLowerCase();
  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  if (!isValidAddress(address)) {
    throw new Error("Invalid wallet address");
  }

  if (!window.electronAPI?.store?.get) {
    throw new Error("Storage not available");
  }

  const stored = await window.electronAPI.store.get(storageKey, null);
  if (!stored) {
    throw new Error("No vault found for this wallet");
  }

  if (stored.address && stored.address !== address) {
    throw new Error("Vault address mismatch");
  }

  if (!stored.derivation) {
    // Legacy ciphertext (or one created via a path that never recorded
    // derivation metadata) - the original signed message cannot be rebuilt,
    // so we refuse to guess at a key rather than risk decrypt failure
    // cascading into a "just recreate it" fallback that clobbers data.
    // Preserve the record verbatim; only an explicitly confirmed
    // resetVault() call may replace it. Cleanup already ran at the top of
    // this function, but is repeated here defensively.
    clearVaultSwitchFailure();
    console.warn("[Vault] Legacy vault has no derivation metadata; recovery required");
    return {
      ok: false,
      recoverable: false,
      reason: LEGACY_VAULT_UNRECOVERABLE,
      requiresReset: true,
    };
  }

  // Validate the persisted metadata BEFORE requesting a signature or
  // touching storage - an altered address/version/timestamp is rejected here.
  if (!isValidDerivationMetadata(stored.derivation, address) || stored.version !== VAULT_VERSION) {
    clearVaultSwitchFailure();
    throw new Error("Vault derivation metadata is invalid or has been altered");
  }

  const message = buildAuthMessage(
    stored.derivation.version,
    stored.derivation.address,
    stored.derivation.createdAtIso,
  );

  try {
    console.log("[Vault] Unlocking vault...");
    const signature = await signer.signMessage(message);

    masterKey = await deriveKeyFromSignature(signature);
    const vaultData = await decrypt(stored.encrypted);

    // G2: if the vault was explicitly reset while we were signing/decrypting,
    // refuse to restore state or write anything — the reset wins.
    if (resetEpoch !== targetResetEpoch) {
      throw new Error("Vault was reset during unlock");
    }

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
    vaultDerivation = stored.derivation;

    console.log("[Vault] Vault unlocked successfully");

    // Process any pending operations
    await processPendingOperations();

    return true;
  } catch (e) {
    // Mirror the same-named fix in initializeOrUnlockFromSignature: without
    // a masterKey nothing can actually be decrypted or persisted, so a
    // stale isUnlocked=true from an earlier session must not survive a
    // failed re-unlock attempt.
    clearVaultSwitchFailure();
    console.error("[Vault] Failed to unlock vault:", e);
    state.error = e.message;
    throw e;
  }
}

/**
 * Explicit, caller-confirmed reset of a vault that could not be recovered
 * (see LEGACY_VAULT_UNRECOVERABLE results above). Never invoked automatically
 * - decrypt/unlock failures must never silently trigger this themselves.
 *
 * @param {string} address - Wallet address
 * @param {{confirm: boolean}} options - Must pass confirm: true explicitly
 */
export async function resetVault(address, { confirm = false } = {}) {
  address = (address || "").toLowerCase();

  if (!isValidAddress(address)) {
    throw new Error("Invalid wallet address");
  }
  if (confirm !== true) {
    throw new Error("resetVault requires explicit confirmation ({ confirm: true })");
  }
  if (!window.electronAPI?.store?.delete) {
    throw new Error("Storage not available");
  }

  const storageKey = `${VAULT_STORAGE_KEY}-${address}`;

  // E6 + F3: mark the wallet as resetting and invalidate any in-flight save
  // BEFORE the async delete, and refuse new saves while the reset is in
  // flight, so a debounced save firing during the delete cannot resurrect
  // the vault afterwards.
  resetEpoch += 1;
  resettingAddresses.add(address);
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

  // If this throws (e.g. the write fails), the old record is left untouched
  // below - we only clear in-memory state after the storage delete succeeds.
  try {
    await window.electronAPI.store.delete(storageKey);
  } finally {
    resettingAddresses.delete(address);
  }

  if (state.walletAddress === address) {
    masterKey = null;
    vaultDerivation = null;
    state.isUnlocked = false;
    state.isInitialized = false;
    state.walletAddress = null;
    state.moltbook = {};
    state.agentWallets = {};
    state.openclaw = null;
    state.p2p = null;
    state.accessToken = null;
    state.tokenExpiry = null;
    state.refreshTokenStored = null;
    state.pendingOperations = [];
  }

  console.log("[Vault] Vault reset for", address, "(explicit caller confirmation)");
  return true;
}

/**
 * Lock the vault (clear in-memory secrets)
 */
export function lockVault() {
  masterKey = null;
  vaultDerivation = null;
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

  // D3: capture the target wallet at call time — a save kicked off for the
  // previous wallet must never land in the newly selected wallet's vault if
  // the switch happens while this async write is in flight. E5: capture the
  // derivation metadata at the SAME instant — a switch mid-write must not
  // attach the new wallet's derivation to the old wallet's ciphertext.
  const targetAddress = state.walletAddress;
  // F3: never write a vault whose reset is in flight.
  if (resettingAddresses.has(targetAddress)) return;
  const targetDerivation = vaultDerivation;
  // E6: an in-flight save must not resurrect a vault the user explicitly
  // reset while the write was pending.
  const targetResetEpoch = resetEpoch;
  const encrypted = await encrypt(vaultData);
  if (resetEpoch !== targetResetEpoch) return; // vault was reset mid-save
  const storageKey = `${VAULT_STORAGE_KEY}-${targetAddress}`;

  if (window.electronAPI?.store?.set) {
    const envelope = {
      version: VAULT_VERSION,
      address: targetAddress,
      encrypted,
    };
    // Carry forward the current session's derivation metadata so a
    // credential save never strips what a future unlock depends on.
    if (targetDerivation) envelope.derivation = targetDerivation;
    await window.electronAPI.store.set(storageKey, envelope);
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
  if (!state.isUnlocked) {
    return { accessToken: null, tokenExpiry: null, refreshToken: null };
  }
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
  resetVault,
  clearVaultSwitchFailure,

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
