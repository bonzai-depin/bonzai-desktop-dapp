/**
 * BonzAI Web3 Store (Pinia)
 * 
 * Central state management for Web3 functionality:
 * - Wallet connection state
 * - BONZAI balance aggregation
 * - Level status tracking
 * - Marketplace state
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { web3Service } from '../services/web3.service.js';
import { levelService } from '../services/level.service.js';
import { marketplaceService } from '../services/marketplace.service.js';
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
  
  // Marketplace
  const orderbook = computed(() => marketplaceService.state.orderbook);
  const predictionMarkets = computed(() => marketplaceService.state.predictionMarkets);
  const smartAgents = computed(() => marketplaceService.state.smartAgents);
  const tradeHistory = computed(() => marketplaceService.state.tradeHistory);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Initialize Web3 and all services
   */
  const initialize = async () => {
    if (isInitialized.value) return;
    
    try {
      // Initialize marketplace (loads mock data)
      await marketplaceService.initializeMarketplace();
      
      // Check if already connected (e.g., from previous session)
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
        // Check levels after connecting
        await refreshLevels();
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
  const disconnect = () => {
    web3Service.disconnectWallet();
    // Reset level state manually
    Object.keys(levelService.state.levels).forEach(key => {
      levelService.state.levels[key] = {
        holdingMet: false,
        nftOwned: false,
        nftStaked: false,
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
   * Stake NFT for a level
   */
  const stakeNft = async (levelKey) => {
    const result = await levelService.stakeNft(levelKey);
    if (result) await refreshLevels();
    return result;
  };
  
  /**
   * Unstake NFT for a level
   */
  const unstakeNft = async (levelKey) => {
    const result = await levelService.unstakeNft(levelKey);
    if (result) await refreshLevels();
    return result;
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETPLACE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const placeBid = (taskType, price, amount) => 
    marketplaceService.placeBid(taskType, price, amount);
    
  const placeAsk = (taskType, price, amount) => 
    marketplaceService.placeAsk(taskType, price, amount);
    
  const cancelOrder = (orderId) => 
    marketplaceService.cancelOrder(orderId);
    
  const takeOrder = (orderId) => 
    marketplaceService.takeOrder(orderId);
    
  const buyPredictionMarket = (marketId) => 
    marketplaceService.buyPredictionMarket(marketId);
    
  const buySmartAgent = (agentId) => 
    marketplaceService.buySmartAgent(agentId);
  
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
    
    // Balance getters
    balances,
    totalBalance,
    isLoadingBalances,
    
    // Level getters
    levels,
    activeLevels,
    highestLevel,
    levelProgress,
    isLoadingLevels,
    
    // Marketplace getters
    orderbook,
    predictionMarkets,
    smartAgents,
    tradeHistory,
    
    // Wallet actions
    initialize,
    connect,
    disconnect,
    refreshBalances,
    refreshLevels,
    refreshAll,
    switchToArbitrum,
    
    // Level actions
    canAccess,
    isLevelActive,
    getLevelBlockReason,
    stakeNft,
    unstakeNft,
    
    // Marketplace actions
    placeBid,
    placeAsk,
    cancelOrder,
    takeOrder,
    buyPredictionMarket,
    buySmartAgent,
    
    // Config
    CONFIG,
  };
});

export default useWeb3Store;
