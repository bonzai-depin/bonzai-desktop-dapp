/**
 * BonzAI Level Service
 * 
 * Manages the 5-tier level system:
 * - LVL1: Text Generation (99 BONZAI + LVL1 NFT staked)
 * - LVL2: Audio Generation (499 BONZAI + LVL2 NFT staked)
 * - LVL3: Image Generation (999 BONZAI + LVL3 NFT staked)
 * - LVL4: Video Generation (4999 BONZAI + LVL4 NFT staked)
 * - LVL5: Training (9999 BONZAI + LVL5 NFT staked)
 * 
 * A level is active when:
 * 1. User holds >= required BONZAI tokens (across Ethereum + Arbitrum)
 * 2. User owns the corresponding ERC1155 NFT
 * 3. User has staked that NFT in the staking contract
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
];

const STAKING_ABI = [
  'function stakedBalance(address account, uint256 tokenId) view returns (uint256)',
  'function stake(uint256 tokenId, uint256 amount)',
  'function unstake(uint256 tokenId, uint256 amount)',
  'function isStaked(address account, uint256 tokenId) view returns (bool)',
  'function getStakedTokens(address account) view returns (uint256[])',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Level status for each tier
  levels: {
    LVL1: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
    LVL2: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
    LVL3: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
    LVL4: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
    LVL5: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
    LVL6: { holdingMet: false, nftOwned: false, nftStaked: false, active: false },
  },
  
  // NFT balances
  nftBalances: {
    1: 0, // LVL1 NFT
    2: 0, // LVL2 NFT
    3: 0, // LVL3 NFT
    4: 0, // LVL4 NFT
    5: 0, // LVL5 NFT
    6: 0, // LVL6 NFT
  },
  
  // Staked amounts
  stakedAmounts: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  },
  
  // Loading states
  isLoading: false,
  lastCheck: null,
  
  // Error handling
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT INSTANCES
// ═══════════════════════════════════════════════════════════════════════════

let nftContract = null;
let stakingContract = null;

const initContracts = async () => {
  const provider = web3Service.getProvider('arbitrum');
  
  if (CONFIG.nft.address && CONFIG.nft.address !== ethers.ZeroAddress) {
    nftContract = new ethers.Contract(CONFIG.nft.address, ERC1155_ABI, provider);
  }
  
  if (CONFIG.nft.stakingContract && CONFIG.nft.stakingContract !== ethers.ZeroAddress) {
    stakingContract = new ethers.Contract(CONFIG.nft.stakingContract, STAKING_ABI, provider);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user meets holding requirement for a level
 */
const checkHoldingRequirement = (levelKey) => {
  const levelConfig = CONFIG.levels[levelKey];
  const totalBalance = web3Service.state.balances.total;
  return totalBalance >= levelConfig.holdingRequired;
};

/**
 * Check if user owns the NFT for a level
 */
const checkNftOwnership = async (levelKey, userAddress) => {
  const levelConfig = CONFIG.levels[levelKey];
  const tokenId = levelConfig.nftTokenId;
  
  // If contracts not deployed yet, return true (for development)
  if (!nftContract) {
    console.warn('[Level] NFT contract not deployed, bypassing NFT check');
    return true;
  }
  
  try {
    const balance = await nftContract.balanceOf(userAddress, tokenId);
    state.nftBalances[tokenId] = Number(balance);
    return Number(balance) > 0;
  } catch (e) {
    console.error(`[Level] NFT check failed for ${levelKey}:`, e);
    return false;
  }
};

/**
 * Check if user has staked the NFT for a level
 */
const checkNftStaked = async (levelKey, userAddress) => {
  const levelConfig = CONFIG.levels[levelKey];
  const tokenId = levelConfig.nftTokenId;
  
  // If staking contract not deployed yet, return true (for development)
  if (!stakingContract) {
    console.warn('[Level] Staking contract not deployed, bypassing staking check');
    return true;
  }
  
  try {
    const isStaked = await stakingContract.isStaked(userAddress, tokenId);
    if (isStaked) {
      const stakedAmount = await stakingContract.stakedBalance(userAddress, tokenId);
      state.stakedAmounts[tokenId] = Number(stakedAmount);
    }
    return isStaked;
  } catch (e) {
    console.error(`[Level] Staking check failed for ${levelKey}:`, e);
    return false;
  }
};

/**
 * Check all requirements for a single level
 */
const checkLevel = async (levelKey, userAddress) => {
  const holdingMet = checkHoldingRequirement(levelKey);
  const nftOwned = await checkNftOwnership(levelKey, userAddress);
  const nftStaked = await checkNftStaked(levelKey, userAddress);
  
  const active = holdingMet && nftOwned && nftStaked;
  
  state.levels[levelKey] = { holdingMet, nftOwned, nftStaked, active };
  
  return { holdingMet, nftOwned, nftStaked, active };
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
    await initContracts();
    
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

// ═══════════════════════════════════════════════════════════════════════════
// NFT STAKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stake NFT for a level
 */
export const stakeNft = async (levelKey) => {
  const levelConfig = CONFIG.levels[levelKey];
  const tokenId = levelConfig.nftTokenId;
  
  if (!stakingContract || !nftContract) {
    throw new Error('Contracts not initialized');
  }
  
  const signer = await web3Service.getSigner();
  const userAddress = await signer.getAddress();
  
  // Check if approved
  const isApproved = await nftContract.isApprovedForAll(userAddress, CONFIG.nft.stakingContract);
  if (!isApproved) {
    const nftWithSigner = nftContract.connect(signer);
    const approveTx = await nftWithSigner.setApprovalForAll(CONFIG.nft.stakingContract, true);
    await approveTx.wait();
  }
  
  // Stake the NFT
  const stakingWithSigner = stakingContract.connect(signer);
  const stakeTx = await stakingWithSigner.stake(tokenId, 1);
  await stakeTx.wait();
  
  // Refresh level status
  await checkLevel(levelKey, userAddress);
  
  return true;
};

/**
 * Unstake NFT for a level
 */
export const unstakeNft = async (levelKey) => {
  const levelConfig = CONFIG.levels[levelKey];
  const tokenId = levelConfig.nftTokenId;
  
  if (!stakingContract) {
    throw new Error('Staking contract not initialized');
  }
  
  const signer = await web3Service.getSigner();
  const userAddress = await signer.getAddress();
  
  const stakingWithSigner = stakingContract.connect(signer);
  const unstakeTx = await stakingWithSigner.unstake(tokenId, 1);
  await unstakeTx.wait();
  
  // Refresh level status
  await checkLevel(levelKey, userAddress);
  
  return true;
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user can access a specific feature
 */
export const canAccessFeature = (feature) => {
  // Find which level provides this feature
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
  
  if (!level) return 'Invalid level';
  
  const reasons = [];
  
  if (!level.holdingMet) {
    reasons.push(`Need ${config.holdingRequired} BONZAI (you have ${web3Service.state.balances.total.toFixed(0)})`);
  }
  if (!level.nftOwned) {
    reasons.push(`Need to own ${config.name} NFT`);
  }
  if (!level.nftStaked) {
    reasons.push(`Need to stake ${config.name} NFT`);
  }
  
  return reasons.length > 0 ? reasons.join(', ') : null;
};

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
  }));
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const levelService = {
  state: readonly(state),
  
  // Level checking
  checkAllLevels,
  
  // NFT operations
  stakeNft,
  unstakeNft,
  
  // Access verification
  canAccessFeature,
  isLevelActive,
  getLevelBlockReason,
  
  // Computed
  highestActiveLevel,
  activeLevels,
  levelProgress,
  
  // Info helpers
  getLevelConfig,
  getAllLevelsWithStatus,
  
  // Config reference
  CONFIG,
};

export default levelService;
