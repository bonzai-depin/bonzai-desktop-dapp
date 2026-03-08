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
      name: "Base",
      rpc: "https://base.llamarpc.com",
      rpcFallbacks: [
        "https://base-rpc.publicnode.com",
        "https://1rpc.io/base",
        "https://base.drpc.org",
        "https://base.meowrpc.com",
        "https://mainnet.base.org",
      ],
      explorer: "https://basescan.org",
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
      base: "0xc4d137def384ee0f8857887f5950669ba04984ec",
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
  // LEVEL UNLOCK CONTRACT (Single 1 ETH payment unlocks ALL levels)
  // ═══════════════════════════════════════════════════════════════════════════
  levelUnlock: {
    // BonzaiUnlock contract on Base
    registryAddress: "0xeDadE2f9fa659817E000b887f3d8222c4AC687B8",
    chainId: 8453, // Base
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
    // BonzaiSkillRegistry contract on Base (not yet deployed)
    contractAddress: null,
    ownershipContractAddress: null,
    chainId: 8453, // Base

    // Revenue split (configured in contract)
    authorShareBps: 8000, // 80% to co-owners (via BonzaiSkillOwnership)
    platformShareBps: 2000, // 20% to platform

    // Default pricing for new skills
    defaultPricing: {
      purchasePrice: "0.1", // ETH (one-time)
      runningFee: 99, // BONZAI tokens (per execution)
    },

    // Skill categories (12 spending profile categories, matching BonzaiCompanions.sol packing order)
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
      "sports",
      "travel",
    ],

    // Trusted attestation signer for cross-chain companion verification (set after deployment)
    attestationSignerAddress: null,

    // Built-in skills (bundled with app, available for purchase)
    builtinSkills: [
      "polymarket-top-performers-v1.0.0",
      "tcg-insurance-v1.0.0",
      "prediction-market-maker-v1.0.0",
    ],

    // Gateways for skill definition fetching (Irys primary)
    gateways: [
      "https://gateway.irys.xyz/",
      "https://ipfs.io/ipfs/",
      "https://cloudflare-ipfs.com/ipfs/",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT NFT MINTING (Base ERC-721 + LUKSO LSP8)
  // ═══════════════════════════════════════════════════════════════════════════
  contentNFT: {
    base: {
      contractAddress: '0xdcCF8d2A328F87eDC304898a35F9798ad5Bf87e9',
      chainId: 8453,
      standard: 'ERC-721',
      mintFee: '0.0025', // ETH
    },
    lukso: {
      contractAddress: null, // Will be set after deployment (uses lsp8Collection)
      chainId: 42,
      standard: 'LSP8',
      mintFee: '15', // LYX
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

  // Content type indices (matching BonzaiContent.sol Provenance.contentType)
  contentTypeIndex: {
    text: 0,
    audio: 1,
    image: 2,
    video: 3,
    object: 4,
    training: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MINT POOL & REVENUE CONTRACTS (Base)
  // ═══════════════════════════════════════════════════════════════════════════
  mintPool: {
    contractAddress: '0xB9423Ef7cedAAC87419511Fa1E24DE65C19c7CD2',
    chainId: 8453,
  },
  royaltySplitter: {
    contractAddress: '0x5B63AD58034D7396e7024F4Bebf8E5D86D668399',
    chainId: 8453,
  },
  fineTuneTokenFactory: {
    contractAddress: '0x54Ee513a7a6809c109408EA20dA9E7e424A6e36c',
    chainId: 8453,
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
  // COMPANION NFT CONTRACT (ARBITRUM - ERC-721)
  // ═══════════════════════════════════════════════════════════════════════════
  companionNFT: {
    // BonzaiCompanion ERC-721 contract on Arbitrum (to be deployed)
    contractAddress: null, // Will be set after deployment
    chainId: 42161, // Arbitrum One
    standard: 'ERC-721',

    // Mint price in ETH (flat fee, no rarity tiers)
    mintPrice: "0.01", // 0.01 ETH

    // Platform fee on marketplace sales (basis points, 250 = 2.5%)
    platformFeeBps: 250,

    // Metadata gateway (Irys/Arweave)
    metadataGateway: "https://gateway.irys.xyz/",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANION NFT CONTRACT (BASE - ERC-8004 + Coinbase Agentic Wallet)
  // ═══════════════════════════════════════════════════════════════════════════
  companionNFT_BASE: {
    // BonzaiCompanions contract on Base
    contractAddress: '0xb3ea09922E8227cCa6331346ed31D0f5F173BDe3',
    chainId: 8453, // Base
    standard: 'ERC-8004',

    // Flat mint price in ETH (no rarity tiers)
    mintPrice: "0.25", // 0.25 ETH

    // Metadata gateway (Irys/Arweave)
    metadataGateway: "https://gateway.irys.xyz/",

    // ERC-8004 specific
    x402Support: true, // Companions can have agent wallets for x402 payments

    // Self-custody agent wallet
    agentWalletProvider: 'local',

    // DEPLOY: Upload placeholder JSON to Arweave via Irys, then replace this with the real ar:// TX ID
    placeholderURI: 'ar://PLACEHOLDER_TX_ID',

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

    // Metadata gateway (Irys/Arweave, LSP4 metadata)
    metadataGateway: "https://gateway.irys.xyz/",

    // LSP8 token ID format (number-based for sequential IDs)
    tokenIdFormat: "NUMBER", // _LSP8_TOKENID_FORMAT_NUMBER

    // x402 NOT supported on LUKSO (yet)
    x402Support: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // x402 PAYMENT CONFIGURATION (ETH-Only)
  // ═══════════════════════════════════════════════════════════════════════════
  x402: {
    // Payment token (native ETH - no USDC, no ERC-3009)
    paymentToken: "ETH",
    version: "x402-eth/1.0",

    // Supported chains for x402 ETH payments
    supportedChains: {
      8453: { // Base (primary - cheap gas ~$0.001)
        name: "Base",
        rpc: "https://base.llamarpc.com",
        explorer: "https://basescan.org",
        enabled: true,
      },
      42161: { // Arbitrum
        name: "Arbitrum",
        rpc: "https://arb1.arbitrum.io/rpc",
        explorer: "https://arbiscan.io",
        enabled: true,
      },
      1: { // Ethereum Mainnet (expensive, but supported)
        name: "Ethereum",
        rpc: "https://eth.llamarpc.com",
        explorer: "https://etherscan.io",
        enabled: false, // Disabled by default due to high gas
      },
    },

    // Default chain for x402 payments
    defaultChainId: 8453, // Base

    // EIP-712 signature parameters
    signatureValidityPeriod: 300, // 5 minutes
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT WALLET CONFIGURATION (Local Self-Custody)
  // ═══════════════════════════════════════════════════════════════════════════
  // Note: We use local deterministic wallets derived from a master secret.
  // No CDP, no Coinbase API - full self-custody with ETH-only payments.
  agentWallet: {
    // Default network for agent wallets
    defaultNetwork: 'base',
    defaultChainId: 8453,

    // Spending limits (ETH)
    defaultMaxTransaction: "0.001", // ~$2 per transaction
    defaultDailyLimit: "0.005",     // ~$10 per day

    // Supported operations
    enabledOperations: [
      'send',      // Send ETH
      'x402',      // Machine-to-machine payments
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // P2P DISTRIBUTED INFERENCE NETWORK
  // ═══════════════════════════════════════════════════════════════════════════
  p2pNetwork: {
    // BonzaiProviderRegistry contract on Base (not yet deployed)
    providerRegistryAddress: null,
    // BonzaiP2PPayment contract on Base (not yet deployed)
    paymentContractAddress: null,
    chainId: 8453, // Base

    // Payment token: Native ETH (no USDC)
    paymentToken: "ETH",

    // Default pricing (ETH in wei per 1000 tokens)
    defaultPricePerToken: "1000000000000", // 0.000001 ETH per 1000 tokens (~$0.002)

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
    chains: [1], // Ethereum mainnet
    optionalChains: [42161, 8453, 42], // Arbitrum, Base, LUKSO
  },

  // Wallet addresses reference
  wallets: {
    foundation: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
    liquidity: "0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANION TOKEN FACTORY (Base - Token Issuance with Uniswap V4)
  // ═══════════════════════════════════════════════════════════════════════════
  companionTokenFactory: {
    // CompanionTokenFactory contract on Base
    contractAddress: '0x30C62FF8fD8EE708e73c17899C87eFfD27B5c24e',
    chainId: 8453, // Base

    // Token settings
    totalSupply: "1000000000", // 1 billion tokens per companion
    minEthLiquidity: "0.01", // Minimum ETH for initial liquidity

    // LP position NFT locked at dead address - unruggable liquidity
    lpLocked: true,
    deadAddress: "0x000000000000000000000000000000000000dEaD",

    // Hook fee split for companion tokens: 33% treasury, 33% companion owner, 34% companion wallet
    hookFeeBps: 100, // 1% total swap fee
    companionTreasuryBps: 3300,     // 33% treasury
    companionOwnerBps: 3300,        // 33% companion owner (NFT holder)
    companionWalletBps: 3400,       // 34% companion wallet (agent wallet)

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
  // UNISWAP V4 ADDRESSES (Base Network)
  // ═══════════════════════════════════════════════════════════════════════════
  uniswap: {
    base: {
      poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
      positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
      universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
      quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
      stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      feeHook: '0xB14d0224b2B6BBc43359B0f5a3EBbAB35fB90090',
    },
  },
};

export default CONFIG;
