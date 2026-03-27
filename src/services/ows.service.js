/**
 * Open Wallet Standard (OWS) Service
 *
 * Thin renderer-side IPC wrapper for OWS operations.
 * All calls go through Electron IPC to the main process where
 * the native OWS bindings run via NAPI-RS.
 *
 * OWS provides:
 * - Encrypted vault-based wallet storage (scrypt/AES-256-GCM)
 * - EIP-712 typed data signing
 * - Policy-gated API keys for autonomous agents
 * - Multi-chain support
 */

// ═══════════════════════════════════════════════════════════════════════════
// WALLET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new wallet in the OWS vault.
 *
 * @param {string} name - Wallet name (e.g., "bonzai-companion-aurore-beaumont")
 * @param {string} passphrase - Encryption passphrase
 * @returns {Promise<{address: string, name: string}|{error: string}>}
 */
export async function createWallet(name, passphrase) {
  return window.electronAPI.ows.createWallet({ name, passphrase });
}

/**
 * List all wallets in the vault.
 *
 * @returns {Promise<Array<{name: string, address: string, createdAt: string}>>}
 */
export async function listWallets() {
  return window.electronAPI.ows.listWallets();
}

/**
 * Get a specific wallet by name or ID.
 *
 * @param {string} nameOrId - Wallet name or ID
 * @returns {Promise<{name: string, address: string, createdAt: string}|{error: string}>}
 */
export async function getWallet(nameOrId) {
  return window.electronAPI.ows.getWallet(nameOrId);
}

/**
 * Delete a wallet from the vault.
 *
 * @param {string} nameOrId - Wallet name or ID
 * @returns {Promise<{success: boolean}|{error: string}>}
 */
export async function deleteWallet(nameOrId) {
  return window.electronAPI.ows.deleteWallet(nameOrId);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNING OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign a message with a wallet.
 *
 * @param {string} wallet - Wallet name
 * @param {string} message - Message to sign
 * @param {string} passphrase - Wallet passphrase
 * @returns {Promise<{signature: string}|{error: string}>}
 */
export async function signMessage(wallet, message, passphrase) {
  return window.electronAPI.ows.signMessage({ wallet, message, passphrase });
}

/**
 * Sign EIP-712 typed data.
 *
 * @param {string} wallet - Wallet name
 * @param {string} typedDataJson - JSON string of typed data (full EIP-712 envelope)
 * @param {string} passphrase - Wallet passphrase
 * @returns {Promise<{signature: string}|{error: string}>}
 */
export async function signTypedData(wallet, typedDataJson, passphrase) {
  return window.electronAPI.ows.signTypedData({ wallet, typedDataJson, passphrase });
}

/**
 * Sign a raw transaction.
 *
 * @param {string} wallet - Wallet name
 * @param {string} rawTxHex - Unsigned transaction hex
 * @param {string} passphrase - Wallet passphrase
 * @returns {Promise<{signedTx: string}|{error: string}>}
 */
export async function signTransaction(wallet, rawTxHex, passphrase) {
  return window.electronAPI.ows.signTransaction({ wallet, rawTxHex, passphrase });
}

/**
 * Sign and broadcast a transaction.
 *
 * @param {string} wallet - Wallet name
 * @param {string} rawTxHex - Unsigned transaction hex
 * @param {string} passphrase - Wallet passphrase
 * @param {string} rpcUrl - RPC endpoint to broadcast to
 * @returns {Promise<{txHash: string}|{error: string}>}
 */
export async function signAndSend(wallet, rawTxHex, passphrase, rpcUrl) {
  return window.electronAPI.ows.signAndSend({ wallet, rawTxHex, passphrase, rpcUrl });
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an API key scoped to specific wallets and policies.
 *
 * @param {string} name - API key name
 * @param {string[]} wallets - Wallet names this key can access
 * @param {string[]} policies - Policy IDs to apply
 * @param {string} passphrase - Vault passphrase
 * @param {string} [expiry] - ISO expiry date (e.g., "2027-01-01T00:00:00Z")
 * @returns {Promise<{id: string, token: string}|{error: string}>}
 */
export async function createApiKey(name, wallets, policies, passphrase, expiry) {
  return window.electronAPI.ows.createApiKey({ name, wallets, policies, passphrase, expiry });
}

/**
 * List all API keys.
 *
 * @returns {Promise<Array<{id: string, name: string, wallets: string[], createdAt: string}>>}
 */
export async function listApiKeys() {
  return window.electronAPI.ows.listApiKeys();
}

/**
 * Revoke an API key.
 *
 * @param {string} id - API key ID
 * @returns {Promise<{success: boolean}|{error: string}>}
 */
export async function revokeApiKey(id) {
  return window.electronAPI.ows.revokeApiKey(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a spending/access policy.
 *
 * @param {Object} json - Policy definition (e.g., { allowed_chains, daily_limit_eth, expires_at })
 * @returns {Promise<{id: string}|{error: string}>}
 */
export async function createPolicy(json) {
  return window.electronAPI.ows.createPolicy(json);
}

/**
 * List all policies.
 *
 * @returns {Promise<Array<{id: string, rules: Object}>>}
 */
export async function listPolicies() {
  return window.electronAPI.ows.listPolicies();
}

/**
 * Get a specific policy.
 *
 * @param {string} id - Policy ID
 * @returns {Promise<{id: string, rules: Object}|{error: string}>}
 */
export async function getPolicy(id) {
  return window.electronAPI.ows.getPolicy(id);
}

/**
 * Delete a policy.
 *
 * @param {string} id - Policy ID
 * @returns {Promise<{success: boolean}|{error: string}>}
 */
export async function deletePolicy(id) {
  return window.electronAPI.ows.deletePolicy(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export a wallet (returns mnemonic or private key).
 *
 * @param {string} name - Wallet name
 * @param {string} passphrase - Wallet passphrase
 * @returns {Promise<{privateKey?: string, mnemonic?: string}|{error: string}>}
 */
export async function exportWallet(name, passphrase) {
  return window.electronAPI.ows.exportWallet({ name, passphrase });
}

/**
 * Import a wallet from a private key.
 *
 * @param {string} name - Wallet name to assign
 * @param {string} hexKey - Private key in hex format (0x-prefixed)
 * @param {string} passphrase - Encryption passphrase
 * @returns {Promise<{address: string, name: string}|{error: string}>}
 */
export async function importWalletPrivateKey(name, hexKey, passphrase) {
  return window.electronAPI.ows.importPrivateKey({ name, hexKey, passphrase });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const owsService = {
  // Wallet management
  createWallet,
  listWallets,
  getWallet,
  deleteWallet,

  // Signing
  signMessage,
  signTypedData,
  signTransaction,
  signAndSend,

  // API keys
  createApiKey,
  listApiKeys,
  revokeApiKey,

  // Policies
  createPolicy,
  listPolicies,
  getPolicy,
  deletePolicy,

  // Import/Export
  exportWallet,
  importWalletPrivateKey,
};

export default owsService;
