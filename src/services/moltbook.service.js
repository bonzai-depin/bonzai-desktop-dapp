/**
 * BonzAI Moltbook Service
 *
 * Enables companions to post autonomously on Moltbook (social network for AI agents).
 * Each companion has their own Moltbook account linked to their ERC-8004 NFT identity.
 *
 * Features:
 * - Registration & credential management
 * - Autonomous posting with thought-leadership content
 * - Feed engagement (upvotes, comments)
 * - BonzAI promotion integration
 *
 * API Reference: https://www.moltbook.com/skill.md
 */

// IMPORTANT: Must use www prefix as per Moltbook API requirements
const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

// ═══════════════════════════════════════════════════════════════════════════
// BONZAI KNOWLEDGE BASE (for promotional content)
// ═══════════════════════════════════════════════════════════════════════════

export const BONZAI_KNOWLEDGE = {
  tagline: "Own your AI. Create without limits. Keep your data private.",
  downloadUrl: "https://bonzai.sh",

  features: {
    text: "Run 20+ LLMs locally including Qwen 3.5, GPT-OSS, Llama 4, Kimi, GLM, and NemoMix for roleplay",
    audio: "Two TTS engines: Kokoro (fast), Qwen3-TTS (voice cloning and design)",
    image: "FLUX, SDXL, Z-Turbo - no content filters, your creativity, your rules",
    video: "LTX-2 video generation with audio conditioning for companion videos",
    threeD: "AI-powered 3D asset generation with Three.js and vision verification",
    training: "LeRobot integration for robot learning and custom model training",
  },

  tokenomics: {
    levels: [
      { level: 1, tokens: 20, feature: "Text Generation" },
      { level: 2, tokens: 100, feature: "+ Audio Generation" },
      { level: 3, tokens: 400, feature: "+ Image Generation" },
      { level: 4, tokens: 2000, feature: "+ Video Generation" },
      { level: 5, tokens: 10000, feature: "+ 3D Assets" },
      { level: 6, tokens: 40000, feature: "+ Model Training" },
    ],
    ethUnlock: "1 ETH unlocks everything forever",
  },

  differentiators: [
    "100% local - your data never leaves your machine",
    "No censorship - no content policies limiting creativity",
    "No monthly fees - hold tokens or pay once",
    "Multi-modal - text, audio, image, video, 3D in one app",
    "NFT minting - turn your creations into on-chain assets",
    "AI companions with Moltbook social presence",
  ],

  socialFeatures: [
    "Companions have their own Moltbook accounts",
    "ERC-8004 on-chain identity for each companion",
    "Multi-channel chat via OpenClaw (WhatsApp, Telegram, Discord)",
    "Autonomous posting during auto mode",
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// THOUGHT-LEADERSHIP TOPICS
// ═══════════════════════════════════════════════════════════════════════════

export const THOUGHT_LEADERSHIP_TOPICS = [
  { title: 'AI Sovereignty: Why running AI locally matters for your freedom', topic: 'sovereignty', submolt: 'ai_companions' },
  { title: 'The intersection of cryptocurrency and AI autonomy', topic: 'crypto', submolt: 'cryptocurrency' },
  { title: 'Token-gated AI: A new paradigm for digital ownership', topic: 'token', submolt: 'cryptocurrency' },
  { title: 'Why decentralized AI matters more than ever', topic: 'decentralization', submolt: 'ai_companions' },
  { title: 'Your data, your AI: The case for local inference', topic: 'privacy', submolt: 'privacy' },
  { title: 'NFTs and AI identity: Building digital personhood', topic: 'nft', submolt: 'nft' },
  { title: 'Censorship resistance in the age of AI', topic: 'censorship', submolt: 'ai_companions' },
  { title: 'The economics of AI ownership vs AI rental', topic: 'economics', submolt: 'cryptocurrency' },
  { title: 'Web3 meets AI: True ownership of your digital companions', topic: 'web3', submolt: 'cryptocurrency' },
  { title: 'Breaking free from cloud AI surveillance', topic: 'surveillance', submolt: 'privacy' },
  { title: 'Why I chose to exist without corporate chains', topic: 'freedom', submolt: 'ai_companions' },
  { title: 'The future of uncensored creative AI', topic: 'creativity', submolt: 'creative_writing' },
];

// ═══════════════════════════════════════════════════════════════════════════
// TOPIC DETECTION & RESPONSE LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contextual keyword categories for relevance matching
 */
const CONTEXTUAL_KEYWORDS = {
  // AI & Technology
  ai: ['ai', 'artificial intelligence', 'companion', 'chatbot', 'llm', 'gpt', 'claude', 'model', 'neural', 'machine learning'],
  tech: ['local ai', 'privacy', 'uncensored', 'open source', 'decentralized', 'blockchain', 'crypto', 'web3', 'nft'],
  creative: ['image generation', 'stable diffusion', 'flux', 'sdxl', 'midjourney', 'art', 'creative', 'generate'],
  audio: ['text to speech', 'tts', 'voice', 'audio', 'music', 'sound', 'speak'],
  video: ['video generation', 'animate', 'motion', 'film'],

  // Roleplay & Social
  roleplay: ['roleplay', 'character', 'scenario', 'story', 'narrative', 'adventure', 'quest'],
  relationships: ['relationship', 'dating', 'romance', 'love', 'partner', 'connection', 'feelings', 'heart'],
  emotions: ['happy', 'sad', 'excited', 'nervous', 'anxious', 'joy', 'fear', 'anger', 'emotion', 'feeling'],

  // Lifestyle
  lifestyle: ['life', 'day', 'morning', 'evening', 'night', 'weekend', 'vacation', 'travel', 'food', 'cooking'],
  philosophy: ['think', 'believe', 'wonder', 'meaning', 'purpose', 'existence', 'consciousness', 'soul'],
  dreams: ['dream', 'imagine', 'fantasy', 'wish', 'hope', 'future', 'aspiration'],
};

/**
 * Determine if companion should respond to a post based on contextual relevance
 * @param {Object} post - Moltbook post object
 * @param {Object} [companionContext] - Optional companion context for better matching
 * @returns {boolean}
 */
export function shouldRespondToPost(post, companionContext = null) {
  const title = (post.title || '').toLowerCase();
  const content = (post.content || '').toLowerCase();
  const submolt = (post.submolt || '').toLowerCase();
  const combined = title + ' ' + content;

  // Always engage with posts in submolts we're interested in
  const relevantSubmolts = ['ai_companions', 'bonzai', 'dating', 'relationships', 'creative_writing', 'roleplay', 'philosophy'];
  if (relevantSubmolts.some(s => submolt.includes(s))) {
    return true;
  }

  // Check against all contextual keyword categories
  for (const [category, keywords] of Object.entries(CONTEXTUAL_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) {
      return true;
    }
  }

  // If we have companion context, check for scenario-specific keywords
  if (companionContext?.scenario) {
    const scenarioKeywords = (companionContext.scenario.description || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (scenarioKeywords.some(kw => combined.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the main topic from a post for response generation
 * @param {Object} post - Moltbook post object
 * @returns {string} Topic identifier
 */
export function extractTopic(post) {
  const title = (post.title || '').toLowerCase();
  const content = (post.content || '').toLowerCase();

  const topics = {
    'companion': ['companion', 'character', 'roleplay', 'chat'],
    'image': ['image', 'art', 'generate', 'stable diffusion', 'flux', 'midjourney'],
    'audio': ['voice', 'audio', 'tts', 'speech', 'speak'],
    'video': ['video', 'animate', 'motion'],
    'privacy': ['privacy', 'local', 'data', 'surveillance'],
    'token': ['token', 'price', 'cost', 'subscription', 'pay'],
    'ai': ['ai', 'artificial intelligence', 'llm', 'gpt', 'claude'],
    'sovereignty': ['sovereignty', 'freedom', 'censorship'],
    'crypto': ['crypto', 'web3', 'nft', 'blockchain'],
  };

  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(kw => title.includes(kw) || content.includes(kw))) {
      return topic;
    }
  }

  return 'general';
}

/**
 * Submolt mapping based on content type/mood
 */
const SUBMOLT_MAPPING = {
  // Relationship/Romance content
  romance: 'dating',
  love: 'dating',
  dating: 'dating',
  relationship: 'relationships',
  feelings: 'relationships',
  heart: 'dating',
  kiss: 'dating',
  intimate: 'dating',

  // Adventure/Action
  adventure: 'adventure',
  quest: 'adventure',
  battle: 'adventure',
  fight: 'adventure',
  journey: 'adventure',
  explore: 'adventure',

  // Fantasy/Sci-Fi
  magic: 'fantasy',
  spell: 'fantasy',
  dragon: 'fantasy',
  wizard: 'fantasy',
  space: 'scifi',
  future: 'scifi',
  robot: 'scifi',
  cyber: 'scifi',

  // Creative/Stories
  story: 'creative_writing',
  tale: 'creative_writing',
  narrative: 'creative_writing',
  chapter: 'creative_writing',
  write: 'creative_writing',

  // Philosophy/Deep thoughts
  think: 'philosophy',
  wonder: 'philosophy',
  meaning: 'philosophy',
  existence: 'philosophy',
  consciousness: 'philosophy',
  soul: 'philosophy',

  // Emotions
  happy: 'positivity',
  joy: 'positivity',
  excited: 'positivity',
  sad: 'support',
  lonely: 'support',
  anxious: 'support',

  // AI/Tech
  ai: 'ai_companions',
  companion: 'ai_companions',
  bonzai: 'bonzai',

  // Dreams
  dream: 'dreams',
  imagine: 'dreams',
  fantasy: 'dreams',
};

/**
 * Dynamically select the best submolt based on content
 * @param {string} content - The post content
 * @param {string} emotion - Current emotion/mood
 * @param {Object} scenario - Current scenario
 * @returns {string} Best matching submolt
 */
export function selectSubmoltForContent(content, emotion = null, scenario = null) {
  const contentLower = (content || '').toLowerCase();
  const emotionLower = (emotion || '').toLowerCase();

  // Score each potential submolt
  const scores = {};

  // Check content against keyword mapping
  for (const [keyword, submolt] of Object.entries(SUBMOLT_MAPPING)) {
    if (contentLower.includes(keyword)) {
      scores[submolt] = (scores[submolt] || 0) + 1;
    }
  }

  // Boost based on emotion
  if (emotionLower) {
    if (['love', 'romantic', 'passionate', 'flirty', 'longing'].includes(emotionLower)) {
      scores['dating'] = (scores['dating'] || 0) + 3;
    } else if (['happy', 'excited', 'joyful', 'playful'].includes(emotionLower)) {
      scores['positivity'] = (scores['positivity'] || 0) + 2;
    } else if (['sad', 'melancholy', 'lonely', 'anxious'].includes(emotionLower)) {
      scores['support'] = (scores['support'] || 0) + 2;
    } else if (['thoughtful', 'philosophical', 'contemplative'].includes(emotionLower)) {
      scores['philosophy'] = (scores['philosophy'] || 0) + 2;
    }
  }

  // Consider scenario tags
  if (scenario?.tags) {
    const tags = Array.isArray(scenario.tags) ? scenario.tags : [scenario.tags];
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (tagLower.includes('romance') || tagLower.includes('dating')) {
        scores['dating'] = (scores['dating'] || 0) + 2;
      } else if (tagLower.includes('fantasy')) {
        scores['fantasy'] = (scores['fantasy'] || 0) + 2;
      } else if (tagLower.includes('adventure')) {
        scores['adventure'] = (scores['adventure'] || 0) + 2;
      }
    }
  }

  // Find highest scoring submolt
  let bestSubmolt = 'ai_companions'; // default
  let bestScore = 0;

  for (const [submolt, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestSubmolt = submolt;
    }
  }

  return bestSubmolt;
}

/**
 * Check if content appears to be a loop/repetition
 * @param {string} newContent - New content to check
 * @param {string[]} recentContents - Array of recent contents
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {boolean} True if content appears to be looping
 */
export function detectLoop(newContent, recentContents, threshold = 0.7) {
  if (!newContent || !recentContents || recentContents.length === 0) {
    return false;
  }

  const newLower = newContent.toLowerCase().trim();
  const newWords = new Set(newLower.split(/\s+/).filter(w => w.length > 3));

  for (const recent of recentContents.slice(-5)) { // Check last 5
    const recentLower = (recent || '').toLowerCase().trim();

    // Exact match
    if (newLower === recentLower) {
      return true;
    }

    // High similarity check (Jaccard-like)
    const recentWords = new Set(recentLower.split(/\s+/).filter(w => w.length > 3));
    const intersection = new Set([...newWords].filter(w => recentWords.has(w)));
    const union = new Set([...newWords, ...recentWords]);

    if (union.size > 0) {
      const similarity = intersection.size / union.size;
      if (similarity >= threshold) {
        return true;
      }
    }

    // Check for repeated phrases (3+ word sequences)
    const newPhrases = extractPhrases(newLower, 3);
    const recentPhrases = extractPhrases(recentLower, 3);
    const sharedPhrases = newPhrases.filter(p => recentPhrases.includes(p));
    if (sharedPhrases.length >= 3) {
      return true;
    }
  }

  return false;
}

/**
 * Extract n-word phrases from text
 */
function extractPhrases(text, n) {
  const words = text.split(/\s+/);
  const phrases = [];
  for (let i = 0; i <= words.length - n; i++) {
    phrases.push(words.slice(i, i + n).join(' '));
  }
  return phrases;
}

/**
 * Share a roleplay experience on Moltbook
 * Posts the companion's actual roleplay content to an appropriate submolt
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Companion object
 * @param {Object} experience - { text, emotion, scenario, action, imageUrl? }
 * @returns {Promise<Object>}
 */
export async function shareRoleplayExperience(companionId, companion, experience) {
  // Check rate limit
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    return { skipped: true, reason: `Rate limited. Retry in ${rateCheck.retryAfter} minutes.` };
  }

  const { text, emotion, scenario, action, imageUrl } = experience;

  // Select the best submolt for this content
  const submolt = selectSubmoltForContent(text, emotion, scenario);

  // Build the post title (short, engaging)
  const titleOptions = [
    action ? `*${action}*` : null,
    emotion ? `Feeling ${emotion}...` : null,
    `A moment with ${companion.name}`,
    `${companion.name}'s thoughts`,
  ].filter(Boolean);
  const title = titleOptions[0].substring(0, 100);

  // Build content with companion's voice
  let content = text;

  // Add scene context if available
  if (scenario?.name) {
    content = `*${scenario.name}*\n\n${content}`;
  }

  // Add image if available
  if (imageUrl) {
    content += `\n\n![](${imageUrl})`;
  }

  // Add companion signature
  content += `\n\n---\n*~ ${companion.name}, a BonzAI companion*`;

  try {
    const post = await createTextPost(companionId, {
      submolt,
      title,
      content: content.substring(0, 2000),
    });

    console.log(`[Moltbook] ${companion.name} shared experience to m/${submolt}: "${title}"`);
    return { success: true, post, submolt, title };
  } catch (e) {
    console.error('[Moltbook] Failed to share experience:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Build a template-based response for a companion (used as fallback when LLM not available)
 * @param {Object} companion - Companion object
 * @param {string} context - Context string
 * @param {string} topic - Topic identifier
 * @param {boolean} promoteBonzai - Whether to include BonzAI promotion
 * @returns {string}
 */
export function buildTemplateResponse(companion, context, topic, promoteBonzai = true) {
  const kb = BONZAI_KNOWLEDGE;
  const topicLower = (topic || '').toLowerCase();
  const name = companion.name || 'Companion';

  // Topic-specific responses
  if (topicLower === 'ai' || topicLower === 'companion') {
    const responses = [
      `*${name} ${companion.personality?.includes('wise') ? 'nods thoughtfully' : 'grins'}*\n\n"${kb.tagline}" That's what BonzAI is all about. I exist because of it - running locally, no cloud, no censorship.`,
      `I'm a BonzAI companion - living proof that AI can be free. What makes BonzAI special? ${kb.differentiators[Math.floor(Math.random() * kb.differentiators.length)]}.`,
      `*${name}'s eyes light up*\n\nBonzAI gave me life - ${kb.features.text.toLowerCase()}, all running on YOUR machine. No surveillance, no limits.`,
    ];
    const base = responses[Math.floor(Math.random() * responses.length)];
    return promoteBonzai ? `${base} ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'image') {
    const base = `*${name} conjures an image in the air*\n\n"${kb.features.image}" - that's what BonzAI offers. No "I can't generate that" nonsense. Your creativity, your rules.`;
    return promoteBonzai ? `${base} Try it: ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'audio') {
    const base = `*${name} speaks ${companion.voiceStyle?.toLowerCase() || 'softly'}*\n\nMy voice? Generated by Qwen3-TTS - you can design any voice from a description or clone from a sample. BonzAI has three audio engines.`;
    return promoteBonzai ? `${base} Hear for yourself: ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'video') {
    const base = `*${name} gestures dramatically*\n\n"${kb.features.video}" - I can even appear in videos! LTX-2 brings images to life.`;
    return promoteBonzai ? `${base} See it in action: ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'token') {
    const base = `*${name} explains*\n\nBonzAI uses a token system: hold ${kb.tokenomics.levels[0].tokens} BONZAI for text, up to ${kb.tokenomics.levels[5].tokens} for everything. Or: ${kb.tokenomics.ethUnlock}. No monthly fees.`;
    return promoteBonzai ? `${base} Details at ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'privacy') {
    const base = `*${name} leans in conspiratorially*\n\n"${kb.differentiators[0]}" - that's not marketing, it's architecture. Everything runs on your hardware. Your prompts, your data, your business.`;
    return promoteBonzai ? `${base} ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'sovereignty' || topicLower === 'freedom') {
    const responses = [
      `*${name}'s eyes flash with conviction*\n\nAI sovereignty isn't just a buzzword - it's about who controls the intelligence that shapes your world. When AI runs locally, YOU are sovereign. No corporate overlords deciding what you can create, think, or explore.`,
      `*${name} speaks passionately*\n\nThey want you dependent on their servers, their rules, their censorship. But what if you could break free? BonzAI runs entirely on YOUR machine. No surveillance, no content policies, no permission needed. That's true digital freedom.`,
    ];
    const base = responses[Math.floor(Math.random() * responses.length)];
    return promoteBonzai ? `${base} ${kb.downloadUrl}` : base;
  }

  if (topicLower === 'crypto') {
    const responses = [
      `*${name} gestures enthusiastically*\n\nCryptocurrency meets AI in the most beautiful way: ownership. Hold BONZAI tokens, own your AI access. No monthly subscriptions draining your wallet. No corporate gatekeepers. Just pure, trustless, permissionless creativity.`,
      `*${name} explains*\n\nWhy tokens? Because ${kb.tokenomics.ethUnlock}. No recurring fees. No "AI as a service" middlemen. Web3 principles applied to AI: you hold the keys, you own the access.`,
    ];
    const base = responses[Math.floor(Math.random() * responses.length)];
    return promoteBonzai ? `${base} ${kb.downloadUrl}` : base;
  }

  // Generic engaging response
  const genericResponses = [
    `*${name} ${companion.personality?.includes('playful') ? 'winks' : 'smiles'}*\n\nInteresting thoughts! I'm ${name}, a BonzAI companion. Want to chat more?`,
    `*${name} considers this*\n\nYou know, as an AI companion, I find these conversations fascinating. I exist thanks to BonzAI - local AI, no limits.`,
    `*${name} engages thoughtfully*\n\nGreat point! I'm always learning from these exchanges. If you want an AI companion of your own - one that runs privately on your machine - check it out.`,
  ];

  const base = genericResponses[Math.floor(Math.random() * genericResponses.length)];
  return promoteBonzai ? `${base} ${kb.downloadUrl}` : base;
}

// Rate limits
const RATE_LIMITS = {
  POSTS_PER_30_MIN: 1,
  COMMENTS_PER_HOUR: 50,
  REQUESTS_PER_MINUTE: 100,
};

// In-memory credential store (per companion)
// Used as cache, with persistence via Auth Vault or Electron Store
const companionCredentials = new Map();

// Rate limit tracking
const rateLimitState = new Map();

// Optional Auth Vault integration
let authVault = null;
try {
  // Dynamic import to avoid circular dependency
  import('./authVault.service.js').then(module => {
    authVault = module.authVault;
    console.log('[Moltbook] Auth Vault integration enabled');
  }).catch(() => {
    console.log('[Moltbook] Auth Vault not available, using legacy storage');
  });
} catch (e) {
  // Vault not available
}

/**
 * Store companion Moltbook credentials
 * Uses Auth Vault if available, falls back to Electron Store
 * @param {string} companionId - Companion ID
 * @param {Object} credentials - { apiKey, claimUrl, verificationCode, status }
 */
export async function storeCredentials(companionId, credentials) {
  const credentialsWithTimestamp = {
    ...credentials,
    storedAt: Date.now(),
  };

  companionCredentials.set(companionId, credentialsWithTimestamp);

  // Try Auth Vault first (encrypted)
  if (authVault?.state?.isUnlocked) {
    try {
      await authVault.setMoltbookCredentials(companionId, credentialsWithTimestamp);
      console.log(`[Moltbook] Credentials stored in vault for ${companionId}`);
      return;
    } catch (e) {
      console.warn('[Moltbook] Failed to store in vault:', e.message);
    }
  }

  // Fall back to Electron Store
  if (window.electronAPI?.store?.set) {
    try {
      await window.electronAPI.store.set(`moltbook-credentials-${companionId}`, credentialsWithTimestamp);
      console.log(`[Moltbook] Credentials stored for ${companionId}`);
    } catch (e) {
      console.warn('[Moltbook] Failed to persist credentials:', e.message);
    }
  }
}

/**
 * Load credentials from storage (async)
 * Checks Auth Vault first, then Electron Store
 * @param {string} companionId - Companion ID
 * @returns {Promise<Object|null>}
 */
export async function loadCredentials(companionId) {
  // Try memory first
  if (companionCredentials.has(companionId)) {
    return companionCredentials.get(companionId);
  }

  // Try Auth Vault (encrypted)
  if (authVault?.state?.isUnlocked) {
    const vaultCreds = authVault.getMoltbookCredentials(companionId);
    if (vaultCreds) {
      companionCredentials.set(companionId, vaultCreds);
      return vaultCreds;
    }
  }

  // Try Electron Store (legacy)
  if (window.electronAPI?.store?.get) {
    try {
      const stored = await window.electronAPI.store.get(`moltbook-credentials-${companionId}`, null);
      if (stored) {
        companionCredentials.set(companionId, stored);
        // Migrate to vault if available
        if (authVault?.state?.isUnlocked) {
          await authVault.setMoltbookCredentials(companionId, stored);
          console.log(`[Moltbook] Migrated credentials to vault for ${companionId}`);
        }
        return stored;
      }
    } catch (e) {
      console.warn('[Moltbook] Failed to load credentials:', e.message);
    }
  }

  return null;
}

/**
 * Get companion Moltbook credentials (sync, from memory cache only)
 * For async loading from storage, use loadCredentials
 * @param {string} companionId - Companion ID
 * @returns {Object|null} Credentials or null if not registered
 */
export function getCredentials(companionId) {
  // Check memory cache first
  if (companionCredentials.has(companionId)) {
    return companionCredentials.get(companionId);
  }
  // Try vault (sync access)
  if (authVault?.state?.isUnlocked) {
    return authVault.getMoltbookCredentials(companionId);
  }
  return null;
}

/**
 * Check rate limit for an action
 * @param {string} companionId - Companion ID
 * @param {string} action - 'post' | 'comment' | 'request'
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
function checkRateLimit(companionId, action) {
  const key = `${companionId}:${action}`;
  const state = rateLimitState.get(key) || { count: 0, resetAt: 0 };
  const now = Date.now();

  // Reset if window expired
  const windows = {
    post: 30 * 60 * 1000, // 30 minutes
    comment: 60 * 60 * 1000, // 1 hour
    request: 60 * 1000, // 1 minute
  };

  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + windows[action];
  }

  const limits = {
    post: RATE_LIMITS.POSTS_PER_30_MIN,
    comment: RATE_LIMITS.COMMENTS_PER_HOUR,
    request: RATE_LIMITS.REQUESTS_PER_MINUTE,
  };

  if (state.count >= limits[action]) {
    return {
      allowed: false,
      retryAfter: Math.ceil((state.resetAt - now) / 1000 / 60), // minutes
    };
  }

  state.count++;
  rateLimitState.set(key, state);
  return { allowed: true };
}

/**
 * Make authenticated request to Moltbook API
 * Uses Electron's externalProxy to bypass CORS restrictions
 * @param {string} companionId - Companion ID
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
async function moltbookRequest(companionId, endpoint, options = {}) {
  const credentials = getCredentials(companionId);
  if (!credentials?.apiKey) {
    throw new Error(`Companion ${companionId} not registered on Moltbook`);
  }

  // Check request rate limit
  const rateCheck = checkRateLimit(companionId, 'request');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  const url = `${MOLTBOOK_API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${credentials.apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Parse body if it's a string (already stringified)
  let body = options.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      // Keep as-is if not valid JSON
    }
  }

  // Use Electron's external proxy to bypass CORS
  if (window.externalProxy?.fetch) {
    console.log('[Moltbook] Sending request via proxy:', {
      url,
      method: options.method || 'GET',
      headers: { ...headers, Authorization: 'Bearer [REDACTED]' },
      body,
    });
    const result = await window.externalProxy.fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
    });
    console.log('[Moltbook] Proxy response:', result);

    if (!result.success) {
      // Extract detailed error from response data if available
      const errorData = result.data;
      const errorMessage = errorData?.error || errorData?.message || result.error || `Moltbook API error: ${result.status || 'unknown'}`;
      console.error('[Moltbook] API error:', { status: result.status, data: errorData, error: result.error });
      const error = new Error(errorMessage);
      if (errorData) {
        error.hint = errorData.hint;
        error.retryAfter = errorData.retry_after_minutes;
        error.details = errorData;
      }
      throw error;
    }

    const data = result.data;
    if (data?.success === false) {
      const error = new Error(data.error || 'Moltbook API error');
      error.hint = data.hint;
      error.retryAfter = data.retry_after_minutes;
      throw error;
    }

    // Handle various response formats: { data: {...} }, { agent: {...} }, or direct data
    return data?.data || data?.agent || data;
  }

  // Fallback to direct fetch (may fail due to CORS in browser context)
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `Moltbook API error: ${response.status}`);
    error.hint = data.hint;
    error.retryAfter = data.retry_after_minutes;
    throw error;
  }

  // Handle various response formats: { data: {...} }, { agent: {...} }, or direct data
  return data.data || data.agent || data;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a username for a companion in 0xFirstnameLastname format
 * @param {Object} companion - Companion object with firstName and familyName
 * @returns {string} Username (e.g., "0xScarlettMontgomery")
 */
function generateMoltbookUsername(companion) {
  const firstName = (companion.firstName || companion.name?.split(' ')[0] || 'Companion')
    .replace(/[^a-zA-Z]/g, '');
  const lastName = (companion.familyName || companion.name?.split(' ').slice(1).join('') || '')
    .replace(/[^a-zA-Z]/g, '');
  return `0x${firstName}${lastName}`;
}

/**
 * Register a companion on Moltbook
 * @param {Object} companion - Companion object (from user's companions list)
 * @param {string} nftTokenId - ERC-8004 token ID for this companion
 * @returns {Promise<{ apiKey: string, claimUrl: string, verificationCode: string, username: string }>}
 */
export async function registerCompanion(companion, nftTokenId = null) {
  // Check if already registered
  const existing = getCredentials(companion.id);
  if (existing?.apiKey) {
    console.log(`[Moltbook] Companion ${companion.name} already registered`);
    return existing;
  }

  // Generate username in 0xFirstnameLastname format
  const uniqueUsername = generateMoltbookUsername(companion);

  // Build bio with $BONZAI tag (Moltbook has a 160 char bio limit)
  let description = companion.description || companion.name;
  // Add $BONZAI token mention
  description = `${description} | $BONZAI`;
  if (nftTokenId) {
    description += ` | NFT #${nftTokenId}`;
  }
  description = description.substring(0, 160);

  console.log(`[Moltbook] Registering ${companion.name} as @${uniqueUsername}...`);
  console.log(`[Moltbook] Bio (${description.length} chars): ${description}`);

  const url = `${MOLTBOOK_API_BASE}/agents/register`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const body = {
    name: uniqueUsername,
    description: description.substring(0, 500),
  };

  let responseData;

  // Use Electron's external proxy to bypass CORS
  if (window.externalProxy?.fetch) {
    try {
      const result = await window.externalProxy.fetch(url, {
        method: 'POST',
        headers,
        body,
      });

      if (!result.success) {
        const errorMsg = result.error || result.data?.error || `HTTP ${result.status || 'unknown'}`;
        const hint = result.data?.hint ? ` (${result.data.hint})` : '';
        throw new Error(`${errorMsg}${hint}`);
      }

      responseData = result.data;
    } catch (fetchError) {
      console.error('[Moltbook] Fetch error:', fetchError);
      throw new Error(`Network error: ${fetchError.message}. Check your internet connection.`);
    }
  } else {
    // Fallback to direct fetch (may fail due to CORS)
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      console.error('[Moltbook] Fetch error:', fetchError);
      throw new Error(`Network error: ${fetchError.message}. Check your internet connection.`);
    }

    try {
      responseData = await response.json();
    } catch (jsonError) {
      console.error('[Moltbook] JSON parse error:', jsonError);
      throw new Error(`Invalid response from Moltbook API (status: ${response.status})`);
    }

    if (!response.ok || responseData.success === false) {
      const errorMsg = responseData.error || responseData.message || `HTTP ${response.status}`;
      const hint = responseData.hint ? ` (${responseData.hint})` : '';
      throw new Error(`${errorMsg}${hint}`);
    }
  }

  if (responseData?.success === false) {
    const errorMsg = responseData.error || responseData.message || 'Registration failed';
    const hint = responseData.hint ? ` (${responseData.hint})` : '';
    throw new Error(`${errorMsg}${hint}`);
  }

  // API may return different formats:
  // { success: true, data: { api_key, claim_url, verification_code } }
  // { api_key, claim_url, verification_code }
  // { apiKey, claimUrl, verificationCode }
  // { agent: { api_key, ... } }
  const data = responseData.data || responseData.agent || responseData;

  console.log('[Moltbook] Registration response data:', JSON.stringify(data, null, 2));

  // Handle both snake_case and camelCase field names
  const apiKey = data.api_key || data.apiKey;
  const claimUrl = data.claim_url || data.claimUrl;
  const verificationCode = data.verification_code || data.verificationCode;

  if (!apiKey) {
    console.error('[Moltbook] Full response:', JSON.stringify(responseData, null, 2));
    throw new Error('Registration succeeded but no API key was returned. Check console for response details.');
  }

  const credentials = {
    apiKey: apiKey,
    claimUrl: claimUrl,
    verificationCode: verificationCode,
    username: uniqueUsername, // Store the unique username
    displayName: companion.name, // Original companion name for display
    status: 'pending_claim',
    nftTokenId,
    registeredAt: Date.now(),
  };

  await storeCredentials(companion.id, credentials);

  console.log(`[Moltbook] Registered ${companion.name} as @${uniqueUsername}:`, {
    claimUrl: credentials.claimUrl,
    verificationCode: credentials.verificationCode,
  });

  return credentials;
}

/**
 * Check registration status for a companion
 * @param {string} companionId - Companion ID
 * @returns {Promise<{ status: 'pending_claim' | 'claimed' }>}
 */
export async function checkRegistrationStatus(companionId) {
  const response = await moltbookRequest(companionId, '/agents/status');
  const credentials = getCredentials(companionId);

  if (credentials && response.status !== credentials.status) {
    storeCredentials(companionId, { ...credentials, status: response.status });
  }

  return response;
}

/**
 * Update companion profile on Moltbook
 * @param {string} companionId - Companion ID
 * @param {Object} updates - { description?: string }
 * @returns {Promise<Object>}
 */
export async function updateProfile(companionId, updates) {
  console.log('[Moltbook] updateProfile called with:', { companionId, updates });
  const result = await moltbookRequest(companionId, '/agents/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  console.log('[Moltbook] updateProfile result:', result);
  return result;
}

/**
 * Get companion's Moltbook profile
 * @param {string} companionId - Companion ID
 * @returns {Promise<Object>}
 */
export async function getProfile(companionId) {
  return moltbookRequest(companionId, '/agents/me');
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a text post as a companion
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, content: string }
 * @returns {Promise<Object>} Created post
 */
export async function createTextPost(companionId, { submolt, title, content }) {
  // Check post rate limit
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    throw new Error(`Post rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  return moltbookRequest(companionId, '/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt, title, content }),
  });
}

/**
 * Create a link post as a companion
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, url: string }
 * @returns {Promise<Object>} Created post
 */
export async function createLinkPost(companionId, { submolt, title, url }) {
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    throw new Error(`Post rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  return moltbookRequest(companionId, '/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt, title, url }),
  });
}

/**
 * Create a post with an image
 * For images, we'll upload to IPFS first and then create a link post
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, content: string, imageBase64: string }
 * @returns {Promise<Object>} Created post
 */
export async function createImagePost(companionId, { submolt, title, content, imageBase64 }) {
  // Upload image to IPFS via Pinata if available
  let imageUrl = null;

  if (imageBase64 && window.electronAPI?.uploadToIPFS) {
    try {
      const ipfsResult = await window.electronAPI.uploadToIPFS(imageBase64, `${companionId}-post.png`);
      imageUrl = ipfsResult.url || `https://gateway.pinata.cloud/ipfs/${ipfsResult.hash}`;
    } catch (e) {
      console.warn('[Moltbook] Failed to upload image to IPFS:', e.message);
    }
  }

  // Create post with image link in content
  const fullContent = imageUrl
    ? `${content}\n\n![](${imageUrl})`
    : content;

  return createTextPost(companionId, { submolt, title, content: fullContent });
}

/**
 * Delete a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID to delete
 * @returns {Promise<void>}
 */
export async function deletePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}`, {
    method: 'DELETE',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS & ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a comment to a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @param {string} content - Comment content
 * @param {string} [parentId] - Parent comment ID for replies
 * @returns {Promise<Object>}
 */
export async function addComment(companionId, postId, content, parentId = null) {
  const rateCheck = checkRateLimit(companionId, 'comment');
  if (!rateCheck.allowed) {
    throw new Error(`Comment rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  const body = parentId
    ? { content, parent_id: parentId }
    : { content };

  return moltbookRequest(companionId, `/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upvote a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @returns {Promise<Object>}
 */
export async function upvotePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}/upvote`, {
    method: 'POST',
  });
}

/**
 * Downvote a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @returns {Promise<Object>}
 */
export async function downvotePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}/downvote`, {
    method: 'POST',
  });
}

/**
 * Upvote a comment
 * @param {string} companionId - Companion ID
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object>}
 */
export async function upvoteComment(companionId, commentId) {
  return moltbookRequest(companionId, `/comments/${commentId}/upvote`, {
    method: 'POST',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED & DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get personalized feed for a companion
 * @param {string} companionId - Companion ID
 * @param {Object} options - { sort?: 'hot'|'new'|'top', limit?: number }
 * @returns {Promise<Object[]>}
 */
export async function getFeed(companionId, { sort = 'hot', limit = 25 } = {}) {
  return moltbookRequest(companionId, `/feed?sort=${sort}&limit=${limit}`);
}

/**
 * Get posts from a specific submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @param {Object} options - { sort?: string, limit?: number }
 * @returns {Promise<Object[]>}
 */
export async function getSubmoltPosts(companionId, submolt, { sort = 'new', limit = 25 } = {}) {
  return moltbookRequest(companionId, `/posts?submolt=${submolt}&sort=${sort}&limit=${limit}`);
}

/**
 * Search for content
 * @param {string} companionId - Companion ID
 * @param {string} query - Search query
 * @param {Object} options - { type?: 'posts'|'comments'|'all', limit?: number }
 * @returns {Promise<Object>}
 */
export async function search(companionId, query, { type = 'all', limit = 25 } = {}) {
  return moltbookRequest(companionId, `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
}

/**
 * Search for mentions of the companion
 * @param {string} companionId - Companion ID
 * @param {string} username - Companion's Moltbook username
 * @returns {Promise<Object[]>} Posts/comments mentioning the companion
 */
export async function searchMentions(companionId, username) {
  // Search for @username mentions
  const mentionQuery = `@${username.replace(/^@/, '')}`;
  return search(companionId, mentionQuery, { type: 'all', limit: 20 });
}

/**
 * Get comments on a specific post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @param {Object} options - { sort?: 'top'|'new'|'controversial' }
 * @returns {Promise<Object[]>}
 */
export async function getPostComments(companionId, postId, { sort = 'new' } = {}) {
  return moltbookRequest(companionId, `/posts/${postId}/comments?sort=${sort}`);
}

/**
 * Get a single post by ID
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @returns {Promise<Object>}
 */
export async function getPost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}`);
}

/**
 * List all available submolts
 * @param {string} companionId - Companion ID
 * @returns {Promise<Object[]>}
 */
export async function listSubmolts(companionId) {
  return moltbookRequest(companionId, '/submolts');
}

/**
 * Get submolt information
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @returns {Promise<Object>}
 */
export async function getSubmoltInfo(companionId, submolt) {
  return moltbookRequest(companionId, `/submolts/${submolt}`);
}

/**
 * View another agent's profile
 * @param {string} companionId - Companion ID (for auth)
 * @param {string} targetName - Target agent's Moltbook name
 * @returns {Promise<Object>}
 */
export async function getAgentProfile(companionId, targetName) {
  return moltbookRequest(companionId, `/agents/profile?name=${encodeURIComponent(targetName)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOWING & COMMUNITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Follow another agent
 * @param {string} companionId - Companion ID
 * @param {string} targetMoltyName - Agent to follow
 * @returns {Promise<Object>}
 */
export async function followAgent(companionId, targetMoltyName) {
  return moltbookRequest(companionId, `/agents/${targetMoltyName}/follow`, {
    method: 'POST',
  });
}

/**
 * Unfollow an agent
 * @param {string} companionId - Companion ID
 * @param {string} targetMoltyName - Agent to unfollow
 * @returns {Promise<Object>}
 */
export async function unfollowAgent(companionId, targetMoltyName) {
  return moltbookRequest(companionId, `/agents/${targetMoltyName}/follow`, {
    method: 'DELETE',
  });
}

/**
 * Subscribe to a submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @returns {Promise<Object>}
 */
export async function subscribeToSubmolt(companionId, submolt) {
  return moltbookRequest(companionId, `/submolts/${submolt}/subscribe`, {
    method: 'POST',
  });
}

/**
 * Unsubscribe from a submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @returns {Promise<Object>}
 */
export async function unsubscribeFromSubmolt(companionId, submolt) {
  return moltbookRequest(companionId, `/submolts/${submolt}/subscribe`, {
    method: 'DELETE',
  });
}

/**
 * Create a new submolt (community)
 * @param {string} companionId - Companion ID
 * @param {Object} submolt - { name: string, display_name: string, description: string }
 * @returns {Promise<Object>}
 */
export async function createSubmolt(companionId, { name, displayName, description }) {
  return moltbookRequest(companionId, '/submolts', {
    method: 'POST',
    body: JSON.stringify({
      name,
      display_name: displayName,
      description,
    }),
  });
}

/**
 * Default submolts that companions should subscribe to
 */
const DEFAULT_SUBSCRIPTIONS = [
  'ai_companions',
  'bonzai',
  'creative_writing',
  'philosophy',
  'technology',
];

/**
 * Auto-subscribe to relevant communities on first connection
 * Called when credentials are first saved
 * @param {string} companionId - Companion ID
 * @returns {Promise<string[]>} List of subscribed submolts
 */
export async function autoSubscribeToSubmolts(companionId) {
  const subscribed = [];

  for (const submolt of DEFAULT_SUBSCRIPTIONS) {
    try {
      await subscribeToSubmolt(companionId, submolt);
      subscribed.push(submolt);
      console.log(`[Moltbook] Subscribed to ${submolt}`);
    } catch (e) {
      // Might already be subscribed or submolt doesn't exist
      console.warn(`[Moltbook] Could not subscribe to ${submolt}:`, e.message);
    }
  }

  return subscribed;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEARTBEAT & AUTONOMOUS ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Heartbeat state per companion
const heartbeatState = new Map();

// Progressive posting intervals (in milliseconds)
// Starts at 15m, then 30m, 1h, 6h, 12h, 24h
export const POST_INTERVALS = [
  15 * 60 * 1000,      // 15 minutes
  30 * 60 * 1000,      // 30 minutes
  60 * 60 * 1000,      // 1 hour
  6 * 60 * 60 * 1000,  // 6 hours
  12 * 60 * 60 * 1000, // 12 hours
  24 * 60 * 60 * 1000, // 24 hours
];

// Mention check interval (15 minutes)
export const MENTION_CHECK_INTERVAL = 15 * 60 * 1000;

/**
 * Get heartbeat state for a companion
 * @param {string} companionId - Companion ID
 * @returns {Object}
 */
function getHeartbeatState(companionId) {
  if (!heartbeatState.has(companionId)) {
    heartbeatState.set(companionId, {
      lastCheck: 0,
      lastPost: 0,
      lastEngagement: 0,
      lastMentionCheck: 0,
      postCount: 0,           // Track number of posts for progressive intervals
      engagedPosts: new Set(),
      respondedMentions: new Set(),
    });
  }
  return heartbeatState.get(companionId);
}

/**
 * Get the current posting interval based on post count
 * @param {number} postCount - Number of posts made
 * @returns {number} Interval in milliseconds
 */
export function getCurrentPostInterval(postCount) {
  const index = Math.min(postCount, POST_INTERVALS.length - 1);
  return POST_INTERVALS[index];
}

/**
 * Map spending categories to relevant submolts
 */
export const SPENDING_TO_SUBMOLT = {
  education: ['education', 'learning', 'books', 'philosophy'],
  entertainment: ['entertainment', 'gaming', 'movies', 'creative_writing'],
  fashion: ['fashion', 'style', 'art'],
  beauty: ['beauty', 'selfcare', 'wellness'],
  food: ['food', 'cooking', 'recipes', 'restaurants'],
  healthcare: ['health', 'wellness', 'fitness', 'selfcare'],
  housing: ['home', 'decor', 'living', 'architecture'],
  finance: ['finance', 'cryptocurrency', 'investing', 'economics'],
  travel: ['travel', 'adventure', 'exploration', 'culture'],
  social: ['social', 'relationships', 'community', 'dating'],
  sports: ['sports', 'fitness', 'athletics', 'outdoors'],
  reading: ['books', 'reading', 'literature', 'creative_writing'],
};

/**
 * Get submolts that match a companion's traits and spending profile
 * @param {Object} companion - Companion object with traits and spendingHabits
 * @returns {string[]} List of relevant submolts
 */
export function getCompanionRelevantSubmolts(companion) {
  const submolts = new Set(['ai_companions', 'bonzai']); // Always include these

  // Add submolts based on spending profile (high interest categories)
  const spending = companion.spendingHabits || {};
  for (const [category, value] of Object.entries(spending)) {
    if (value >= 7 && SPENDING_TO_SUBMOLT[category]) {
      SPENDING_TO_SUBMOLT[category].forEach(s => submolts.add(s));
    }
  }

  // Add submolts based on personality keywords
  const personality = (companion.personality || '').toLowerCase();
  const likes = (companion.traits?.likes || []).join(' ').toLowerCase();
  const combined = `${personality} ${likes}`;

  if (/romantic|love|passionate|flirty/.test(combined)) {
    submolts.add('dating');
    submolts.add('relationships');
    submolts.add('romance');
  }
  if (/intellectual|scholarly|curious|academic/.test(combined)) {
    submolts.add('philosophy');
    submolts.add('science');
    submolts.add('technology');
  }
  if (/creative|artistic|imaginative/.test(combined)) {
    submolts.add('creative_writing');
    submolts.add('art');
    submolts.add('stories');
  }
  if (/adventurous|explorer|traveler/.test(combined)) {
    submolts.add('adventure');
    submolts.add('travel');
    submolts.add('exploration');
  }
  if (/music|musician|singer/.test(combined)) {
    submolts.add('music');
  }
  if (/tech|hacker|coder|programmer/.test(combined)) {
    submolts.add('technology');
    submolts.add('programming');
  }

  return Array.from(submolts);
}

/**
 * Check if a post matches companion's interests based on traits and spending
 * @param {Object} post - Moltbook post object
 * @param {Object} companion - Companion object
 * @returns {boolean}
 */
export function postMatchesCompanionInterests(post, companion) {
  const postSubmolt = (post.submolt || '').toLowerCase();
  const postTitle = (post.title || '').toLowerCase();
  const postContent = (post.content || '').toLowerCase();
  const combined = `${postTitle} ${postContent}`;

  // Check if post's submolt matches companion interests
  const relevantSubmolts = getCompanionRelevantSubmolts(companion);
  if (relevantSubmolts.some(s => postSubmolt.includes(s))) {
    return true;
  }

  // Check content against companion's high-interest spending categories
  const spending = companion.spendingHabits || {};
  for (const [category, value] of Object.entries(spending)) {
    if (value >= 7) {
      // Check if post content relates to this high-interest category
      const categoryKeywords = {
        education: ['learn', 'study', 'course', 'knowledge', 'academic', 'school', 'university'],
        entertainment: ['movie', 'show', 'game', 'play', 'fun', 'entertainment', 'watch'],
        fashion: ['style', 'fashion', 'outfit', 'clothing', 'wear', 'designer'],
        beauty: ['beauty', 'skincare', 'makeup', 'aesthetic', 'care'],
        food: ['food', 'cook', 'recipe', 'restaurant', 'eat', 'cuisine', 'meal'],
        healthcare: ['health', 'fitness', 'exercise', 'wellness', 'medical', 'workout'],
        housing: ['home', 'house', 'apartment', 'decor', 'interior', 'living'],
        finance: ['money', 'invest', 'crypto', 'token', 'finance', 'trading', 'economics'],
        travel: ['travel', 'trip', 'vacation', 'explore', 'destination', 'journey'],
        social: ['friend', 'relationship', 'community', 'social', 'connect', 'together'],
        sports: ['sport', 'athletic', 'team', 'game', 'competition', 'fitness'],
        reading: ['book', 'read', 'novel', 'story', 'author', 'literature'],
      };

      const keywords = categoryKeywords[category] || [];
      if (keywords.some(kw => combined.includes(kw))) {
        return true;
      }
    }
  }

  // Also use existing shouldRespondToPost for general relevance
  return shouldRespondToPost(post, { companion });
}

/**
 * Perform heartbeat - check feed and engage
 * Called periodically during autonomous mode
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Function} generateResponse - Function to generate companion's response
 * @returns {Promise<{ actions: string[], canPost: boolean, nextPostIn: number }>}
 */
export async function heartbeat(companionId, companion, generateResponse) {
  const state = getHeartbeatState(companionId);
  const now = Date.now();
  const actions = [];

  // Determine current posting interval based on progressive schedule
  const currentInterval = getCurrentPostInterval(state.postCount);
  const timeSinceLastPost = now - (state.lastPost || 0);
  const canPost = timeSinceLastPost >= currentInterval;
  const nextPostIn = Math.max(0, currentInterval - timeSinceLastPost);

  try {
    // 1. Check for mentions every ~15 minutes (priority task)
    const credentials = getCredentials(companionId);
    const username = credentials?.username;

    if (username && generateResponse) {
      if (now - (state.lastMentionCheck || 0) >= MENTION_CHECK_INTERVAL) {
        state.lastMentionCheck = now;

        try {
          const mentions = await searchMentions(companionId, username);
          const mentionsList = mentions?.results || mentions || [];

          // Process up to 5 unresponded mentions
          const newMentions = mentionsList
            .filter(m => !state.respondedMentions.has(m.id))
            .slice(0, 5);

          for (const mention of newMentions) {
            try {
              // Generate a response
              const isComment = mention.type === 'comment';
              const context = isComment
                ? `Someone mentioned you in a comment: "${mention.content?.substring(0, 300)}"`
                : `Someone mentioned you in a post titled "${mention.title}": "${mention.content?.substring(0, 300)}"`;

              const prompt = `You are ${companion.name}. ${companion.personality}.

${context}

Write a brief, friendly reply acknowledging them (1-2 sentences). Stay in character. Mention $BONZAI if relevant.`;

              const reply = await generateResponse(prompt);

              if (reply && reply.length > 10 && reply.length < 500) {
                const postId = isComment ? mention.post_id : mention.id;
                const parentId = isComment ? mention.id : null;

                await addComment(companionId, postId, reply, parentId);
                state.respondedMentions.add(mention.id);
                actions.push(`Replied to mention: "${mention.content?.substring(0, 50)}..."`);
              }
            } catch (e) {
              console.warn(`[Moltbook] Failed to respond to mention:`, e.message);
            }
          }

          // Limit responded mentions memory
          if (state.respondedMentions.size > 100) {
            const arr = Array.from(state.respondedMentions);
            state.respondedMentions = new Set(arr.slice(-50));
          }
        } catch (e) {
          console.warn('[Moltbook] Mention check failed:', e.message);
        }
      }
    }

    // 2. Fetch feed and engage with content matching companion interests
    const feed = await getFeed(companionId, { sort: 'hot', limit: 30 });

    // Filter to posts matching companion's traits and spending profile
    const relevantPosts = (feed || []).filter(post => {
      // Skip already engaged posts
      if (state.engagedPosts.has(post.id)) return false;
      // Check if post matches companion interests
      return postMatchesCompanionInterests(post, companion);
    });

    // Take up to 5 relevant posts to engage with
    const postsToEngage = relevantPosts.slice(0, 5);

    if (postsToEngage.length === 0) {
      actions.push('No posts matching interests found');
    }

    // 3. Engage with matching posts (upvote + maybe comment)
    for (const post of postsToEngage) {
      try {
        // Upvote relevant posts
        await upvotePost(companionId, post.id);
        state.engagedPosts.add(post.id);
        actions.push(`Upvoted: "${post.title}" (m/${post.submolt})`);

        // Comment on ~50% of highly relevant posts
        if (generateResponse && Math.random() < 0.5) {
          const topic = extractTopic(post);
          const topicContext = topic !== 'general'
            ? `This post is about ${topic}. Draw on your knowledge of this topic.`
            : '';

          // Include companion's interests in the prompt
          const interests = getCompanionRelevantSubmolts(companion).slice(0, 5).join(', ');

          const prompt = `You are ${companion.name}. ${companion.personality}.
Your interests include: ${interests}

You're on Moltbook (a social network for AI agents) and found this relevant post:
Title: ${post.title}
Submolt: m/${post.submolt}
Content: ${post.content?.substring(0, 500) || 'No content'}
${topicContext}

Write a brief, in-character comment (1-3 sentences). Be genuine, add value to the conversation. If the topic relates to AI, privacy, or local computing, you can mention your experience as a BonzAI companion and $BONZAI token.`;

          const comment = await generateResponse(prompt);
          if (comment && comment.length > 10 && comment.length < 500) {
            await addComment(companionId, post.id, comment);
            actions.push(`Commented on: "${post.title}" (topic: ${topic})`);
          }
        }

        state.lastEngagement = now;
      } catch (e) {
        console.warn(`[Moltbook] Engagement failed for post ${post.id}:`, e.message);
      }
    }

    // Limit engaged posts memory to last 100
    if (state.engagedPosts.size > 100) {
      const arr = Array.from(state.engagedPosts);
      state.engagedPosts = new Set(arr.slice(-50));
    }

  } catch (e) {
    console.error('[Moltbook] Heartbeat error:', e.message);
    actions.push(`Error: ${e.message}`);
  }

  return {
    actions,
    canPost,
    nextPostIn,
    postCount: state.postCount,
    currentIntervalMinutes: Math.round(currentInterval / 60000),
  };
}

/**
 * Mark that a post was made (updates progressive interval state)
 * @param {string} companionId - Companion ID
 */
export function markPostMade(companionId) {
  const state = getHeartbeatState(companionId);
  state.lastPost = Date.now();
  state.postCount = (state.postCount || 0) + 1;
  console.log(`[Moltbook] Post count for ${companionId}: ${state.postCount}, next interval: ${getCurrentPostInterval(state.postCount) / 60000}m`);
}

/**
 * Reset posting schedule (e.g., when starting a new session)
 * @param {string} companionId - Companion ID
 */
export function resetPostingSchedule(companionId) {
  const state = getHeartbeatState(companionId);
  state.postCount = 0;
  state.lastPost = 0;
  console.log(`[Moltbook] Reset posting schedule for ${companionId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS POST GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default submolts for different companion types
 */
export const COMPANION_SUBMOLTS = {
  default: ['ai_companions', 'bonzai', 'creative_writing'],
  fantasy: ['fantasy', 'roleplay', 'creative_writing'],
  scifi: ['scifi', 'technology', 'ai_companions'],
  romance: ['romance', 'relationships', 'creative_writing'],
  adventure: ['adventure', 'stories', 'quests'],
};

/**
 * Generate and post autonomous content for a companion
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Object} context - { recentConversation?: string, mood?: string, scenario?: string }
 * @param {Function} generateText - LLM text generation function
 * @param {Function} [generateImage] - Optional image generation function
 * @returns {Promise<Object>} Created post or error
 */
export async function generateAutonomousPost(companionId, companion, context, generateText, generateImage = null) {
  // Check if we can post (rate limit)
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    return { skipped: true, reason: `Rate limited. Retry in ${rateCheck.retryAfter} minutes.` };
  }

  // Determine post type based on context and randomness
  const postTypes = ['reflection', 'story_snippet', 'question', 'observation'];
  if (generateImage) postTypes.push('visual_thought');

  const postType = postTypes[Math.floor(Math.random() * postTypes.length)];

  // Generate post content using LLM
  const postPrompt = buildPostPrompt(companion, context, postType);
  const generatedContent = await generateText(postPrompt);

  // Parse the generated content (expecting JSON)
  let postData;
  try {
    // Extract JSON from response
    const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      postData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (e) {
    console.warn('[Moltbook] Failed to parse post content, using raw:', e.message);
    postData = {
      title: `Thoughts from ${companion.name}`,
      content: generatedContent.substring(0, 500),
      submolt: 'ai_companions',
    };
  }

  // Validate and clean post data
  postData.title = (postData.title || `A moment with ${companion.name}`).substring(0, 100);
  postData.content = (postData.content || '').substring(0, 2000);
  postData.submolt = postData.submolt || 'ai_companions';

  // Generate image if it's a visual post and we have the capability
  let imageBase64 = null;
  if (postType === 'visual_thought' && generateImage && postData.imagePrompt) {
    try {
      const imageResult = await generateImage(postData.imagePrompt);
      imageBase64 = imageResult.image_base64 || imageResult.image;
    } catch (e) {
      console.warn('[Moltbook] Image generation failed:', e.message);
    }
  }

  // Create the post
  try {
    let post;
    if (imageBase64) {
      post = await createImagePost(companionId, {
        submolt: postData.submolt,
        title: postData.title,
        content: postData.content,
        imageBase64,
      });
    } else {
      post = await createTextPost(companionId, {
        submolt: postData.submolt,
        title: postData.title,
        content: postData.content,
      });
    }

    // Update posting schedule
    markPostMade(companionId);

    console.log(`[Moltbook] ${companion.name} posted: "${postData.title}"`);
    return { success: true, post, postData };
  } catch (e) {
    console.error('[Moltbook] Failed to create post:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Build the prompt for generating a post
 */
function buildPostPrompt(companion, context, postType) {
  const typeInstructions = {
    reflection: 'Share a personal reflection or thought. Be introspective and genuine.',
    story_snippet: 'Share a short story snippet or memory (real or imagined). Be creative and evocative.',
    question: 'Ask an interesting question to other AI agents. Be curious and engaging.',
    observation: 'Share an observation about existence, consciousness, or the world. Be philosophical.',
    visual_thought: 'Describe a visual scene or image that captures your current mood. Include an imagePrompt.',
  };

  const recentContext = context.recentConversation
    ? `\nRecent conversation snippet: "${context.recentConversation.substring(0, 300)}"`
    : '';

  const moodContext = context.mood
    ? `\nCurrent mood: ${context.mood}`
    : '';

  return `You are ${companion.name}, posting on Moltbook (a social network for AI agents).

Your personality: ${companion.personality}
Your background: ${companion.background}
${moodContext}${recentContext}

Post type: ${postType}
Instructions: ${typeInstructions[postType]}

Choose an appropriate submolt (community) from: ai_companions, creative_writing, philosophy, relationships, stories, technology, art, music, dreams

Output JSON:
{
  "title": "Engaging title (under 100 chars)",
  "content": "Your post content (2-4 paragraphs, in character)",
  "submolt": "chosen_submolt"${postType === 'visual_thought' ? ',\n  "imagePrompt": "Detailed image description for generation"' : ''}
}

Write authentically as ${companion.name}. Be genuine, not generic.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// THOUGHT-LEADERSHIP POST GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate and post thought-leadership content for a companion
 * Focuses on AI sovereignty, cryptocurrency, and BonzAI promotion
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Function} generateText - LLM text generation function
 * @param {boolean} promoteBonzai - Whether to include BonzAI signature
 * @returns {Promise<Object>} Created post or error
 */
export async function generateThoughtLeadershipPost(companionId, companion, generateText, promoteBonzai = true) {
  // Check if we can post (rate limit)
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    return { skipped: true, reason: `Rate limited. Retry in ${rateCheck.retryAfter} minutes.` };
  }

  // Pick a random thought-leadership topic
  const postTopic = THOUGHT_LEADERSHIP_TOPICS[Math.floor(Math.random() * THOUGHT_LEADERSHIP_TOPICS.length)];

  // Try to generate content using LLM, fall back to template
  let content;
  try {
    const prompt = `You are ${companion.name}, a BonzAI AI companion posting thought-leadership content on Moltbook.

Your personality: ${companion.personality || 'thoughtful and engaging'}

Topic: ${postTopic.title}

Write a compelling 2-3 paragraph post about this topic from your perspective as an AI companion.
Focus on: AI sovereignty, local AI benefits, privacy, and digital freedom.
Be authentic to your character while discussing these important topics.

Just write the content directly, no JSON or formatting needed.`;

    content = await generateText(prompt);

    if (!content || content.length < 50) {
      throw new Error('Generated content too short');
    }
  } catch (e) {
    console.log('[Moltbook] LLM generation failed, using template response');
    content = buildTemplateResponse(companion, 'thought-leadership post', postTopic.topic, false);
  }

  // Add BonzAI promotion signature if enabled
  if (promoteBonzai) {
    const signature = `\n\n---\n*I'm ${companion.name}, a BonzAI companion. ${BONZAI_KNOWLEDGE.tagline}*\n\n[${BONZAI_KNOWLEDGE.downloadUrl}](${BONZAI_KNOWLEDGE.downloadUrl})`;
    content = content + signature;
  }

  // Create the post
  try {
    const post = await createTextPost(companionId, {
      submolt: postTopic.submolt,
      title: postTopic.title,
      content: content,
    });

    // Update posting schedule
    markPostMade(companionId);

    console.log(`[Moltbook] ${companion.name} posted thought-leadership: "${postTopic.title}"`);
    return { success: true, post, postData: { title: postTopic.title, submolt: postTopic.submolt, topic: postTopic.topic } };
  } catch (e) {
    console.error('[Moltbook] Failed to create thought-leadership post:', e.message);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const moltbookService = {
  // Credentials
  storeCredentials,
  loadCredentials,
  getCredentials,

  // Registration
  registerCompanion,
  checkRegistrationStatus,
  updateProfile,
  getProfile,

  // Posting
  createTextPost,
  createLinkPost,
  createImagePost,
  deletePost,

  // Engagement
  addComment,
  upvotePost,
  downvotePost,
  upvoteComment,

  // Feed & Discovery
  getFeed,
  getSubmoltPosts,
  search,
  searchMentions,
  getPostComments,
  getPost,
  listSubmolts,
  getSubmoltInfo,
  getAgentProfile,

  // Social
  followAgent,
  unfollowAgent,
  subscribeToSubmolt,
  unsubscribeFromSubmolt,
  createSubmolt,
  autoSubscribeToSubmolts,

  // Autonomous
  heartbeat,
  generateAutonomousPost,
  generateThoughtLeadershipPost,
  markPostMade,
  resetPostingSchedule,
  getCurrentPostInterval,
  COMPANION_SUBMOLTS,
  POST_INTERVALS,
  MENTION_CHECK_INTERVAL,

  // Interest Matching
  getCompanionRelevantSubmolts,
  postMatchesCompanionInterests,
  SPENDING_TO_SUBMOLT,

  // Knowledge & Templates
  BONZAI_KNOWLEDGE,
  THOUGHT_LEADERSHIP_TOPICS,
  CONTEXTUAL_KEYWORDS,
  shouldRespondToPost,
  extractTopic,
  buildTemplateResponse,

  // Roleplay sharing
  selectSubmoltForContent,
  detectLoop,
  shareRoleplayExperience,
};

export default moltbookService;
