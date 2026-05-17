/**
 * BonzAI Level Service
 *
 * Manages the 6-tier level system with DUAL access paths:
 *
 * IMPORTANT: All AI generation is FREE. Levels ONLY gate MINTING content as NFTs.
 *
 * A level is ACTIVE when EITHER:
 *   1. User holds >= required BONZAI tokens on Ethereum
 *   OR
 *   2. User has paid 1 ETH one-time payment to unlock ALL levels via BonzaiUnlock
 *
 * Levels (BONZAI holding requirements):
 *   - LVL1: Mint Text NFTs (1,000 BONZAI or 1 ETH for all)
 *   - LVL2: Mint Audio NFTs (5,000 BONZAI or 1 ETH for all)
 *   - LVL3: Mint Image NFTs (10,000 BONZAI or 1 ETH for all)
 *   - LVL4: Mint Video NFTs (25,000 BONZAI or 1 ETH for all)
 *   - LVL5: Mint 3D NFTs (33,000 BONZAI or 1 ETH for all)
 *   - LVL6: Mint Training NFTs + Token Issuance (50,000 BONZAI or 1 ETH for all)
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// BonzaiUnlock contract ABI (1 ETH one-time payment unlocks all levels)
// Contract configured in web3.config.js on Ethereum
const BONZAI_UNLOCK_ABI = [
  // View functions
  'function unlockPrice() view returns (uint256)',
  'function hasUnlocked(address) view returns (bool)',
  'function isUnlocked(address user) view returns (bool)',
  'function totalPaidUnlocks() view returns (uint256)',
  'function totalGiftedUnlocks() view returns (uint256)',
  'function totalCollected() view returns (uint256)',
  'function getStats() view returns (uint256 totalPaidUnlocks, uint256 totalGiftedUnlocks, uint256 totalUnlocks, uint256 totalCollected, uint256 currentBalance, uint256 currentPrice)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function getBalance() view returns (uint256)',
  // State-changing functions
  'function unlock() payable',
  'function unlockFor(address recipient) payable',
  // Events
  'event Unlocked(address indexed user, address indexed paidBy, uint256 amount, uint256 timestamp)',
  'event UnlockPriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 timestamp)',
  'event ProceedsWithdrawn(address indexed foundationWallet, uint256 foundationAmount, address indexed liquidityWallet, uint256 liquidityAmount, uint256 timestamp)',
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

  // Cross-component modal control
  openNetworkModal: false,

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
    console.error('[Level] No registry address configured');
    return null;
  }

  if (withSigner) {
    // Get fresh browser provider and signer to ensure we're on the right network
    const browserProvider = await web3Service.getBrowserProvider();
    if (!browserProvider) {
      throw new Error('No wallet connected. Please connect your wallet first.');
    }

    const signer = await browserProvider.getSigner();
    return new ethers.Contract(registryAddress, BONZAI_UNLOCK_ABI, signer);
  }

  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(registryAddress, BONZAI_UNLOCK_ABI, provider);
};

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL CHECKING
// ═══════════════════════════════════════════════════════════════════════════

const checkHoldingRequirement = (levelKey) => {
  const levelConfig = CONFIG.levels[levelKey];
  if (!levelConfig) return false;

  const totalBalance = web3Service.state.balances.total;
  return totalBalance >= levelConfig.holdingRequired;
};

const checkEthUnlock = async (userAddress) => {
  try {
    const contract = await getUnlockContract();
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

const checkLevel = (levelKey, ethUnlocked) => {
  const levelConfig = CONFIG.levels[levelKey];
  if (!levelConfig) return { holdingMet: false, ethUnlocked: false, active: false };

  const holdingMet = checkHoldingRequirement(levelKey);
  const active = holdingMet || ethUnlocked;

  state.levels[levelKey] = { holdingMet, ethUnlocked, active };

  return { holdingMet, ethUnlocked, active };
};

export const checkAllLevels = async () => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) {
    console.warn('[Level] No wallet connected');
    return state.levels;
  }

  state.isLoading = true;
  state.error = null;

  try {
    await fetchContractInfo();

    const ethUnlocked = await checkEthUnlock(userAddress);
    state.allLevelsUnlocked = ethUnlocked;

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
    // getStats() returns: totalPaidUnlocks, totalGiftedUnlocks, totalUnlocks, totalCollected, currentBalance, currentPrice
    state.contractStats.totalUnlocks = Number(stats[2]); // totalUnlocks (index 2)
    state.contractStats.totalCollected = parseFloat(ethers.formatEther(stats[3])); // totalCollected (index 3)
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
    // The unlock contract is on Ethereum.
    const targetChainId = CONFIG.levelUnlock?.chainId || 1;
    const currentChainId = web3Service.state.currentChainId;

    if (currentChainId !== targetChainId) {
      onStatusChange?.('switching_network');

      const switchPromise = web3Service.switchNetwork('base');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Network switch timed out. Please switch to Ethereum manually in your wallet.')), 30000)
      );

      try {
        await Promise.race([switchPromise, timeoutPromise]);
      } catch (switchError) {
        throw new Error(`Please switch to Ethereum network in your wallet. ${switchError.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      if (web3Service.state.currentChainId !== targetChainId) {
        throw new Error('Failed to switch to Ethereum. Please switch manually in your wallet and try again.');
      }
    }

    const contract = await getUnlockContract(true);
    if (!contract) {
      throw new Error('BonzaiUnlock contract not configured');
    }

    const price = await contract.unlockPrice();

    onStatusChange?.('awaiting_payment');

    const txPromise = contract.unlock({ value: price });
    const txTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction request timed out (60s). Please check your wallet for a pending approval.')), 60000)
    );

    const tx = await Promise.race([txPromise, txTimeoutPromise]);

    onStatusChange?.('confirming');

    const receipt = await tx.wait();

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

export const canAccessFeature = (feature) => {
  for (const [levelKey, levelConfig] of Object.entries(CONFIG.levels)) {
    if (levelConfig.features.includes(feature) && state.levels[levelKey].active) {
      return true;
    }
  }
  return false;
};

export const isLevelActive = (levelKey) => {
  return state.levels[levelKey]?.active || false;
};

export const getLevelBlockReason = (levelKey) => {
  const level = state.levels[levelKey];
  const config = CONFIG.levels[levelKey];

  if (!level || !config) return 'Invalid level';
  if (level.active) return null;

  const currentBalance = web3Service.state.balances.total;
  const needed = config.holdingRequired - currentBalance;

  return `Hold ${config.holdingRequired.toLocaleString()} BONZAI (need ${needed.toLocaleString()} more) or pay ${state.unlockPrice} ETH to unlock all levels`;
};

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

export const highestActiveLevel = computed(() => {
  const levelOrder = ['LVL6', 'LVL5', 'LVL4', 'LVL3', 'LVL2', 'LVL1'];
  for (const levelKey of levelOrder) {
    if (state.levels[levelKey].active) {
      return levelKey;
    }
  }
  return null;
});

export const activeLevels = computed(() => {
  return Object.entries(state.levels)
    .filter(([_, status]) => status.active)
    .map(([key, _]) => key);
});

export const levelProgress = computed(() => {
  const activeCount = activeLevels.value.length;
  return (activeCount / 6) * 100;
});

export const inactiveLevels = computed(() => {
  return Object.entries(state.levels)
    .filter(([_, status]) => !status.active)
    .map(([key, _]) => key);
});

export const allUnlockedViaEth = computed(() => {
  return state.allLevelsUnlocked;
});

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL INFO HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export const getLevelConfig = (levelKey) => {
  return CONFIG.levels[levelKey] || null;
};

export const getAllLevelsWithStatus = computed(() => {
  return Object.entries(CONFIG.levels).map(([key, config]) => ({
    key,
    ...config,
    status: state.levels[key],
    unlockOptions: getLevelUnlockOptions(key),
  }));
});

// ═══════════════════════════════════════════════════════════════════════════
// MINT-LEVEL GATING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user can mint a specific content type.
 * Generation is FREE — this only gates minting content as NFTs.
 *
 * @param {string} inferenceType - 'text'|'audio'|'image'|'video'|'object'|'training'
 * @returns {{ canMint: boolean, levelRequired: string|null, reason: string|null }}
 */
export const canMintContentType = (inferenceType) => {
  const levelKey = CONFIG.mintLevels?.[inferenceType];
  if (!levelKey) return { canMint: true, levelRequired: null, reason: null };

  const levelStatus = state.levels[levelKey];
  if (levelStatus?.active) return { canMint: true, levelRequired: levelKey, reason: null };

  const config = CONFIG.levels[levelKey];
  if (!config) return { canMint: true, levelRequired: null, reason: null };

  const currentBalance = web3Service.state.balances.total;
  const needed = config.holdingRequired - currentBalance;

  return {
    canMint: false,
    levelRequired: levelKey,
    reason: `Hold ${config.holdingRequired.toLocaleString()} BONZAI (need ${Math.max(0, needed).toLocaleString()} more) or pay 1 ETH to unlock all levels`,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-COMPONENT COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════

// The active App.vue shell watches this and opens the modal when it changes.
export const requestOpenLevelModal = (levelNum) => {
  if (levelNum >= 1 && levelNum <= 6) {
    state.openLevelModalFor = levelNum;
  }
};

export const clearOpenLevelModalRequest = () => {
  state.openLevelModalFor = null;
};

export const requestOpenNetworkModal = () => {
  state.openNetworkModal = true;
};

export const clearOpenNetworkModalRequest = () => {
  state.openNetworkModal = false;
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

  // Mint-level gating
  canMintContentType,

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
  requestOpenNetworkModal,
  clearOpenNetworkModalRequest,

  // Config reference
  CONFIG,
};

export default levelService;
