/**
 * Agent Service — agent purchases and companion-token skill access.
 *
 * Env gating:
 * - `isDevMode()` returns true in Vite dev or when VITE_MOCK_PURCHASES=1 →
 *   purchases are mocked locally (no on-chain call, no fee collected).
 * - Production skill access is rebuilt from BonzaiSkillRegistry.
 */

import { ethers } from 'ethers';
import { reactive, readonly } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
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
  runningFee: 0,
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
// SKILL EXECUTION — no execution payment in the current registry
// ═══════════════════════════════════════════════════════════════════════════

export const hasEnoughForRunningFee = () => true;

/** Free execution does not create a payment or a synthetic transaction receipt. */
export const payRunningFee = async () => ({ success: true, free: true, amount: '0', txHash: null });

export const executeAgentWithFee = async (agent, inputs, context = {}) => {
  const agentId = agent.id || agent.name;

  if (!hasPurchasedAgent(agentId)) {
    return { 
      success: false, 
      error: 'Agent not purchased. Please purchase this agent first.',
      requiresPurchase: true,
    };
  }
  
  try {
    context.updateStatus?.('Executing agent...');
    const results = await agent.execute(inputs, context);
    
    return { 
      success: true, 
      results,
      feeTxHash: null,
    };
  } catch (e) {
    return { 
      success: false, 
      error: `Agent execution failed: ${e.message}`,
      feePaid: false,
      feeTxHash: null,
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
// COMPANION TOKEN ACCESS (on-chain via BonzaiSkillRegistry)
// ═══════════════════════════════════════════════════════════════════════════

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
  throw new Error(`Skill ${localSkillId} is not registered on the configured economy chain`);
}

const SKILL_REGISTRY_ABI = [
  'function userHasAccess(address user, bytes32 skillId) view returns (bool)',
  'function getSkill(bytes32 skillId) view returns (tuple(bytes32 id, address author, string name, string version, string category, string ipfsHash, bool tokenGated, bool isActive, bool isVerified, bool adminDeactivated, uint256 totalExecutions, uint256 createdAt, uint256 updatedAt))',
  'function registerSkill(string name, string version, string category, string ipfsHash, bool tokenGated) external returns (bytes32)',
  'function getSkillsPaginated(uint256 offset, uint256 limit) view returns (bytes32[])',
];

/**
 * Get the BonzaiSkillRegistry contract instance on the configured economy chain.
 * @param {boolean} [withSigner=false]
 * @returns {Promise<ethers.Contract|null>}
 */
async function getSkillRegistryContract(withSigner = false) {
  const registryAddress = CONFIG.skillRegistry?.contractAddress;
  if (!registryAddress) return null;

  if (withSigner) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const signer = await web3Service.getSigner();
    return new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, signer);
  }

  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(registryAddress, SKILL_REGISTRY_ABI, provider);
}

/**
 * Check whether the current wallet holds an eligible companion-owner token.
 *
 * - **Dev mode**: always returns `true` (skills free locally).
 * - **Prod**: on-chain check via `BonzaiSkillRegistry.userHasAccess()`.
 *   No localStorage fallback; access is rebuilt from authoritative chain state.
 *   which populates a verified set at mount time.
 *
 * @param {string} skillId
 * @returns {Promise<boolean>}
 */
export async function hasSkillTokenAccess(skillId) {
  if (isDevMode()) return true;
  try {
    const registry = await getSkillRegistryContract();
    if (!registry) return false;
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return false;
    const skillIdBytes = getOnChainSkillId(skillId);
    return await registry.userHasAccess(userAddress, skillIdBytes);
  } catch (e) {
    console.warn('[SkillAccess] On-chain check failed:', e.message);
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
export async function loadSkillTokenAccessOnChain(skillIds) {
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
          const ok = await registry.userHasAccess(userAddress, skillIdBytes);
          return ok ? id : null;
        } catch {
          return null;
        }
      })
    );
    results.filter(Boolean).forEach((id) => purchased.add(id));
  } catch (e) {
    console.warn('[SkillAccess] Batch load failed:', e.message);
  }
  return purchased;
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

  // Companion-token skill access (on-chain)
  hasSkillTokenAccess,
  loadSkillTokenAccessOnChain,
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
