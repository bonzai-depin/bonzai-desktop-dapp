/**
 * BonzAI Level Service
 *
 * Manages the 6-tier level system with DUAL access paths:
 *
 * IMPORTANT: Basic generation (text, audio, image, video, 3D, training) is FREE.
 * Levels ONLY gate SMART AGENT SKILLS that use these capabilities.
 *
 * A level is ACTIVE when EITHER:
 *   1. User holds >= required BONZAI tokens (across Ethereum + Arbitrum)
 *   OR
 *   2. User has paid 1 ETH one-time payment to unlock ALL levels via BonzaiUnlock
 *
 * Levels (BONZAI holding requirements divided by 5):
 *   - LVL1: Text in Smart Agents (20 BONZAI or 1 ETH for all)
 *   - LVL2: Audio in Smart Agents (100 BONZAI or 1 ETH for all)
 *   - LVL3: Image in Smart Agents (400 BONZAI or 1 ETH for all)
 *   - LVL4: Video in Smart Agents (2,000 BONZAI or 1 ETH for all)
 *   - LVL5: 3D in Smart Agents (10,000 BONZAI or 1 ETH for all)
 *   - LVL6: Training in Smart Agents (40,000 BONZAI or 1 ETH for all)
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// BonzaiUnlock contract ABI (1 ETH one-time payment unlocks all levels)
// Contract: 0xE49492A2604Cea2a50060E47215Cb19bffD1Edae on Arbitrum
const BONZAI_UNLOCK_ABI = [
  // View functions
  'function unlockPrice() view returns (uint256)',
  'function hasUnlocked(address) view returns (bool)',
  'function isUnlocked(address user) view returns (bool)',
  'function totalUnlocks() view returns (uint256)',
  'function totalCollected() view returns (uint256)',
  'function getStats() view returns (uint256 totalUnlocks, uint256 totalCollected, uint256 currentBalance)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  // State-changing functions
  'function unlock() payable',
  // Events
  'event Unlocked(address indexed user, uint256 amount)',
  'event PriceUpdated(uint256 oldPrice, uint256 newPrice)',
  'event Withdrawn(address indexed to, uint256 amount)',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Level status for each tier
  // A level is active if: holdingMet OR ethUnlocked (all levels via single 1 ETH payment)
  levels: {
    LVL1: { holdingMet: false, ethUnlocked: false, active: false },
    LVL2: { holdingMet: false, ethUnlocked: false, active: false },
    LVL3: { holdingMet: false, ethUnlocked: false, active: false },
    LVL4: { holdingMet: false, ethUnlocked: false, active: false },
    LVL5: { holdingMet: false, ethUnlocked: false, active: false },
    LVL6: { holdingMet: false, ethUnlocked: false, active: false },
  },

  // ETH unlock price (fixed 1 ETH for ALL levels)
  unlockPrice: 1.0, // ETH

  // Whether user has paid 1 ETH to unlock all levels
  allLevelsUnlocked: false,

  // Contract stats
  contractStats: {
    totalUnlocks: 0,
    totalCollected: 0,
    isPaused: false,
  },

  // Loading states
  isLoading: false,
  isUnlocking: false,
  lastCheck: null,
  error: null,

  // Cross-component communication: request to open level modal
  // Set to a level number (1-6) to request opening the modal
  openLevelModalFor: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the BonzaiUnlock contract instance
 * @param {boolean} withSigner - If true, returns contract with signer for transactions
 */
const getUnlockContract = async (withSigner = false) => {
  const registryAddress = CONFIG.levelUnlock?.registryAddress;

  if (!registryAddress || registryAddress === ethers.ZeroAddress) {
    return null;
  }

  if (withSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(registryAddress, BONZAI_UNLOCK_ABI, signer);
  }

  const provider = web3Service.getProvider('arbitrum');
  return new ethers.Contract(registryAddress, BONZAI_UNLOCK_ABI, provider);
};

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user meets HOLDING requirement for a level
 */
const checkHoldingRequirement = (levelKey) => {
  const levelConfig = CONFIG.levels[levelKey];
  if (!levelConfig) return false;

  const totalBalance = web3Service.state.balances.total;
  return totalBalance >= levelConfig.holdingRequired;
};

/**
 * Check if user has PAID 1 ETH to unlock ALL levels
 * Single payment unlocks everything - no per-level unlock
 */
const checkEthUnlock = async (userAddress) => {
  try {
    const contract = await getUnlockContract();

    // If contract not deployed, ETH unlock not available
    if (!contract) {
      return false;
    }

    const unlocked = await contract.isUnlocked(userAddress);
    return unlocked;
  } catch (e) {
    console.warn('[Level] ETH unlock check failed:', e.message);
    return false;
  }
};

/**
 * Check all requirements for a single level
 * Level is ACTIVE if holdingMet OR ethUnlocked (all levels unlocked via 1 ETH)
 */
const checkLevel = (levelKey, ethUnlocked) => {
  const levelConfig = CONFIG.levels[levelKey];
  if (!levelConfig) return { holdingMet: false, ethUnlocked: false, active: false };

  const holdingMet = checkHoldingRequirement(levelKey);

  // Active if EITHER holding requirement is met OR paid 1 ETH unlock
  const active = holdingMet || ethUnlocked;

  state.levels[levelKey] = { holdingMet, ethUnlocked, active };

  return { holdingMet, ethUnlocked, active };
};

/**
 * Check all levels for the connected user
 */
export const checkAllLevels = async () => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) {
    console.warn('[Level] No wallet connected');
    return state.levels;
  }

  state.isLoading = true;
  state.error = null;

  try {
    // Fetch contract info (price, stats, pause status)
    await fetchContractInfo();

    // Check if user has paid 1 ETH to unlock ALL levels (single check)
    const ethUnlocked = await checkEthUnlock(userAddress);
    state.allLevelsUnlocked = ethUnlocked;

    // Check each level - ethUnlocked applies to ALL levels
    checkLevel('LVL1', ethUnlocked);
    checkLevel('LVL2', ethUnlocked);
    checkLevel('LVL3', ethUnlocked);
    checkLevel('LVL4', ethUnlocked);
    checkLevel('LVL5', ethUnlocked);
    checkLevel('LVL6', ethUnlocked);

    state.lastCheck = Date.now();
    return state.levels;
  } catch (e) {
    state.error = e.message;
    console.error('[Level] Failed to check levels:', e);
    return state.levels;
  } finally {
    state.isLoading = false;
  }
};

/**
 * Fetch contract info: unlock price, stats, pause status
 */
const fetchContractInfo = async () => {
  try {
    const contract = await getUnlockContract();
    if (!contract) {
      // Use config defaults
      state.unlockPrice = parseFloat(CONFIG.levelUnlock?.unlockPrice || '1.0');
      return;
    }

    // Fetch all info in parallel
    const [unlockPrice, stats, isPaused] = await Promise.all([
      contract.unlockPrice(),
      contract.getStats(),
      contract.paused(),
    ]);

    state.unlockPrice = parseFloat(ethers.formatEther(unlockPrice));
    state.contractStats.totalUnlocks = Number(stats._totalUnlocks);
    state.contractStats.totalCollected = parseFloat(ethers.formatEther(stats._totalCollected));
    state.contractStats.isPaused = isPaused;
  } catch (e) {
    console.warn('[Level] Failed to fetch contract info:', e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ETH UNLOCK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user can unlock all levels with ETH
 * @returns {{ canUnlock: boolean, reason: string | null }}
 */
export const canUnlockWithEth = () => {
  if (state.allLevelsUnlocked) {
    return { canUnlock: false, reason: 'Already unlocked' };
  }

  if (state.contractStats.isPaused) {
    return { canUnlock: false, reason: 'Unlocking is currently paused' };
  }

  return { canUnlock: true, reason: null };
};

/**
 * Unlock ALL levels by paying 1 ETH
 * Single payment permanently unlocks all 6 levels
 * @param {Function} onStatusChange - Optional callback for status updates
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const unlockAllWithEth = async (onStatusChange) => {
  // Validate can unlock
  const { canUnlock, reason } = canUnlockWithEth();
  if (!canUnlock) {
    return { success: false, error: reason };
  }

  state.isUnlocking = true;

  try {
    const contract = await getUnlockContract(true);
    if (!contract) {
      throw new Error('BonzaiUnlock contract not configured');
    }

    // Get price from contract (should be 1 ETH)
    const price = await contract.unlockPrice();

    // Notify that we're about to request payment
    if (onStatusChange) {
      onStatusChange('awaiting_payment');
    }

    // Call unlock function with exact payment
    const tx = await contract.unlock({ value: price });

    // Notify that payment was submitted, waiting for confirmation
    if (onStatusChange) {
      onStatusChange('confirming');
    }

    const receipt = await tx.wait();

    console.log('[Level] All levels unlocked via ETH payment:', receipt.hash);

    // Refresh all levels
    await checkAllLevels();

    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    console.error('[Level] Unlock failed:', error);
    return { success: false, error };
  } finally {
    state.isUnlocking = false;
  }
};


// ═══════════════════════════════════════════════════════════════════════════
// ACCESS VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user can access a specific feature
 */
export const canAccessFeature = (feature) => {
  for (const [levelKey, levelConfig] of Object.entries(CONFIG.levels)) {
    if (levelConfig.features.includes(feature) && state.levels[levelKey].active) {
      return true;
    }
  }
  return false;
};

/**
 * Check if a specific level is active
 */
export const isLevelActive = (levelKey) => {
  return state.levels[levelKey]?.active ?? false;
};

/**
 * Get the reason why a level is not active
 */
export const getLevelBlockReason = (levelKey) => {
  const level = state.levels[levelKey];
  const config = CONFIG.levels[levelKey];

  if (!level || !config) return 'Invalid level';
  if (level.active) return null;

  const currentBalance = web3Service.state.balances.total;
  const needed = config.holdingRequired - currentBalance;

  return `Hold ${config.holdingRequired.toLocaleString()} BONZAI (need ${needed.toLocaleString()} more) or pay ${state.unlockPrice} ETH to unlock all levels`;
};

/**
 * Get unlock options for a level
 */
export const getLevelUnlockOptions = (levelKey) => {
  const config = CONFIG.levels[levelKey];
  if (!config) return null;

  const currentBalance = web3Service.state.balances.total;
  const { canUnlock, reason } = canUnlockWithEth();

  return {
    levelId: config.id,
    holdingRequired: config.holdingRequired,
    currentBalance,
    holdingNeeded: Math.max(0, config.holdingRequired - currentBalance),
    ethPrice: state.unlockPrice,
    canUnlockViaHolding: currentBalance >= config.holdingRequired,
    canUnlockViaEth: canUnlock,
    unlockBlockedReason: reason,
    allLevelsUnlocked: state.allLevelsUnlocked,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTED VALUES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the highest active level
 */
export const highestActiveLevel = computed(() => {
  const levelOrder = ['LVL6', 'LVL5', 'LVL4', 'LVL3', 'LVL2', 'LVL1'];
  for (const levelKey of levelOrder) {
    if (state.levels[levelKey].active) {
      return levelKey;
    }
  }
  return null;
});

/**
 * Get all active levels
 */
export const activeLevels = computed(() => {
  return Object.entries(state.levels)
    .filter(([_, status]) => status.active)
    .map(([key, _]) => key);
});

/**
 * Get overall progress (for progress bar)
 */
export const levelProgress = computed(() => {
  const activeCount = activeLevels.value.length;
  return (activeCount / 6) * 100;
});

/**
 * Get levels that could be unlocked (not yet active)
 */
export const inactiveLevels = computed(() => {
  return Object.entries(state.levels)
    .filter(([_, status]) => !status.active)
    .map(([key, _]) => key);
});

/**
 * Check if all levels are unlocked via ETH payment
 */
export const allUnlockedViaEth = computed(() => {
  return state.allLevelsUnlocked;
});

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL INFO HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get level configuration
 */
export const getLevelConfig = (levelKey) => {
  return CONFIG.levels[levelKey] || null;
};

/**
 * Get all levels with their status
 */
export const getAllLevelsWithStatus = computed(() => {
  return Object.entries(CONFIG.levels).map(([key, config]) => ({
    key,
    ...config,
    status: state.levels[key],
    unlockOptions: getLevelUnlockOptions(key),
  }));
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-COMPONENT COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request opening the level modal for a specific level
 * BonzaiBottomBar watches this and opens the modal when it changes
 * @param {number} levelNum - Level number 1-6
 */
export const requestOpenLevelModal = (levelNum) => {
  if (levelNum >= 1 && levelNum <= 6) {
    state.openLevelModalFor = levelNum;
  }
};

/**
 * Clear the open modal request (called after modal opens)
 */
export const clearOpenLevelModalRequest = () => {
  state.openLevelModalFor = null;
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const levelService = {
  state: readonly(state),

  // Level checking
  checkAllLevels,

  // ETH unlock (single 1 ETH payment for ALL levels)
  canUnlockWithEth,
  unlockAllWithEth,

  // Access verification
  canAccessFeature,
  isLevelActive,
  getLevelBlockReason,
  getLevelUnlockOptions,

  // Computed
  highestActiveLevel,
  activeLevels,
  levelProgress,
  inactiveLevels,
  allUnlockedViaEth,

  // Info helpers
  getLevelConfig,
  getAllLevelsWithStatus,

  // Cross-component communication
  requestOpenLevelModal,
  clearOpenLevelModalRequest,

  // Config reference
  CONFIG,
};

export default levelService;
