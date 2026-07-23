const { ethers } = require("hardhat");

// ═══════════════════════════════════════════════════════════════════════════
// PRICES
// ═══════════════════════════════════════════════════════════════════════════

const UNLOCK_PRICE = ethers.parseEther("1");
// Per-type mint fees (LVL progression)
const MINT_FEES_BY_TYPE = [
  ethers.parseEther("0.0005"),   // 0: text   (LVL1)
  ethers.parseEther("0.001"),    // 1: audio  (LVL2)
  ethers.parseEther("0.0015"),   // 2: image  (LVL3)
  ethers.parseEther("0.0025"),   // 3: video  (LVL4)
  ethers.parseEther("0.0035"),   // 4: 3D     (LVL5)
  ethers.parseEther("0.005"),    // 5: training (LVL6)
];
const COMPANION_MINT_PRICE = ethers.parseEther("0.30");
const MIN_ETH_LIQUIDITY = ethers.parseEther("0.01");

// ═══════════════════════════════════════════════════════════════════════════
// MINT POOL CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const NUM_POOLS = 6;
const EPOCH_DURATION = 14 * 24 * 60 * 60; // 2 weeks in tests (production uses 1 week = 604800)
const MIN_CLAIM_BLOCK_GAP = 256;
const PROVIDER_SHARE_BPS = 5000n; // 50% of every deposit goes to providers

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

const CONTENT_TYPE = {
  TEXT: 0,
  AUDIO: 1,
  IMAGE: 2,
  VIDEO: 3,
  THREE_D: 4,
  TRAINING: 5,
};

// ═══════════════════════════════════════════════════════════════════════════
// SPLITTER (3-way: 1/3 creator pending pool / 1/3 treasury / 1/3 pools)
// ═══════════════════════════════════════════════════════════════════════════

const MIN_DISTRIBUTION_AMOUNT = ethers.parseEther("0.01");

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

const HOOK_FEE_BPS = 100n;
// Companion: 40 wallet / 40 owner / 10 treasury / 10 MintPool (split equally)
const COMPANION_WALLET_BPS = 4000n;
const COMPANION_OWNER_BPS = 4000n;
const COMPANION_TREASURY_BPS = 1000n;
const COMPANION_POOL_BPS = 1000n;
// FineTune: 80 beneficiary / 10 treasury / 10 MintPool (split equally)
const FINETUNE_BENEFICIARY_BPS = 8000n;
const FINETUNE_TREASURY_BPS = 1000n;
const FINETUNE_POOL_BPS = 1000n;

const POOL_TYPE_COMPANION = 0;
const POOL_TYPE_FINETUNE = 1;

// ═══════════════════════════════════════════════════════════════════════════
// COMPANIONS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SUPPLY = 10000;

// Valid spending profiles
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
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// ═══════════════════════════════════════════════════════════════════════════
// SKILL REGISTRY / OWNERSHIP — ETH-only post-migration
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_PURCHASE_PRICE = ethers.parseEther("0.01"); // 0.01 ETH
const SKILL_RUNNING_FEE = ethers.parseEther("0.001");   // 0.001 ETH per execution
const SKILL_CO_OWNER_SHARE_BPS = 8000n;
const SKILL_TREASURY_SHARE_BPS = 2000n;
const MIN_PROFILE_SCORE = 5;
const MAX_COMPANIONS_PER_SKILL = 100;

const VALID_CATEGORIES = [
  "education", "entertainment", "fashion", "finance", "food", "healthcare",
  "housing", "beauty", "reading", "social", "travel", "sports"
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TIME
// ═══════════════════════════════════════════════════════════════════════════

const PROVIDER_LVL1 = ethers.parseEther("1000"); // 1000 BONZAI
const MAX_SESSION_DURATION = 24 * 60 * 60;       // 24h

module.exports = {
  UNLOCK_PRICE,
  MINT_FEES_BY_TYPE,
  COMPANION_MINT_PRICE,
  MIN_ETH_LIQUIDITY,
  NUM_POOLS,
  EPOCH_DURATION,
  MIN_CLAIM_BLOCK_GAP,
  PROVIDER_SHARE_BPS,
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
  COMPANION_TREASURY_BPS,
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
  BURN_ADDRESS,
  SKILL_PURCHASE_PRICE,
  SKILL_RUNNING_FEE,
  SKILL_CO_OWNER_SHARE_BPS,
  SKILL_TREASURY_SHARE_BPS,
  MIN_PROFILE_SCORE,
  MAX_COMPANIONS_PER_SKILL,
  VALID_CATEGORIES,
  PROVIDER_LVL1,
  MAX_SESSION_DURATION,
};
