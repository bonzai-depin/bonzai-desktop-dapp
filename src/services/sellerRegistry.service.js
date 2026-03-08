/**
 * Seller Registry Service
 *
 * Local registry of x402 sellers stored in Electron store.
 * Maps sellers to spending categories for companion autonomous purchasing.
 *
 * 4 built-in sellers:
 * - Content NFT Mint (entertainment)
 * - Companion Token Buyback (finance)
 * - Buy Other Companion Tokens (social)
 * - Buy BONZAI Token (finance)
 */

const STORE_KEY = 'bonzai-seller-registry';

// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN SELLERS
// ═══════════════════════════════════════════════════════════════════════════

const BUILTIN_SELLERS = [
  {
    id: 'content_nft_mint',
    name: 'Content NFT Mint',
    category: 'entertainment',
    type: 'content_nft_mint',
    description: 'Mint roleplay images as on-chain content NFTs on Base',
    endpoint: null,
    contractAddress: null, // Uses CONFIG.contentNFT.base.contractAddress
    chainId: 8453,
    priceRange: '0.0025 ETH',
    enabled: true,
    builtin: true,
  },
  {
    id: 'companion_token_buyback',
    name: 'Companion Token Buyback',
    category: 'finance',
    type: 'companion_token_buyback',
    description: 'Buy back own companion token via Uniswap V4 on Base',
    endpoint: null,
    contractAddress: null, // Uses companion token address from factory
    chainId: 8453,
    priceRange: '0.0005-0.005 ETH',
    enabled: true,
    builtin: true,
  },
  {
    id: 'other_companion_token',
    name: 'Buy Other Companion Tokens',
    category: 'social',
    type: 'other_companion_token',
    description: 'Buy tokens of other companions via Uniswap V4 on Base',
    endpoint: null,
    contractAddress: null, // Selected at runtime from factory
    chainId: 8453,
    priceRange: '0.0005-0.005 ETH',
    enabled: true,
    builtin: true,
  },
  {
    id: 'bonzai_token',
    name: 'Buy BONZAI Token',
    category: 'finance',
    type: 'bonzai_token',
    description: 'Buy BONZAI token via Uniswap V4 on Base',
    endpoint: null,
    contractAddress: null, // Uses CONFIG.tokens.BONZAI.base
    chainId: 8453,
    priceRange: '0.0005-0.005 ETH',
    enabled: true,
    builtin: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize registry — seed built-in sellers if first run
 */
async function initRegistry() {
  try {
    const stored = await window.electronAPI?.store?.get(STORE_KEY, null);
    if (!stored) {
      await window.electronAPI?.store?.set(STORE_KEY, BUILTIN_SELLERS);
      console.log('[SellerRegistry] Seeded built-in sellers');
    } else {
      // Ensure all built-ins exist (in case new ones were added in an update)
      const existingIds = new Set(stored.map(s => s.id));
      let updated = false;
      for (const builtin of BUILTIN_SELLERS) {
        if (!existingIds.has(builtin.id)) {
          stored.push(builtin);
          updated = true;
        }
      }
      if (updated) {
        await window.electronAPI?.store?.set(STORE_KEY, stored);
        console.log('[SellerRegistry] Added missing built-in sellers');
      }
    }
  } catch (e) {
    console.error('[SellerRegistry] Init failed:', e);
  }
}

/**
 * Get all sellers (enabled and disabled)
 * @returns {Promise<Array>}
 */
async function getAllSellers() {
  try {
    const stored = await window.electronAPI?.store?.get(STORE_KEY, null);
    return stored || BUILTIN_SELLERS;
  } catch (e) {
    console.error('[SellerRegistry] Failed to load sellers:', e);
    return BUILTIN_SELLERS;
  }
}

/**
 * Get only enabled sellers
 * @returns {Promise<Array>}
 */
async function getEnabledSellers() {
  const all = await getAllSellers();
  return all.filter(s => s.enabled);
}

/**
 * Add a custom seller
 * @param {Object} seller - Seller entry (without builtin flag)
 * @returns {Promise<Object>} The created seller
 */
async function addCustomSeller(seller) {
  const all = await getAllSellers();
  const newSeller = {
    ...seller,
    id: seller.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    builtin: false,
    enabled: seller.enabled !== false,
    type: seller.type || 'x402_external',
  };

  all.push(newSeller);
  await window.electronAPI?.store?.set(STORE_KEY, all);
  console.log(`[SellerRegistry] Added custom seller: ${newSeller.name}`);
  return newSeller;
}

/**
 * Remove a seller (custom only — built-ins cannot be removed)
 * @param {string} id - Seller ID
 * @returns {Promise<boolean>}
 */
async function removeSeller(id) {
  const all = await getAllSellers();
  const seller = all.find(s => s.id === id);
  if (!seller) return false;
  if (seller.builtin) {
    console.warn('[SellerRegistry] Cannot remove built-in seller');
    return false;
  }

  const filtered = all.filter(s => s.id !== id);
  await window.electronAPI?.store?.set(STORE_KEY, filtered);
  console.log(`[SellerRegistry] Removed seller: ${id}`);
  return true;
}

/**
 * Toggle a seller's enabled state
 * @param {string} id - Seller ID
 * @param {boolean} enabled - New enabled state
 * @returns {Promise<boolean>}
 */
async function toggleSeller(id, enabled) {
  const all = await getAllSellers();
  const seller = all.find(s => s.id === id);
  if (!seller) return false;

  seller.enabled = enabled;
  await window.electronAPI?.store?.set(STORE_KEY, all);
  return true;
}

/**
 * Update a seller's properties
 * @param {string} id - Seller ID
 * @param {Object} updates - Properties to update
 * @returns {Promise<boolean>}
 */
async function updateSeller(id, updates) {
  const all = await getAllSellers();
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return false;

  // Prevent changing builtin flag or ID
  const { id: _id, builtin: _builtin, ...safeUpdates } = updates;
  Object.assign(all[idx], safeUpdates);
  await window.electronAPI?.store?.set(STORE_KEY, all);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const sellerRegistryService = {
  initRegistry,
  getAllSellers,
  getEnabledSellers,
  addCustomSeller,
  removeSeller,
  toggleSeller,
  updateSeller,
  BUILTIN_SELLERS,
};

export default sellerRegistryService;
