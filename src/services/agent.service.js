/**
 * BonzAI Agent Service
 *
 * Manages smart agent lifecycle:
 * - Purchase: One-time USDC payment to own an agent (via BonzaiSkillRegistry)
 * - Running Fee: USDC transferred per execution (via BonzaiSkillRegistry)
 *
 * All payments are in USDC (6 decimals) to avoid sell pressure on BONZAI token.
 * Revenue split: 80% to companion co-owners, 20% to skill author.
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
  
  // Running fee config (USDC, 6 decimals — value in human units)
  runningFee: CONFIG.agents?.runningFee || 1, // 1 USDC per execution
  purchasePrice: CONFIG.agents?.purchasePrice || 10, // 10 USDC one-time purchase
  
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
 * Purchase an agent/skill
 * Currently mocked until BonzaiSkillRegistry contract is deployed and battle-tested
 *
 * @param {string} agentId - Unique agent/skill identifier
 * @returns {Promise<{success: boolean, txHash?: string, error?: string, mock?: boolean}>}
 */
export const purchaseAgent = async (agentId) => {
  state.isPurchasing = true;
  state.error = null;

  try {
    // TODO: Enable real purchases after BonzaiSkillRegistry is deployed
    // For now, always use mock purchase for testing
    const ENABLE_REAL_PURCHASES = false;

    if (!ENABLE_REAL_PURCHASES) {
      // Mock purchase for development/testing
      console.log('[Agent] Mock purchase for:', agentId);
      const mockTxHash = `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Save mock purchase locally
      savePurchase(agentId, mockTxHash);

      // Log mock transaction
      state.transactions.push({
        type: 'agent-purchase',
        agentId,
        amount: state.purchasePrice,
        token: 'ETH',
        txHash: mockTxHash,
        timestamp: Date.now(),
        mock: true,
      });

      return { success: true, txHash: mockTxHash, mock: true };
    }

    // Real purchase flow (disabled until contract deployed)
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
// RUNNING FEE (USDC per execution, via BonzaiSkillRegistry)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user has enough USDC for running fee
 */
export const hasEnoughForRunningFee = () => {
  // TODO: Check USDC balance on Base when BonzaiSkillRegistry is deployed
  // For now, always return true (mock mode)
  return true;
};

/**
 * Get USDC contract instance on Base
 */
const getUsdcContract = async (withSigner = false) => {
  const usdcAddress = CONFIG.tokens?.USDC?.base;
  if (!usdcAddress) throw new Error('USDC address not configured for Base');

  if (withSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(usdcAddress, ERC20_ABI, signer);
  }

  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(usdcAddress, ERC20_ABI, provider);
};

/**
 * Pay running fee (USDC via BonzaiSkillRegistry.recordExecution)
 * Currently mocked until BonzaiSkillRegistry contract is deployed and battle-tested.
 * When enabled, this calls registry.recordExecution(skillId) which pulls USDC from the user.
 * Revenue split: 80% to companion co-owners, 20% to skill author.
 *
 * @param {string} agentId - For logging purposes
 * @returns {Promise<{success: boolean, txHash?: string, error?: string, mock?: boolean}>}
 */
export const payRunningFee = async (agentId) => {
  state.isPayingFee = true;
  state.error = null;

  try {
    // TODO: Enable real fee payments after BonzaiSkillRegistry is deployed on Base
    // When enabled: approve USDC to SkillRegistry, then call recordExecution(skillId)
    const ENABLE_REAL_FEES = false;

    if (!ENABLE_REAL_FEES) {
      // Mock fee payment for development/testing
      console.log('[Agent] Mock USDC fee payment for:', agentId);
      const mockTxHash = `mock-fee-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      state.transactions.push({
        type: 'agent-run-fee',
        agentId,
        amount: state.runningFee,
        token: 'USDC',
        txHash: mockTxHash,
        timestamp: Date.now(),
        mock: true,
      });

      return { success: true, txHash: mockTxHash, mock: true };
    }

    // Real fee payment flow via BonzaiSkillRegistry (disabled until deployed)
    if (!hasEnoughForRunningFee()) {
      throw new Error(`Insufficient USDC balance. Need ${state.runningFee} USDC to run this skill.`);
    }

    // TODO: Call BonzaiSkillRegistry.recordExecution(skillId) on Base
    // The contract handles USDC transfer and revenue distribution
    throw new Error('Real USDC fee payments not yet enabled');
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
      error: `Insufficient USDC. Need ${state.runningFee} USDC to run this skill.`,
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
// USDC SKILL PURCHASE (on-chain via BonzaiSkillRegistry on Base)
// ═══════════════════════════════════════════════════════════════════════════

const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_SKILL_PRICE_USDC = 10_000_000; // 10 USDC (6 decimals)

/**
 * Compute on-chain skill ID matching BonzaiSkillRegistry.registerSkill() encoding.
 * Contract: skillId = keccak256(abi.encode(name, version, msg.sender))
 *
 * If a pre-computed mapping exists in CONFIG.skillRegistry.skillIdMap, use that.
 * Otherwise fall back to ethers.id(localSkillId) for compatibility.
 */
function getOnChainSkillId(localSkillId) {
  const map = CONFIG.skillRegistry?.skillIdMap;
  if (map && map[localSkillId]) return map[localSkillId];
  // Fallback: hash the local ID string (won't match contract-generated IDs)
  return ethers.id(localSkillId);
}

const SKILL_REGISTRY_ABI = [
  'function userHasPurchased(address user, bytes32 skillId) view returns (bool)',
  'function purchaseSkill(bytes32 skillId, uint256 maxPrice) external',
  'function getSkill(bytes32 skillId) view returns (tuple(bytes32 id, address author, string name, string version, string category, string ipfsHash, uint256 purchasePrice, uint256 runningFee, bool isActive, bool isVerified, bool adminDeactivated, uint256 totalPurchases, uint256 totalExecutions, uint256 totalRevenue, uint256 createdAt, uint256 updatedAt))',
  'function registerSkill(string name, string version, string category, string ipfsHash, uint256 purchasePrice, uint256 runningFee) external returns (bytes32)',
  'function getSkillsPaginated(uint256 offset, uint256 limit) view returns (bytes32[])',
];

const USDC_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

/**
 * Get the BonzaiSkillRegistry contract instance (Base only).
 * @param {boolean} [withSigner=false]
 * @returns {Promise<ethers.Contract|null>}
 */
async function getSkillRegistryContract(withSigner = false) {
  const registryAddress = CONFIG.skillRegistry?.contractAddress;
  if (!registryAddress) return null;

  if (withSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, signer);
  }

  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, provider);
}

/**
 * Check if a skill has been purchased by the current user.
 * Checks on-chain via BonzaiSkillRegistry.hasUserPurchased() first,
 * then falls back to local store for offline access.
 *
 * @param {string} skillId
 * @returns {Promise<boolean>}
 */
export async function hasPurchasedSkill(skillId) {
  // Try on-chain check first
  try {
    const registry = await getSkillRegistryContract();
    if (registry) {
      const userAddress = web3Service.state.walletAddress;
      if (userAddress) {
        const skillIdBytes = getOnChainSkillId(skillId);
        return await registry.userHasPurchased(userAddress, skillIdBytes);
      }
    }
  } catch (e) {
    console.warn('[SkillPurchase] On-chain check failed, using local:', e.message);
  }
  // Fallback to local store
  return !!(await window.electronAPI?.store?.get(`skill-purchased-${skillId}`));
}

/**
 * Purchase a skill with USDC on Base.
 * Handles USDC approval + on-chain purchase in one flow.
 *
 * @param {string} skillId
 * @param {number} [price=10_000_000] - Price in USDC smallest unit (6 decimals). Default 10 USDC.
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export async function purchaseSkillUSDC(skillId, price = DEFAULT_SKILL_PRICE_USDC) {
  state.isPurchasing = true;
  state.error = null;

  try {
    // 1. Auto-connect wallet if not connected (supports both Privy and Reown)
    if (!web3Service.state.isConnected) {
      // Try to restore Privy session silently
      try {
        const { privyService } = await import('./privy.service.js');
        await privyService.initialize();
        if (privyService.state.isAuthenticated && privyService.state.embeddedWalletAddress) {
          await web3Service.connectWithPrivy({ method: 'email', otpCode: '__restore__' }).catch(() => {});
        }
      } catch { /* Privy not configured or no session */ }

      if (!web3Service.state.isConnected) {
        throw new Error('Please connect your wallet or sign in to purchase skills.');
      }
    }

    // 2. Ensure on Base — auto-switch if needed
    if (web3Service.state.currentChainId !== 8453) {
      console.log('[SkillPurchase] Switching to Base...');
      await web3Service.switchToBase();
    }

    // 3. Get signer
    const signer = await web3Service.getSigner();
    const userAddress = await signer.getAddress();

    // 4. Get registry contract
    const registryAddress = CONFIG.skillRegistry?.contractAddress;
    if (!registryAddress) {
      throw new Error('Skill registry contract not yet deployed');
    }

    // 5. Check USDC balance
    const usdcContract = new ethers.Contract(USDC_ADDRESS_BASE, USDC_ABI, signer);
    const balance = await usdcContract.balanceOf(userAddress);
    if (balance < BigInt(price)) {
      const needed = (Number(price) / 1_000_000).toFixed(2);
      const has = (Number(balance) / 1_000_000).toFixed(2);

      // For Privy users: offer Coinbase onramp to fund wallet
      if (web3Service.state.authProvider === 'privy') {
        try {
          const { privyService } = await import('./privy.service.js');
          const funding = await privyService.getFundingUrl(needed);
          if (funding.url) {
            const { shell } = await import('electron');
            shell.openExternal(funding.url);
            throw new Error(`Insufficient USDC (have ${has}, need ${needed}). A funding page has been opened in your browser — purchase USDC with credit card, then retry.`);
          }
        } catch (e) {
          if (e.message.includes('funding page')) throw e; // Re-throw our custom message
        }
      }
      throw new Error(`Insufficient USDC. Need ${needed} USDC, have ${has} USDC. Add funds to your wallet on Base.`);
    }

    // 6. Check/set USDC allowance for SkillRegistry
    const currentAllowance = await usdcContract.allowance(userAddress, registryAddress);
    if (currentAllowance < BigInt(price)) {
      console.log('[SkillPurchase] Approving USDC spend...');
      const approveTx = await usdcContract.approve(registryAddress, BigInt(price));
      await approveTx.wait();
      console.log('[SkillPurchase] USDC approved');
    }

    // 7. Call registry.purchaseSkill(skillIdBytes, maxPrice)
    const registry = new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, signer);
    const skillIdBytes = getOnChainSkillId(skillId);
    const tx = await registry.purchaseSkill(skillIdBytes, BigInt(price));
    const receipt = await tx.wait();

    // 6. Store purchase locally for offline access
    await window.electronAPI?.store?.set(`skill-purchased-${skillId}`, {
      purchasedAt: Date.now(),
      txHash: receipt.hash,
      price,
    });

    // Also save in localStorage for immediate UI update
    savePurchase(skillId, receipt.hash);

    state.transactions.push({
      type: 'skill-purchase-usdc',
      skillId,
      amount: price / 1_000_000,
      token: 'USDC',
      txHash: receipt.hash,
      timestamp: Date.now(),
    });

    console.log('[SkillPurchase] Skill purchased on-chain:', receipt.hash);
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    state.error = error;
    console.error('[SkillPurchase] USDC purchase failed:', error);
    return { success: false, error };
  } finally {
    state.isPurchasing = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const agentService = {
  state: readonly(state),
  
  // Purchase
  hasPurchasedAgent,
  purchaseAgent,
  getAgentPurchaseInfo,

  // USDC Skill Purchase (on-chain)
  hasPurchasedSkill,
  purchaseSkillUSDC,
  
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
