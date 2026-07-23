/**
 * BonzAI mint-level access.
 *
 * Generation is free. LVL1-LVL6 gate NFT minting and are derived exclusively
 * from the amount of BONZAI staked in the canonical economy-chain vault.
 */

import { computed, reactive, readonly } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { bonzaiStakingService } from './bonzaiStaking.service.js';

const emptyLevel = () => ({ holdingMet: false, stakeMet: false, ethUnlocked: false, active: false });

const state = reactive({
  levels: {
    LVL1: emptyLevel(), LVL2: emptyLevel(), LVL3: emptyLevel(),
    LVL4: emptyLevel(), LVL5: emptyLevel(), LVL6: emptyLevel(),
  },
  stakedAmount: 0,
  allLevelsUnlocked: false,
  unlockPrice: 0,
  isLoading: false,
  isUnlocking: false,
  lastCheck: null,
  error: null,
  openLevelModalFor: null,
  openNetworkModal: false,
  contractStats: { totalUnlocks: 0, totalCollected: 0, isPaused: true },
});

function resetLevels() {
  state.stakedAmount = 0;
  state.allLevelsUnlocked = false;
  for (const key of Object.keys(state.levels)) state.levels[key] = emptyLevel();
}

function updateLevels() {
  for (const [key, config] of Object.entries(CONFIG.levels)) {
    const stakeMet = state.stakedAmount >= Number(config.holdingRequired || 0);
    state.levels[key] = { holdingMet: stakeMet, stakeMet, ethUnlocked: false, active: stakeMet };
  }
}

export async function checkAllLevels() {
  const wallet = web3Service.state.walletAddress;
  if (!wallet) {
    resetLevels();
    return state.levels;
  }

  state.isLoading = true;
  state.error = null;
  try {
    const position = await bonzaiStakingService.fetchPosition(wallet);
    state.stakedAmount = Number(position?.amount || 0);
    updateLevels();
    state.lastCheck = Date.now();
  } catch (error) {
    resetLevels();
    state.error = error?.message || 'Unable to read BONZAI stake.';
  } finally {
    state.isLoading = false;
  }
  return state.levels;
}

export const canUnlockWithEth = () => ({
  canUnlock: false,
  reason: 'ETH unlocks are retired. Stake BONZAI to unlock minting levels.',
});

export async function unlockAllWithEth() {
  return { success: false, error: canUnlockWithEth().reason };
}

export function canAccessFeature(feature) {
  return Object.entries(CONFIG.levels).some(([key, config]) =>
    config.features.includes(feature) && state.levels[key].active,
  );
}

export const isLevelActive = (levelKey) => state.levels[levelKey]?.active || false;

export function getLevelBlockReason(levelKey) {
  const config = CONFIG.levels[levelKey];
  if (!config) return 'Invalid level';
  if (state.levels[levelKey]?.active) return null;
  const required = Number(config.holdingRequired || 0);
  return `Stake ${required.toLocaleString()} BONZAI (${Math.max(0, required - state.stakedAmount).toLocaleString()} more required)`;
}

export function getLevelUnlockOptions(levelKey) {
  const config = CONFIG.levels[levelKey];
  if (!config) return null;
  const required = Number(config.holdingRequired || 0);
  const needed = Math.max(0, required - state.stakedAmount);
  return {
    levelId: config.id,
    holdingRequired: required,
    currentBalance: state.stakedAmount,
    holdingNeeded: needed,
    stakedAmount: state.stakedAmount,
    stakingNeeded: needed,
    canUnlockViaHolding: false,
    canUnlockViaStaking: needed === 0,
    canUnlockViaEth: false,
    unlockBlockedReason: canUnlockWithEth().reason,
    allLevelsUnlocked: false,
  };
}

export const highestActiveLevel = computed(() =>
  ['LVL6', 'LVL5', 'LVL4', 'LVL3', 'LVL2', 'LVL1'].find((key) => state.levels[key].active) || null,
);
export const activeLevels = computed(() => Object.keys(state.levels).filter((key) => state.levels[key].active));
export const inactiveLevels = computed(() => Object.keys(state.levels).filter((key) => !state.levels[key].active));
export const levelProgress = computed(() => (activeLevels.value.length / 6) * 100);
export const allUnlockedViaEth = computed(() => false);
export const getLevelConfig = (levelKey) => CONFIG.levels[levelKey] || null;
export const getAllLevelsWithStatus = computed(() => Object.entries(CONFIG.levels).map(([key, config]) => ({
  key,
  ...config,
  status: state.levels[key],
  unlockOptions: getLevelUnlockOptions(key),
})));

export function canMintContentType(inferenceType) {
  const levelKey = CONFIG.mintLevels?.[inferenceType];
  if (!levelKey) return { canMint: true, levelRequired: null, reason: null };
  if (state.levels[levelKey]?.active) return { canMint: true, levelRequired: levelKey, reason: null };
  return { canMint: false, levelRequired: levelKey, reason: getLevelBlockReason(levelKey) };
}

export function requestOpenLevelModal(levelNum) {
  if (levelNum >= 1 && levelNum <= 6) state.openLevelModalFor = levelNum;
}
export const clearOpenLevelModalRequest = () => { state.openLevelModalFor = null; };
export const requestOpenNetworkModal = () => { state.openNetworkModal = true; };
export const clearOpenNetworkModalRequest = () => { state.openNetworkModal = false; };

export const levelService = {
  state: readonly(state),
  checkAllLevels,
  canUnlockWithEth,
  unlockAllWithEth,
  canAccessFeature,
  isLevelActive,
  getLevelBlockReason,
  getLevelUnlockOptions,
  canMintContentType,
  highestActiveLevel,
  activeLevels,
  inactiveLevels,
  levelProgress,
  allUnlockedViaEth,
  getLevelConfig,
  getAllLevelsWithStatus,
  requestOpenLevelModal,
  clearOpenLevelModalRequest,
  requestOpenNetworkModal,
  clearOpenNetworkModalRequest,
  CONFIG,
};

export default levelService;
