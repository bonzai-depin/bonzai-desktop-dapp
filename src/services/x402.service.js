/**
 * x402 Payment Validation Service
 *
 * Implements HTTP 402 Payment Required flow for distributed inference.
 * Uses EIP-712 typed signatures for secure, verifiable payments.
 *
 * Payment Flow:
 * 1. Consumer requests inference from provider
 * 2. Provider returns 402 with payment requirements
 * 3. Consumer signs payment authorization
 * 4. Consumer resubmits request with signed payment
 * 5. Provider validates signature and processes request
 */

import { ethers } from 'ethers';

// EIP-712 Domain for BonzAI x402 payments
const EIP712_DOMAIN = {
  name: 'BonzAI x402',
  version: '1',
  chainId: 42161, // Arbitrum
};

// EIP-712 Types
const PAYMENT_TYPES = {
  Payment: [
    { name: 'providerId', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'pipeline', type: 'string' },
  ],
};

// Used nonces to prevent replay attacks (in-memory, reset on restart)
// In production, this should be persisted or use on-chain nonces
const usedNonces = new Set();

/**
 * Create a payment request (402 response)
 *
 * @param {Object} options Payment options
 * @param {string} options.providerId Provider's wallet address
 * @param {string} options.amount Amount in smallest unit (e.g., USDC with 6 decimals)
 * @param {string} options.pipeline Pipeline being requested
 * @param {number} options.chainId Chain ID (default: 42161 Arbitrum)
 * @returns {Object} Payment request to return in 402 response
 */
export function createPaymentRequest({ providerId, amount, pipeline, chainId = 42161 }) {
  return {
    version: 'x402/1.0',
    providerId,
    amount,
    pipeline,
    chainId,
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId,
    },
    types: PAYMENT_TYPES,
  };
}

/**
 * Create a signed payment (consumer side)
 *
 * @param {ethers.Signer} signer Ethers signer (wallet)
 * @param {Object} paymentRequest Payment request from provider
 * @param {string} paymentRequest.providerId Provider's wallet address
 * @param {string} paymentRequest.amount Amount in smallest unit
 * @param {string} paymentRequest.pipeline Pipeline being requested
 * @returns {Promise<Object>} Signed payment to include in request
 */
export async function signPayment(signer, paymentRequest) {
  const { providerId, amount, pipeline, chainId = 42161 } = paymentRequest;

  // Generate nonce and expiry
  const nonce = Date.now().toString() + Math.random().toString(36).slice(2);
  const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  const domain = {
    name: EIP712_DOMAIN.name,
    version: EIP712_DOMAIN.version,
    chainId,
  };

  const message = {
    providerId,
    amount,
    nonce: BigInt(ethers.keccak256(ethers.toUtf8Bytes(nonce))),
    expiry,
    pipeline,
  };

  // Sign with EIP-712
  const signature = await signer.signTypedData(domain, PAYMENT_TYPES, message);

  return {
    version: 'x402/1.0',
    consumer: await signer.getAddress(),
    providerId,
    amount,
    nonce,
    nonceHash: message.nonce.toString(),
    expiry,
    pipeline,
    chainId,
    signature,
  };
}

/**
 * Validate a signed payment (provider side)
 *
 * @param {Object} payment Signed payment from consumer
 * @param {Object} options Validation options
 * @param {string} options.expectedProviderId Expected provider address
 * @param {string} options.minAmount Minimum required amount
 * @param {string} options.pipeline Expected pipeline
 * @returns {Object} Validation result { valid: boolean, error?: string, consumer?: string }
 */
export function validatePayment(payment, options = {}) {
  const { expectedProviderId, minAmount = '0', pipeline: expectedPipeline } = options;

  try {
    // Check version
    if (payment.version !== 'x402/1.0') {
      return { valid: false, error: 'invalid_version' };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payment.expiry < now) {
      return { valid: false, error: 'payment_expired' };
    }

    // Check expiry isn't too far in the future (max 1 hour)
    if (payment.expiry > now + 3600) {
      return { valid: false, error: 'expiry_too_far' };
    }

    // Check nonce hasn't been used
    const nonceKey = `${payment.consumer}:${payment.nonce}`;
    if (usedNonces.has(nonceKey)) {
      return { valid: false, error: 'nonce_reused' };
    }

    // Check provider ID matches
    if (expectedProviderId && payment.providerId.toLowerCase() !== expectedProviderId.toLowerCase()) {
      return { valid: false, error: 'wrong_provider' };
    }

    // Check amount is sufficient
    if (BigInt(payment.amount) < BigInt(minAmount)) {
      return { valid: false, error: 'insufficient_amount' };
    }

    // Check pipeline matches
    if (expectedPipeline && payment.pipeline !== expectedPipeline) {
      return { valid: false, error: 'wrong_pipeline' };
    }

    // Check chain ID
    if (payment.chainId !== 42161) {
      return { valid: false, error: 'wrong_chain' };
    }

    // Verify EIP-712 signature
    const domain = {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: payment.chainId,
    };

    const message = {
      providerId: payment.providerId,
      amount: payment.amount,
      nonce: BigInt(payment.nonceHash),
      expiry: payment.expiry,
      pipeline: payment.pipeline,
    };

    const recoveredAddress = ethers.verifyTypedData(
      domain,
      PAYMENT_TYPES,
      message,
      payment.signature
    );

    if (recoveredAddress.toLowerCase() !== payment.consumer.toLowerCase()) {
      return { valid: false, error: 'invalid_signature' };
    }

    // Mark nonce as used
    usedNonces.add(nonceKey);

    // Clean up old nonces periodically (keep last 10000)
    if (usedNonces.size > 10000) {
      const entries = Array.from(usedNonces);
      entries.slice(0, 5000).forEach((n) => usedNonces.delete(n));
    }

    return {
      valid: true,
      consumer: recoveredAddress,
      amount: payment.amount,
    };
  } catch (err) {
    console.error('[x402] Validation error:', err.message);
    return { valid: false, error: 'validation_error', detail: err.message };
  }
}

/**
 * Check if a peer is the local node (self-inference)
 *
 * @param {string} remotePeerId Remote peer ID
 * @param {string} localPeerId Local node's peer ID
 * @returns {boolean} True if same peer
 */
export function isSelfInference(remotePeerId, localPeerId) {
  if (!remotePeerId || !localPeerId) return false;
  return remotePeerId === localPeerId;
}

/**
 * Calculate token count for pricing
 * Simple heuristic: ~4 characters per token
 *
 * @param {string} text Input text
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Calculate payment amount for a request
 *
 * @param {Object} request Inference request
 * @param {string} pricePerToken Price per 1000 tokens in USDC (6 decimals)
 * @returns {string} Total amount in smallest unit
 */
export function calculatePaymentAmount(request, pricePerToken = '100000') {
  // Estimate tokens from request
  let tokens = 0;

  if (request.params?.prompt) {
    tokens += estimateTokens(request.params.prompt);
  }
  if (request.params?.messages) {
    for (const msg of request.params.messages) {
      tokens += estimateTokens(msg.content || '');
    }
  }

  // Minimum 100 tokens for any request
  tokens = Math.max(tokens, 100);

  // Add estimated output tokens (assume 2x input for generation)
  const totalTokens = tokens * 3;

  // Calculate amount: (tokens / 1000) * pricePerToken
  const amount = BigInt(Math.ceil(totalTokens / 1000)) * BigInt(pricePerToken);

  return amount.toString();
}

export default {
  createPaymentRequest,
  signPayment,
  validatePayment,
  isSelfInference,
  estimateTokens,
  calculatePaymentAmount,
};
