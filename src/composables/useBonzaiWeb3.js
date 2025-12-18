/**
 * BonzAI Web3 Composable
 * 
 * Easy-to-use composable for integrating Web3 level gating into
 * existing generative components (GenerativeText, GenerativeImage, etc.)
 */

import { computed, watch, onMounted } from 'vue';
import { useWeb3Store } from '../stores/web3.store.js';
import { CONFIG } from '../../config/web3.config.js';

/**
 * Main Web3 composable for BonzAI components
 * 
 * @param {Object} options
 * @param {string} options.requiredLevel - Level required for this component ('LVL1' - 'LVL5')
 * @param {string} options.feature - Specific feature to check access for
 * @param {boolean} options.autoInitialize - Auto-initialize on mount (default: true)
 * @returns {Object} Web3 state and methods
 * 
 * @example
 * // In GenerativeText.vue
 * const { hasAccess, isConnected, connect, blockReason } = useBonzaiWeb3({
 *   requiredLevel: 'LVL1'
 * });
 * 
 * // In GenerativeImage.vue
 * const { hasAccess, isConnected, connect, blockReason } = useBonzaiWeb3({
 *   requiredLevel: 'LVL3'
 * });
 */
export function useBonzaiWeb3(options = {}) {
  const {
    requiredLevel = null,
    feature = null,
    autoInitialize = true,
  } = options;
  
  const web3Store = useWeb3Store();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTED STATE
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Connection state
  const isConnected = computed(() => web3Store.isConnected);
  const isConnecting = computed(() => web3Store.isConnecting);
  const walletAddress = computed(() => web3Store.walletAddress);
  const truncatedAddress = computed(() => web3Store.truncatedAddress);
  const isOnArbitrum = computed(() => web3Store.isOnArbitrum);
  
  // Balance state
  const totalBalance = computed(() => web3Store.totalBalance);
  const balances = computed(() => web3Store.balances);
  
  // Level state
  const levels = computed(() => web3Store.levels);
  const activeLevels = computed(() => web3Store.activeLevels);
  const highestLevel = computed(() => web3Store.highestLevel);
  
  // Access check for required level
  const hasAccess = computed(() => {
    if (!isConnected.value) return false;
    
    if (requiredLevel) {
      return web3Store.isLevelActive(requiredLevel);
    }
    
    if (feature) {
      return web3Store.canAccess(feature);
    }
    
    return true; // No requirements specified
  });
  
  // Get reason why access is blocked
  const blockReason = computed(() => {
    if (!isConnected.value) {
      return 'Connect your wallet to access this feature';
    }
    
    if (requiredLevel && !web3Store.isLevelActive(requiredLevel)) {
      return web3Store.getLevelBlockReason(requiredLevel);
    }
    
    return null;
  });
  
  // Level config for the required level
  const levelConfig = computed(() => {
    if (!requiredLevel) return null;
    return CONFIG.levels[requiredLevel];
  });
  
  // Amount needed to meet holding requirement
  const amountNeeded = computed(() => {
    if (!levelConfig.value) return 0;
    const needed = levelConfig.value.holdingRequired - totalBalance.value;
    return Math.max(0, needed);
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Connect wallet
   */
  const connect = async () => {
    return web3Store.connect();
  };
  
  /**
   * Disconnect wallet
   */
  const disconnect = () => {
    web3Store.disconnect();
  };
  
  /**
   * Refresh balances and levels
   */
  const refresh = async () => {
    await web3Store.refreshAll();
  };
  
  /**
   * Switch to Arbitrum network
   */
  const switchToArbitrum = async () => {
    return web3Store.switchToArbitrum();
  };
  
  /**
   * Check if a specific level is active
   */
  const isLevelActive = (levelKey) => {
    return web3Store.isLevelActive(levelKey);
  };
  
  /**
   * Check if user can access a specific feature
   */
  const canAccessFeature = (featureName) => {
    return web3Store.canAccess(featureName);
  };
  
  /**
   * Stake NFT for a level
   */
  const stakeNft = async (levelKey) => {
    return web3Store.stakeNft(levelKey);
  };
  
  /**
   * Unstake NFT for a level
   */
  const unstakeNft = async (levelKey) => {
    return web3Store.unstakeNft(levelKey);
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  onMounted(async () => {
    if (autoInitialize) {
      await web3Store.initialize();
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════════════════════════
  
  return {
    // Connection state
    isConnected,
    isConnecting,
    walletAddress,
    truncatedAddress,
    isOnArbitrum,
    
    // Balance state
    totalBalance,
    balances,
    
    // Level state
    levels,
    activeLevels,
    highestLevel,
    
    // Access state
    hasAccess,
    blockReason,
    levelConfig,
    amountNeeded,
    
    // Methods
    connect,
    disconnect,
    refresh,
    switchToArbitrum,
    isLevelActive,
    canAccessFeature,
    stakeNft,
    unstakeNft,
    
    // Store reference (for advanced usage)
    store: web3Store,
    
    // Config
    CONFIG,
  };
}

/**
 * Create an access guard for a component
 * Returns a function that can be used to conditionally render or execute actions
 * 
 * @example
 * const guard = createAccessGuard('LVL3');
 * 
 * // In template
 * <button @click="guard(generateImage)" :disabled="!guard.hasAccess.value">
 *   Generate Image
 * </button>
 */
export function createAccessGuard(requiredLevel) {
  const { hasAccess, blockReason, connect, isConnected } = useBonzaiWeb3({
    requiredLevel,
    autoInitialize: false,
  });
  
  const guard = (action) => {
    if (!hasAccess.value) {
      console.warn(`[BonzAI] Access denied for ${requiredLevel}: ${blockReason.value}`);
      return false;
    }
    return typeof action === 'function' ? action() : true;
  };
  
  guard.hasAccess = hasAccess;
  guard.blockReason = blockReason;
  guard.isConnected = isConnected;
  guard.connect = connect;
  
  return guard;
}

/**
 * Level requirement constants for easy reference
 */
export const LEVELS = {
  TEXT: 'LVL1',
  AUDIO: 'LVL2',
  IMAGE: 'LVL3',
  VIDEO: 'LVL4',
  GAME: 'LVL5',
  TRAINING: 'LVL6',
};

/**
 * Feature names for access checking
 */
export const FEATURES = {
  // LVL1
  TEXT_GENERATION: 'text-generation',
  CHAT: 'chat',
  CODE_ASSISTANCE: 'code-assistance',
  
  // LVL2
  AUDIO_GENERATION: 'audio-generation',
  VOICE_SYNTHESIS: 'voice-synthesis',
  MUSIC_CREATION: 'music-creation',
  
  // LVL3
  IMAGE_GENERATION: 'image-generation',
  FLUX: 'flux',
  SDXL: 'sdxl',
  IMG2IMG: 'img2img',
  
  // LVL4
  VIDEO_GENERATION: 'video-generation',
  LTX: 'ltx',
  WAN: 'wan',
  HUNYUAN: 'hunyuan',
  
  // LVL5
  GAME_GENERATION: 'game-generation',
  GAMES_2D: '2d-games',
  GAMES_3D: '3d-games',
  P5JS: 'p5js',
  THREEJS: 'threejs',
  
  // LVL6
  MODEL_TRAINING: 'model-training',
  FINE_TUNING: 'fine-tuning',
  LEROBOT: 'lerobot',
};

export default useBonzaiWeb3;
