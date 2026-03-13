/**
 * BonzAI P2P Contract Service
 *
 * Interacts with the on-chain provider registry and payment contracts
 * for the distributed inference network.
 *
 * Uses BonzaiPayment.sol (ETH + USDC dual-token support) and
 * BonzaiProviderRegistry.sol on Base (chainId 8453).
 */

import { ethers } from "ethers";
import { CONFIG } from "../config/web3.config.js";
import { web3Service } from "./web3.service.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ABIs (minimal interfaces matching BonzaiPayment.sol)
// ═══════════════════════════════════════════════════════════════════════════

const PROVIDER_REGISTRY_ABI = [
  // Registration
  "function register(string peerId, string[] multiaddrs, uint8[] pipelines, uint256 pricePerToken, bool isRelay) payable",
  "function activate()",
  "function deactivate()",
  "function heartbeat()",

  // Views
  "function getProvider(address wallet) view returns (tuple(address wallet, string peerId, string[] multiaddrs, uint8[] pipelines, uint256 pricePerToken, uint256 stakedAmount, uint256 totalEarnings, uint256 completedJobs, uint256 registeredAt, uint256 lastSeenAt, bool isActive, bool isRelay))",
  "function getProviderByPeerId(string peerId) view returns (tuple(address wallet, string peerId, string[] multiaddrs, uint8[] pipelines, uint256 pricePerToken, uint256 stakedAmount, uint256 totalEarnings, uint256 completedJobs, uint256 registeredAt, uint256 lastSeenAt, bool isActive, bool isRelay))",
  "function getProvidersForPipeline(uint8 pipeline) view returns (tuple(address wallet, string peerId, string[] multiaddrs, uint8[] pipelines, uint256 pricePerToken, uint256 stakedAmount, uint256 totalEarnings, uint256 completedJobs, uint256 registeredAt, uint256 lastSeenAt, bool isActive, bool isRelay)[])",
  "function getRelayNodes() view returns (tuple(address wallet, string peerId, string[] multiaddrs, uint8[] pipelines, uint256 pricePerToken, uint256 stakedAmount, uint256 totalEarnings, uint256 completedJobs, uint256 registeredAt, uint256 lastSeenAt, bool isActive, bool isRelay)[])",
  "function getProviderCount() view returns (uint256)",
  "function getActiveProviderCount() view returns (uint256)",
  "function platformFeeBps() view returns (uint256)",
  "function minStakeAmount() view returns (uint256)",

  // Events
  "event ProviderRegistered(address indexed wallet, string peerId, uint8[] pipelines, uint256 pricePerToken)",
  "event ProviderUpdated(address indexed wallet, string peerId, uint8[] pipelines, uint256 pricePerToken)",
  "event ProviderDeactivated(address indexed wallet)",
  "event ProviderActivated(address indexed wallet)",
];

// BonzaiPayment ABI — supports both ETH and USDC
const PAYMENT_CONTRACT_ABI = [
  // ETH Deposits & Withdrawals
  "function depositETH() payable",
  "function withdrawETH(uint256 amount)",
  "function withdrawETHEarnings()",

  // USDC Deposits & Withdrawals
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function withdrawEarnings()",

  // Payments
  "function processPayment(address consumer, address provider, uint256 amount, uint256 nonce, uint256 expiry, string service, uint8 paymentToken, bytes signature)",
  "function payDirect(address provider, uint256 amount, string pipeline)",
  "function payDirectETH(address provider, string pipeline) payable",
  "function payFromBalance(address provider, uint256 amount, string pipeline)",
  "function payFromETHBalance(address provider, uint256 amount, string pipeline)",

  // Views
  "function getBalance(address consumer) view returns (uint256)",
  "function getETHBalance(address consumer) view returns (uint256)",
  "function getPendingWithdrawals(address provider) view returns (uint256)",
  "function getPendingETHWithdrawals(address provider) view returns (uint256)",
  "function isNonceUsed(address consumer, uint256 nonce) view returns (bool)",
  "function domainSeparator() view returns (bytes32)",
  "function platformFeeBps() view returns (uint256)",

  // Events
  "event Deposited(address indexed consumer, uint256 amount, uint8 token)",
  "event Withdrawn(address indexed user, uint256 amount, uint8 token)",
  "event PaymentProcessed(address indexed consumer, address indexed provider, uint256 amount, uint256 platformFee, string service, uint8 token)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

// Payment token enum (matches BonzaiPayment.sol)
export const PaymentToken = { ETH: 0, USDC: 1 };

// Pipeline category IDs (matches BonzaiProviderRegistry.sol PipelineCategory enum)
export const PIPELINE_CATEGORY_IDS = {
  // LLM category covers all models via OpenClaw
  llm: 0,
  // Image pipelines
  image_turbo: 1,
  image_quality: 2,
  image_standard: 3,
  image_advanced: 2, // deprecated: routes to image_quality
  // Audio pipelines (5 is deprecated)
  audio_turbo: 6,
  audio_quality: 7,
  // Music pipeline (ACE-Step)
  music: 8,
  // Video
  video_fast: 9,
  // Vision
  vision: 10,
};

// Map specific model names to their category
export const MODEL_TO_CATEGORY = {
  // All LLM models map to category 0
  llm_codestral_22b: 0,
  llm_deepseek_r1_1_5b: 0,
  llm_deepseek_r1_7b: 0,
  llm_deepseek_r1_32b: 0,
  llm_gemma_3_1b: 0,
  llm_gpt_oss_20b: 0,
  llm_hermes_4_14b: 0,
  llm_llama_2_7b: 0,
  llm_llama_3_1_8b: 0,
  llm_mistral_7b: 0,
  llm_mythomax_13b: 0,
  llm_phi_3_mini: 0,
  llm_phi_4_mini: 0,
  llm_yi_coder_9b: 0,
  llm_glm_4_7_q2: 0,
  llm_glm_4_7_q4: 0,
  llm_glm_4_7_q8: 0,
  llm_qwen3_coder_next: 0,
  // Other pipelines map directly
  ...PIPELINE_CATEGORY_IDS,
};

// Legacy alias
export const PIPELINE_IDS = PIPELINE_CATEGORY_IDS;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the provider registry contract
 */
async function getRegistryContract(needsSigner = false) {
  const config = CONFIG.p2pNetwork;
  if (!config.providerRegistryAddress) {
    throw new Error("Provider registry not deployed");
  }

  if (needsSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(config.providerRegistryAddress, PROVIDER_REGISTRY_ABI, signer);
  }

  const provider = await web3Service.getProvider("base");
  return new ethers.Contract(config.providerRegistryAddress, PROVIDER_REGISTRY_ABI, provider);
}

/**
 * Get the payment contract
 */
async function getPaymentContract(needsSigner = false) {
  const config = CONFIG.p2pNetwork;
  if (!config.paymentContractAddress) {
    throw new Error("Payment contract not deployed");
  }

  if (needsSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(config.paymentContractAddress, PAYMENT_CONTRACT_ABI, signer);
  }

  const provider = await web3Service.getProvider("base");
  return new ethers.Contract(config.paymentContractAddress, PAYMENT_CONTRACT_ABI, provider);
}

/**
 * Get the USDC contract (only needed for USDC payments)
 */
async function getUsdcContract(needsSigner = false) {
  const config = CONFIG.p2pNetwork;
  if (!config.usdcAddress) {
    throw new Error("USDC address not configured");
  }

  if (needsSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(config.usdcAddress, ERC20_ABI, signer);
  }

  const provider = await web3Service.getProvider("base");
  return new ethers.Contract(config.usdcAddress, ERC20_ABI, provider);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register as a provider
 *
 * @param {Object} options Registration options
 * @param {string} options.peerId libp2p peer ID
 * @param {string[]} options.multiaddrs libp2p multiaddresses
 * @param {string[]} options.pipelines Supported pipeline names
 * @param {string} options.pricePerToken Price per 1000 tokens in wei
 * @param {boolean} options.isRelay Whether to act as a relay
 * @param {string} options.stakeAmount ETH to stake (optional)
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export async function registerProvider(options) {
  try {
    const {
      peerId,
      multiaddrs = [],
      pipelines = [],
      pricePerToken = CONFIG.p2pNetwork.defaultPricePerToken,
      isRelay = false,
      stakeAmount = "0",
    } = options;

    // Convert pipeline names to IDs
    const pipelineIds = pipelines.map((p) => PIPELINE_IDS[p] ?? 0);

    const contract = await getRegistryContract(true);

    const tx = await contract.register(
      peerId,
      multiaddrs,
      pipelineIds,
      pricePerToken,
      isRelay,
      { value: ethers.parseEther(stakeAmount) }
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (err) {
    console.error("[P2P Contract] Registration failed:", err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Activate provider (start accepting jobs)
 */
export async function activateProvider() {
  try {
    const contract = await getRegistryContract(true);
    const tx = await contract.activate();
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Deactivate provider (stop accepting jobs)
 */
export async function deactivateProvider() {
  try {
    const contract = await getRegistryContract(true);
    const tx = await contract.deactivate();
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Send heartbeat to registry
 */
export async function sendHeartbeat() {
  try {
    const contract = await getRegistryContract(true);
    const tx = await contract.heartbeat();
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get provider info by wallet address
 */
export async function getProvider(walletAddress) {
  try {
    const contract = await getRegistryContract(false);
    const provider = await contract.getProvider(walletAddress);
    return formatProvider(provider);
  } catch (err) {
    console.error("[P2P Contract] Failed to get provider:", err);
    return null;
  }
}

/**
 * Get provider info by peer ID
 */
export async function getProviderByPeerId(peerId) {
  try {
    const contract = await getRegistryContract(false);
    const provider = await contract.getProviderByPeerId(peerId);
    return formatProvider(provider);
  } catch (err) {
    console.error("[P2P Contract] Failed to get provider:", err);
    return null;
  }
}

/**
 * Get all active providers for a specific pipeline
 */
export async function getProvidersForPipeline(pipeline) {
  try {
    const pipelineId = typeof pipeline === "string" ? PIPELINE_IDS[pipeline] : pipeline;
    const contract = await getRegistryContract(false);
    const providers = await contract.getProvidersForPipeline(pipelineId);
    return providers.map(formatProvider);
  } catch (err) {
    console.error("[P2P Contract] Failed to get providers:", err);
    return [];
  }
}

/**
 * Get all relay nodes
 */
export async function getRelayNodes() {
  try {
    const contract = await getRegistryContract(false);
    const relays = await contract.getRelayNodes();
    return relays.map(formatProvider);
  } catch (err) {
    console.error("[P2P Contract] Failed to get relays:", err);
    return [];
  }
}

/**
 * Get provider statistics
 */
export async function getProviderStats() {
  try {
    const contract = await getRegistryContract(false);
    const [total, active, platformFee, minStake] = await Promise.all([
      contract.getProviderCount(),
      contract.getActiveProviderCount(),
      contract.platformFeeBps(),
      contract.minStakeAmount(),
    ]);

    return {
      totalProviders: Number(total),
      activeProviders: Number(active),
      platformFeeBps: Number(platformFee),
      minStakeAmount: ethers.formatEther(minStake),
    };
  } catch (err) {
    console.error("[P2P Contract] Failed to get stats:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ETH PAYMENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deposit ETH for faster payments
 */
export async function depositETH(amount) {
  try {
    const amountWei = ethers.parseEther(amount);
    const payment = await getPaymentContract(true);
    const tx = await payment.depositETH({ value: amountWei });
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Withdraw deposited ETH
 */
export async function withdrawETH(amount) {
  try {
    const amountWei = ethers.parseEther(amount);
    const payment = await getPaymentContract(true);
    const tx = await payment.withdrawETH(amountWei);
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Withdraw provider ETH earnings
 */
export async function withdrawETHEarnings() {
  try {
    const payment = await getPaymentContract(true);
    const tx = await payment.withdrawETHEarnings();
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get consumer's deposited ETH balance
 */
export async function getDepositedETHBalance(address) {
  try {
    const payment = await getPaymentContract(false);
    const balance = await payment.getETHBalance(address);
    return ethers.formatEther(balance);
  } catch (err) {
    return "0";
  }
}

/**
 * Get provider's pending ETH withdrawals
 */
export async function getPendingETHWithdrawals(address) {
  try {
    const payment = await getPaymentContract(false);
    const pending = await payment.getPendingETHWithdrawals(address);
    return ethers.formatEther(pending);
  } catch (err) {
    return "0";
  }
}

/**
 * Pay provider directly in ETH
 */
export async function payProviderETH(providerAddress, amount, pipeline) {
  try {
    const amountWei = ethers.parseEther(amount);
    const payment = await getPaymentContract(true);
    const tx = await payment.payDirectETH(providerAddress, pipeline, { value: amountWei });
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Pay from deposited ETH balance
 */
export async function payFromETHBalance(providerAddress, amount, pipeline) {
  try {
    const amountWei = ethers.parseEther(amount);
    const payment = await getPaymentContract(true);
    const tx = await payment.payFromETHBalance(providerAddress, amountWei, pipeline);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USDC PAYMENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deposit USDC for faster payments
 */
export async function depositUSDC(amount) {
  try {
    const config = CONFIG.p2pNetwork;
    const amountWei = ethers.parseUnits(amount, 6); // USDC has 6 decimals

    // First approve
    const usdc = await getUsdcContract(true);
    const approveTx = await usdc.approve(config.paymentContractAddress, amountWei);
    await approveTx.wait();

    // Then deposit
    const payment = await getPaymentContract(true);
    const depositTx = await payment.deposit(amountWei);
    await depositTx.wait();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Withdraw deposited USDC
 */
export async function withdrawUSDC(amount) {
  try {
    const amountWei = ethers.parseUnits(amount, 6);
    const payment = await getPaymentContract(true);
    const tx = await payment.withdraw(amountWei);
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Withdraw provider USDC earnings
 */
export async function withdrawUSDCEarnings() {
  try {
    const payment = await getPaymentContract(true);
    const tx = await payment.withdrawEarnings();
    await tx.wait();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get consumer's deposited USDC balance
 */
export async function getDepositedUSDCBalance(address) {
  try {
    const payment = await getPaymentContract(false);
    const balance = await payment.getBalance(address);
    return ethers.formatUnits(balance, 6);
  } catch (err) {
    return "0";
  }
}

/**
 * Get provider's pending USDC withdrawals
 */
export async function getPendingUSDCWithdrawals(address) {
  try {
    const payment = await getPaymentContract(false);
    const pending = await payment.getPendingWithdrawals(address);
    return ethers.formatUnits(pending, 6);
  } catch (err) {
    return "0";
  }
}

/**
 * Pay provider directly in USDC
 */
export async function payProviderUSDC(providerAddress, amount, pipeline) {
  try {
    const config = CONFIG.p2pNetwork;
    const amountWei = ethers.parseUnits(amount, 6);

    // First approve
    const usdc = await getUsdcContract(true);
    const allowance = await usdc.allowance(
      web3Service.state.walletAddress,
      config.paymentContractAddress
    );

    if (allowance < amountWei) {
      const approveTx = await usdc.approve(config.paymentContractAddress, amountWei);
      await approveTx.wait();
    }

    // Pay
    const payment = await getPaymentContract(true);
    const tx = await payment.payDirect(providerAddress, amountWei, pipeline);
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Pay from deposited USDC balance
 */
export async function payFromUSDCBalance(providerAddress, amount, pipeline) {
  try {
    const amountWei = ethers.parseUnits(amount, 6);
    const payment = await getPaymentContract(true);
    const tx = await payment.payFromBalance(providerAddress, amountWei, pipeline);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED PAYMENT (auto-select token)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pay provider using the specified payment token
 *
 * @param {string} providerAddress Provider wallet address
 * @param {string} amount Amount (ETH in ether, USDC in USDC)
 * @param {string} pipeline Pipeline/service name
 * @param {number} paymentToken 0=ETH, 1=USDC
 */
export async function payProvider(providerAddress, amount, pipeline, paymentToken = PaymentToken.ETH) {
  if (paymentToken === PaymentToken.USDC) {
    return payProviderUSDC(providerAddress, amount, pipeline);
  }
  return payProviderETH(providerAddress, amount, pipeline);
}

/**
 * Withdraw provider earnings for the specified token
 */
export async function withdrawEarnings(paymentToken = PaymentToken.ETH) {
  if (paymentToken === PaymentToken.USDC) {
    return withdrawUSDCEarnings();
  }
  return withdrawETHEarnings();
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format provider struct from contract
 */
function formatProvider(provider) {
  if (!provider || provider.wallet === ethers.ZeroAddress) {
    return null;
  }

  // Map pipeline IDs back to names
  const pipelineNames = Object.entries(PIPELINE_IDS);
  const pipelines = provider.pipelines.map((id) => {
    const entry = pipelineNames.find(([, v]) => v === Number(id));
    return entry ? entry[0] : `unknown_${id}`;
  });

  return {
    wallet: provider.wallet,
    peerId: provider.peerId,
    multiaddrs: provider.multiaddrs,
    pipelines,
    pricePerToken: provider.pricePerToken.toString(),
    stakedAmount: ethers.formatEther(provider.stakedAmount),
    totalEarnings: ethers.formatEther(provider.totalEarnings),
    completedJobs: Number(provider.completedJobs),
    registeredAt: new Date(Number(provider.registeredAt) * 1000),
    lastSeenAt: new Date(Number(provider.lastSeenAt) * 1000),
    isActive: provider.isActive,
    isRelay: provider.isRelay,
  };
}

/**
 * Check if contracts are deployed
 */
export function areContractsDeployed() {
  const config = CONFIG.p2pNetwork;
  return !!(config.providerRegistryAddress && config.paymentContractAddress);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Constants
  PaymentToken,
  PIPELINE_IDS,

  // Registration
  registerProvider,
  activateProvider,
  deactivateProvider,
  sendHeartbeat,

  // Lookup
  getProvider,
  getProviderByPeerId,
  getProvidersForPipeline,
  getRelayNodes,
  getProviderStats,

  // ETH Payments
  depositETH,
  withdrawETH,
  withdrawETHEarnings,
  getDepositedETHBalance,
  getPendingETHWithdrawals,
  payProviderETH,
  payFromETHBalance,

  // USDC Payments
  depositUSDC,
  withdrawUSDC,
  withdrawUSDCEarnings,
  getDepositedUSDCBalance,
  getPendingUSDCWithdrawals,
  payProviderUSDC,
  payFromUSDCBalance,

  // Unified
  payProvider,
  withdrawEarnings,

  // Utils
  areContractsDeployed,
};
