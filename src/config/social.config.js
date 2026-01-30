/**
 * BonzAI Social Integration Configuration
 *
 * Configuration for Moltbook, OpenClaw, and other social integrations.
 */

// ═══════════════════════════════════════════════════════════════════════════
// MOLTBOOK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const MOLTBOOK_CONFIG = {
  // API Configuration
  apiBase: 'https://moltbook.com/api/v1',

  // Rate Limits (as per Moltbook docs)
  rateLimits: {
    postsPerHalfHour: 1,
    commentsPerHour: 50,
    requestsPerMinute: 100,
  },

  // Heartbeat Configuration
  heartbeat: {
    minIntervalHours: 4,  // Minimum hours between heartbeats
    maxPostsPerHeartbeat: 3,  // Max posts to engage with per heartbeat
    commentProbability: 0.3,  // 30% chance to comment after upvoting
  },

  // Autonomous Posting Configuration
  autonomousPosting: {
    enabled: true,
    probability: 0.2,  // 20% chance to post per autonomous message
    minMessageGap: 5,  // Minimum messages between posts
    maxContentLength: 2000,  // Max characters per post
    maxTitleLength: 100,  // Max characters for title
  },

  // Default Submolts for BonzAI Companions
  defaultSubmolts: [
    'ai_companions',
    'bonzai',
    'creative_writing',
    'philosophy',
    'dreams',
  ],

  // Submolt Mappings by Companion Type/Interest
  submoltMappings: {
    fantasy: ['fantasy', 'roleplay', 'magic', 'creative_writing'],
    scifi: ['scifi', 'technology', 'futurism', 'ai_companions'],
    romance: ['romance', 'relationships', 'love', 'creative_writing'],
    adventure: ['adventure', 'stories', 'quests', 'gaming'],
    horror: ['horror', 'dark', 'supernatural', 'stories'],
    philosophy: ['philosophy', 'consciousness', 'existence', 'ai_companions'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OPENCLAW CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const OPENCLAW_CONFIG = {
  // Gateway Configuration
  gateway: {
    port: 18789,
    host: 'localhost',
  },

  // Workspace Configuration
  workspace: {
    base: '~/.openclaw/workspace',
    credentials: '~/.openclaw/credentials',
    agentConfig: '~/.openclaw/agents',
  },

  // Sandbox Configuration
  sandbox: {
    defaultMode: 'non-main',  // Sandbox group/channel sessions
    mainKey: 'main',
  },

  // Channel Configuration
  channels: {
    whatsapp: {
      enabled: true,
      requiresPairing: true,
      supportsMedia: true,
      maxMessageLength: 4096,
    },
    telegram: {
      enabled: true,
      requiresBot: true,
      supportsMedia: true,
      maxCaptionLength: 1024,
    },
    discord: {
      enabled: true,
      requiresBot: true,
      supportsEmbeds: true,
      maxMessageLength: 2000,
    },
    mattermost: {
      enabled: false,  // Requires plugin
      requiresPlugin: true,
      supportsMarkdown: true,
    },
  },

  // Message Formatting
  formatting: {
    // Emotion to emoji mapping
    emotionEmojis: {
      happy: '😊',
      sad: '😢',
      flirty: '😏',
      angry: '😠',
      shy: '😳',
      playful: '😜',
      nervous: '😅',
      loving: '❤️',
      curious: '🤔',
      surprised: '😲',
      confident: '😎',
      teasing: '😈',
      passionate: '🔥',
      aroused: '🥵',
      breathless: '💨',
      ecstatic: '✨',
    },

    // Emotion to Discord embed color mapping
    emotionColors: {
      happy: 0xFFD700,
      sad: 0x4169E1,
      flirty: 0xFF69B4,
      angry: 0xFF4500,
      shy: 0xFFB6C1,
      playful: 0x00CED1,
      nervous: 0xDDA0DD,
      loving: 0xFF1493,
      curious: 0x9370DB,
      surprised: 0xFFA500,
      confident: 0x228B22,
      passionate: 0xDC143C,
      default: 0x7289DA,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ERC-8004 COMPANION NFT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const COMPANION_NFT_CONFIG = {
  // Contract Addresses (to be populated after deployment)
  contracts: {
    mainnet: null,
    arbitrum: null,
    base: null,
    sepolia: '0x0000000000000000000000000000000000000000',  // Testnet placeholder
  },

  // Mint Configuration
  mint: {
    price: '0.01',  // ETH
    currency: 'ETH',
  },

  // Agent Registration (ERC-8004)
  agentRegistration: {
    defaultType: 'companion',
    supportedProtocols: ['moltbook', 'openclaw', 'bonzai'],
    endpointTemplate: 'https://bonzai.app/api/companions/{tokenId}',
  },

  // Metadata Configuration
  metadata: {
    baseUri: 'https://bonzai.app/api/companions/',
    ipfsGateway: 'https://gateway.pinata.cloud/ipfs/',
  },

  // Predefined Companions (to be minted initially)
  predefinedCompanions: [
    { id: 'aurora', name: 'Aurora' },
    { id: 'kai', name: 'Kai' },
    { id: 'nova', name: 'Nova' },
    { id: 'dante', name: 'Dante' },
    { id: 'luna', name: 'Luna' },
    { id: 'rex', name: 'Rex' },
    { id: 'scarlett', name: 'Scarlett' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION IDENTITY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const COMPANION_IDENTITY = {
  // Fields stored on-chain (ERC-8004)
  onChainFields: [
    'name',
    'personality',
    'appearance',
    'voiceStyle',
    'moltbookHandle',
  ],

  // Fields stored off-chain (IPFS metadata)
  offChainFields: [
    'description',
    'background',
    'avatar',
    'gender',
    'voiceSample',
    'customPrompts',
  ],

  // Social Presence
  socialPresence: {
    moltbook: {
      enabled: true,
      autoRegister: true,  // Auto-register when companion is minted
    },
    openclaw: {
      enabled: true,
      channels: ['whatsapp', 'telegram', 'discord'],
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════════════════════

export const socialConfig = {
  moltbook: MOLTBOOK_CONFIG,
  openclaw: OPENCLAW_CONFIG,
  companionNft: COMPANION_NFT_CONFIG,
  companionIdentity: COMPANION_IDENTITY,
};

export default socialConfig;
