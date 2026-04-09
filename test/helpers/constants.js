const { ethers } = require("hardhat");

// ═══════════════════════════════════════════════════════════════════════════
// PRICES
// ═══════════════════════════════════════════════════════════════════════════

const UNLOCK_PRICE = ethers.parseEther("1");
const MINT_FEE = ethers.parseEther("0.0025"); // legacy flat fee
// Per-type mint fees (LVL progression)
const MINT_FEES_BY_TYPE = [
  ethers.parseEther("0.0005"),   // 0: text   (LVL1)
  ethers.parseEther("0.001"),    // 1: audio  (LVL2)
  ethers.parseEther("0.0015"),   // 2: image  (LVL3)
  ethers.parseEther("0.0025"),   // 3: video  (LVL4)
  ethers.parseEther("0.0035"),   // 4: 3D     (LVL5)
  ethers.parseEther("0.005"),    // 5: training (LVL6)
];
const COMPANION_MINT_PRICE = ethers.parseEther("0.25");
const MIN_ETH_LIQUIDITY = ethers.parseEther("0.01");

// ═══════════════════════════════════════════════════════════════════════════
// MINT POOL CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const NUM_POOLS = 6;
const EPOCH_DURATION = 14 * 24 * 60 * 60; // 2 weeks in tests (production uses 1 week = 604800)
const MIN_CLAIM_BLOCK_GAP = 256;

// LVL thresholds in full token units (constructor multiplies by 1e18)
const POOL_THRESHOLDS = [1000, 5000, 10000, 25000, 33000, 50000];
// With 18 decimals
const POOL_THRESHOLDS_WEI = POOL_THRESHOLDS.map(t => ethers.parseEther(t.toString()));

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT
// ═══════════════════════════════════════════════════════════════════════════

const TREASURY_BPS = 8000n;
const POOL_BPS = 2000n;
const ROYALTY_BPS = 750n;
const BPS_DENOMINATOR = 10000n;

// Content types
const CONTENT_TYPE = {
  TEXT: 0,
  AUDIO: 1,
  IMAGE: 2,
  VIDEO: 3,
  THREE_D: 4,
  TRAINING: 5,
};

// ═══════════════════════════════════════════════════════════════════════════
// SPLITTER
// ═══════════════════════════════════════════════════════════════════════════

const MIN_DISTRIBUTION_AMOUNT = ethers.parseEther("0.01");

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

const HOOK_FEE_BPS = 100n;
const COMPANION_WALLET_BPS = 3400n;   // 34% companion wallet
const COMPANION_OWNER_BPS = 3300n;    // 33% companion owner
const COMPANION_POOL_BPS = 3300n;     // 33% LVL6 (training) pool
const FINETUNE_BENEFICIARY_BPS = 8000n;
const FINETUNE_TREASURY_BPS = 1000n;
const FINETUNE_POOL_BPS = 1000n;

const POOL_TYPE_COMPANION = 0;
const POOL_TYPE_FINETUNE = 1;

// ═══════════════════════════════════════════════════════════════════════════
// COMPANIONS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SUPPLY = 10000;

// Valid spending profile: 12 categories with values 1-10
// Each nibble is 4 bits: education=5, entertainment=7, fashion=3, finance=8,
// food=6, healthcare=4, housing=5, beauty=2, reading=9, social=6, travel=7, sports=3
const VALID_SPENDING_PROFILE = packSpendingProfile([5, 7, 3, 8, 6, 4, 5, 2, 9, 6, 7, 3]);
const ALL_ONES_PROFILE = packSpendingProfile([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const ALL_TENS_PROFILE = packSpendingProfile([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);

function packSpendingProfile(categories) {
  let packed = 0n;
  for (let i = 0; i < 12; i++) {
    packed |= BigInt(categories[i]) << BigInt(i * 4);
  }
  return packed;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

const TOTAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion
const POOL_SHARE_BPS = 9600n;
const AGENT_SHARE_BPS = 400n;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// ═══════════════════════════════════════════════════════════════════════════
// P2P / PAYMENT
// ═══════════════════════════════════════════════════════════════════════════

const PLATFORM_FEE_BPS = 250n; // 2.5%
const MIN_STAKE = ethers.parseEther("0.1");
const PAYMENT_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC (6 decimals)
const PAYMENT_AMOUNT_ETH = ethers.parseEther("0.05");

// ═══════════════════════════════════════════════════════════════════════════
// SKILL REGISTRY / OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_PURCHASE_PRICE = ethers.parseUnits("10", 6); // 10 USDC (6 decimals)
const SKILL_RUNNING_FEE = ethers.parseUnits("1", 6); // 1 USDC per execution (6 decimals)
const SKILL_AUTHOR_SHARE_BPS = 8000n;
const SKILL_PLATFORM_SHARE_BPS = 2000n;
const MIN_PROFILE_SCORE = 5;
const MAX_COMPANIONS_PER_SKILL = 100;

// Valid spending profile category names
const VALID_CATEGORIES = [
  "education", "entertainment", "fashion", "finance", "food", "healthcare",
  "housing", "beauty", "reading", "social", "travel", "sports"
];

module.exports = {
  UNLOCK_PRICE,
  MINT_FEE,
  MINT_FEES_BY_TYPE,
  COMPANION_MINT_PRICE,
  MIN_ETH_LIQUIDITY,
  NUM_POOLS,
  EPOCH_DURATION,
  MIN_CLAIM_BLOCK_GAP,
  POOL_THRESHOLDS,
  POOL_THRESHOLDS_WEI,
  TREASURY_BPS,
  POOL_BPS,
  ROYALTY_BPS,
  BPS_DENOMINATOR,
  CONTENT_TYPE,
  MIN_DISTRIBUTION_AMOUNT,
  HOOK_FEE_BPS,
  COMPANION_WALLET_BPS,
  COMPANION_OWNER_BPS,
  COMPANION_POOL_BPS,
  FINETUNE_BENEFICIARY_BPS,
  FINETUNE_TREASURY_BPS,
  FINETUNE_POOL_BPS,
  POOL_TYPE_COMPANION,
  POOL_TYPE_FINETUNE,
  MAX_SUPPLY,
  VALID_SPENDING_PROFILE,
  ALL_ONES_PROFILE,
  ALL_TENS_PROFILE,
  packSpendingProfile,
  TOTAL_SUPPLY,
  POOL_SHARE_BPS,
  AGENT_SHARE_BPS,
  DEAD_ADDRESS,
  PLATFORM_FEE_BPS,
  MIN_STAKE,
  PAYMENT_AMOUNT,
  PAYMENT_AMOUNT_ETH,
  SKILL_PURCHASE_PRICE,
  SKILL_RUNNING_FEE,
  SKILL_AUTHOR_SHARE_BPS,
  SKILL_PLATFORM_SHARE_BPS,
  MIN_PROFILE_SCORE,
  MAX_COMPANIONS_PER_SKILL,
  VALID_CATEGORIES,
};
