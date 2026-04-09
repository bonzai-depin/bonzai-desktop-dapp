/**
 * x402 Payment Service (ETH-Only)
 *
 * Simplified HTTP 402 Payment Required flow using native ETH.
 * No USDC, no ERC-3009, no complexity - just ETH transfers.
 *
 * Payment Flow:
 * 1. Consumer requests service from provider
 * 2. Provider returns 402 with payment requirements (ETH amount + address)
 * 3. Consumer sends ETH payment
 * 4. Consumer resubmits request with tx hash
 * 5. Provider validates tx and processes request
 *
 * Supported Chain: Base (8453) - cheap gas, fast finality
 */

import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Base is the primary chain - cheap gas (~$0.001)
const BASE_CONFIG = {
  chainId: 8453,
  name: 'Base',
  rpc: 'https://base.llamarpc.com',
  explorer: 'https://basescan.org',
};

// EIP-712 domain for signed payment authorizations
const EIP712_DOMAIN = {
  name: 'BonzAI x402',
  version: '2',
  chainId: BASE_CONFIG.chainId,
};

// Payment authorization types (must match BonzaiPayment.sol PAYMENT_TYPEHASH)
const PAYMENT_TYPES = {
  Payment: [
    { name: 'provider', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'service', type: 'string' },
    { name: 'paymentToken', type: 'uint8' },
  ],
};

// Payment token enum (matches BonzaiPayment.sol)
const PaymentToken = { ETH: 0, USDC: 1 };

// ── Persistent nonce store (replay-attack prevention) ────────────────────
// Nonces are stored as {key, ts} objects in Electron Store under 'x402-used-nonces'.
// On load, entries older than 24 hours are discarded. Capped at 10,000 entries.
//
// Works in both Electron contexts:
//   Renderer process  → window.electronAPI.store.get / .set  (async IPC)
//   Main process      → electron-store instance               (sync)
const NONCE_STORE_KEY = 'x402-used-nonces';
const NONCE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NONCE_MAX_ENTRIES = 10_000;

// In-memory mirror; lazily hydrated from Electron Store on first access.
let _nonceEntries = null; // Array<{key: string, ts: number}> | null
let _nonceSet = null;     // Set<string> | null  (fast lookup mirror)
let _loadPromise = null;  // deduplicates concurrent init calls
let _mainProcessStore = null; // electron-store instance (main process only)

/**
 * Resolve a reference to the Electron Store, regardless of process context.
 * - In the main process: dynamically imports electron-store.
 * - In the renderer: uses window.electronAPI.store (IPC bridge).
 * Returns { get, set } with async-compatible methods, or null if unavailable.
 */
async function _getStoreBackend() {
  // Renderer process
  if (typeof window !== 'undefined' && window.electronAPI?.store) {
    return {
      get: (key, def) => window.electronAPI.store.get(key, def),
      set: (key, val) => window.electronAPI.store.set(key, val),
    };
  }

  // Main process — import electron-store (singleton)
  if (_mainProcessStore) {
    return {
      get: (key, def) => Promise.resolve(_mainProcessStore.get(key, def)),
      set: (key, val) => Promise.resolve(_mainProcessStore.set(key, val)),
    };
  }

  try {
    const StoreModule = await import('electron-store');
    const Store = StoreModule.default || StoreModule;
    _mainProcessStore = new Store();
    return {
      get: (key, def) => Promise.resolve(_mainProcessStore.get(key, def)),
      set: (key, val) => Promise.resolve(_mainProcessStore.set(key, val)),
    };
  } catch {
    // Not in Electron at all (e.g. tests) — no persistence
    return null;
  }
}

/**
 * Hydrate the in-memory nonce cache from Electron Store.
 * Filters out entries older than 24 hours on load.
 * Safe to call repeatedly — only the first call does real work.
 */
async function _loadNonces() {
  if (_nonceEntries !== null) return; // already loaded

  if (_loadPromise) {
    await _loadPromise;
    return;
  }

  _loadPromise = (async () => {
    let raw = null;
    try {
      const backend = await _getStoreBackend();
      if (backend) {
        raw = await backend.get(NONCE_STORE_KEY, null);
      }
    } catch (err) {
      console.warn('[x402] Failed to load persisted nonces:', err.message);
    }

    const now = Date.now();
    const entries = Array.isArray(raw)
      ? raw.filter((e) => e && typeof e.key === 'string' && typeof e.ts === 'number' && now - e.ts < NONCE_TTL_MS)
      : [];

    _nonceEntries = entries;
    _nonceSet = new Set(entries.map((e) => e.key));
  })();

  await _loadPromise;
}

/**
 * Persist the current nonce list to Electron Store.
 * Fire-and-forget; errors are logged but do not propagate.
 */
async function _persistNonces() {
  try {
    const backend = await _getStoreBackend();
    if (backend) {
      await backend.set(NONCE_STORE_KEY, _nonceEntries);
    }
  } catch (err) {
    console.warn('[x402] Failed to persist nonces:', err.message);
  }
}

/**
 * Prune expired nonces (older than 24 h) and enforce the 10,000-entry cap
 * by evicting the oldest entries first.
 */
function _pruneNonces() {
  const now = Date.now();

  // Remove expired
  _nonceEntries = _nonceEntries.filter((e) => now - e.ts < NONCE_TTL_MS);

  // Enforce cap — keep the newest entries
  if (_nonceEntries.length > NONCE_MAX_ENTRIES) {
    // Entries are appended chronologically, so oldest are at the front
    _nonceEntries = _nonceEntries.slice(_nonceEntries.length - NONCE_MAX_ENTRIES);
  }

  // Rebuild the lookup set
  _nonceSet = new Set(_nonceEntries.map((e) => e.key));
}

/**
 * Check whether a nonce key has already been used.
 * Must call `await _loadNonces()` before using this.
 */
function _hasNonce(key) {
  return _nonceSet !== null && _nonceSet.has(key);
}

/**
 * Record a nonce as used, prune stale entries, and persist.
 * Must call `await _loadNonces()` before using this.
 */
function _addNonce(key) {
  const entry = { key, ts: Date.now() };
  _nonceEntries.push(entry);
  _nonceSet.add(key);

  _pruneNonces();
  _persistNonces();
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT REQUEST (Provider Side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a payment request for 402 response
 *
 * @param {Object} options
 * @param {string} options.provider - Provider's ETH address
 * @param {string} options.amount - Amount in wei (use ethers.parseEther)
 * @param {string} options.service - Service/endpoint being requested
 * @param {number} options.paymentToken - 0=ETH, 1=USDC (default: ETH)
 * @returns {Object} Payment request to include in 402 response
 */
export function createPaymentRequest({ provider, amount, service, paymentToken = PaymentToken.ETH }) {
  return {
    version: 'x402-eth/1.0',
    provider,
    amount,
    amountEth: ethers.formatEther(amount),
    service,
    paymentToken,
    chainId: BASE_CONFIG.chainId,
    chainName: BASE_CONFIG.name,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT SIGNING (Consumer Side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign a payment authorization
 * This creates a signed message that authorizes payment, but doesn't send ETH yet.
 *
 * @param {ethers.Wallet} signer - Wallet to sign with
 * @param {Object} paymentRequest - Payment request from provider
 * @returns {Promise<Object>} Signed payment authorization
 */
export async function signPayment(signer, paymentRequest) {
  const { provider, amount, service, paymentToken = PaymentToken.ETH } = paymentRequest;

  const nonce = Date.now();
  const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  const message = {
    provider,
    amount: BigInt(amount),
    nonce: BigInt(nonce),
    expiry: BigInt(expiry),
    service,
    paymentToken,
  };

  const signature = await signer.signTypedData(EIP712_DOMAIN, PAYMENT_TYPES, message);

  return {
    version: 'x402-eth/1.0',
    consumer: await signer.getAddress(),
    provider,
    amount,
    amountEth: ethers.formatEther(amount),
    nonce,
    expiry,
    service,
    paymentToken,
    chainId: BASE_CONFIG.chainId,
    signature,
  };
}

/**
 * Send ETH payment directly
 * Simpler alternative to signed authorization - just send the ETH.
 *
 * @param {ethers.Wallet} signer - Wallet to send from (must be connected to provider)
 * @param {string} to - Recipient address
 * @param {string} amount - Amount in wei
 * @returns {Promise<Object>} Transaction result
 */
export async function sendPayment(signer, to, amount) {
  const tx = await signer.sendTransaction({
    to,
    value: BigInt(amount),
  });

  const receipt = await tx.wait();

  return {
    success: true,
    txHash: receipt.hash,
    from: await signer.getAddress(),
    to,
    amount,
    amountEth: ethers.formatEther(amount),
    blockNumber: receipt.blockNumber,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT VALIDATION (Provider Side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a signed payment authorization
 *
 * @param {Object} payment - Signed payment from consumer
 * @param {Object} options - Validation options
 * @param {string} options.expectedProvider - Expected provider address
 * @param {string} options.minAmount - Minimum required amount in wei
 * @returns {Promise<Object>} Validation result
 */
export async function validateSignedPayment(payment, options = {}) {
  const { expectedProvider, minAmount = '0' } = options;

  try {
    // Ensure persistent nonce store is loaded
    await _loadNonces();

    // Check version
    if (payment.version !== 'x402-eth/1.0') {
      return { valid: false, error: 'invalid_version' };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payment.expiry < now) {
      return { valid: false, error: 'payment_expired' };
    }

    // Check nonce hasn't been used
    const nonceKey = `${payment.consumer}:${payment.nonce}`;
    if (_hasNonce(nonceKey)) {
      return { valid: false, error: 'nonce_reused' };
    }

    // Check provider matches
    if (expectedProvider && payment.provider.toLowerCase() !== expectedProvider.toLowerCase()) {
      return { valid: false, error: 'wrong_provider' };
    }

    // Check amount is sufficient
    if (BigInt(payment.amount) < BigInt(minAmount)) {
      return { valid: false, error: 'insufficient_amount' };
    }

    // Verify EIP-712 signature
    const message = {
      provider: payment.provider,
      amount: BigInt(payment.amount),
      nonce: BigInt(payment.nonce),
      expiry: BigInt(payment.expiry),
      service: payment.service,
      paymentToken: payment.paymentToken ?? PaymentToken.ETH,
    };

    const recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      PAYMENT_TYPES,
      message,
      payment.signature
    );

    if (recoveredAddress.toLowerCase() !== payment.consumer.toLowerCase()) {
      return { valid: false, error: 'invalid_signature' };
    }

    // Mark nonce as used (persists to Electron Store + prunes stale/overflow)
    _addNonce(nonceKey);

    return {
      valid: true,
      consumer: recoveredAddress,
      amount: payment.amount,
      amountEth: ethers.formatEther(payment.amount),
    };
  } catch (err) {
    console.error('[x402] Validation error:', err.message);
    return { valid: false, error: 'validation_error', detail: err.message };
  }
}

/**
 * Verify an ETH transaction was received
 *
 * @param {string} txHash - Transaction hash to verify
 * @param {Object} options - Verification options
 * @param {string} options.expectedTo - Expected recipient
 * @param {string} options.minAmount - Minimum amount in wei
 * @param {ethers.Provider} options.provider - Ethers provider (optional)
 * @returns {Promise<Object>} Verification result
 */
export async function verifyTransaction(txHash, options = {}) {
  const { expectedTo, minAmount = '0', provider } = options;

  try {
    const rpcProvider = provider || new ethers.JsonRpcProvider(BASE_CONFIG.rpc);
    const receipt = await rpcProvider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { valid: false, error: 'tx_not_found' };
    }

    if (receipt.status !== 1) {
      return { valid: false, error: 'tx_failed' };
    }

    const tx = await rpcProvider.getTransaction(txHash);

    if (expectedTo && tx.to?.toLowerCase() !== expectedTo.toLowerCase()) {
      return { valid: false, error: 'wrong_recipient' };
    }

    if (BigInt(tx.value) < BigInt(minAmount)) {
      return { valid: false, error: 'insufficient_amount' };
    }

    return {
      valid: true,
      from: tx.from,
      to: tx.to,
      amount: tx.value.toString(),
      amountEth: ethers.formatEther(tx.value),
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    console.error('[x402] TX verification error:', err.message);
    return { valid: false, error: 'verification_error', detail: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate tokens for pricing (simple heuristic)
 * @param {string} text - Input text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Calculate ETH amount for a request
 *
 * @param {Object} request - Inference request
 * @param {string} pricePerToken - Price per 1000 tokens in wei
 * @returns {string} Total amount in wei
 */
export function calculateAmount(request, pricePerToken = '1000000000000') {
  // Default: 0.000001 ETH per 1000 tokens (~$0.002 at $2000/ETH)

  let tokens = 0;

  if (request.params?.prompt) {
    tokens += estimateTokens(request.params.prompt);
  }
  if (request.params?.messages) {
    for (const msg of request.params.messages) {
      tokens += estimateTokens(msg.content || '');
    }
  }

  // Minimum 100 tokens
  tokens = Math.max(tokens, 100);

  // Estimate output tokens (2x input)
  const totalTokens = tokens * 3;

  // Calculate: (tokens / 1000) * pricePerToken
  const amount = BigInt(Math.ceil(totalTokens / 1000)) * BigInt(pricePerToken);

  return amount.toString();
}

/**
 * Format wei to ETH string
 * @param {string|bigint} wei - Amount in wei
 * @returns {string} Formatted ETH amount
 */
export function formatEth(wei) {
  return ethers.formatEther(wei);
}

/**
 * Parse ETH string to wei
 * @param {string} eth - Amount in ETH
 * @returns {string} Amount in wei
 */
export function parseEth(eth) {
  return ethers.parseEther(eth).toString();
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P NETWORK HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if this is self-inference (consumer === provider)
 * Self-inference is FREE - no payment required
 *
 * @param {string} remotePeer - Remote peer ID
 * @param {string} localPeerId - Local peer ID
 * @returns {boolean} True if self-inference
 */
export function isSelfInference(remotePeer, localPeerId) {
  return remotePeer === localPeerId;
}

/**
 * Validate a payment for P2P inference
 * Wrapper for validateSignedPayment with P2P-specific parameter names
 *
 * @param {Object} payment - Payment object from request
 * @param {Object} options - Validation options
 * @param {string} options.expectedProviderId - Expected provider address
 * @param {string} options.minAmount - Minimum required amount in wei
 * @param {string} options.pipeline - Pipeline being requested
 * @returns {Object} Validation result
 */
export async function validatePayment(payment, options = {}) {
  const { expectedProviderId, minAmount, pipeline } = options;

  // Map P2P options to validateSignedPayment options
  return validateSignedPayment(payment, {
    expectedProvider: expectedProviderId,
    minAmount,
  });
}

/**
 * Calculate payment amount for a P2P inference request
 * Alias for calculateAmount with P2P-specific naming
 *
 * @param {Object} request - Inference request
 * @param {string} pricePerToken - Price per 1000 tokens in wei
 * @returns {string} Total amount in wei
 */
export function calculatePaymentAmount(request, pricePerToken) {
  return calculateAmount(request, pricePerToken);
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE PAYMENT (Multi-Payee x402)
// ═══════════════════════════════════════════════════════════════════════════

// EIP-712 types for multi-payee pipeline payments (must match BonzaiPipelinePayment.sol)
const PIPELINE_PAYMENT_TYPES = {
  PipelinePayment: [
    { name: 'providers', type: 'address[]' },
    { name: 'amounts', type: 'uint256[]' },
    { name: 'totalAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'service', type: 'string' },
    { name: 'sessionId', type: 'bytes32' },
  ],
};

/**
 * Sign a multi-payee pipeline payment authorization.
 * Consumer signs ONE message covering all pipeline peers.
 *
 * @param {ethers.Wallet} signer - Wallet to sign with
 * @param {Object} params
 * @param {string[]} params.providers - Array of provider wallet addresses
 * @param {string[]} params.amounts - Array of per-provider amounts in wei
 * @param {string} params.service - Service identifier (e.g., "pipeline/llm/llama-3.1-8b")
 * @param {string} params.sessionId - Pipeline session ID (bytes32 hex string)
 * @returns {Promise<Object>} Signed pipeline payment authorization
 */
export async function signPipelinePayment(signer, { providers, amounts, service, sessionId }) {
  if (providers.length !== amounts.length) throw new Error('providers and amounts must have equal length');
  if (providers.length === 0) throw new Error('At least one provider required');

  const totalAmount = amounts.reduce((sum, a) => sum + BigInt(a), 0n);
  const nonce = Date.now();
  const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  // Ensure sessionId is a valid bytes32
  const sessionIdBytes32 = sessionId.startsWith('0x')
    ? sessionId.padEnd(66, '0')
    : ('0x' + sessionId).padEnd(66, '0');

  const message = {
    providers,
    amounts: amounts.map((a) => BigInt(a)),
    totalAmount,
    nonce: BigInt(nonce),
    expiry: BigInt(expiry),
    service,
    sessionId: sessionIdBytes32,
  };

  const signature = await signer.signTypedData(EIP712_DOMAIN, PIPELINE_PAYMENT_TYPES, message);

  return {
    version: 'x402-pipeline/1.0',
    consumer: await signer.getAddress(),
    providers,
    amounts: amounts.map(String),
    totalAmount: totalAmount.toString(),
    totalAmountEth: ethers.formatEther(totalAmount),
    nonce,
    expiry,
    service,
    sessionId: sessionIdBytes32,
    chainId: BASE_CONFIG.chainId,
    signature,
  };
}

/**
 * Validate a signed pipeline payment authorization.
 *
 * @param {Object} payment - Signed pipeline payment
 * @param {Object} options
 * @param {string[]} [options.expectedProviders] - Expected provider addresses
 * @param {string} [options.minTotalAmount] - Minimum total amount in wei
 * @returns {Promise<Object>} Validation result { valid, consumer, totalAmount }
 */
export async function validatePipelinePayment(payment, options = {}) {
  const { expectedProviders, minTotalAmount = '0' } = options;

  try {
    await _loadNonces();

    if (payment.version !== 'x402-pipeline/1.0') {
      return { valid: false, error: 'invalid_version' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payment.expiry < now) {
      return { valid: false, error: 'payment_expired' };
    }

    const nonceKey = `${payment.consumer}:pipeline:${payment.nonce}`;
    if (_hasNonce(nonceKey)) {
      return { valid: false, error: 'nonce_reused' };
    }

    if (payment.providers.length !== payment.amounts.length) {
      return { valid: false, error: 'array_length_mismatch' };
    }

    // Verify amounts sum to totalAmount
    const computedTotal = payment.amounts.reduce((sum, a) => sum + BigInt(a), 0n);
    if (computedTotal !== BigInt(payment.totalAmount)) {
      return { valid: false, error: 'amount_sum_mismatch' };
    }

    if (BigInt(payment.totalAmount) < BigInt(minTotalAmount)) {
      return { valid: false, error: 'insufficient_amount' };
    }

    // Verify expected providers if specified
    if (expectedProviders) {
      const paymentProviders = payment.providers.map((p) => p.toLowerCase()).sort();
      const expected = expectedProviders.map((p) => p.toLowerCase()).sort();
      if (JSON.stringify(paymentProviders) !== JSON.stringify(expected)) {
        return { valid: false, error: 'provider_mismatch' };
      }
    }

    // Verify EIP-712 signature
    const message = {
      providers: payment.providers,
      amounts: payment.amounts.map((a) => BigInt(a)),
      totalAmount: BigInt(payment.totalAmount),
      nonce: BigInt(payment.nonce),
      expiry: BigInt(payment.expiry),
      service: payment.service,
      sessionId: payment.sessionId,
    };

    const recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      PIPELINE_PAYMENT_TYPES,
      message,
      payment.signature,
    );

    if (recoveredAddress.toLowerCase() !== payment.consumer.toLowerCase()) {
      return { valid: false, error: 'invalid_signature' };
    }

    _addNonce(nonceKey);

    return {
      valid: true,
      consumer: recoveredAddress,
      totalAmount: payment.totalAmount,
      totalAmountEth: ethers.formatEther(payment.totalAmount),
      providers: payment.providers,
      amounts: payment.amounts,
    };
  } catch (err) {
    console.error('[x402] Pipeline payment validation error:', err.message);
    return { valid: false, error: 'validation_error', detail: err.message };
  }
}

/**
 * Calculate pipeline payment amounts per provider.
 * Splits total cost proportionally by layer count per shard.
 *
 * @param {number} totalCostWei - Total cost in wei
 * @param {Object[]} shards - Array of { peerId, wallet, layerCount }
 * @returns {{ providers: string[], amounts: string[], totalAmount: string }}
 */
export function calculatePipelinePaymentSplit(totalCostWei, shards) {
  const totalLayers = shards.reduce((sum, s) => sum + s.layerCount, 0);
  const total = BigInt(totalCostWei);

  const providers = [];
  const amounts = [];
  let distributed = 0n;

  for (let i = 0; i < shards.length; i++) {
    const share = (total * BigInt(shards[i].layerCount)) / BigInt(totalLayers);
    providers.push(shards[i].wallet);
    amounts.push(share.toString());
    distributed += share;
  }

  // Give rounding dust to the last provider
  if (distributed < total && amounts.length > 0) {
    const last = BigInt(amounts[amounts.length - 1]);
    amounts[amounts.length - 1] = (last + (total - distributed)).toString();
  }

  return { providers, amounts, totalAmount: total.toString() };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const x402Service = {
  // Config
  BASE_CONFIG,
  EIP712_DOMAIN,
  PaymentToken,

  // Payment flow
  createPaymentRequest,
  signPayment,
  sendPayment,
  validateSignedPayment,
  verifyTransaction,

  // Utilities
  estimateTokens,
  calculateAmount,
  formatEth,
  parseEth,

  // P2P helpers
  isSelfInference,
  validatePayment,
  calculatePaymentAmount,

  // Pipeline multi-payee
  PIPELINE_PAYMENT_TYPES,
  signPipelinePayment,
  validatePipelinePayment,
  calculatePipelinePaymentSplit,
};

export default x402Service;
