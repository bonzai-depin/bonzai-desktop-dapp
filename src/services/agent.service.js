/**
 * Agent Service — purchase + per-execution USDC fees via BonzaiSkillRegistry.
 * Revenue split: 80% to companion co-owners, 20% to skill author.
 *
 * Env gating:
 * - `isDevMode()` returns true in Vite dev or when VITE_MOCK_PURCHASES=1 →
 *   purchases are mocked locally (no on-chain call, no fee collected).
 * - Production (packaged build) always uses the real USDC flow against
 *   BonzaiSkillRegistry on Base (requires CONFIG.skillRegistry.contractAddress).
 */

import { ethers } from 'ethers';
import { reactive, readonly } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ENV GATING — dev mocks vs prod on-chain
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when purchases/fees should be mocked locally.
 * - Vite dev mode (`npm run start`): always mocked
 * - Explicit override via `VITE_MOCK_PURCHASES=1` (e.g. for staging builds)
 * - Packaged production builds: never mocked
 */
export function isDevMode() {
  try {
    if (import.meta.env?.VITE_MOCK_PURCHASES === '1') return true;
    if (import.meta.env?.DEV === true) return true;
    if (import.meta.env?.MODE === 'development') return true;
  } catch {
    // `import.meta` unavailable in non-ESM contexts — fall through
  }
  return false;
}

/** True only if the SkillRegistry contract address is configured. */
export function skillRegistryReady() {
  return !!CONFIG.skillRegistry?.contractAddress;
}

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

const AGENT_REGISTRY_ABI = [
  'function hasPurchased(address user, bytes32 agentId) view returns (bool)',
  'function purchaseAgent(bytes32 agentId) payable',
  'function agentPrice() view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  purchasedAgents: {},
  runningFee: CONFIG.agents?.runningFee || 1,
  purchasePrice: CONFIG.agents?.purchasePrice || 10,
  isPurchasing: false,
  isPayingFee: false,
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

export const hasPurchasedAgent = (agentId) => {
  loadPurchases();
  return !!state.purchasedAgents[agentId];
};

export const purchaseAgent = async (agentId) => {
  state.isPurchasing = true;
  state.error = null;

  try {
    // Dev mode: mock the purchase so local testing doesn't hit mainnet.
    // Production: real ETH transfer to treasury.
    if (isDevMode()) {
      const mockTxHash = `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      savePurchase(agentId, mockTxHash);

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

    const signer = await web3Service.getSigner();
    const treasury = CONFIG.treasury?.address || CONFIG.agents?.feeRecipient;

    if (!treasury || treasury === ethers.ZeroAddress) {
      throw new Error('Treasury address not configured');
    }

    const price = ethers.parseEther(state.purchasePrice);

    const tx = await signer.sendTransaction({
      to: treasury,
      value: price,
    });

    const receipt = await tx.wait();

    savePurchase(agentId, receipt.hash);

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

// TODO: Check USDC balance on Base when BonzaiSkillRegistry is deployed
export const hasEnoughForRunningFee = () => {
  return true;
};

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

export const payRunningFee = async (agentId) => {
  state.isPayingFee = true;
  state.error = null;

  try {
    // Dev mode: mock the running fee. Production: real USDC via
    // BonzaiSkillRegistry.recordExecution(skillId). Not yet wired for prod;
    // running fees are 0 in the contract today, so the mock path is also
    // taken in prod until running-fee collection is enabled.
    const ENABLE_RUNNING_FEE_COLLECTION = skillRegistryReady()
      && CONFIG.skillRegistry?.enforceRunningFee === true;

    if (isDevMode() || !ENABLE_RUNNING_FEE_COLLECTION) {
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

export const executeAgentWithFee = async (agent, inputs, context = {}) => {
  const agentId = agent.id || agent.name;

  if (!hasPurchasedAgent(agentId)) {
    return { 
      success: false, 
      error: 'Agent not purchased. Please purchase this agent first.',
      requiresPurchase: true,
    };
  }
  
  if (!hasEnoughForRunningFee()) {
    return { 
      success: false, 
      error: `Insufficient USDC. Need ${state.runningFee} USDC to run this skill.`,
      insufficientBalance: true,
      required: state.runningFee,
      current: web3Service.state.balances.total,
    };
  }
  
  context.updateStatus?.('Paying running fee...');
  const feeResult = await payRunningFee(agentId);
  
  if (!feeResult.success) {
    return { 
      success: false, 
      error: `Fee payment failed: ${feeResult.error}`,
      feeFailed: true,
    };
  }
  
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

export const getAgentPurchaseInfo = (agentId) => {
  loadPurchases();
  return state.purchasedAgents[agentId] || null;
};

export const getTransactionHistory = () => {
  return [...state.transactions].reverse();
};

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
 *
 * - **Dev mode**: always returns `true` (skills free locally).
 * - **Prod**: on-chain check via `BonzaiSkillRegistry.userHasPurchased()`.
 *   No localStorage fallback — caching is done via `loadPurchasedSkillsOnChain()`
 *   which populates a verified set at mount time.
 *
 * @param {string} skillId
 * @returns {Promise<boolean>}
 */
export async function hasPurchasedSkill(skillId) {
  if (isDevMode()) return true;
  try {
    const registry = await getSkillRegistryContract();
    if (!registry) return false;
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return false;
    const skillIdBytes = getOnChainSkillId(skillId);
    return await registry.userHasPurchased(userAddress, skillIdBytes);
  } catch (e) {
    console.warn('[SkillPurchase] On-chain check failed:', e.message);
    return false;
  }
}

/**
 * Batch-query on-chain purchase state for a list of skill IDs. Used on wallet
 * connect to rebuild the UI's purchase set from authoritative state (no trust
 * in localStorage). Returns a Set of purchased skill IDs.
 *
 * In dev mode, returns all IDs as "purchased" so skills are usable locally.
 *
 * @param {string[]} skillIds
 * @returns {Promise<Set<string>>}
 */
export async function loadPurchasedSkillsOnChain(skillIds) {
  const purchased = new Set();
  if (!skillIds?.length) return purchased;

  if (isDevMode()) {
    skillIds.forEach((id) => purchased.add(id));
    return purchased;
  }

  try {
    const registry = await getSkillRegistryContract();
    if (!registry) return purchased;
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return purchased;

    const results = await Promise.all(
      skillIds.map(async (id) => {
        try {
          const skillIdBytes = getOnChainSkillId(id);
          const ok = await registry.userHasPurchased(userAddress, skillIdBytes);
          return ok ? id : null;
        } catch {
          return null;
        }
      })
    );
    results.filter(Boolean).forEach((id) => purchased.add(id));
  } catch (e) {
    console.warn('[SkillPurchase] Batch load failed:', e.message);
  }
  return purchased;
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
      const approveTx = await usdcContract.approve(registryAddress, BigInt(price));
      await approveTx.wait();
    }

    // 7. Call registry.purchaseSkill(skillIdBytes, maxPrice)
    const registry = new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, signer);
    const skillIdBytes = getOnChainSkillId(skillId);
    const tx = await registry.purchaseSkill(skillIdBytes, BigInt(price));
    const receipt = await tx.wait();

    await window.electronAPI?.store?.set(`skill-purchased-${skillId}`, {
      purchasedAt: Date.now(),
      txHash: receipt.hash,
      price,
    });

    savePurchase(skillId, receipt.hash);

    state.transactions.push({
      type: 'skill-purchase-usdc',
      skillId,
      amount: price / 1_000_000,
      token: 'USDC',
      txHash: receipt.hash,
      timestamp: Date.now(),
    });

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
  loadPurchasedSkillsOnChain,
  purchaseSkillUSDC,
  isDevMode,
  skillRegistryReady,
  
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
