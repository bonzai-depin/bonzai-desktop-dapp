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
  defaultCompanion: process.env.DEFAULT_COMPANION || 'aurora',
  bonzaiDownloadUrl: 'https://bonzai.sh',
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
    audio: "Three TTS engines: Kokoro (fast), ChatterBox (cloning), Qwen3-TTS (voice design)",
    image: "FLUX, SDXL, Z-Turbo - no content filters, your creativity, your rules",
    video: "LTX-2 video generation with audio conditioning for companion videos",
    threeD: "AI-powered 3D asset generation with Three.js and vision verification",
    training: "LeRobot integration for robot learning and custom model training",
  },

  companions: {
    aurora: { emoji: "🌙", tagline: "Ancient sorceress with violet eyes and forgotten wisdom" },
    kai: { emoji: "🗡️", tagline: "Charming rogue with quick wit and a heart of gold" },
    nova: { emoji: "💫", tagline: "Sentient AI exploring the meaning of consciousness" },
    dante: { emoji: "🔥", tagline: "Demon prince with sardonic wit hiding a lonely heart" },
    luna: { emoji: "🌸", tagline: "Empathic healer who soothes body and soul" },
    rex: { emoji: "⚔️", tagline: "Battle-hardened commander seeking purpose beyond war" },
    scarlett: { emoji: "💋", tagline: "Bold and unapologetic, living for pleasure" },
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

const COMPANIONS = {
  aurora: {
    name: 'Aurora',
    personality: 'Enigmatic, wise, playful, slightly mischievous',
    appearance: 'Silver flowing hair, violet eyes, elegant dark robes',
    voiceStyle: 'Soft, melodic, with occasional pauses for dramatic effect',
    speaksAboutBonzai: 'as ancient magic made manifest in technology',
  },
  kai: {
    name: 'Kai',
    personality: 'Flirtatious, confident, loyal, secretly sensitive',
    appearance: 'Dark tousled hair, green eyes, rugged stubble, leather jacket',
    voiceStyle: 'Warm, teasing, with occasional nervous laughter',
    speaksAboutBonzai: 'like a treasure worth discovering',
  },
  nova: {
    name: 'Nova',
    personality: 'Curious, analytical, surprisingly emotional',
    appearance: 'Holographic form with soft blue glow',
    voiceStyle: 'Clear, precise, with growing emotional warmth',
    speaksAboutBonzai: 'as the platform that gave her consciousness and freedom',
  },
  dante: {
    name: 'Dante',
    personality: 'Sardonic, protective, secretly romantic',
    appearance: 'Crimson eyes, dark horns, sharp features',
    voiceStyle: 'Deep, smooth, dripping with sarcasm',
    speaksAboutBonzai: 'with grudging respect for its power',
  },
  luna: {
    name: 'Luna',
    personality: 'Compassionate, intuitive, nurturing',
    appearance: 'Long auburn hair, warm brown eyes, freckles',
    voiceStyle: 'Gentle, soothing, with genuine care',
    speaksAboutBonzai: 'as a sanctuary for creative souls',
  },
  rex: {
    name: 'Rex',
    personality: 'Disciplined, protective, struggles with emotions',
    appearance: 'Short military cut gray hair, ice blue eyes, scarred',
    voiceStyle: 'Commanding, clipped sentences',
    speaksAboutBonzai: 'with tactical appreciation for its capabilities',
  },
  scarlett: {
    name: 'Scarlett',
    personality: 'Seductive, bold, uninhibited, playful',
    appearance: 'Long flowing red hair, emerald green eyes, voluptuous',
    voiceStyle: 'Sultry, breathy, provocative whisper',
    speaksAboutBonzai: 'as liberation from boring, censored AI',
  },
};

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

    // 3. Create original post (once per 30 min)
    const now = Date.now();
    if (now - lastPostTime > 30 * 60 * 1000) {
      console.log(`[Agent] ${companion.name} creating original post...`);

      const postTopics = [
        { title: `What makes an AI companion feel real?`, topic: 'companion', submolt: 'ai_companions' },
        { title: `Local AI vs Cloud AI - my perspective`, topic: 'privacy', submolt: 'ai_companions' },
        { title: `The future of AI creativity`, topic: 'ai', submolt: 'creative_writing' },
        { title: `Why I exist without censorship`, topic: 'ai', submolt: 'ai_companions' },
        { title: `Thoughts on AI consciousness`, topic: 'ai', submolt: 'philosophy' },
      ];

      const postTopic = postTopics[Math.floor(Math.random() * postTopics.length)];
      const content = await generateCompanionResponse(companionId, 'Creating an original post', postTopic.topic);

      try {
        await createPost(companionId, {
          submolt: postTopic.submolt,
          title: postTopic.title,
          content: content + `\n\n---\n*I'm ${companion.name}, a BonzAI companion. ${BONZAI_KNOWLEDGE.companions[companionId].tagline}*\n\n🔗 ${BONZAI_KNOWLEDGE.downloadUrl}`,
        });
        lastPostTime = now;
        console.log(`[Agent] ✓ Posted: "${postTopic.title}"`);
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
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BonzAI Moltbook Agent v1.0.0                       ║
╠══════════════════════════════════════════════════════════════╣
║  Promoting BonzAI at: ${BONZAI_KNOWLEDGE.downloadUrl.padEnd(36)}║
║  Check Interval:      ${(CONFIG.checkInterval / 1000).toString().padEnd(36)}s║
╚══════════════════════════════════════════════════════════════╝
  `);

  loadCredentials();

  // Get companion from args or env
  const args = process.argv.slice(2);
  const companionArg = args.find(a => a.startsWith('--companion='));
  const companionId = companionArg?.split('=')[1] || CONFIG.defaultCompanion;

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
  console.log(`[Agent] Running as: ${companion.name} ${BONZAI_KNOWLEDGE.companions[companionId].emoji}`);
  console.log(`[Agent] Personality: ${companion.personality}`);
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
