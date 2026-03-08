/**
 * BonzAI — Mint Store
 * Tracks mint network (Base-only) and modal state.
 */

import { reactive, readonly, computed } from 'vue';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MINT_NETWORKS = {
  base: {
    key: 'base',
    chainId: 8453,
    standard: 'ERC-721',
    currency: 'ETH',
    fee: '0.0025',
    explorer: 'basescan.org',
    explorerUrl: 'https://basescan.org',
    label: 'Base',
  },
};

const STORE_KEY = 'mintNetwork';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  network: 'base',
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
  // Network is always Base — no persistence needed
  state.network = 'base';
}

/**
 * Set the active mint network (Base only)
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

const activeMintNetwork = computed(() => MINT_NETWORKS[state.network] || MINT_NETWORKS.base);

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
