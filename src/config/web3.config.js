/**
 * BonzAI Web3 Configuration
 *
 * Defines token addresses, level requirements, NFT contracts, and treasury settings
 */

export const CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  networks: {
    ethereum: {
      chainId: 1,
      chainIdHex: "0x1",
      name: "Ethereum Mainnet",
      rpc: "https://ethereum.publicnode.com",
      rpcFallbacks: [
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://eth.drpc.org",
      ],
      explorer: "https://etherscan.io",
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
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════
  tokens: {
    BONZAI: {
      // Token addresses with proper checksum format
      ethereum: "0xDdA9Ff241C7160be8295EF9Eca2e782361467666",
      arbitrum: "0x0a84edf70f30325151631ce7a61307d1f4d619a3",
      decimals: 18,
      symbol: "BONZAI",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL SYSTEM CONFIGURATION (6 Levels)
  // ═══════════════════════════════════════════════════════════════════════════
  // Access via: BONZAI token holding OR 1 ETH one-time payment (unlocks ALL levels)
  levels: {
    LVL1: {
      id: 1,
      name: "Text Generation",
      description: "Access text-powered agentic workflows.",
      icon: "chat",
      holdingRequired: 1000,
      features: ["SOTA Large Language Models", "Unlimited Text Generation", "Unlimited Character Roleplay", "Unlimited Vibe Coding"],
    },
    LVL2: {
      id: 2,
      name: "Audio Generation",
      description: "Access audio-powered agentic workflows.",
      icon: "headphones",
      holdingRequired: 5000,
      features: ["SOTA Audio Generation", "Unlimited Voice Design", "Unlimited Voice Cloning", "Unlimited Text-to-Speech", "Unlimited Music"],
    },
    LVL3: {
      id: 3,
      name: "Image Generation",
      description: "Access image-powered agentic workflows.",
      icon: "image",
      holdingRequired: 10000,
      features: ["SOTA Image Generation", "Uncensored Images", "Unlimited Edits", "Unlimited Style Transfer"],
    },
    LVL4: {
      id: 4,
      name: "Video Generation",
      description: "Access video-powered agentic workflows.",
      icon: "movie",
      holdingRequired: 25000,
      features: ["SOTA Video Generation", "Unlimited Image-to-Video", "Unlimited Text-to-Video"],
    },
    LVL5: {
      id: 5,
      name: "3D Generation",
      description: "Access 3D-powered agentic workflows.",
      icon: "3d_rotation",
      holdingRequired: 33000,
      features: ["SOTA Asset Generation", "Unlimited 3D Objects (Web)"],
    },
    LVL6: {
      id: 6,
      name: "Model Training",
      description: "Access training-powered agentic workflows.",
      icon: "exercise",
      holdingRequired: 50000,
      features: ["SOA Training", "Custom Large Language Models", "Custom Image Models", "Robotics Neural Networks"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL UNLOCK CONTRACT (Single 1 ETH payment unlocks ALL levels)
  // ═══════════════════════════════════════════════════════════════════════════
  levelUnlock: {
    // BonzaiUnlock contract on Arbitrum (deployed)
    registryAddress: "0xE49492A2604Cea2a50060E47215Cb19bffD1Edae",
    chainId: 42161, // Arbitrum One
    // Fixed price: 1 ETH unlocks all 6 levels permanently
    unlockPrice: "1.0", // ETH
    // Proceeds split (configured in contract):
    // - 50% to Foundation: 0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89
    // - 50% to Liquidity:  0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93
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
    // BonzaiSkillRegistry contract on Arbitrum (to be deployed)
    contractAddress: null, // Will be set after deployment
    chainId: 42161, // Arbitrum One

    // Revenue split (configured in contract)
    authorShareBps: 9000, // 90% to skill author
    platformShareBps: 1000, // 10% to platform

    // Default pricing for new skills
    defaultPricing: {
      purchasePrice: "0.1", // ETH (one-time)
      runningFee: 99, // BONZAI tokens (per execution)
    },

    // Skill categories
    categories: [
      "analysis",
      "trading",
      "prediction",
      "training",
      "automation",
      "utility",
    ],

    // Built-in skills (bundled with app, available for purchase)
    builtinSkills: [
      "polymarket-top-performers-v1.0.0",
      "tcg-insurance-v1.0.0",
      "prediction-market-maker-v1.0.0",
    ],

    // IPFS/Arweave gateways for skill definition fetching
    gateways: [
      "https://gateway.irys.xyz/",
      "https://arweave.net/",
      "https://ipfs.io/ipfs/",
      "https://cloudflare-ipfs.com/ipfs/",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // P2P DISTRIBUTED INFERENCE NETWORK
  // ═══════════════════════════════════════════════════════════════════════════
  p2pNetwork: {
    // BonzaiProviderRegistry contract on Arbitrum
    providerRegistryAddress: null, // Will be set after deployment
    // BonzaiP2PPayment contract on Arbitrum
    paymentContractAddress: null, // Will be set after deployment
    chainId: 42161, // Arbitrum One

    // USDC token on Arbitrum (for payments)
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Native USDC on Arbitrum

    // Default pricing (USDC with 6 decimals)
    defaultPricePerToken: "100000", // 0.1 USDC per 1000 tokens (0.0001 per token)

    // Platform fee (basis points, 250 = 2.5%)
    platformFeeBps: 250,

    // Bootstrap nodes (public relays)
    bootstrapNodes: [
      // Will be populated with official BonzAI relays
    ],

    // Supported pipelines for P2P inference (matches flagship.js MODEL_REQUIREMENTS)
    pipelines: {
      // LLM Models (via OpenClaw port 3002)
      llm: [
        "llm_codestral_22b",
        "llm_deepseek_r1_1_5b",
        "llm_deepseek_r1_7b",
        "llm_deepseek_r1_32b",
        "llm_gemma_3_1b",
        "llm_gpt_oss_20b",
        "llm_hermes_4_14b",
        "llm_llama_2_7b",
        "llm_llama_3_1_8b",
        "llm_mistral_7b",
        "llm_mythomax_13b",
        "llm_phi_3_mini",
        "llm_phi_4_mini",
        "llm_qwen_2_5_3b",
        "llm_qwen_coder_7b",
        "llm_qwen_coder_14b",
        "llm_qwen_coder_32b",
        "llm_qwen3_coder_30b",
        "llm_yi_coder_9b",
        "llm_glm_4_7_flash",
        "llm_qwen3_coder_next",
      ],
      // Image Generation (via Flask port 65000)
      image: [
        "image_turbo",      // FLUX Klein - /image/turbo
        "image_quality",    // FLUX Krea - /image/quality
        "image_standard",   // SDXL 1.0 - /image/standard
        "image_advanced",   // Z Turbo - /image/advanced
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
  // MARKETPLACE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  marketplace: {
    enabled: true,
    requiresHolding: false, // No holding requirements for marketplace access
    paymentToken: "wTAO",
    orderBookDepth: 50, // Max orders per side
    minOrderSize: 0.001, // Minimum wTAO per order
    maxOrderSize: 1000, // Maximum wTAO per order
    // Sales model
    capturesFullProceeds: true, // BonzAI receives 100% of prediction market & agent sales
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL LINKS
  // ═══════════════════════════════════════════════════════════════════════════
  links: {
    buyBonzai:
      "https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3",
    docs: "https://docs.bonzai.ai",
    discord: "https://discord.gg/bonzai",
    twitter: "https://twitter.com/BonzAI_AI",
  },

  // WalletConnect (needed for Electron; MetaMask mobile works via QR)
  walletconnect: {
    projectId: (import.meta?.env?.VITE_WALLETCONNECT_PROJECT_ID || '844c2e04d27062b198ef7306820a2ff8'),
    chains: [1], // Ethereum mainnet
    optionalChains: [42161], // Arbitrum optional (only if you want WC to support it)
  },

  // Wallet addresses reference
  wallets: {
    foundation: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
    liquidity: "0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93",
  },
};

export default CONFIG;
