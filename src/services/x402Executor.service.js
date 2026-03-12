/**
 * x402 Payment Executor Service (ETH-Only)
 *
 * Handles autonomous x402 payments for AI companions using native ETH.
 * No USDC, no ERC-3009 - just simple ETH transfers.
 *
 * Features:
 * - Autonomous ETH payment execution with spending limits
 * - Daily spending tracking and enforcement
 * - Transaction logging and history
 * - Base primary (cheap gas), Arbitrum/Mainnet supported
 */

import { ethers } from 'ethers';
import { walletProviderService } from './walletProvider.service.js';
import { x402Service } from './x402.service.js';

// Storage keys
const TX_HISTORY_PREFIX = 'x402-transactions-';
const DAILY_SPENDING_PREFIX = 'x402-daily-spending-';

// Default limits (in ETH)
const DEFAULT_MAX_TX_AMOUNT = '0.001';    // ~$2 at $2000/ETH
const DEFAULT_DAILY_LIMIT = '0.005';      // ~$10 at $2000/ETH
const DEFAULT_CHAIN_ID = 8453;            // Base

/**
 * Get transaction history for a companion
 * @param {string} companionId - Companion ID
 * @returns {Promise<Array>}
 */
export async function getTransactionHistory(companionId) {
  try {
    const key = `${TX_HISTORY_PREFIX}${companionId}`;
    const stored = await window.electronAPI?.store?.get(key, []);
    return stored || [];
  } catch (e) {
    console.error('[x402Executor] Failed to load history:', e);
    return [];
  }
}

/**
 * Log a transaction
 * @param {string} companionId - Companion ID
 * @param {Object} transaction - Transaction details
 * @returns {Promise<Object>}
 */
export async function logTransaction(companionId, transaction) {
  try {
    const key = `${TX_HISTORY_PREFIX}${companionId}`;
    const history = await getTransactionHistory(companionId);

    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      companionId,
      ...transaction,
    };

    history.unshift(tx);

    // Keep last 100 transactions
    const trimmed = history.slice(0, 100);
    await window.electronAPI?.store?.set(key, trimmed);

    console.log(`[x402Executor] Transaction logged: ${tx.service} - ${tx.amountEth} ETH`);
    return tx;
  } catch (e) {
    console.error('[x402Executor] Failed to log transaction:', e);
  }
}

/**
 * Get daily spending amount for a companion (in ETH)
 * @param {string} companionId - Companion ID
 * @returns {Promise<string>} Daily spending in ETH
 */
export async function getDailySpending(companionId) {
  const today = new Date().toDateString();
  const history = await getTransactionHistory(companionId);

  const dailyWei = history
    .filter(tx => {
      const txDate = new Date(tx.timestamp).toDateString();
      return txDate === today && tx.status === 'success';
    })
    .reduce((sum, tx) => sum + BigInt(tx.amount || '0'), 0n);

  return ethers.formatEther(dailyWei);
}

/**
 * Check if a purchase is allowed based on settings
 * @param {string} companionId - Companion ID
 * @param {string} amountWei - Amount in wei
 * @param {Object} settings - Autonomous mode settings
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canMakePurchase(companionId, amountWei, settings = {}) {
  // Check if purchases are enabled
  if (!settings.enablePurchases) {
    return { allowed: false, reason: 'Autonomous purchases disabled' };
  }

  const amount = BigInt(amountWei);

  // Check max transaction amount
  const maxTx = ethers.parseEther(settings.maxPurchaseAmount || DEFAULT_MAX_TX_AMOUNT);
  if (amount > maxTx) {
    return {
      allowed: false,
      reason: `Exceeds max per transaction (${ethers.formatEther(maxTx)} ETH)`,
    };
  }

  // Check daily limit
  const dailyLimitEth = settings.dailySpendingLimit || DEFAULT_DAILY_LIMIT;
  const dailyLimit = ethers.parseEther(dailyLimitEth);
  const dailySpentEth = await getDailySpending(companionId);
  const dailySpent = ethers.parseEther(dailySpentEth);

  if (dailySpent + amount > dailyLimit) {
    const remaining = dailyLimit - dailySpent;
    return {
      allowed: false,
      reason: `Exceeds daily limit (${dailyLimitEth} ETH). Remaining: ${ethers.formatEther(remaining)} ETH`,
    };
  }

  // Check wallet exists
  const hasWallet = await walletProviderService.hasAgentWallet(companionId);
  if (!hasWallet) {
    return { allowed: false, reason: 'No agent wallet - mint companion to blockchain first' };
  }

  // Check ETH balance
  try {
    const balanceEth = await walletProviderService.getAgentWalletBalance(
      companionId,
      settings.chainId || DEFAULT_CHAIN_ID
    );
    const balance = ethers.parseEther(balanceEth);

    if (balance < amount) {
      return {
        allowed: false,
        reason: `Insufficient balance (${balanceEth} ETH)`,
      };
    }
  } catch (e) {
    return { allowed: false, reason: `Balance check failed: ${e.message}` };
  }

  return { allowed: true };
}

/**
 * Execute an x402 ETH payment
 * @param {string} companionId - Companion ID
 * @param {Object} paymentRequest - Payment request details
 * @param {Object} settings - Autonomous mode settings
 * @returns {Promise<{success: boolean, result?: any, error?: string, transaction?: Object}>}
 */
export async function executePayment(companionId, paymentRequest, settings = {}) {
  const {
    provider,         // Provider wallet address
    service,          // Service name (for logging)
    amount,           // Amount in wei
    endpoint,         // API endpoint
    params,           // Request parameters
    chainId = DEFAULT_CHAIN_ID,
  } = paymentRequest;

  // Validate purchase
  const check = await canMakePurchase(companionId, amount, settings);
  if (!check.allowed) {
    console.warn(`[x402Executor] Payment blocked: ${check.reason}`);
    return { success: false, error: check.reason };
  }

  try {
    console.log(`[x402Executor] Executing payment: ${service} - ${ethers.formatEther(amount)} ETH to ${provider}`);

    // Get agent wallet signer
    const signer = await walletProviderService.getAgentWalletSigner(companionId, chainId);

    // Send ETH directly
    const paymentResult = await x402Service.sendPayment(signer, provider, amount);

    if (!paymentResult.success) {
      throw new Error('Payment failed');
    }

    // Make request with payment proof (if endpoint provided)
    let result = { txHash: paymentResult.txHash };
    let responseOk = true;

    if (endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': JSON.stringify({
            version: 'x402-eth/1.0',
            txHash: paymentResult.txHash,
            from: paymentResult.from,
            to: provider,
            amount,
            amountEth: ethers.formatEther(amount),
            chainId,
          }),
        },
        body: JSON.stringify(params),
      });
      result = await response.json();
      responseOk = response.ok;
    }

    // Log transaction
    const transaction = await logTransaction(companionId, {
      type: 'x402-eth',
      service,
      amount,
      amountEth: ethers.formatEther(amount),
      provider,
      chainId,
      txHash: paymentResult.txHash,
      status: responseOk ? 'success' : 'failed',
      endpoint,
    });

    if (responseOk) {
      console.log(`[x402Executor] Payment successful: ${service}`);
      return { success: true, result, transaction };
    } else {
      const error = result.error || `HTTP ${response.status}`;
      console.error(`[x402Executor] Service request failed: ${error}`);
      return { success: false, error, transaction };
    }
  } catch (e) {
    console.error('[x402Executor] Payment error:', e);

    // Log failed transaction
    const transaction = await logTransaction(companionId, {
      type: 'x402-eth',
      service,
      amount,
      amountEth: ethers.formatEther(amount),
      provider,
      chainId,
      status: 'error',
      error: e.message,
    });

    return { success: false, error: e.message, transaction };
  }
}

/**
 * Handle a 402 Payment Required response
 * Automatically pays and retries the request
 *
 * @param {string} companionId - Companion ID
 * @param {Response} response - Fetch response with 402 status
 * @param {Object} originalRequest - Original request details { url, method, headers, body }
 * @param {Object} settings - Autonomous mode settings
 * @returns {Promise<{success: boolean, response?: Response, error?: string}>}
 */
export async function handlePaymentRequired(companionId, response, originalRequest, settings = {}) {
  if (response.status !== 402) {
    return { success: false, error: 'Not a 402 response' };
  }

  try {
    // Parse payment requirements from header or body
    const paymentHeader = response.headers.get('X-Payment-Required') ||
                          response.headers.get('Payment-Required');
    let paymentRequired;

    if (paymentHeader) {
      paymentRequired = JSON.parse(paymentHeader);
    } else {
      // Try to get from response body
      const body = await response.json();
      paymentRequired = body.paymentRequired || body.payment || body;
    }

    const {
      amount,           // Amount in wei
      amountEth,        // Amount in ETH (alternative)
      provider,         // Recipient address (v2)
      recipient,        // Recipient address (v1)
      chainId = DEFAULT_CHAIN_ID,
      service = 'unknown',
    } = paymentRequired;

    // Convert amountEth to wei if needed
    const amountWei = amount || ethers.parseEther(amountEth || '0').toString();

    // Execute payment and retry request
    const paymentResult = await executePayment(
      companionId,
      {
        provider: provider || recipient,
        service,
        amount: amountWei,
        endpoint: originalRequest.url,
        params: originalRequest.body ? JSON.parse(originalRequest.body) : {},
        chainId,
      },
      settings
    );

    return paymentResult;
  } catch (e) {
    console.error('[x402Executor] Failed to handle 402:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Wrap a fetch request with automatic x402 payment handling
 *
 * @param {string} companionId - Companion ID
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} settings - Autonomous mode settings
 * @returns {Promise<Response>}
 */
export async function fetchWithPayment(companionId, url, options = {}, settings = {}) {
  // Make initial request
  const response = await fetch(url, options);

  // If not 402, return as-is
  if (response.status !== 402) {
    return response;
  }

  // Handle payment required
  const result = await handlePaymentRequired(
    companionId,
    response,
    { url, ...options },
    settings
  );

  if (result.success && result.response) {
    return result.response;
  }

  // Return original 402 response if payment failed
  return response;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const x402ExecutorService = {
  // Transaction history
  getTransactionHistory,
  logTransaction,
  getDailySpending,

  // Payment checks
  canMakePurchase,

  // Payment execution
  executePayment,
  handlePaymentRequired,
  fetchWithPayment,

  // Constants
  DEFAULT_MAX_TX_AMOUNT,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_CHAIN_ID,
};

export default x402ExecutorService;
