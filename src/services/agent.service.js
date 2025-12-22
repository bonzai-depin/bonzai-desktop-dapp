/**
 * BonzAI Agent Service
 * 
 * Manages smart agent lifecycle:
 * - Purchase: One-time 0.1 ETH payment to own an agent
 * - Running Fee: 99 BONZAI transferred per execution
 * 
 * The running fee is an actual token transfer, not a holding requirement.
 * User must have 99 BONZAI in their wallet and approve the transfer.
 */

import { ethers } from 'ethers';
import { reactive, readonly } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Optional: If you want on-chain agent registry
const AGENT_REGISTRY_ABI = [
  'function hasPurchased(address user, bytes32 agentId) view returns (bool)',
  'function purchaseAgent(bytes32 agentId) payable',
  'function agentPrice() view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Purchased agents (agentId => boolean)
  purchasedAgents: {},
  
  // Running fee config
  runningFee: CONFIG.agents?.runningFee || 99,
  purchasePrice: CONFIG.agents?.purchasePrice || '0.1',
  
  // Loading states
  isPurchasing: false,
  isPayingFee: false,
  
  // Transaction history
  transactions: [],
  
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE (for purchase tracking before on-chain registry)
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'bonzai-agent-purchases';

const loadPurchases = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      const walletAddress = web3Service.state.walletAddress?.toLowerCase();
      if (walletAddress && data[walletAddress]) {
        state.purchasedAgents = data[walletAddress];
      }
    }
  } catch (e) {
    console.warn('[Agent] Failed to load purchases:', e);
  }
};

const savePurchase = (agentId, txHash) => {
  try {
    const walletAddress = web3Service.state.walletAddress?.toLowerCase();
    if (!walletAddress) return;
    
    const stored = localStorage.getItem(STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : {};
    
    if (!data[walletAddress]) {
      data[walletAddress] = {};
    }
    
    data[walletAddress][agentId] = {
      purchasedAt: Date.now(),
      txHash,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    state.purchasedAgents[agentId] = data[walletAddress][agentId];
  } catch (e) {
    console.warn('[Agent] Failed to save purchase:', e);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AGENT PURCHASE (0.1 ETH)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user has purchased an agent
 * @param {string} agentId - Unique agent identifier
 */
export const hasPurchasedAgent = (agentId) => {
  loadPurchases();
  return !!state.purchasedAgents[agentId];
};

/**
 * Purchase an agent by paying ETH
 * @param {string} agentId - Unique agent identifier
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const purchaseAgent = async (agentId) => {
  state.isPurchasing = true;
  state.error = null;
  
  try {
    const signer = await web3Service.getSigner();
    const treasury = CONFIG.treasury?.address || CONFIG.agents?.feeRecipient;
    
    if (!treasury || treasury === ethers.ZeroAddress) {
      throw new Error('Treasury address not configured');
    }
    
    const price = ethers.parseEther(state.purchasePrice);
    
    // Send ETH to treasury
    const tx = await signer.sendTransaction({
      to: treasury,
      value: price,
    });
    
    const receipt = await tx.wait();
    
    // Save purchase locally
    savePurchase(agentId, receipt.hash);
    
    // Log transaction
    state.transactions.push({
      type: 'agent-purchase',
      agentId,
      amount: state.purchasePrice,
      token: 'ETH',
      txHash: receipt.hash,
      timestamp: Date.now(),
    });
    
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    state.error = error;
    console.error('[Agent] Purchase failed:', error);
    return { success: false, error };
  } finally {
    state.isPurchasing = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RUNNING FEE (99 BONZAI per execution)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user has enough BONZAI for running fee
 */
export const hasEnoughForRunningFee = () => {
  const balance = web3Service.state.balances.total;
  return balance >= state.runningFee;
};

/**
 * Get BONZAI contract instance
 */
const getBonzaiContract = async (withSigner = false) => {
  const bonzaiAddress = CONFIG.tokens.BONZAI.arbitrum;
  
  if (withSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(bonzaiAddress, ERC20_ABI, signer);
  }
  
  const provider = web3Service.getProvider('arbitrum');
  return new ethers.Contract(bonzaiAddress, ERC20_ABI, provider);
};

/**
 * Pay running fee (transfer 99 BONZAI to treasury)
 * This must be called before each agent execution
 * 
 * @param {string} agentId - For logging purposes
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const payRunningFee = async (agentId) => {
  state.isPayingFee = true;
  state.error = null;
  
  try {
    // Check balance first
    if (!hasEnoughForRunningFee()) {
      throw new Error(`Insufficient BONZAI balance. Need ${state.runningFee} BONZAI to run this agent.`);
    }
    
    const treasury = CONFIG.treasury?.address || CONFIG.agents?.feeRecipient;
    if (!treasury || treasury === ethers.ZeroAddress) {
      throw new Error('Treasury address not configured');
    }
    
    const bonzaiContract = await getBonzaiContract(true);
    const decimals = await bonzaiContract.decimals();
    const feeAmount = ethers.parseUnits(state.runningFee.toString(), decimals);
    
    // Transfer BONZAI to treasury
    const tx = await bonzaiContract.transfer(treasury, feeAmount);
    const receipt = await tx.wait();
    
    // Refresh balances
    await web3Service.fetchAllBalances();
    
    // Log transaction
    state.transactions.push({
      type: 'agent-run-fee',
      agentId,
      amount: state.runningFee,
      token: 'BONZAI',
      txHash: receipt.hash,
      timestamp: Date.now(),
    });
    
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    state.error = error;
    console.error('[Agent] Fee payment failed:', error);
    return { success: false, error };
  } finally {
    state.isPayingFee = false;
  }
};

/**
 * Execute agent with automatic fee payment
 * This is the main entry point for running an agent
 * 
 * @param {Object} agent - Agent definition
 * @param {Object} inputs - User inputs
 * @param {Object} context - Execution context
 * @returns {Promise<{success: boolean, results?: any, error?: string}>}
 */
export const executeAgentWithFee = async (agent, inputs, context = {}) => {
  const agentId = agent.id || agent.name;
  
  // Step 1: Check if purchased
  if (!hasPurchasedAgent(agentId)) {
    return { 
      success: false, 
      error: 'Agent not purchased. Please purchase this agent first.',
      requiresPurchase: true,
    };
  }
  
  // Step 2: Check balance
  if (!hasEnoughForRunningFee()) {
    return { 
      success: false, 
      error: `Insufficient BONZAI. Need ${state.runningFee} BONZAI to run this agent.`,
      insufficientBalance: true,
      required: state.runningFee,
      current: web3Service.state.balances.total,
    };
  }
  
  // Step 3: Pay running fee
  context.updateStatus?.('Paying running fee...');
  const feeResult = await payRunningFee(agentId);
  
  if (!feeResult.success) {
    return { 
      success: false, 
      error: `Fee payment failed: ${feeResult.error}`,
      feeFailed: true,
    };
  }
  
  // Step 4: Execute agent
  try {
    context.updateStatus?.('Executing agent...');
    const results = await agent.execute(inputs, context);
    
    return { 
      success: true, 
      results,
      feeTxHash: feeResult.txHash,
    };
  } catch (e) {
    return { 
      success: false, 
      error: `Agent execution failed: ${e.message}`,
      feePaid: true, // Fee was paid even though execution failed
      feeTxHash: feeResult.txHash,
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get agent purchase info
 */
export const getAgentPurchaseInfo = (agentId) => {
  loadPurchases();
  return state.purchasedAgents[agentId] || null;
};

/**
 * Get all transactions for current user
 */
export const getTransactionHistory = () => {
  return [...state.transactions].reverse();
};

/**
 * Initialize service (load purchases for connected wallet)
 */
export const initialize = () => {
  loadPurchases();
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const agentService = {
  state: readonly(state),
  
  // Purchase
  hasPurchasedAgent,
  purchaseAgent,
  getAgentPurchaseInfo,
  
  // Running fee
  hasEnoughForRunningFee,
  payRunningFee,
  
  // Execute with fee
  executeAgentWithFee,
  
  // Utilities
  getTransactionHistory,
  initialize,
  
  // Config
  runningFee: state.runningFee,
  purchasePrice: state.purchasePrice,
};

export default agentService;
