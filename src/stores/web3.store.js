/**
 * BonzAI Web3 Store (Pinia)
 *
 * Manages wallet connection, balances, and level access.
 * 
 * Level Access: Users can unlock levels via:
 *   1. HOLDING the required BONZAI tokens (free access while holding)
 *   2. PAYING 0.1 ETH per level (permanent unlock)
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { ethers } from 'ethers';

import { web3Service } from '../services/web3.service.js';
import { levelService } from '../services/level.service.js';
import { agentService } from '../services/agent.service.js';
import { CONFIG } from '../config/web3.config.js';

export const useWeb3Store = defineStore('web3', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const isInitialized = ref(false);
  const isConnecting = ref(false);
  const error = ref(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS (COMPUTED)
  // ═══════════════════════════════════════════════════════════════════════════

  // Wallet state
  const isConnected = computed(() => web3Service.state.isConnected);
  const walletAddress = computed(() => web3Service.state.walletAddress);
  const truncatedAddress = computed(() => web3Service.truncatedAddress.value);
  const currentChainId = computed(() => web3Service.state.currentChainId);
  const isOnArbitrum = computed(() => web3Service.isOnArbitrum.value);
  const networkName = computed(() => web3Service.currentNetworkName.value);

  // Authentication state (JWT)
  const isAuthenticated = computed(() => web3Service.state.isAuthenticated);
  const authLevel = computed(() => web3Service.state.authLevel);
  const authLevelValue = computed(() => web3Service.state.authLevelValue);

  // Balances
  const balances = computed(() => web3Service.state.balances);
  const totalBalance = computed(() => web3Service.state.balances.total);
  const isLoadingBalances = computed(() => web3Service.state.isLoadingBalances);

  // Levels
  const levels = computed(() => levelService.state.levels);
  const activeLevels = computed(() => levelService.activeLevels.value);
  const highestLevel = computed(() => levelService.highestActiveLevel.value);
  const levelProgress = computed(() => levelService.levelProgress.value);
  const isLoadingLevels = computed(() => levelService.state.isLoading);
  const isUnlockingLevel = computed(() => levelService.state.isUnlocking);

  // Level prices (from contract or config)
  const levelPrices = computed(() => levelService.state.prices);

  // Current level helpers
  const currentLevelKey = computed(() => highestLevel.value || 'LVL0');
  const currentLevel = computed(() => {
    const key = (highestLevel.value || '').toString().trim();
    if (!key) return 0;
    const m = key.match(/LVL\s*(\d+)/i);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : 0;
  });
  const currentLevelLabel = computed(() => `LVL${currentLevel.value}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize Web3 and all services
   */
  const initialize = async () => {
    if (isInitialized.value) return;

    try {
      // Initialize agent service
      agentService.initialize();

      // Attempt auto-connect (injected wallets only)
      if (typeof window !== 'undefined' && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          await connect();
        }
      }

      isInitialized.value = true;
    } catch (e) {
      console.error('[Web3Store] Initialization error:', e);
      error.value = e.message;
    }
  };

  /**
   * Connect wallet
   */
  const connect = async () => {
    isConnecting.value = true;
    error.value = null;

    try {
      const result = await web3Service.connectWallet();

      if (result.success) {
        await refreshAll();
      } else {
        error.value = result.error;
      }

      return result;
    } catch (e) {
      error.value = e.message;
      return { success: false, error: e.message };
    } finally {
      isConnecting.value = false;
    }
  };

  /**
   * Disconnect wallet
   */
  const disconnect = async () => {
    await web3Service.disconnectWallet();

    // Reset level state
    Object.keys(levelService.state.levels).forEach((key) => {
      levelService.state.levels[key] = {
        holdingMet: false,
        ethUnlocked: false,
        active: false,
      };
    });
  };

  /**
   * Refresh balances
   */
  const refreshBalances = async () => {
    await web3Service.fetchAllBalances();
  };

  /**
   * Refresh level status
   */
  const refreshLevels = async () => {
    await levelService.checkAllLevels();
  };

  /**
   * Refresh everything
   */
  const refreshAll = async () => {
    await refreshBalances();
    await refreshLevels();
  };

  /**
   * Switch to Arbitrum network
   */
  const switchToArbitrum = async () => {
    return web3Service.switchToArbitrum();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL ACCESS ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Unlock a level by paying ETH
   * @param {number} levelId - Level to unlock (1-6)
   */
  const unlockLevel = async (levelId) => {
    const result = await levelService.unlockLevelWithEth(levelId);
    if (result.success) {
      await refreshLevels();
    }
    return result;
  };

  /**
   * Unlock multiple levels by paying ETH
   * @param {number[]} levelIds - Levels to unlock
   */
  const unlockLevels = async (levelIds) => {
    const result = await levelService.unlockLevelsWithEth(levelIds);
    if (result.success) {
      await refreshLevels();
    }
    return result;
  };

  /**
   * Unlock ALL levels at discounted bulk price
   */
  const unlockAllLevels = async () => {
    const result = await levelService.unlockAllLevelsWithEth();
    if (result.success) {
      await refreshLevels();
    }
    return result;
  };

  /**
   * Mint a Level NFT
   * @param {number} levelId - Level to mint (1-6)
   */
  const mintLevelNFT = async (levelId) => {
    const result = await levelService.mintLevelNFT(levelId);
    if (result.success) {
      await refreshLevels();
    }
    return result;
  };

  /**
   * Get NFT price for a level
   * @param {number} levelId - Level (1-6)
   */
  const getNFTPrice = (levelId) => {
    return levelService.getNFTPrice(levelId);
  };

  /**
   * Get remaining NFT supply for a level
   * @param {number} levelId - Level (1-6)
   */
  const getNFTRemainingSupply = (levelId) => {
    return levelService.getNFTRemainingSupply(levelId);
  };

  /**
   * Check if user can access a feature
   */
  const canAccess = (feature) => {
    return levelService.canAccessFeature(feature);
  };

  /**
   * Check if a specific level is active
   */
  const isLevelActive = (levelKey) => {
    return levelService.isLevelActive(levelKey);
  };

  /**
   * Get reason why level is blocked
   */
  const getLevelBlockReason = (levelKey) => {
    return levelService.getLevelBlockReason(levelKey);
  };

  /**
   * Get unlock options for a level
   */
  const getLevelUnlockOptions = (levelKey) => {
    return levelService.getLevelUnlockOptions(levelKey);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if user has purchased an agent
   */
  const hasAgentPurchased = (agentId) => {
    return agentService.hasPurchasedAgent(agentId);
  };

  /**
   * Purchase an agent
   */
  const purchaseAgent = async (agentId) => {
    return agentService.purchaseAgent(agentId);
  };

  /**
   * Check if user has enough BONZAI for running fee
   */
  const hasEnoughForAgentFee = () => {
    return agentService.hasEnoughForRunningFee();
  };

  /**
   * Execute agent with automatic fee payment
   */
  const executeAgent = async (agent, inputs, context) => {
    const result = await agentService.executeAgentWithFee(agent, inputs, context);
    // Refresh balances after fee payment
    if (result.success || result.feePaid) {
      await refreshBalances();
    }
    return result;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCHERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Auto-refresh levels when balance changes
  watch(totalBalance, async (newBalance, oldBalance) => {
    if (newBalance !== oldBalance && isConnected.value) {
      await refreshLevels();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // State
    isInitialized,
    isConnecting,
    error,

    // Wallet getters
    isConnected,
    walletAddress,
    truncatedAddress,
    currentChainId,
    isOnArbitrum,
    networkName,

    // Authentication getters
    isAuthenticated,
    authLevel,
    authLevelValue,

    // Balance getters
    balances,
    totalBalance,
    isLoadingBalances,

    // Level getters
    levels,
    activeLevels,
    highestLevel,
    currentLevel,
    currentLevelKey,
    currentLevelLabel,
    levelProgress,
    isLoadingLevels,
    isUnlockingLevel,
    levelPrices,

    // Wallet actions
    initialize,
    connect,
    disconnect,
    refreshBalances,
    refreshLevels,
    refreshAll,
    switchToArbitrum,

    // Level actions
    unlockLevel,
    unlockLevels,
    unlockAllLevels,
    canAccess,
    isLevelActive,
    getLevelBlockReason,
    getLevelUnlockOptions,

    // NFT minting
    mintLevelNFT,
    getNFTPrice,
    getNFTRemainingSupply,

    // Agent actions
    hasAgentPurchased,
    purchaseAgent,
    hasEnoughForAgentFee,
    executeAgent,

    // Config
    CONFIG,
  };
});

export default useWeb3Store;
