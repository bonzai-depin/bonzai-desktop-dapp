/**
 * BonzAI Shared Constants & Type Definitions
 *
 * Single source of truth for values used across services, stores, and components.
 * Import from here instead of defining locally.
 *
 * IMPORTANT: The spending category order matches the on-chain packing order in
 * BonzaiCompanions.sol (uint96 nibble layout). Do NOT reorder.
 */

// ═══════════════════════════════════════════════════════════════════════════
// JSDOC TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'text'|'audio'|'image'|'video'|'object'|'training'} InferenceType
 * Inference type string key used throughout the app for content categorization.
 */

/**
 * @typedef {Object} SpendingProfile
 * @property {number} education - 1-10 scale
 * @property {number} entertainment - 1-10 scale
 * @property {number} fashion - 1-10 scale
 * @property {number} finance - 1-10 scale
 * @property {number} food - 1-10 scale
 * @property {number} healthcare - 1-10 scale
 * @property {number} housing - 1-10 scale
 * @property {number} beauty - 1-10 scale
 * @property {number} reading - 1-10 scale
 * @property {number} social - 1-10 scale
 * @property {number} travel - 1-10 scale
 * @property {number} sports - 1-10 scale
 */

/**
 * @typedef {Object} CompanionData
 * @property {string} id - Unique identifier (e.g. 'aurore', 'nft_base_42')
 * @property {number} [tokenId] - On-chain token ID (for NFT companions)
 * @property {string} firstName - First name
 * @property {string} [familyName] - Family name
 * @property {string} [personality] - Personality description
 * @property {string} [appearance] - Appearance description
 * @property {string} [background] - Background story
 * @property {string} [voiceStyle] - Voice style for TTS
 * @property {string} [firstMessage] - Initial greeting
 * @property {SpendingProfile} spendingHabits - Spending profile
 * @property {string} gender - 'female'|'male'|'neutral'
 * @property {number} age - Character age (must be 18+)
 * @property {string} style - Primary Big5 trait (e.g. 'openness')
 * @property {string|null} image - Profile image URL or null
 * @property {boolean} [isCustom] - Whether this is a custom companion
 * @property {boolean} [isNFT] - Whether this is an NFT companion
 * @property {string} [network] - Network ('base')
 * @property {string} [standard] - Token standard ('ERC-8004')
 * @property {string|null} [agentWallet] - Agent wallet address
 * @property {string|null} [creator] - Creator wallet address
 */

/**
 * @typedef {Object} MintTarget
 * @property {InferenceType} inferenceType - Content category
 * @property {string} inferenceId - Unique inference record ID
 * @property {string|Blob} content - The content data to mint
 * @property {string} contentType - MIME type (e.g. 'image/webp')
 * @property {string} prompt - The prompt that generated the content
 * @property {Object} generation - Full generation record from inference store
 */

/**
 * @typedef {Object} InferenceRecord
 * @property {string} id - Unique UUID
 * @property {InferenceType} type - Content type
 * @property {string} model - Model name/filename used
 * @property {string} prompt - User prompt
 * @property {*} result - Generation result (string for text, base64 for media)
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {Object} [hardware] - Hardware specs snapshot
 * @property {boolean} [minted] - Whether minted as NFT
 * @property {Object} [nftData] - NFT metadata if minted
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Content type indices matching BonzaiCollectibles.sol Provenance.contentType
 * and BonzaiMintPool pool indices.
 *
 * @enum {number}
 */
export const CONTENT_TYPE = {
  TEXT: 0,
  AUDIO: 1,
  IMAGE: 2,
  VIDEO: 3,
  OBJECT: 4,      // 3D assets
  TRAINING: 5,
};

/**
 * Map from inference type string keys (used in stores, services, UI) to
 * on-chain content type indices. Matches BonzaiCollectibles.sol.
 *
 * @type {Record<string, number>}
 */
export const CONTENT_TYPE_MAP = {
  text: CONTENT_TYPE.TEXT,
  audio: CONTENT_TYPE.AUDIO,
  image: CONTENT_TYPE.IMAGE,
  video: CONTENT_TYPE.VIDEO,
  object: CONTENT_TYPE.OBJECT,
  training: CONTENT_TYPE.TRAINING,
};

/**
 * Human-readable labels for each pool / content type, indexed by CONTENT_TYPE.
 * Used in MintPool UI and logs.
 *
 * @type {string[]}
 */
export const POOL_LABELS = ['Text', 'Audio', 'Image', 'Video', '3D', 'Training'];

/** Total number of pools / content types */
export const NUM_POOLS = 6;

/**
 * Inference type string keys in index order.
 * `INFERENCE_TYPES[CONTENT_TYPE.TEXT]` === 'text'
 *
 * @type {string[]}
 */
export const INFERENCE_TYPES = ['text', 'audio', 'image', 'video', 'object', 'training'];

// ═══════════════════════════════════════════════════════════════════════════
// SPENDING CATEGORIES (ON-CHAIN PACKING ORDER)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical ordering of the 12 spending categories.
 *
 * This order matches the uint96 nibble layout in BonzaiCompanions.sol:
 *   Bits [3:0]=education  [7:4]=entertainment  [11:8]=fashion  [15:12]=finance
 *   [19:16]=food  [23:20]=healthcare  [27:24]=housing  [31:28]=beauty
 *   [35:32]=reading  [39:36]=social  [43:40]=travel  [47:44]=sports
 *
 * IMPORTANT: Do NOT reorder. Any reorder breaks on-chain packing/unpacking.
 *
 * @type {string[]}
 */
export const SPENDING_CATEGORIES_ORDER = [
  'education',
  'entertainment',
  'fashion',
  'finance',
  'food',
  'healthcare',
  'housing',
  'beauty',
  'reading',
  'social',
  'travel',    // index 10
  'sports',    // index 11
];

/**
 * Pack 12 spending category values (1-10) into a BigInt uint96.
 * Each value is stored as a 4-bit nibble at the position defined by
 * SPENDING_CATEGORIES_ORDER.
 *
 * @param {Object<string, number>} habits - Category name -> value (1-10)
 * @returns {bigint} Packed uint96 value
 */
export function packSpendingProfile(habits) {
  let packed = 0n;
  SPENDING_CATEGORIES_ORDER.forEach((cat, i) => {
    packed |= BigInt(Math.min(Math.max(habits[cat] || 0, 0), 15)) << BigInt(i * 4);
  });
  return packed;
}

/**
 * Unpack a BigInt uint96 into spending category values.
 *
 * @param {bigint} packed - Packed uint96 value
 * @returns {Object<string, number>} Category name -> value (1-10)
 */
export function unpackSpendingProfile(packed) {
  const result = {};
  SPENDING_CATEGORIES_ORDER.forEach((cat, i) => {
    result[cat] = Number((packed >> BigInt(i * 4)) & 0xFn);
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED ABI FRAGMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * BonzaiCollectibles clone ABI (mint + fee queries).
 * Used by contentNFT.service.js and purchaseExecutor.service.js.
 *
 * @type {string[]}
 */
export const COLLECTIBLES_CLONE_ABI = [
  'function mint(string transactionId, string model, string tokenURI_, uint8 contentType) payable returns (uint256)',
  'function mintFee() view returns (uint256)',
  'function mintFees(uint8 contentType) view returns (uint256)',
  'event ContentMinted(uint256 indexed tokenId, address indexed creator, string transactionId, string model, uint256 timestamp)',
];

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * BONZAI holding thresholds for each level (in whole token units).
 * Index matches CONTENT_TYPE / pool index.
 *
 * @type {number[]}
 */
export const LEVEL_THRESHOLDS = [1000, 5000, 10000, 25000, 33000, 50000];

/**
 * Mint level key for each inference type.
 * Maps inference type string to the level key (e.g., 'LVL1').
 *
 * @type {Record<string, string>}
 */
export const MINT_LEVELS = {
  text: 'LVL1',
  audio: 'LVL2',
  image: 'LVL3',
  video: 'LVL4',
  object: 'LVL5',
  training: 'LVL6',
};
