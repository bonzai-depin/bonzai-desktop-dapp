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
      rpc: "https://cloudflare-eth.com",
      explorer: "https://etherscan.io",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
    arbitrum: {
      chainId: 42161,
      chainIdHex: "0xa4b1",
      name: "Arbitrum One",
      rpc: "https://arb1.arbitrum.io/rpc",
      explorer: "https://arbiscan.io",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════
  tokens: {
    BONZAI: {
      // Same token address deployed on both chains (update if different)
      ethereum: "0xdda9ff241c7160be8295ef9eca2e782361467666",
      arbitrum: "0x0a84edf70f30325151631ce7a61307d1f4d619a3",
      decimals: 18,
      symbol: "BONZAI",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL SYSTEM CONFIGURATION (6 Levels)
  // ═══════════════════════════════════════════════════════════════════════════
  levels: {
    LVL1: {
      id: 1,
      name: "Text Generation",
      description: "Instant Chat. Offline, Private & Personal.",
      icon: "chat",
      holdingRequired: 99, // BONZAI tokens required
      nftTokenId: 1, // ERC1155 token ID for this level
      features: ["unlimited-text-generation", "unlimited-character-roleplay", "unlimited-vibe-coding"],
    },
    LVL2: {
      id: 2,
      name: "Audio Generation",
      description: "Generate music and sound",
      icon: "music_note",
      holdingRequired: 599, // 99 + 500
      nftTokenId: 2,
      features: ["audio-generation", "voice-synthesis", "music-creation"],
    },
    LVL3: {
      id: 3,
      name: "Image Generation",
      description: "Create AI images",
      icon: "image",
      holdingRequired: 1099, // 599 + 500
      nftTokenId: 3,
      features: ["image-generation", "flux", "sdxl", "img2img"],
    },
    LVL4: {
      id: 4,
      name: "Video Generation",
      description: "Generate AI videos",
      icon: "videocam",
      holdingRequired: 1599, // 1099 + 500
      nftTokenId: 4,
      features: ["video-generation", "ltx", "wan", "hunyuan"],
    },
    LVL5: {
      id: 5,
      name: "Game Generation",
      description: "Generate 2D/3D games",
      icon: "sports_esports",
      holdingRequired: 2099, // 1599 + 500
      nftTokenId: 5,
      features: ["game-generation", "2d-games", "3d-games", "p5js", "threejs"],
    },
    LVL6: {
      id: 6,
      name: "Training",
      description: "Train custom models",
      icon: "model_training",
      holdingRequired: 2599, // 2099 + 500
      nftTokenId: 6,
      features: ["model-training", "fine-tuning", "lerobot"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NFT CONTRACT (ERC1155 for Level Access)
  // ═══════════════════════════════════════════════════════════════════════════
  nft: {
    // BonzAI Access Pass - ERC1155 collection
    address: "0x0000000000000000000000000000000000000000", // TODO: Deploy
    chainId: 42161, // Deployed on Arbitrum
    name: "BonzAI Access Pass",
    symbol: "BONZAI-PASS",
    // Staking contract for NFT staking requirements
    stakingContract: "0x0000000000000000000000000000000000000000", // TODO: Deploy
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TREASURY & FEES
  // ═══════════════════════════════════════════════════════════════════════════
  treasury: {
    address: "0x0000000000000000000000000000000000000000", // TODO: Set treasury wallet
    // BonzAI captures 100% of sales proceeds for:
    // - Prediction Market projects
    // - Smart Agent workflows
    // Fee percentages (basis points, 100 = 1%) for other operations:
    fees: {
      p2pInference: 250, // 2.5% on P2P inference trades
      nftMint: 100, // 1% on NFT mints
      // Note: Prediction markets and smart agents = 100% to treasury (full sale price)
      predictionMarketSale: 10000, // 100% - BonzAI captures entire sale
      smartAgentSale: 10000, // 100% - BonzAI captures entire sale
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

  // LVL∞ lifetime unlock via on-chain registry
  infinity: {
    // Deployed BonzAIInfinityRegistry address (Ethereum mainnet)
    registryAddress: '',
    // Treasury receiving the ETH payments
    treasury: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89',
  },
};

export default CONFIG;
