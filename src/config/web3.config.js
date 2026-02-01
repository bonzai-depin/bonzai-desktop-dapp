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
      description: "Local chat with 20+ models.",
      icon: "chat",
      holdingRequired: 1000,
      features: ["Unlimited Text Generation", "Unlimited Character Roleplay", "Unlimited Vibe Coding"],
    },
    LVL2: {
      id: 2,
      name: "Audio Generation",
      description: "Text-to-Speech and more.",
      icon: "headphones",
      holdingRequired: 5000,
      features: ["Unlimited Audio Generation", "Voice Cloning", "Text-to-Speech"],
    },
    LVL3: {
      id: 3,
      name: "Image Generation",
      description: "Turn text into images.",
      icon: "image",
      holdingRequired: 10000,
      features: ["Unlimited Image Generation", "Uncensored Images", "Style Transfer"],
    },
    LVL4: {
      id: 4,
      name: "Video Generation",
      description: "Turn text and images into videos.",
      icon: "movie",
      holdingRequired: 25000,
      features: ["Unlimited Video Generation", "Image-to-Video", "Text-to-Video"],
    },
    LVL5: {
      id: 5,
      name: "Game Generation",
      description: "Turn text into 3D assets.",
      icon: "3d_rotation",
      holdingRequired: 33000,
      features: ["Unlimited Game Generation", "3D Assets", "Virtual Effects"],
    },
    LVL6: {
      id: 6,
      name: "Model Training",
      description: "Train models and robots.",
      icon: "exercise",
      holdingRequired: 50000,
      features: ["Robotics Neural Networks", "Consistent Characters", "Custom Large Language Models"],
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
