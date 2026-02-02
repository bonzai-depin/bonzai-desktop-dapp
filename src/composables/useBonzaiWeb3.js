/**
 * BonzAI Web3 Composable
 *
 * Easy integration for Vue components:
 *
 * ```vue
 * const { hasAccess, isConnected, connect } = useBonzaiWeb3({
 *   requiredLevel: 'LVL3'
 * });
 * ```
 *
 * Level access is granted when EITHER:
 *   - User holds >= required BONZAI tokens
 *   - User has paid 0.1 ETH to unlock the level
 */

import { computed, onMounted } from "vue";
import { useWeb3Store } from "../stores/web3.store.js";
import { CONFIG } from "../config/web3.config.js";

/**
 * Level key constants
 */
export const LEVELS = {
  TEXT: "LVL1",
  AUDIO: "LVL2",
  IMAGE: "LVL3",
  VIDEO: "LVL4",
  GAME: "LVL5",
  TRAINING: "LVL6",
};

/**
 * Feature constants for granular access checks
 */
export const FEATURES = {
  // LVL1
  TEXT_GENERATION: "text-generation",
  CHAT: "chat",
  CODE_ASSISTANCE: "code-assistance",

  // LVL2
  AUDIO_GENERATION: "audio-generation",
  VOICE_SYNTHESIS: "voice-synthesis",
  MUSIC_CREATION: "music-creation",

  // LVL3
  IMAGE_GENERATION: "image-generation",
  FLUX: "flux",
  SDXL: "sdxl",
  IMG2IMG: "img2img",

  // LVL4
  VIDEO_GENERATION: "video-generation",
  WAN: "wan",

  // LVL5
  GAME_GENERATION: "game-generation",
  GAMES_2D: "2d-games",
  GAMES_3D: "3d-games",
  P5JS: "p5js",
  THREEJS: "threejs",

  // LVL6
  MODEL_TRAINING: "model-training",
  FINE_TUNING: "fine-tuning",
  LEROBOT: "lerobot",
};

/**
 * Main composable
 */
export function useBonzaiWeb3(options = {}) {
  const {
    requiredLevel = null,
    feature = null,
    autoInitialize = true,
  } = options;

  const store = useWeb3Store();

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const isConnected = computed(() => store.isConnected);
  const isConnecting = computed(() => store.isConnecting);
  const walletAddress = computed(() => store.walletAddress);
  const truncatedAddress = computed(() => store.truncatedAddress);
  const isOnArbitrum = computed(() => store.isOnArbitrum);
  const networkName = computed(() => store.networkName);

  // ═══════════════════════════════════════════════════════════════════════════
  // BALANCE STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const totalBalance = computed(() => store.totalBalance);
  const balances = computed(() => store.balances);
  const isLoadingBalances = computed(() => store.isLoadingBalances);

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const levels = computed(() => store.levels);
  const activeLevels = computed(() => store.activeLevels);
  const highestLevel = computed(() => store.highestLevel);
  const currentLevel = computed(() => store.currentLevel);
  const currentLevelLabel = computed(() => store.currentLevelLabel);
  const levelProgress = computed(() => store.levelProgress);
  const levelPrices = computed(() => store.levelPrices);
  const isUnlockingLevel = computed(() => store.isUnlockingLevel);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS CHECKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if user has access to the required level/feature
   * Uses reactive levels.value directly to ensure Vue tracks dependencies properly
   */
  const hasAccess = computed(() => {
    if (!isConnected.value) return false;

    if (requiredLevel) {
      // Access levels.value directly for proper Vue reactivity tracking
      const levelStatus = levels.value?.[requiredLevel];
      return levelStatus?.active ?? false;
    }

    if (feature) {
      return store.canAccess(feature);
    }

    return true;
  });

  /**
   * Get the reason why access is blocked
   */
  const blockReason = computed(() => {
    if (!isConnected.value) {
      return "Connect your wallet to access this feature";
    }

    if (requiredLevel && !store.isLevelActive(requiredLevel)) {
      return store.getLevelBlockReason(requiredLevel);
    }

    return null;
  });

  /**
   * Get config for the required level
   */
  const levelConfig = computed(() => {
    if (!requiredLevel) return null;
    return CONFIG.levels[requiredLevel];
  });

  /**
   * Amount of BONZAI needed to meet holding requirement
   */
  const amountNeeded = computed(() => {
    if (!levelConfig.value) return 0;
    const needed = levelConfig.value.holdingRequired - totalBalance.value;
    return Math.max(0, needed);
  });

  /**
   * Get unlock options for the required level
   */
  const unlockOptions = computed(() => {
    if (!requiredLevel) return null;
    return store.getLevelUnlockOptions(requiredLevel);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Wallet
  const connect = async () => store.connect();
  const disconnect = async () => store.disconnect();
  const refresh = async () => store.refreshAll();
  const switchToArbitrum = async () => store.switchToArbitrum();

  // Level checks
  const isLevelActive = (levelKey) => store.isLevelActive(levelKey);
  const canAccessFeature = (featureName) => store.canAccess(featureName);

  // Level unlocking (ETH payment)
  const unlockLevel = async (levelId) => store.unlockLevel(levelId);
  const unlockLevels = async (levelIds) => store.unlockLevels(levelIds);
  const unlockAllLevels = async () => store.unlockAllLevels();

  // NFT minting
  const mintLevelNFT = async (levelId) => store.mintLevelNFT(levelId);
  const getNFTPrice = (levelId) => store.getNFTPrice(levelId);
  const getNFTRemainingSupply = (levelId) => store.getNFTRemainingSupply(levelId);

  // Agent helpers
  const hasAgentPurchased = (agentId) => store.hasAgentPurchased(agentId);
  const purchaseAgent = async (agentId) => store.purchaseAgent(agentId);
  const hasEnoughForAgentFee = () => store.hasEnoughForAgentFee();
  const executeAgent = async (agent, inputs, context) =>
    store.executeAgent(agent, inputs, context);

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  onMounted(async () => {
    if (autoInitialize) {
      await store.initialize();
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
    networkName,

    // Balance state
    totalBalance,
    balances,
    isLoadingBalances,

    // Level state
    levels,
    activeLevels,
    highestLevel,
    currentLevel,
    currentLevelLabel,
    levelProgress,
    levelPrices,
    isUnlockingLevel,

    // Access state
    hasAccess,
    blockReason,
    levelConfig,
    amountNeeded,
    unlockOptions,

    // Wallet methods
    connect,
    disconnect,
    cancelConnection: () => store.cancelConnection(),
    refresh,
    switchToArbitrum,

    // Level methods
    isLevelActive,
    canAccessFeature,
    unlockLevel,
    unlockLevels,
    unlockAllLevels,

    // NFT minting methods
    mintLevelNFT,
    getNFTPrice,
    getNFTRemainingSupply,

    // Agent methods
    hasAgentPurchased,
    purchaseAgent,
    hasEnoughForAgentFee,
    executeAgent,

    // Store reference
    store,

    // Config
    CONFIG,
  };
}

export { CONFIG };
export default useBonzaiWeb3;
