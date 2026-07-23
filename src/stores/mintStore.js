/**
 * BonzAI — Mint Store
 * Tracks the canonical economy-chain mint target and modal state.
 */

import { reactive, readonly, computed } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const economyNetwork = CONFIG.networks[ECONOMY_NETWORK_KEY];
const MINT_NETWORKS = {
  [ECONOMY_NETWORK_KEY]: {
    key: ECONOMY_NETWORK_KEY,
    chainId: economyNetwork.chainId,
    standard: 'ERC-721',
    currency: 'ETH',
    fees: CONFIG.contentNFT.economy.mintFees,
    explorer: new URL(economyNetwork.explorer).hostname,
    explorerUrl: economyNetwork.explorer,
    label: economyNetwork.name,
  },
};

const STORE_KEY = 'mintNetwork';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  network: ECONOMY_NETWORK_KEY,
  isMinting: false,
  showModal: false,
  mintTarget: null,        // { inferenceType, inferenceId, content, contentType, prompt, generation }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const getStore = () => window.electronAPI?.store;

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize store
 */
async function init() {
  state.network = ECONOMY_NETWORK_KEY;
}

/**
 * Set the active mint network (economy chain only)
 */
async function setMintNetwork(key) {
  if (!MINT_NETWORKS[key]) return;
  state.network = key;
}

/**
 * Open the mint modal with a target inference
 */
function openMintModal(target) {
  state.mintTarget = target;
  state.showModal = true;
}

/**
 * Close the mint modal
 */
function closeMintModal() {
  state.showModal = false;
  state.mintTarget = null;
  state.isMinting = false;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTED
// ═══════════════════════════════════════════════════════════════════════════

const activeMintNetwork = computed(() => MINT_NETWORKS[state.network] || MINT_NETWORKS[ECONOMY_NETWORK_KEY]);

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

// Initialize on import
init();

export const mintStore = {
  state: readonly(state),
  MINT_NETWORKS,
  activeMintNetwork,
  setMintNetwork,
  openMintModal,
  closeMintModal,
  init,
};

export default mintStore;
