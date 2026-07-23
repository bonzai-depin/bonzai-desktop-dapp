/**
 * BonzAI Web3 Configuration
 *
 * Defines token addresses, level requirements, NFT contracts, and treasury settings
 */

const env = import.meta?.env || {};
const ETHEREUM_CHAIN_ID = 1;
const ETHEREUM_CHAIN_ID_HEX = "0x1";
const ETHEREUM_EXPLORER = "https://etherscan.io";
const ETHEREUM_RPC = env.VITE_ETHEREUM_RPC_URL || "https://ethereum.publicnode.com";
const BONZAI_ETHEREUM = "0xDdA9Ff241C7160be8295EF9Eca2e782361467666";
const USDC_ETHEREUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BONZAI_BASE = "0xc4d137def384ee0f8857887f5950669ba04984ec";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
const ROBINHOOD_RPC = env.VITE_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_TESTNET_RPC = env.VITE_ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const BONZAI_ROBINHOOD = env.VITE_BONZAI_TOKEN_ROBINHOOD_ADDRESS || null;
const USDG_ROBINHOOD = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH_ROBINHOOD = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const ECONOMY_CHAIN_ID = Number(env.VITE_BONZAI_ECONOMY_CHAIN_ID || ROBINHOOD_CHAIN_ID);
const ECONOMY_NETWORK_KEYS = { 1: 'ethereum', 42161: 'arbitrum', 8453: 'base', 4663: 'robinhood' };
export const ECONOMY_NETWORK_KEY = ECONOMY_NETWORK_KEYS[ECONOMY_CHAIN_ID];
if (!ECONOMY_NETWORK_KEY) {
  throw new Error(`Unsupported VITE_BONZAI_ECONOMY_CHAIN_ID: ${ECONOMY_CHAIN_ID}`);
}
export const networkKeyForChainId = (chainId) => ({
  ...ECONOMY_NETWORK_KEYS,
  42: 'lukso',
  46630: 'robinhoodTestnet',
})[Number(chainId)] || null;
const BONZAI_ECONOMY = {
  1: BONZAI_ETHEREUM,
  42161: "0x0a84edf70f30325151631ce7a61307d1f4d619a3",
  8453: BONZAI_BASE,
  4663: BONZAI_ROBINHOOD,
}[ECONOMY_CHAIN_ID];

const economyAddress = (name, ...legacyKeys) => {
  const chainKey = `VITE_BONZAI_${name}_${ECONOMY_NETWORK_KEY.toUpperCase()}_ADDRESS`;
  const genericKey = `VITE_BONZAI_${name}_ADDRESS`;
  return env[chainKey] || env[genericKey] || legacyKeys.map((key) => env[key]).find(Boolean) || null;
};

const ECONOMY_CONTRACTS = {
  unlock: economyAddress('UNLOCK', 'VITE_BONZAI_UNLOCK_ETHEREUM_ADDRESS'),
  skillRegistry: economyAddress('SKILL_REGISTRY', 'VITE_BONZAI_SKILL_REGISTRY_ETHEREUM_ADDRESS'),
  skillOwnership: economyAddress('SKILL_OWNERSHIP', 'VITE_BONZAI_SKILL_OWNERSHIP_ETHEREUM_ADDRESS'),
  collectibles: economyAddress('COLLECTIBLES', 'VITE_BONZAI_COLLECTIBLES_ETHEREUM_ADDRESS'),
  collectiblesFactory: economyAddress('COLLECTIBLES_FACTORY', 'VITE_BONZAI_COLLECTIBLES_FACTORY_ETHEREUM_ADDRESS'),
  mintPool: economyAddress('MINT_POOL', 'VITE_BONZAI_MINT_POOL_ETHEREUM_ADDRESS'),
  royaltySplitter: economyAddress('ROYALTY_SPLITTER', 'VITE_BONZAI_ROYALTY_SPLITTER_ETHEREUM_ADDRESS'),
  fineTuneTokenFactory: economyAddress('FINE_TUNE_TOKEN_FACTORY'),
  companions: economyAddress('COMPANIONS'),
  providerRegistry: economyAddress('PROVIDER_REGISTRY', 'VITE_BONZAI_PROVIDER_REGISTRY_ETHEREUM_ADDRESS'),
  serviceTime: economyAddress('SERVICE_TIME'),
  stakingVault: economyAddress('STAKING_VAULT'),
  revenueRouter: economyAddress('REVENUE_ROUTER'),
  contributionRegistry: economyAddress('CONTRIBUTION_REGISTRY'),
  datasetRegistry: economyAddress('DATASET_REGISTRY'),
  modelRegistry: economyAddress('MODEL_REGISTRY'),
  evaluationRegistry: economyAddress('EVALUATION_REGISTRY'),
  contributionScoreOracle: economyAddress('CONTRIBUTION_SCORE_ORACLE'),
  jobEscrow: economyAddress('JOB_ESCROW'),
  p2pPayment: economyAddress('P2P_PAYMENT', 'VITE_BONZAI_P2P_PAYMENT_ETHEREUM_ADDRESS'),
  pipelinePayment: economyAddress('PIPELINE_PAYMENT', 'VITE_BONZAI_PIPELINE_PAYMENT_ETHEREUM_ADDRESS'),
  companionTokenFactory: economyAddress('COMPANION_TOKEN_FACTORY'),
};

const parseSkillIdMap = () => {
  if (!env.VITE_BONZAI_SKILL_ID_MAP_JSON) return {};
  try {
    const parsed = JSON.parse(env.VITE_BONZAI_SKILL_ID_MAP_JSON);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error('[Web3Config] VITE_BONZAI_SKILL_ID_MAP_JSON is not valid JSON');
    return {};
  }
};

const parseCompanionTokens = () => {
  if (!env.VITE_DEFAULT_COMPANION_TOKENS_JSON) return {};
  try {
    const parsed = JSON.parse(env.VITE_DEFAULT_COMPANION_TOKENS_JSON);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error('[Web3Config] VITE_DEFAULT_COMPANION_TOKENS_JSON is not valid JSON');
    return {};
  }
};

export const CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  networks: {
    ethereum: {
      chainId: ETHEREUM_CHAIN_ID,
      chainIdHex: ETHEREUM_CHAIN_ID_HEX,
      name: "Ethereum Mainnet",
      rpc: ETHEREUM_RPC,
      rpcFallbacks: [
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://eth.drpc.org",
      ],
      explorer: ETHEREUM_EXPLORER,
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    arbitrum: {
      chainId: 42161,
      chainIdHex: "0xa4b1",
      name: "Arbitrum One",
      rpc: "https://arbitrum.publicnode.com",
      rpcFallbacks: [
        "https://rpc.ankr.com/arbitrum",
        "https://arb1.arbitrum.io/rpc",
      ],
      explorer: "https://arbiscan.io",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    lukso: {
      chainId: 42,
      chainIdHex: "0x2a",
      name: "LUKSO Mainnet",
      rpc: "https://rpc.mainnet.lukso.network",
      rpcFallbacks: [
        "https://rpc.lukso.sigmacore.io",
        "https://rpc.lukso.gateway.fm",
      ],
      explorer: "https://explorer.lukso.network",
      currency: { name: "LYX", symbol: "LYX", decimals: 18 },
    },
    base: {
      chainId: 8453,
      chainIdHex: "0x2105",
      name: "Base Mainnet",
      rpc: env.VITE_BASE_RPC_URL || "https://mainnet.base.org",
      rpcFallbacks: [
        "https://base.publicnode.com",
        "https://base.llamarpc.com",
      ],
      explorer: "https://basescan.org",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    robinhood: {
      chainId: ROBINHOOD_CHAIN_ID,
      chainIdHex: "0x1237",
      name: "Robinhood Chain",
      rpc: ROBINHOOD_RPC,
      rpcFallbacks: ["https://rpc.mainnet.chain.robinhood.com"],
      explorer: "https://robinhoodchain.blockscout.com",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
      canonicalBridge: "https://bridge.arbitrum.io",
      isEconomyDefault: true,
    },
    robinhoodTestnet: {
      chainId: ROBINHOOD_TESTNET_CHAIN_ID,
      chainIdHex: "0xb626",
      name: "Robinhood Chain Testnet",
      rpc: ROBINHOOD_TESTNET_RPC,
      rpcFallbacks: ["https://rpc.testnet.chain.robinhood.com"],
      explorer: "https://explorer.testnet.chain.robinhood.com",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════
  tokens: {
    BONZAI: {
      // Token addresses with proper checksum format
      ethereum: "0xDdA9Ff241C7160be8295EF9Eca2e782361467666",
      arbitrum: "0x0a84edf70f30325151631ce7a61307d1f4d619a3",
      base: BONZAI_BASE,
      robinhood: BONZAI_ROBINHOOD,
      decimals: 18,
      symbol: "BONZAI",
    },
    usdc: {
      ethereum: USDC_ETHEREUM,
      arbitrum: USDC_ARBITRUM,
      base: USDC_BASE,
      robinhood: USDG_ROBINHOOD,
    },
    USDG: { robinhood: USDG_ROBINHOOD },
    WETH: { robinhood: WETH_ROBINHOOD },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL SYSTEM CONFIGURATION (6 Levels)
  // ═══════════════════════════════════════════════════════════════════════════
  // Access is derived exclusively from BONZAI staked on the economy chain.
  levels: {
    LVL1: {
      id: 1,
      name: "Text Minting",
      description: "Mint text collectibles and co-own text pool.",
      icon: "chat",
      holdingRequired: 1000,
      features: ["SOTA Large Language Models", "Unlimited Text Generation", "Unlimited Character Roleplay", "Unlimited Vibe Coding", "Mint Text NFTs", "Text Pool Co-Ownership"],
    },
    LVL2: {
      id: 2,
      name: "Audio Minting",
      description: "Mint audio collectibles and co-own audio pool.",
      icon: "headphones",
      holdingRequired: 5000,
      features: ["SOTA Audio Generation", "Unlimited Voice Design", "Unlimited Voice Cloning", "Unlimited Text-to-Speech", "Unlimited Music", "Mint Audio NFTs", "Audio Pool Co-Ownership"],
    },
    LVL3: {
      id: 3,
      name: "Image Minting",
      description: "Mint image collectibles and co-own image pool.",
      icon: "image",
      holdingRequired: 10000,
      features: ["SOTA Image Generation", "Uncensored Images", "Unlimited Edits", "Unlimited Style Transfer", "Mint Image NFTs", "Image Pool Co-Ownership"],
    },
    LVL4: {
      id: 4,
      name: "Video Minting",
      description: "Mint video collectibles and co-own video pool.",
      icon: "movie",
      holdingRequired: 25000,
      features: ["SOTA Video Generation", "Unlimited Image-to-Video", "Unlimited Text-to-Video", "Mint Video NFTs", "Video Pool Co-Ownership"],
    },
    LVL5: {
      id: 5,
      name: "3D Minting",
      description: "Mint 3D collectibles and co-own 3D pool.",
      icon: "3d_rotation",
      holdingRequired: 33000,
      features: ["SOTA Asset Generation", "Unlimited 3D Objects (Web)", "Mint 3D NFTs", "3D Pool Co-Ownership"],
    },
    LVL6: {
      id: 6,
      name: "Model Training & Token Issuance",
      description: "Mint trained models, issue ERC-20 tokens, and co-own training pool.",
      icon: "exercise",
      holdingRequired: 50000,
      features: ["SOTA Training", "Custom Large Language Models", "Custom Image Models", "Robotics Neural Networks", "Mint Training NFTs", "Issue Model ERC-20 Tokens", "Training Pool Co-Ownership"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TREASURY & WALLETS
  // ═══════════════════════════════════════════════════════════════════════════
  treasury: {
    // Main treasury address (for skill purchases, agent fees, etc.)
    address: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
    // Foundation wallet (receives 50% of unlock proceeds)
    foundationWallet: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
    // Liquidity management wallet (receives 50% of unlock proceeds)
    liquidityWallet: "0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93",
    // Fee percentages (basis points, 100 = 1%) for other operations:
    fees: {
      p2pInference: 250, // 2.5% on P2P inference trades
      predictionMarketSale: 10000, // 100% - BonzAI captures entire sale
      smartAgentSale: 10000, // 100% - BonzAI captures entire sale
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL REGISTRY (Decentralized Claude Skills)
  // ═══════════════════════════════════════════════════════════════════════════
  skillRegistry: {
    contractAddress: ECONOMY_CONTRACTS.skillRegistry,
    ownershipContractAddress: ECONOMY_CONTRACTS.skillOwnership,
    chainId: ECONOMY_CHAIN_ID,

    // Mapping: local skill ID → on-chain bytes32 skill ID
    // Populated by scripts/register-skills.js after on-chain registration
    skillIdMap: parseSkillIdMap(),

    accessModel: 'companion-token',
    executionPrice: 0,

    // Skill categories (12 spending profile categories, matching BonzaiCompanions.sol packing order)
    // IMPORTANT: Order must match uint96 nibble layout in BonzaiCompanions.sol.
    // See src/constants/index.js SPENDING_CATEGORIES_ORDER for canonical source.
    categories: [
      "education",
      "entertainment",
      "fashion",
      "finance",
      "food",
      "healthcare",
      "housing",
      "beauty",
      "reading",
      "social",
      "travel",      // index 10 (was incorrectly 'sports')
      "sports",      // index 11 (was incorrectly 'travel')
    ],

    // Trusted attestation signer for cross-chain companion verification (set after deployment)
    attestationSignerAddress: '0x9D7d090865f9fEd3C0beA3f851523228c0b76BFE',

    // Built-in skills (bundled with app, available for purchase)
    builtinSkills: [
      "polymarket-top-performers-v1.0.0",
      "prediction-market-maker-v1.0.0",
    ],

    // Gateways for skill definition fetching
    gateways: [
      "https://gateway.pinata.cloud/ipfs/",
      "https://ipfs.io/ipfs/",
      "https://cloudflare-ipfs.com/ipfs/",
    ],
  },

  companionTokens: {
    byCompanionId: parseCompanionTokens(),
    tradeUrlTemplate:
      env.VITE_COMPANION_TOKEN_TRADE_URL_TEMPLATE ||
      'https://app.uniswap.org/swap?chain=robinhood&outputCurrency={tokenAddress}',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT NFT MINTING (canonical economy chain only)
  // ═══════════════════════════════════════════════════════════════════════════
  contentNFT: {
    economy: {
      contractAddress: ECONOMY_CONTRACTS.collectibles,
      factoryAddress: ECONOMY_CONTRACTS.collectiblesFactory,
      chainId: ECONOMY_CHAIN_ID,
      standard: 'ERC-721',
      mintFees: ['0.0005', '0.001', '0.0015', '0.0025', '0.0035', '0.005'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MINT LEVEL GATING (inferenceType → LVL mapping for minting)
  // ═══════════════════════════════════════════════════════════════════════════
  // Generation is FREE (LVL0). These levels gate MINTING content as NFTs.
  mintLevels: {
    text: 'LVL1',
    audio: 'LVL2',
    image: 'LVL3',
    video: 'LVL4',
    object: 'LVL5',
    training: 'LVL6',
  },

  // Content type indices (matching BonzaiCollectibles.sol Provenance.contentType)
  // Canonical source: src/constants/index.js (CONTENT_TYPE_MAP)
  contentTypeIndex: {
    text: 0,
    audio: 1,
    image: 2,
    video: 3,
    object: 4,
    training: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MINT POOL & REVENUE CONTRACTS (Ethereum)
  // ═══════════════════════════════════════════════════════════════════════════
  mintPool: {
    contractAddress: ECONOMY_CONTRACTS.mintPool,
    chainId: ECONOMY_CHAIN_ID,
  },
  royaltySplitter: {
    contractAddress: ECONOMY_CONTRACTS.royaltySplitter,
    chainId: ECONOMY_CHAIN_ID,
  },
  fineTuneTokenFactory: {
    contractAddress: ECONOMY_CONTRACTS.fineTuneTokenFactory,
    chainId: ECONOMY_CHAIN_ID,
    totalSupply: '1000000000', // 1 billion tokens per model
    minEthLiquidity: '0.01',
    lpLocked: true,
    deadAddress: '0x000000000000000000000000000000000000dEaD',

    // Hook fee split: 80% creator, 10% treasury, 10% MintPool(LVL6)
    hookFeeBps: 100, // 1% total swap fee
    beneficiaryShareBps: 8000,
    treasuryShareBps: 1000,
    mintPoolShareBps: 1000,
    mintPoolIndex: 5, // LVL6 / training pool

    description: 'Launch burnable ERC-20 tokens for fine-tuned models with V4 LP (unruggable, hook fees)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROOF-OF-CONTRIBUTION REGISTRIES (Ethereum)
  // ═══════════════════════════════════════════════════════════════════════════
  contributionEconomy: {
    chainId: ECONOMY_CHAIN_ID,
    stakingVaultAddress: ECONOMY_CONTRACTS.stakingVault,
    revenueRouterAddress: ECONOMY_CONTRACTS.revenueRouter,
    contributionRegistryAddress: ECONOMY_CONTRACTS.contributionRegistry,
    datasetRegistryAddress: ECONOMY_CONTRACTS.datasetRegistry,
    modelRegistryAddress: ECONOMY_CONTRACTS.modelRegistry,
    evaluationRegistryAddress: ECONOMY_CONTRACTS.evaluationRegistry,
    contributionScoreOracleAddress: ECONOMY_CONTRACTS.contributionScoreOracle,
    jobEscrowAddress: ECONOMY_CONTRACTS.jobEscrow,
    defaultLicenseURI: 'https://bonzai.sh/licenses/contribution-v1',
    visibility: {
      private: 0,
      desktop: 1,
      publishable: 2,
      public: 3,
    },
    contributionTypes: {
      dataset_text: 0,
      dataset_image: 1,
      dataset_video: 2,
      appraisal: 3,
      generation: 4,
      model_adapter: 5,
      skill: 6,
      evaluation: 7,
      provider_time: 8,
      companion_action: 9,
    },
  },

  stakingEconomy: {
    chainId: ECONOMY_CHAIN_ID,
    stakingVaultAddress: ECONOMY_CONTRACTS.stakingVault,
    revenueRouterAddress: ECONOMY_CONTRACTS.revenueRouter,
    tokenAddress: BONZAI_ECONOMY,
    utilityTiers: [
      { tier: 1, label: 'Contributor', amount: 1000, rights: ['Publish basic contribution packs', 'Mint text assets', 'Join contribution routes'] },
      { tier: 2, label: 'Curator', amount: 5000, rights: ['Publish curated datasets', 'Boost curation weight', 'Mint audio assets'] },
      { tier: 3, label: 'Builder', amount: 10000, rights: ['Publish image/model assets', 'Boost marketplace trust', 'Mint image assets'] },
      { tier: 4, label: 'Producer', amount: 25000, rights: ['Back fine-tune campaigns', 'Boost provider routing', 'Mint video assets'] },
      { tier: 5, label: 'Operator', amount: 33000, rights: ['Launch companions and advanced skills', 'Boost company reputation', 'Mint 3D assets'] },
      { tier: 6, label: 'Sovereign', amount: 50000, rights: ['Launch high-value model tokens', 'Create Zero-Human Companies', 'Mint training assets'] },
    ],
    lockOptions: [
      { label: 'Flexible', seconds: 0, multiplierBps: 10000 },
      { label: '30 days', seconds: 2592000, multiplierBps: 11000 },
      { label: '90 days', seconds: 7776000, multiplierBps: 12500 },
      { label: '180 days', seconds: 15552000, multiplierBps: 14500 },
      { label: '365 days', seconds: 31536000, multiplierBps: 17000 },
    ],
    formula: 'utility_weight = staked_BONZAI * lock_multiplier * contribution_multiplier',
    description: 'Stake BONZAI to publish, curate, back, serve, and earn from contribution-backed AI assets.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANION NFT CONTRACT (Ethereum - ERC-8004 + self-custody agent wallet)
  // ═══════════════════════════════════════════════════════════════════════════
  companionNFT_BASE: {
    // BonzaiCompanions contract on Ethereum
    contractAddress: ECONOMY_CONTRACTS.companions,
    chainId: ECONOMY_CHAIN_ID,
    standard: 'ERC-8004',

    // Flat mint price in ETH (no rarity tiers)
    mintPrice: "0.30", // 0.25 ETH protocol fee + 0.05 ETH permanent token liquidity

    // Metadata gateway (IPFS via Pinata)
    metadataGateway: "https://gateway.pinata.cloud/ipfs/",

    // ERC-8004 specific
    x402Support: false,

    // Self-custody agent wallet
    agentWalletProvider: 'local',

    // DEPLOY: Upload placeholder JSON to IPFS via Pinata, then replace this with the real ipfs:// CID
    placeholderURI: 'ipfs://PLACEHOLDER_CID',

    // Default values for external minting (Etherscan / dApp)
    externalMintDefaults: {
      spendingProfileUint96: '93824992236885', // 0x555555555555 (all-5s)
      personalityHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LUKSO COMPANION NFT (LSP8 / NFT 2.0 + Universal Profile)
  // ═══════════════════════════════════════════════════════════════════════════
  companionNFT_LUKSO: {
    // BonzaiCompanionLSP8 contract on LUKSO (to be deployed)
    contractAddress: null, // Will be set after deployment
    chainId: 42, // LUKSO Mainnet
    standard: "LSP8+UP", // NFT 2.0 standard with Universal Profile support

    // Universal Profile Factory address
    upFactoryAddress: "0x2300000A84D25dF63081feAa37ba6b62C4c89a30",

    // Mint price in LYX
    mintPrice: "0.1", // 0.1 LYX

    // Platform fee on marketplace sales (basis points, 250 = 2.5%)
    platformFeeBps: 250,

    // Metadata gateway (IPFS via Pinata, LSP4 metadata)
    metadataGateway: "https://gateway.pinata.cloud/ipfs/",

    // LSP8 token ID format (number-based for sequential IDs)
    tokenIdFormat: "NUMBER", // _LSP8_TOKENID_FORMAT_NUMBER

    // x402 NOT supported on LUKSO (yet)
    x402Support: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // x402 PAYMENT CONFIGURATION (ETH-Only)
  // ═══════════════════════════════════════════════════════════════════════════
  x402: {
    enabled: false,
    // Payment token (native ETH - no USDC, no ERC-3009)
    paymentToken: "ETH",
    version: "x402-eth/1.0",

    // Supported chains for x402 ETH payments
    supportedChains: {
      1: { name: 'Ethereum', rpc: ETHEREUM_RPC, explorer: ETHEREUM_EXPLORER, usdc: USDC_ETHEREUM, enabled: ECONOMY_CHAIN_ID === 1 },
      42161: { name: 'Arbitrum', rpc: 'https://arbitrum.publicnode.com', explorer: 'https://arbiscan.io', usdc: USDC_ARBITRUM, enabled: ECONOMY_CHAIN_ID === 42161 },
      8453: { name: 'Base', rpc: env.VITE_BASE_RPC_URL || 'https://mainnet.base.org', explorer: 'https://basescan.org', usdc: USDC_BASE, enabled: ECONOMY_CHAIN_ID === 8453 },
    },

    // Default chain for x402 payments
    defaultChainId: ECONOMY_CHAIN_ID,

    // EIP-712 signature parameters
    signatureValidityPeriod: 300, // 5 minutes
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT WALLET CONFIGURATION (Local Self-Custody)
  // ═══════════════════════════════════════════════════════════════════════════
  // Note: We use local deterministic wallets derived from a master secret.
  // No CDP or Coinbase API. Wallets are receive-only in this release.
  agentWallet: {
    // Default network for agent wallets
    defaultNetwork: ECONOMY_NETWORK_KEY,
    defaultChainId: ECONOMY_CHAIN_ID,

    defaultMaxTransaction: "0",
    defaultDailyLimit: "0",

    // Supported operations
    enabledOperations: [
      'receive',   // Revenue capture only; companions cannot initiate payments
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // P2P DISTRIBUTED INFERENCE NETWORK
  // ═══════════════════════════════════════════════════════════════════════════
  p2pNetwork: {
    providerRegistryAddress: ECONOMY_CONTRACTS.providerRegistry,
    serviceTimeAddress: ECONOMY_CONTRACTS.serviceTime,
    chainId: ECONOMY_CHAIN_ID,
    pricing: 'free',
    rewardSource: 'mint-pool-service-time',

    // Bootstrap nodes (public relays)
    bootstrapNodes: [
      // Will be populated with official BonzAI relays
    ],

    // Supported pipelines for P2P inference (matches flagship.js MODEL_REQUIREMENTS)
    pipelines: {
      // LLM Models (via OpenClaw port 3002)
      llm: [
        "llm_gemma_3_1b",
        "llm_gpt_oss_20b",
        "llm_gpt_oss_120b",
        "llm_hermes_4_14b",
        "llm_llama_3_1_8b",
        "llm_llama_4_scout_17b_16e",
        "llm_llama_4_maverick_17b_128e",
        "llm_nemomix_12b_heretic",
        "llm_phi_4_mini",
        "llm_glm_4_7_q2",
        "llm_glm_4_7",
        "llm_glm_4_7_q8",
        "llm_glm_5_1",
        "llm_qwen3_5_9b_deepseek_v4_flash",
        "llm_qwen3_coder_next",
        "llm_kimi_k2_6",
        "llm_minimax_m2_7",
        "llm_mistral_small_3_2_24b",
        "llm_devstral_small_2_24b",
        "llm_ministral_3b",
        "llm_ministral_14b_reasoning",
        "llm_nemotron_3_nano_4b",
        "llm_nemotron_3_nano_30b_a3b",
      ],
      // Image Generation (via Flask port 65000)
      image: [
        "image_turbo",      // FLUX Klein - /image/turbo
        "image_quality",    // Z-Image Turbo - /image/quality
        "image_standard",   // SDXL 1.0 - /image/standard
      ],
      // Audio Generation (via Flask port 65000)
      audio: [
        "audio_turbo",      // Fast TTS - /audio/turbo
        "audio_quality",    // Quality TTS - /audio/quality/persona
      ],
      // Music Generation (via Flask port 65000)
      music: [
        "music",            // ACE-Step - /audio/music
      ],
      // Video Generation (via Flask port 65000)
      video: [
        "video_fast",       // LTX-2 Video - /video
      ],
      // Vision Analysis (via Flask port 65000)
      vision: [
        "vision",           // Qwen3-VL 2B - /vision/analyze
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL LINKS
  // ═══════════════════════════════════════════════════════════════════════════
  links: {
    buyBonzai:
      `https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${BONZAI_ETHEREUM}`,
    docs: "https://docs.bonzai.sh",
    discord: "https://discord.gg/bonzai",
    twitter: "https://twitter.com/BonzAI_AI",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LUKSO UNIVERSAL PROFILE FACTORY (LSP23 — same address on LUKSO, Base, Ethereum)
  // ═══════════════════════════════════════════════════════════════════════════
  luksoUPFactory: {
    lsp23FactoryAddress: '0x2300000A84D25dF63081feAa37ba6b62C4c89a30',
    upImplementation: '0x3024D38EA2434BA6635003Dc1BDC0daB5882ED4F',
    keyManagerImplementation: '0x2Fe3AeD98684E7351aD2D408A43cE09a738BF8a4',
    postDeploymentModule: '0x000000000066093407b6704B89793beFfD0D8F00',
    universalReceiverDelegate: '0x7870C5B8BC9572A8001C3f96f7ff59961B23500D',

    // LUKSO relay (gasless on chains 42/4201 ONLY)
    relayApi: 'https://relayer.mainnet.lukso.network/api',

    // Agent wallet controller permissions (minimum necessary)
    // CALL (0x0800) + TRANSFERVALUE (0x0200) + SETDATA (0x040000) + SIGN (0x200000)
    agentPermissions: '0x0000000000000000000000000000000000000000000000000000000000240a00',
  },

  // WalletConnect (needed for Electron; MetaMask mobile works via QR)
  walletconnect: {
    projectId: (import.meta?.env?.VITE_WALLETCONNECT_PROJECT_ID || '844c2e04d27062b198ef7306820a2ff8'),
    chains: [ECONOMY_CHAIN_ID],
    optionalChains: [...new Set([1, 42161, 8453, 42].filter((id) => id !== ECONOMY_CHAIN_ID))],
  },

  // Wallet addresses reference
  wallets: {
    foundation: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
    liquidity: "0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANION TOKEN FACTORY (Ethereum - Token Issuance)
  // ═══════════════════════════════════════════════════════════════════════════
  companionTokenFactory: {
    // CompanionTokenFactory contract on Ethereum
    contractAddress: ECONOMY_CONTRACTS.companionTokenFactory,
    chainId: ECONOMY_CHAIN_ID,

    // Token settings
    totalSupply: "1000000000", // 1 billion tokens per companion
    minEthLiquidity: "0.01", // Minimum ETH for initial liquidity

    // LP position NFT locked at dead address - unruggable liquidity
    lpLocked: true,
    deadAddress: "0x000000000000000000000000000000000000dEaD",

    // Hook fee split: 40% agent wallet, 40% owner, 10% treasury, 10% pools
    hookFeeBps: 100, // 1% total swap fee
    companionWalletBps: 4000,
    companionOwnerBps: 4000,
    treasuryShareBps: 1000,
    companionPoolBps: 1000,

    // Description
    description: "Launch burnable ERC-20 tokens with V4 LP (unruggable, hook fees)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE MODE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  purchaseMode: {
    defaultMode: 'default',       // 'default' or 'specialized'
    defaultSlippage: 500,         // 5% in basis points
    swapDeadlineSeconds: 300,     // 5 minutes
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UNISWAP V4 ADDRESSES
  // Arbitrum is now the primary deployment target. Base addresses are kept
  // here for any legacy reads but should not be used by new code.
  // ═══════════════════════════════════════════════════════════════════════════
  uniswap: {
    ethereum: {
      poolManager: env.VITE_UNISWAP_V4_POOL_MANAGER || null,
      positionManager: env.VITE_UNISWAP_V4_POSITION_MANAGER || null,
      universalRouter: env.VITE_UNISWAP_V4_UNIVERSAL_ROUTER || null,
      quoter: env.VITE_UNISWAP_V4_QUOTER || null,
      stateView: env.VITE_UNISWAP_V4_STATE_VIEW || null,
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      feeHook: env.VITE_BONZAI_UNISWAP_HOOK_ADDRESS || null,
    },
    arbitrum: {
      // Source: Uniswap V4 official deployments
      // https://docs.uniswap.org/contracts/v4/deployments
      poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
      positionManager: '0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869',
      universalRouter: '0xa51afafe0263b40edaef0df8781ea9aa03e381a3',
      quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
      stateView: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990',
      // Permit2 is the canonical singleton — same address on every EVM chain.
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      // Hook address is set after CREATE2 deployment via deploy-arbitrum.js.
      feeHook: '0x0000000000000000000000000000000000000000',
    },
    // Legacy — DO NOT USE for new code paths.
    base: {
      poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
      positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
      universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
      quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
      stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      feeHook: '0x0d4B1d95ec00A6BC794B4bE18D1dF4136D524090',
    },
  },
};

export default CONFIG;
