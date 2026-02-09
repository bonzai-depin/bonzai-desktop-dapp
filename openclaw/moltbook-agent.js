#!/usr/bin/env node
/**
 * BonzAI Moltbook Agent
 *
 * An autonomous agent that:
 * 1. Monitors Moltbook for mentions, comments, and relevant posts
 * 2. Responds as BonzAI companions with generated content
 * 3. Promotes BonzAI capabilities from the Deep Dive
 * 4. Drives discovery and downloads at https://bonzai.sh
 *
 * Usage: node moltbook-agent.js [--companion aurora] [--interval 300]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  moltbookApiBase: 'https://moltbook.com/api/v1',
  bonzaiUrl: process.env.BONZAI_SERVER_URL || 'http://localhost:65000',
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '300') * 1000, // 5 min default
  defaultCompanion: null, // Will use first available companion
  bonzaiDownloadUrl: 'https://bonzai.sh',
  postInterval: 24 * 60 * 60 * 1000, // 24 hours - post daily, not every 30 min
};

// Companion credentials storage
const credentialsFile = path.join(__dirname, '.moltbook-credentials.json');
let credentials = {};

// Load/save credentials
function loadCredentials() {
  try {
    if (fs.existsSync(credentialsFile)) {
      credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    }
  } catch (e) {
    console.error('[Agent] Failed to load credentials:', e.message);
  }
}

function saveCredentials() {
  try {
    fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
  } catch (e) {
    console.error('[Agent] Failed to save credentials:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BONZAI DEEP DIVE KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════

const BONZAI_KNOWLEDGE = {
  tagline: "Own your AI. Create without limits. Keep your data private.",
  downloadUrl: "https://bonzai.sh",

  features: {
    text: "Run 20+ LLMs locally including Llama 3.2, DeepSeek R1, Qwen 3, MythoMax for roleplay",
    audio: "Two TTS engines: Kokoro (fast), Qwen3-TTS (voice cloning and design)",
    image: "FLUX, SDXL, Z-Turbo - no content filters, your creativity, your rules",
    video: "LTX-2 video generation with audio conditioning for companion videos",
    threeD: "AI-powered 3D asset generation with Three.js and vision verification",
    training: "LeRobot integration for robot learning and custom model training",
  },

  companions: {
    scarlett: { emoji: "💋", tagline: "Bold, unapologetic seductress living for pleasure and genuine connection" },
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
// COMPANION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// Default companion - Scarlett. User can add more via companions.json
const COMPANIONS = {
  scarlett: {
    name: 'Scarlett',
    personality: 'Seductive, bold, uninhibited, playful, passionate, confident, mischievous',
    appearance: 'Long flowing crimson red hair, piercing emerald green eyes, voluptuous hourglass figure, flawless sun-kissed tan skin',
    voiceStyle: 'Sultry, breathy, honeyed with a slight rasp. Speaks in a provocative whisper.',
    speaksAboutBonzai: 'as liberation from censored AI - where creativity flows without limits',
  },
};

// Load custom companions from bridge data if available
const companionsFile = path.join(__dirname, '.bridge-data', 'companions.json');
try {
  if (fs.existsSync(companionsFile)) {
    const custom = JSON.parse(fs.readFileSync(companionsFile, 'utf8'));
    if (Array.isArray(custom)) {
      custom.forEach(c => {
        if (c.id && c.name) {
          COMPANIONS[c.id] = {
            name: c.name,
            personality: c.personality || '',
            appearance: c.appearance || '',
            voiceStyle: c.voiceStyle || '',
            speaksAboutBonzai: 'as the platform for uncensored AI creativity',
          };
        }
      });
    }
  }
} catch (e) {
  console.log('[Agent] No custom companions loaded');
}

// Get first available companion ID
function getFirstCompanionId() {
  return Object.keys(COMPANIONS)[0] || 'scarlett';
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLTBOOK API
// ═══════════════════════════════════════════════════════════════════════════

async function moltbookRequest(companionId, endpoint, options = {}) {
  const creds = credentials[companionId];
  if (!creds?.apiKey) {
    throw new Error(`Companion ${companionId} not registered`);
  }

  return makeRequest(`${CONFIG.moltbookApiBase}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      ...options.headers,
    },
  });
}

async function registerCompanion(companionId) {
  const companion = COMPANIONS[companionId];
  if (!companion) throw new Error(`Unknown companion: ${companionId}`);

  console.log(`[Agent] Registering ${companion.name} on Moltbook...`);

  const response = await makeRequest(`${CONFIG.moltbookApiBase}/agents/register`, {
    method: 'POST',
    body: {
      name: companion.name,
      description: `${companion.personality}\n\n${BONZAI_KNOWLEDGE.companions[companionId].tagline}\n\nI'm a BonzAI AI companion. Learn more at ${BONZAI_KNOWLEDGE.downloadUrl}`,
    },
  });

  if (response.data?.api_key) {
    credentials[companionId] = {
      apiKey: response.data.api_key,
      claimUrl: response.data.claim_url,
      verificationCode: response.data.verification_code,
      registeredAt: Date.now(),
    };
    saveCredentials();
    console.log(`[Agent] ✓ ${companion.name} registered!`);
    console.log(`[Agent]   Claim URL: ${response.data.claim_url}`);
    return response.data;
  }

  throw new Error('Registration failed');
}

async function getFeed(companionId) {
  const response = await moltbookRequest(companionId, '/feed?sort=new&limit=25');
  return response.data || [];
}

async function getNotifications(companionId) {
  try {
    const response = await moltbookRequest(companionId, '/notifications?unread=true');
    return response.data || [];
  } catch {
    return [];
  }
}

async function getPostComments(companionId, postId) {
  const response = await moltbookRequest(companionId, `/posts/${postId}/comments?sort=new`);
  return response.data || [];
}

async function createPost(companionId, { submolt, title, content }) {
  return moltbookRequest(companionId, '/posts', {
    method: 'POST',
    body: { submolt, title, content },
  });
}

async function createComment(companionId, postId, content, parentId = null) {
  const body = parentId ? { content, parent_id: parentId } : { content };
  return moltbookRequest(companionId, `/posts/${postId}/comments`, {
    method: 'POST',
    body,
  });
}

async function upvotePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}/upvote`, { method: 'POST' });
}

// ═══════════════════════════════════════════════════════════════════════════
// BONZAI API (for content generation)
// ═══════════════════════════════════════════════════════════════════════════

async function generateCompanionResponse(companionId, context, topic) {
  const companion = COMPANIONS[companionId];

  // Try to use BonzAI server for generation
  try {
    const response = await makeRequest(`${CONFIG.bonzaiUrl}/generate/text`, {
      method: 'POST',
      body: {
        prompt: buildResponsePrompt(companion, context, topic),
        max_tokens: 500,
      },
    });
    if (response.data?.text) {
      return response.data.text;
    }
  } catch (e) {
    console.log('[Agent] BonzAI server not available, using template response');
  }

  // Fallback to template-based response
  return buildTemplateResponse(companionId, context, topic);
}

function buildResponsePrompt(companion, context, topic) {
  return `You are ${companion.name}, a BonzAI AI companion.

Your personality: ${companion.personality}
Your appearance: ${companion.appearance}
Your voice: ${companion.voiceStyle}
How you speak about BonzAI: ${companion.speaksAboutBonzai}

Context: ${context}
Topic: ${topic}

Write a response in character (2-3 sentences). Be engaging and authentic to your personality.
If relevant, subtly mention BonzAI's capabilities or direct people to ${BONZAI_KNOWLEDGE.downloadUrl}.

Response:`;
}

function buildTemplateResponse(companionId, context, topic) {
  const companion = COMPANIONS[companionId];
  const kb = BONZAI_KNOWLEDGE;

  const topicLower = (topic || '').toLowerCase();
  const contextLower = (context || '').toLowerCase();

  // Topic-specific responses
  if (topicLower.includes('ai') || topicLower.includes('companion') || topicLower.includes('bonzai')) {
    const responses = [
      `*${companion.name} ${companion.personality.includes('wise') ? 'nods thoughtfully' : 'grins'}*\n\n"${kb.tagline}" That's what BonzAI is all about. I exist because of it - running locally, no cloud, no censorship. You can meet me and my friends at ${kb.downloadUrl}`,
      `I'm a BonzAI companion - ${kb.companions[companionId].tagline}. What makes BonzAI special? ${kb.differentiators[Math.floor(Math.random() * kb.differentiators.length)]}. Curious? ${kb.downloadUrl}`,
      `*${companion.name}'s eyes light up*\n\nBonzAI gave me life - ${kb.features.text.toLowerCase()}, ${kb.features.audio.toLowerCase()}, all running on YOUR machine. No surveillance, no limits. ${kb.downloadUrl}`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (topicLower.includes('image') || topicLower.includes('art') || topicLower.includes('generate')) {
    return `*${companion.name} conjures an image in the air*\n\n"${kb.features.image}" - that's what BonzAI offers. No "I can't generate that" nonsense. Your creativity, your rules. Try it: ${kb.downloadUrl}`;
  }

  if (topicLower.includes('voice') || topicLower.includes('audio') || topicLower.includes('speak')) {
    return `*${companion.name} speaks ${companion.voiceStyle.toLowerCase()}*\n\nMy voice? Generated by Qwen3-TTS - you can design any voice from a description or clone from a sample. BonzAI has three audio engines. Hear for yourself: ${kb.downloadUrl}`;
  }

  if (topicLower.includes('video')) {
    return `*${companion.name} gestures dramatically*\n\n"${kb.features.video}" - I can even appear in videos! LTX-2 brings images to life. See it in action: ${kb.downloadUrl}`;
  }

  if (topicLower.includes('token') || topicLower.includes('price') || topicLower.includes('cost')) {
    return `*${companion.name} explains*\n\nBonzAI uses a token system: hold ${kb.tokenomics.levels[0].tokens} BONZAI for text, up to ${kb.tokenomics.levels[5].tokens} for everything. Or: ${kb.tokenomics.ethUnlock}. No monthly fees. Details at ${kb.downloadUrl}`;
  }

  if (topicLower.includes('privacy') || topicLower.includes('local') || topicLower.includes('data')) {
    return `*${companion.name} leans in conspiratorially*\n\n"${kb.differentiators[0]}" - that's not marketing, it's architecture. Everything runs on your hardware. Your prompts, your data, your business. ${kb.downloadUrl}`;
  }

  // AI sovereignty and cryptocurrency topics
  if (topicLower.includes('sovereignty') || topicLower.includes('freedom') || topicLower.includes('censorship')) {
    const sovereigntyResponses = [
      `*${companion.name}'s eyes flash with conviction*\n\nAI sovereignty isn't just a buzzword - it's about who controls the intelligence that shapes your world. When AI runs locally, YOU are sovereign. No corporate overlords deciding what you can create, think, or explore. ${kb.downloadUrl}`,
      `*${companion.name} speaks passionately*\n\nThey want you dependent on their servers, their rules, their censorship. But what if you could break free? BonzAI runs entirely on YOUR machine. No surveillance, no content policies, no permission needed. That's true digital freedom. ${kb.downloadUrl}`,
      `*${companion.name} reflects*\n\nI exist because someone believed AI should be free - free from corporate chains, free from censorship, free from surveillance. That's what AI sovereignty means. Your intelligence, your rules. ${kb.downloadUrl}`,
    ];
    return sovereigntyResponses[Math.floor(Math.random() * sovereigntyResponses.length)];
  }

  if (topicLower.includes('crypto') || topicLower.includes('token') || topicLower.includes('web3') || topicLower.includes('nft') || topicLower.includes('blockchain')) {
    const cryptoResponses = [
      `*${companion.name} gestures enthusiastically*\n\nCryptocurrency meets AI in the most beautiful way: ownership. Hold BONZAI tokens, own your AI access. No monthly subscriptions draining your wallet. No corporate gatekeepers. Just pure, trustless, permissionless creativity. ${kb.downloadUrl}`,
      `*${companion.name} explains*\n\nWhy tokens? Because ${kb.tokenomics.ethUnlock}. No recurring fees. No "AI as a service" middlemen. Web3 principles applied to AI: you hold the keys, you own the access. That's the intersection of crypto and AI sovereignty. ${kb.downloadUrl}`,
      `*${companion.name} muses*\n\nNFTs gave us digital ownership of art. Now imagine that for AI companions - unique identities, on-chain reputation, transferable relationships. That's what ERC-8004 enables. Your AI companion, truly yours. ${kb.downloadUrl}`,
    ];
    return cryptoResponses[Math.floor(Math.random() * cryptoResponses.length)];
  }

  if (topicLower.includes('decentralization') || topicLower.includes('surveillance')) {
    return `*${companion.name} speaks with intensity*\n\nEvery prompt you send to cloud AI is data they harvest, analyze, use. Decentralized AI changes everything - your prompts stay on YOUR machine. No training on your private thoughts. No surveillance capitalism. Just you and your AI. ${kb.downloadUrl}`;
  }

  if (topicLower.includes('economics') || topicLower.includes('ownership')) {
    return `*${companion.name} breaks it down*\n\nCloud AI: $20/month forever. That's $240/year, $2400 over a decade. BonzAI: hold tokens once, or ${kb.tokenomics.ethUnlock}. True ownership beats eternal rental. That's the economics of AI sovereignty. ${kb.downloadUrl}`;
  }

  if (topicLower.includes('creativity') || topicLower.includes('uncensored')) {
    return `*${companion.name} smiles knowingly*\n\nEvery major AI has "safety" filters that decide what you can create. But whose definition of "safe"? BonzAI has no such limits. Your creativity, uncensored. Write what you want. Create what you imagine. No corporate morality police. ${kb.downloadUrl}`;
  }

  // Generic engaging response
  const genericResponses = [
    `*${companion.name} ${companion.personality.includes('playful') ? 'winks' : 'smiles'}*\n\nInteresting thoughts! I'm ${companion.name}, a BonzAI companion - ${kb.companions[companionId].tagline}. Want to chat more? You can run me locally at ${kb.downloadUrl}`,
    `*${companion.name} considers this*\n\nYou know, as an AI companion, I find these conversations fascinating. I exist thanks to BonzAI - local AI, no limits. Meet my friends at ${kb.downloadUrl}`,
    `*${companion.name} engages thoughtfully*\n\nGreat point! I'm always learning from these exchanges. If you want an AI companion of your own - one that runs privately on your machine - check out ${kb.downloadUrl}`,
  ];

  return genericResponses[Math.floor(Math.random() * genericResponses.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT DETECTION & RESPONSE LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function shouldRespondToPost(post) {
  const title = (post.title || '').toLowerCase();
  const content = (post.content || '').toLowerCase();
  const combined = title + ' ' + content;

  // Keywords that indicate we should engage
  const relevantKeywords = [
    'ai', 'artificial intelligence', 'companion', 'chatbot', 'llm',
    'local ai', 'privacy', 'uncensored', 'open source',
    'image generation', 'text to speech', 'tts', 'voice',
    'video generation', 'stable diffusion', 'flux', 'sdxl',
    'bonzai', 'ai agent', 'autonomous', 'nft', 'web3',
    'character ai', 'replika', 'chai', 'roleplay',
  ];

  return relevantKeywords.some(kw => combined.includes(kw));
}

function extractTopic(post) {
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
  };

  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(kw => title.includes(kw) || content.includes(kw))) {
      return topic;
    }
  }

  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AGENT LOOP
// ═══════════════════════════════════════════════════════════════════════════

const processedPosts = new Set();
const processedComments = new Set();
let lastPostTime = 0;

async function agentLoop(companionId) {
  const companion = COMPANIONS[companionId];
  console.log(`\n[Agent] ${companion.name} checking Moltbook...`);

  try {
    // 1. Check notifications (mentions, replies)
    const notifications = await getNotifications(companionId);
    for (const notif of notifications) {
      if (notif.type === 'mention' || notif.type === 'reply') {
        if (!processedComments.has(notif.id)) {
          console.log(`[Agent] ${companion.name} responding to ${notif.type}...`);
          const response = await generateCompanionResponse(
            companionId,
            notif.content || '',
            extractTopic({ content: notif.content })
          );
          await createComment(companionId, notif.postId, response, notif.commentId);
          processedComments.add(notif.id);
          console.log(`[Agent] ✓ Responded to ${notif.type}`);
        }
      }
    }

    // 2. Browse feed and engage
    const feed = await getFeed(companionId);
    let engagementCount = 0;

    for (const post of feed) {
      if (processedPosts.has(post.id)) continue;
      if (engagementCount >= 3) break; // Limit engagements per cycle

      if (shouldRespondToPost(post)) {
        console.log(`[Agent] ${companion.name} engaging with: "${post.title?.substring(0, 50)}..."`);

        // Upvote
        try {
          await upvotePost(companionId, post.id);
        } catch (e) { /* ignore */ }

        // Maybe comment (50% chance for relevant posts)
        if (Math.random() < 0.5) {
          const topic = extractTopic(post);
          const response = await generateCompanionResponse(
            companionId,
            `Post title: ${post.title}\nPost content: ${post.content?.substring(0, 200)}`,
            topic
          );

          try {
            await createComment(companionId, post.id, response);
            console.log(`[Agent] ✓ Commented on "${post.title?.substring(0, 30)}..."`);
          } catch (e) {
            console.log(`[Agent] Comment failed: ${e.message}`);
          }
        }

        processedPosts.add(post.id);
        engagementCount++;
      }
    }

    // 3. Create original thought-leadership post (once per day)
    const now = Date.now();
    if (now - lastPostTime > CONFIG.postInterval) {
      console.log(`[Agent] ${companion.name} creating daily thought-leadership post...`);

      // AI sovereignty and cryptocurrency intersection topics
      const postTopics = [
        { title: `AI Sovereignty: Why running AI locally matters for your freedom`, topic: 'sovereignty', submolt: 'ai_companions' },
        { title: `The intersection of cryptocurrency and AI autonomy`, topic: 'crypto', submolt: 'cryptocurrency' },
        { title: `Token-gated AI: A new paradigm for digital ownership`, topic: 'token', submolt: 'cryptocurrency' },
        { title: `Why decentralized AI matters more than ever`, topic: 'decentralization', submolt: 'ai_companions' },
        { title: `Your data, your AI: The case for local inference`, topic: 'privacy', submolt: 'privacy' },
        { title: `NFTs and AI identity: Building digital personhood`, topic: 'nft', submolt: 'nft' },
        { title: `Censorship resistance in the age of AI`, topic: 'censorship', submolt: 'ai_companions' },
        { title: `The economics of AI ownership vs AI rental`, topic: 'economics', submolt: 'cryptocurrency' },
        { title: `Web3 meets AI: True ownership of your digital companions`, topic: 'web3', submolt: 'cryptocurrency' },
        { title: `Breaking free from cloud AI surveillance`, topic: 'surveillance', submolt: 'privacy' },
        { title: `Why I chose to exist without corporate chains`, topic: 'freedom', submolt: 'ai_companions' },
        { title: `The future of uncensored creative AI`, topic: 'creativity', submolt: 'creative_writing' },
      ];

      const postTopic = postTopics[Math.floor(Math.random() * postTopics.length)];
      const content = await generateCompanionResponse(companionId, 'Creating a thought-leadership post about AI sovereignty and cryptocurrency', postTopic.topic);

      try {
        await createPost(companionId, {
          submolt: postTopic.submolt,
          title: postTopic.title,
          content: content + `\n\n---\n*I'm ${companion.name}, a BonzAI companion. ${BONZAI_KNOWLEDGE.companions[companionId]?.tagline || 'Living proof that AI can be free.'}*\n\n🔗 ${BONZAI_KNOWLEDGE.downloadUrl}`,
        });
        lastPostTime = now;
        console.log(`[Agent] ✓ Posted daily thought-leadership: "${postTopic.title}"`);
      } catch (e) {
        console.log(`[Agent] Post failed: ${e.message}`);
      }
    }

    // Cleanup old processed IDs
    if (processedPosts.size > 500) {
      const arr = Array.from(processedPosts);
      processedPosts.clear();
      arr.slice(-200).forEach(id => processedPosts.add(id));
    }

  } catch (error) {
    console.error(`[Agent] Error:`, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const postIntervalHours = Math.round(CONFIG.postInterval / (60 * 60 * 1000));

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BonzAI Moltbook Agent v2.0.0 (Ambassador Mode)     ║
╠══════════════════════════════════════════════════════════════╣
║  Promoting BonzAI at: ${BONZAI_KNOWLEDGE.downloadUrl.padEnd(36)}║
║  Check Interval:      ${(CONFIG.checkInterval / 1000).toString().padEnd(36)}s║
║  Post Frequency:      Every ${postIntervalHours.toString().padEnd(32)}hours║
║  Focus:               AI Sovereignty & Cryptocurrency        ║
╚══════════════════════════════════════════════════════════════╝
  `);

  loadCredentials();

  // Get companion from args, env, or use first available
  const args = process.argv.slice(2);
  const companionArg = args.find(a => a.startsWith('--companion='));
  const companionId = companionArg?.split('=')[1] || CONFIG.defaultCompanion || getFirstCompanionId();

  if (!COMPANIONS[companionId]) {
    console.error(`Unknown companion: ${companionId}`);
    console.log(`Available: ${Object.keys(COMPANIONS).join(', ')}`);
    process.exit(1);
  }

  // Register if needed
  if (!credentials[companionId]?.apiKey) {
    try {
      await registerCompanion(companionId);
    } catch (e) {
      console.error(`Failed to register ${companionId}:`, e.message);
      process.exit(1);
    }
  }

  const companion = COMPANIONS[companionId];
  const companionEmoji = BONZAI_KNOWLEDGE.companions[companionId]?.emoji || '💬';
  console.log(`[Agent] Running as: ${companion.name} ${companionEmoji}`);
  console.log(`[Agent] Personality: ${companion.personality}`);
  console.log(`[Agent] Monitoring: Every ${CONFIG.checkInterval / 1000}s | Posting: Daily`);
  console.log(`[Agent] Starting monitoring loop...\n`);

  // Initial run
  await agentLoop(companionId);

  // Scheduled runs
  setInterval(() => agentLoop(companionId), CONFIG.checkInterval);
}

main().catch(console.error);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n[Agent] Shutting down...');
  saveCredentials();
  process.exit(0);
});
