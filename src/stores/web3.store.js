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
import * as authService from '../services/auth.service.js';
import { CONFIG } from '../config/web3.config.js';

export const useWeb3Store = defineStore('web3', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const isInitialized = ref(false);
  const isConnecting = ref(false);
  const error = ref(null);
  let connectionAttempt = 0;

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
  const authProvider = computed(() => web3Service.state.authProvider); // 'reown' | 'privy' | null

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

  const connect = async () => {
    const attempt = ++connectionAttempt;
    isConnecting.value = true;
    error.value = null;

    try {
      const result = await web3Service.connectWallet();

      if (result.success) {
        await refreshAll();
      } else {
        if (attempt === connectionAttempt) error.value = result.error;
      }

      return result;
    } catch (e) {
      if (attempt === connectionAttempt) error.value = e.message;
      return { success: false, error: e.message };
    } finally {
      if (attempt === connectionAttempt) isConnecting.value = false;
    }
  };

  const connectWithPrivy = async (options = {}) => {
    if (options.signal?.aborted) return { success: false, cancelled: true, error: 'Sign-in cancelled' };
    const attempt = ++connectionAttempt;
    const cancel = () => {
      if (attempt !== connectionAttempt) return;
      connectionAttempt++;
      isConnecting.value = false;
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    isConnecting.value = true;
    error.value = null;
    try {
      const result = await web3Service.connectWithPrivy(options);
      if (attempt === connectionAttempt) {
        // The service already staged balances before committing the session.
        // Level reads must not keep a cancellable sign-in open after that commit.
        if (result.success) refreshLevels().catch(e => console.warn('[Web3Store] Level refresh failed:', e.message));
        else if (!result.cancelled && result.error) error.value = result.error;
      }
      return result;
    } catch (e) {
      if (attempt === connectionAttempt) error.value = e.message;
      return { success: false, error: e.message };
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      if (attempt === connectionAttempt) isConnecting.value = false;
    }
  };

  const cancelConnection = async () => {
    isConnecting.value = false;
    error.value = null;
    await disconnect();
  };

  const disconnect = async () => {
    connectionAttempt++;
    isConnecting.value = false;
    await web3Service.disconnectWallet();

    Object.keys(levelService.state.levels).forEach((key) => {
      levelService.state.levels[key] = {
        holdingMet: false,
        ethUnlocked: false,
        active: false,
      };
    });
  };

  const refreshBalances = async () => {
    await web3Service.fetchAllBalances();

    // Ensure Flask JWT is valid (not needed for Privy users)
    if (isConnected.value && web3Service.state.authProvider !== 'privy' && !authService.isAuthenticated()) {
      try {
        await authService.refreshToken();
      } catch {
        try {
          await authService.reAuthenticate();
        } catch { /* */ }
      }
    }
  };

  const refreshLevels = async () => {
    await levelService.checkAllLevels();
  };

  const refreshAll = async () => {
    await refreshBalances();
    await refreshLevels();
  };

  const switchToArbitrum = async () => {
    return web3Service.switchToArbitrum();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL ACCESS ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const unlockAllLevels = async () => {
    const result = await levelService.unlockAllWithEth();
    if (result.success) {
      await refreshLevels();
    }
    return result;
  };


  const getNFTPrice = (levelId) => {
    return levelService.getNFTPrice(levelId);
  };

  const getNFTRemainingSupply = (levelId) => {
    return levelService.getNFTRemainingSupply(levelId);
  };

  const canAccess = (feature) => {
    return levelService.canAccessFeature(feature);
  };

  const isLevelActive = (levelKey) => {
    return levelService.isLevelActive(levelKey);
  };

  const getLevelBlockReason = (levelKey) => {
    return levelService.getLevelBlockReason(levelKey);
  };

  const getLevelUnlockOptions = (levelKey) => {
    return levelService.getLevelUnlockOptions(levelKey);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const hasAgentPurchased = (agentId) => {
    return agentService.hasPurchasedAgent(agentId);
  };

  const purchaseAgent = async (agentId) => {
    return agentService.purchaseAgent(agentId);
  };

  const hasEnoughForAgentFee = () => {
    return agentService.hasEnoughForRunningFee();
  };

  const executeAgent = async (agent, inputs, context) => {
    const result = await agentService.executeAgentWithFee(agent, inputs, context);
    if (result.success || result.feePaid) {
      await refreshBalances();
    }
    return result;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCHERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Auto-refresh levels when balance changes (debounced to avoid RPC spam)
  let levelRefreshTimer = null;
  watch(totalBalance, (newBalance, oldBalance) => {
    if (newBalance !== oldBalance && isConnected.value) {
      clearTimeout(levelRefreshTimer);
      levelRefreshTimer = setTimeout(() => refreshLevels(), 2000);
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
    authProvider,

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
    connectWithPrivy,
    disconnect,
    cancelConnection,
    refreshBalances,
    refreshLevels,
    refreshAll,
    switchToArbitrum,

    // Level actions
    unlockAllLevels,
    canAccess,
    isLevelActive,
    getLevelBlockReason,
    getLevelUnlockOptions,

    // NFT minting
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
