/**
 * BonzAI Level Service
 * 
 * Manages the 6-tier level system with DUAL access paths:
 * 
 * A level is ACTIVE when EITHER:
 *   1. User holds >= required BONZAI tokens (across Ethereum + Arbitrum)
 *   OR
 *   2. User has paid 0.1 ETH to unlock the level via BonzaiLevelRegistry
 * 
 * Levels:
 *   - LVL1: Text Generation (100 BONZAI or 0.1 ETH)
 *   - LVL2: Audio Generation (500 BONZAI or 0.1 ETH)
 *   - LVL3: Image Generation (2,000 BONZAI or 0.1 ETH)
 *   - LVL4: Video Generation (10,000 BONZAI or 0.1 ETH)
 *   - LVL5: Game Generation (50,000 BONZAI or 0.1 ETH)
 *   - LVL6: Training (200,000 BONZAI or 0.1 ETH)
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const LEVEL_REGISTRY_ABI = [
  'function hasUnlockedLevel(address user, uint8 level) view returns (bool)',
  'function getUserUnlockedLevels(address user) view returns (bool[6])',
  'function getHighestUnlockedLevel(address user) view returns (uint8)',
  'function getNextUnlockableLevel(address user) view returns (uint8)',
  'function canUnlockLevel(address user, uint8 level) view returns (bool canUnlock, string reason)',
  'function calculateCostToLevel(address user, uint8 targetLevel) view returns (uint256 cost, uint8 levelsToUnlock)',
  'function levelPrice() view returns (uint256)',
  'function bulkPrice() view returns (uint256)',
  'function buybackPercentage() view returns (uint256)',
  'function buybackEnabled() view returns (bool)',
  'function getBuybackConfig() view returns (bool enabled, uint256 percentage, uint256 minOut, uint256 totalBought)',
  'function unlockLevel(uint8 level) payable',
  'function unlockLevelRange(uint8 fromLevel, uint8 toLevel) payable',
  'function unlockAllLevels() payable',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Level status for each tier
  levels: {
    LVL1: { holdingMet: false, ethUnlocked: false, active: false },
    LVL2: { holdingMet: false, ethUnlocked: false, active: false },
    LVL3: { holdingMet: false, ethUnlocked: false, active: false },
    LVL4: { holdingMet: false, ethUnlocked: false, active: false },
    LVL5: { holdingMet: false, ethUnlocked: false, active: false },
    LVL6: { holdingMet: false, ethUnlocked: false, active: false },
  },
  
  // ETH unlock prices (fetched from contract)
  prices: {
    perLevel: 0.1,  // ETH
    bulk: 0.4,      // ETH for all 6
  },
  
  // Sequential unlock: next level that can be unlocked via ETH
  nextUnlockableLevel: 1,
  
  // Buyback configuration (fetched from contract)
  buyback: {
    enabled: true,
    percentage: 2000, // basis points (20%)
    minBonzaiOut: 0,
    totalBonzaiBought: 0,
  },
  
  // Loading states
  isLoading: false,
  isUnlocking: false,
  lastCheck: null,
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let registryContract = null;

const getRegistryContract = async (withSigner = false) => {
  const registryAddress = CONFIG.levelUnlock?.registryAddress;
  
  if (!registryAddress || registryAddress === ethers.ZeroAddress) {
    return null;
  }
  
  if (withSigner) {
    const signer = await web3Service.getSigner();
    return new ethers.Contract(registryAddress, LEVEL_REGISTRY_ABI, signer);
  }
  
  const provider = web3Service.getProvider('arbitrum');
  return new ethers.Contract(registryAddress, LEVEL_REGISTRY_ABI, provider);
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
 * Check if user has PAID to unlock a level via ETH
 */
const checkEthUnlock = async (levelId, userAddress) => {
  try {
    const contract = await getRegistryContract();
    
    // If contract not deployed, ETH unlock not available
    if (!contract) {
      return false;
    }
    
    const unlocked = await contract.hasUnlockedLevel(userAddress, levelId);
    return unlocked;
  } catch (e) {
    console.warn(`[Level] ETH unlock check failed for LVL${levelId}:`, e.message);
    return false;
  }
};

/**
 * Check all requirements for a single level
 * Level is ACTIVE if holdingMet OR ethUnlocked
 */
const checkLevel = async (levelKey, userAddress) => {
  const levelConfig = CONFIG.levels[levelKey];
  if (!levelConfig) return { holdingMet: false, ethUnlocked: false, active: false };
  
  const holdingMet = checkHoldingRequirement(levelKey);
  const ethUnlocked = await checkEthUnlock(levelConfig.id, userAddress);
  
  // Active if EITHER condition is met
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
    // Fetch prices from contract if available
    await fetchPrices();
    
    // Check all levels in parallel
    await Promise.all([
      checkLevel('LVL1', userAddress),
      checkLevel('LVL2', userAddress),
      checkLevel('LVL3', userAddress),
      checkLevel('LVL4', userAddress),
      checkLevel('LVL5', userAddress),
      checkLevel('LVL6', userAddress),
    ]);
    
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
 * Fetch current prices and buyback config from contract
 */
const fetchPrices = async () => {
  try {
    const contract = await getRegistryContract();
    if (!contract) {
      // Use config defaults
      state.prices.perLevel = parseFloat(CONFIG.levelUnlock?.pricePerLevel || '0.1');
      state.prices.bulk = parseFloat(CONFIG.levelUnlock?.bulkPrice || '0.4');
      state.buyback.percentage = CONFIG.buyback?.percentage || 2000;
      state.buyback.enabled = CONFIG.buyback?.enabled ?? true;
      return;
    }
    
    const userAddress = web3Service.state.walletAddress;
    
    // Fetch all config in parallel
    const [levelPrice, bulkPrice, buybackConfig, nextLevel] = await Promise.all([
      contract.levelPrice(),
      contract.bulkPrice(),
      contract.getBuybackConfig(),
      userAddress ? contract.getNextUnlockableLevel(userAddress) : Promise.resolve(1),
    ]);
    
    state.prices.perLevel = parseFloat(ethers.formatEther(levelPrice));
    state.prices.bulk = parseFloat(ethers.formatEther(bulkPrice));
    
    // Buyback config: [enabled, percentage, minOut, totalBought]
    state.buyback.enabled = buybackConfig[0];
    state.buyback.percentage = Number(buybackConfig[1]);
    state.buyback.minBonzaiOut = Number(buybackConfig[2]);
    state.buyback.totalBonzaiBought = Number(ethers.formatEther(buybackConfig[3]));
    
    state.nextUnlockableLevel = Number(nextLevel);
  } catch (e) {
    console.warn('[Level] Failed to fetch prices:', e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ETH UNLOCK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a level can be unlocked (sequential requirement)
 * @param {number} levelId - Level to check (1-6)
 * @returns {{ canUnlock: boolean, reason: string | null }}
 */
export const canUnlockLevel = (levelId) => {
  const levelKey = `LVL${levelId}`;
  const levelStatus = state.levels[levelKey];
  
  if (!levelStatus) {
    return { canUnlock: false, reason: 'Invalid level' };
  }
  
  if (levelStatus.ethUnlocked) {
    return { canUnlock: false, reason: 'Already unlocked' };
  }
  
  // Check sequential requirement
  if (levelId > 1) {
    const prevLevelKey = `LVL${levelId - 1}`;
    const prevLevelStatus = state.levels[prevLevelKey];
    if (!prevLevelStatus?.ethUnlocked) {
      return { 
        canUnlock: false, 
        reason: `Unlock LVL${levelId - 1} first` 
      };
    }
  }
  
  return { canUnlock: true, reason: null };
};

/**
 * Get the next level that can be unlocked via ETH
 * @returns {number} Next unlockable level (1-6), or 0 if all unlocked
 */
export const getNextUnlockableLevel = () => {
  for (let lvl = 1; lvl <= 6; lvl++) {
    const levelKey = `LVL${lvl}`;
    if (!state.levels[levelKey]?.ethUnlocked) {
      return lvl;
    }
  }
  return 0; // All unlocked
};

/**
 * Unlock a single level by paying ETH
 * @param {number} levelId - Level to unlock (1-6)
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
export const unlockLevelWithEth = async (levelId) => {
  // Validate sequential requirement
  const { canUnlock, reason } = canUnlockLevel(levelId);
  if (!canUnlock) {
    return { success: false, error: reason };
  }
  
  state.isUnlocking = true;
  
  try {
    const contract = await getRegistryContract(true);
    if (!contract) {
      throw new Error('Level registry contract not configured');
    }
    
    const price = await contract.levelPrice();
    
    const tx = await contract.unlockLevel(levelId, { value: price });
    const receipt = await tx.wait();
    
    // Refresh level status
    const userAddress = web3Service.state.walletAddress;
    await checkLevel(`LVL${levelId}`, userAddress);
    
    // Update next unlockable level
    state.nextUnlockableLevel = getNextUnlockableLevel();
    
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    console.error('[Level] Unlock failed:', error);
    return { success: false, error };
  } finally {
    state.isUnlocking = false;
  }
};

/**
 * Unlock a range of sequential levels by paying ETH
 * @param {number} fromLevel - Starting level (1-6)
 * @param {number} toLevel - Ending level (1-6, inclusive)
 */
export const unlockLevelRangeWithEth = async (fromLevel, toLevel) => {
  // Validate range
  if (fromLevel < 1 || toLevel > 6 || fromLevel > toLevel) {
    return { success: false, error: 'Invalid level range' };
  }
  
  // Check sequential requirement for starting level
  if (fromLevel > 1) {
    const prevLevelKey = `LVL${fromLevel - 1}`;
    if (!state.levels[prevLevelKey]?.ethUnlocked) {
      return { 
        success: false, 
        error: `Unlock LVL${fromLevel - 1} first` 
      };
    }
  }
  
  state.isUnlocking = true;
  
  try {
    const contract = await getRegistryContract(true);
    if (!contract) {
      throw new Error('Level registry contract not configured');
    }
    
    const userAddress = web3Service.state.walletAddress;
    const [cost, count] = await contract.calculateCostToLevel(userAddress, toLevel);
    
    if (count === 0) {
      return { success: false, error: 'Nothing to unlock' };
    }
    
    const tx = await contract.unlockLevelRange(fromLevel, toLevel, { value: cost });
    const receipt = await tx.wait();
    
    // Refresh all levels
    await checkAllLevels();
    
    return { success: true, txHash: receipt.hash, levelsUnlocked: Number(count) };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    console.error('[Level] Range unlock failed:', error);
    return { success: false, error };
  } finally {
    state.isUnlocking = false;
  }
};

/**
 * Unlock multiple levels by paying ETH (convenience wrapper)
 * @param {number[]} levelIds - Levels to unlock (must be sequential)
 * @deprecated Use unlockLevelRangeWithEth instead
 */
export const unlockLevelsWithEth = async (levelIds) => {
  if (!levelIds.length) {
    return { success: false, error: 'No levels specified' };
  }
  
  const sorted = [...levelIds].sort((a, b) => a - b);
  const fromLevel = sorted[0];
  const toLevel = sorted[sorted.length - 1];
  
  return unlockLevelRangeWithEth(fromLevel, toLevel);
};

/**
 * Unlock ALL levels at discounted bulk price
 */
export const unlockAllLevelsWithEth = async () => {
  state.isUnlocking = true;
  
  try {
    const contract = await getRegistryContract(true);
    if (!contract) {
      throw new Error('Level registry contract not configured');
    }
    
    const bulkPrice = await contract.bulkPrice();
    
    const tx = await contract.unlockAllLevels({ value: bulkPrice });
    const receipt = await tx.wait();
    
    // Refresh all levels
    await checkAllLevels();
    
    return { success: true, txHash: receipt.hash };
  } catch (e) {
    const error = e.shortMessage || e.message || String(e);
    console.error('[Level] Bulk unlock failed:', error);
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
  
  return `Hold ${config.holdingRequired.toLocaleString()} BONZAI (need ${needed.toLocaleString()} more) or pay ${state.prices.perLevel} ETH to unlock`;
};

/**
 * Get unlock options for a level
 */
export const getLevelUnlockOptions = (levelKey) => {
  const config = CONFIG.levels[levelKey];
  if (!config) return null;
  
  const levelId = config.id;
  const currentBalance = web3Service.state.balances.total;
  const { canUnlock, reason } = canUnlockLevel(levelId);
  
  return {
    levelId,
    holdingRequired: config.holdingRequired,
    currentBalance,
    holdingNeeded: Math.max(0, config.holdingRequired - currentBalance),
    ethPrice: state.prices.perLevel,
    canUnlockViaHolding: currentBalance >= config.holdingRequired,
    canUnlockViaEth: canUnlock,
    unlockBlockedReason: reason,
    isNextUnlockable: levelId === state.nextUnlockableLevel,
    buybackPercentage: state.buyback.percentage / 100, // Convert to percentage
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
 * Get levels that could be unlocked via ETH (not yet unlocked, not met via holding)
 */
export const unlockableLevels = computed(() => {
  return Object.entries(state.levels)
    .filter(([_, status]) => !status.active && !status.ethUnlocked)
    .map(([key, _]) => key);
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
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const levelService = {
  state: readonly(state),
  
  // Level checking
  checkAllLevels,
  
  // Sequential unlock helpers
  canUnlockLevel,
  getNextUnlockableLevel,
  
  // ETH unlock
  unlockLevelWithEth,
  unlockLevelRangeWithEth,
  unlockLevelsWithEth,
  unlockAllLevelsWithEth,
  
  // Access verification
  canAccessFeature,
  isLevelActive,
  getLevelBlockReason,
  getLevelUnlockOptions,
  
  // Computed
  highestActiveLevel,
  activeLevels,
  levelProgress,
  unlockableLevels,
  
  // Info helpers
  getLevelConfig,
  getAllLevelsWithStatus,
  
  // Config reference
  CONFIG,
};

export default levelService;
