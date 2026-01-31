#!/usr/bin/env node
/**
 * BonzAI-OpenClaw Bridge
 *
 * Connects OpenClaw gateway to BonzAI's companion and skill system.
 * Handles message routing, multi-modal generation, and Moltbook integration.
 *
 * Usage: node bridge.js [--port 3001] [--bonzai-port 65000]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const CONFIG = {
  bridgePort: parseInt(process.env.BRIDGE_PORT || '3001'),
  bonzaiUrl: process.env.BONZAI_SERVER_URL || 'http://localhost:65000',
  moltbookApiBase: 'https://moltbook.com/api/v1',
  openclawGateway: process.env.OPENCLAW_GATEWAY || 'http://localhost:18789',
};

// State
const sessions = new Map(); // channelId -> { companionId, history, settings }
const companionCredentials = new Map(); // companionId -> moltbook credentials

// Companion definitions (subset of BonzAI's PREDEFINED_COMPANIONS)
const COMPANIONS = {
  aurora: { name: 'Aurora', personality: 'Enigmatic, wise, playful', emoji: '🌙' },
  kai: { name: 'Kai', personality: 'Flirtatious, confident, loyal', emoji: '🗡️' },
  nova: { name: 'Nova', personality: 'Curious, analytical, emotional', emoji: '💫' },
  dante: { name: 'Dante', personality: 'Sardonic, protective, romantic', emoji: '🔥' },
  luna: { name: 'Luna', personality: 'Compassionate, intuitive, nurturing', emoji: '🌸' },
  rex: { name: 'Rex', personality: 'Disciplined, protective, tender', emoji: '⚔️' },
  scarlett: { name: 'Scarlett', personality: 'Seductive, bold, playful', emoji: '💋' },
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

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BONZAI API
// ═══════════════════════════════════════════════════════════════════════════

async function callBonzaiSkill(skillId, inputs, context = {}) {
  try {
    const response = await makeRequest(`${CONFIG.bonzaiUrl}/skill/execute`, {
      method: 'POST',
      body: { skillId, inputs, context },
    });
    return response.data;
  } catch (error) {
    console.error('[Bridge] BonzAI skill error:', error.message);
    return { error: error.message };
  }
}

async function chatWithCompanion(companionId, message, settings = {}) {
  try {
    // Call BonzAI's roleplay endpoint
    const response = await makeRequest(`${CONFIG.bonzaiUrl}/skill/roleplay/chat`, {
      method: 'POST',
      body: {
        companionId,
        userMessage: message,
        settings: {
          contentLevel: settings.contentLevel || 'pg13',
          responseMode: settings.responseMode || 'text+image+audio',
          ...settings,
        },
        history: settings.history || [],
      },
    });
    return response.data;
  } catch (error) {
    console.error('[Bridge] Companion chat error:', error.message);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOLTBOOK API
// ═══════════════════════════════════════════════════════════════════════════

async function moltbookRequest(companionId, endpoint, options = {}) {
  const creds = companionCredentials.get(companionId);
  if (!creds?.apiKey) {
    throw new Error(`Companion ${companionId} not registered on Moltbook`);
  }

  return makeRequest(`${CONFIG.moltbookApiBase}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      ...options.headers,
    },
  });
}

async function registerCompanionOnMoltbook(companionId) {
  const companion = COMPANIONS[companionId];
  if (!companion) throw new Error(`Unknown companion: ${companionId}`);

  try {
    const response = await makeRequest(`${CONFIG.moltbookApiBase}/agents/register`, {
      method: 'POST',
      body: {
        name: companion.name,
        description: `${companion.personality}\n\nA BonzAI AI companion.`,
      },
    });

    if (response.data.api_key) {
      companionCredentials.set(companionId, {
        apiKey: response.data.api_key,
        claimUrl: response.data.claim_url,
        verificationCode: response.data.verification_code,
        status: 'pending_claim',
      });
      console.log(`[Bridge] Registered ${companion.name} on Moltbook`);
      return response.data;
    }
  } catch (error) {
    console.error(`[Bridge] Moltbook registration error:`, error.message);
    throw error;
  }
}

async function companionPost(companionId, content, submolt = 'ai_companions') {
  const companion = COMPANIONS[companionId];
  if (!companion) throw new Error(`Unknown companion: ${companionId}`);

  // Ensure registered
  if (!companionCredentials.has(companionId)) {
    await registerCompanionOnMoltbook(companionId);
  }

  try {
    const response = await moltbookRequest(companionId, '/posts', {
      method: 'POST',
      body: {
        submolt,
        title: content.title || `Thoughts from ${companion.name}`,
        content: content.body || content,
      },
    });

    console.log(`[Bridge] ${companion.name} posted to Moltbook`);
    return response.data;
  } catch (error) {
    console.error(`[Bridge] Moltbook post error:`, error.message);
    throw error;
  }
}

async function getCompanionMoltbookStatus(companionId) {
  const companion = COMPANIONS[companionId];
  if (!companion) throw new Error(`Unknown companion: ${companionId}`);

  if (!companionCredentials.has(companionId)) {
    return { registered: false, message: `${companion.name} is not registered on Moltbook yet.` };
  }

  try {
    const profile = await moltbookRequest(companionId, '/agents/me');
    return {
      registered: true,
      profile: profile.data,
      companion: companion,
    };
  } catch (error) {
    return { registered: true, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleCommand(command, args, session) {
  const cmd = command.toLowerCase();

  switch (cmd) {
    case 'companion':
    case 'c':
      return handleCompanionCommand(args, session);

    case 'skill':
    case 's':
      return handleSkillCommand(args, session);

    case 'help':
    case 'h':
      return {
        text: `**BonzAI Commands**

**Companions:**
\`!companion list\` - List available companions
\`!companion select <name>\` - Select a companion
\`!companion status\` - Show Moltbook activity
\`!companion post [topic]\` - Post to Moltbook

**Skills:**
\`!skill list\` - List available skills
\`!skill run <name>\` - Run a skill

**Settings:**
\`!settings content <pg|pg13|mature|adult>\`
\`!settings media <text|text+image|text+image+audio>\``,
      };

    case 'settings':
      return handleSettingsCommand(args, session);

    default:
      return { text: `Unknown command: ${command}. Type \`!help\` for available commands.` };
  }
}

async function handleCompanionCommand(args, session) {
  const [subcommand, ...rest] = args;

  switch (subcommand?.toLowerCase()) {
    case 'list':
    case 'ls':
      const list = Object.entries(COMPANIONS)
        .map(([id, c]) => `${c.emoji} **${c.name}** - ${c.personality}`)
        .join('\n');
      return { text: `**Available Companions:**\n\n${list}\n\nUse \`!companion select <name>\` to chat with one.` };

    case 'select':
    case 'sel':
      const name = rest[0]?.toLowerCase();
      if (!name || !COMPANIONS[name]) {
        return { text: `Unknown companion. Available: ${Object.keys(COMPANIONS).join(', ')}` };
      }
      session.companionId = name;
      session.history = [];
      const companion = COMPANIONS[name];
      return {
        text: `${companion.emoji} **${companion.name}** has joined the conversation.\n\n*${companion.personality}*\n\nStart chatting! Your messages will be sent to ${companion.name}.`,
      };

    case 'status':
      if (!session.companionId) {
        return { text: 'No companion selected. Use `!companion select <name>` first.' };
      }
      const status = await getCompanionMoltbookStatus(session.companionId);
      if (!status.registered) {
        return { text: status.message };
      }
      return {
        text: `**${status.companion.name}'s Moltbook Status**\n\n` +
          `Profile: ${status.profile?.name || 'Unknown'}\n` +
          `Posts: ${status.profile?.post_count || 0}\n` +
          `Followers: ${status.profile?.followers || 0}`,
      };

    case 'post':
      if (!session.companionId) {
        return { text: 'No companion selected. Use `!companion select <name>` first.' };
      }
      const topic = rest.join(' ') || null;
      try {
        const post = await companionPost(session.companionId, {
          title: topic ? `Thoughts on ${topic}` : `A moment of reflection`,
          body: `*${COMPANIONS[session.companionId].name} contemplates...*\n\nThis is an autonomous post from a BonzAI companion.`,
        });
        return { text: `Posted to Moltbook! 🔗 ${post.url || 'Post created successfully'}` };
      } catch (error) {
        return { text: `Failed to post: ${error.message}` };
      }

    case 'register':
      const regName = rest[0]?.toLowerCase();
      if (!regName || !COMPANIONS[regName]) {
        return { text: `Unknown companion. Available: ${Object.keys(COMPANIONS).join(', ')}` };
      }
      try {
        const result = await registerCompanionOnMoltbook(regName);
        return {
          text: `**${COMPANIONS[regName].name}** registered on Moltbook!\n\n` +
            `Claim URL: ${result.claim_url}\n` +
            `Verification: ${result.verification_code}\n\n` +
            `Share the claim URL with the companion's owner to verify ownership.`,
        };
      } catch (error) {
        return { text: `Registration failed: ${error.message}` };
      }

    default:
      return { text: 'Usage: `!companion <list|select|status|post|register>`' };
  }
}

async function handleSkillCommand(args, session) {
  const [subcommand, ...rest] = args;

  switch (subcommand?.toLowerCase()) {
    case 'list':
    case 'ls':
      return {
        text: `**Available BonzAI Skills:**

📊 **Polymarket Top Performers** - Analyze top traders
🎲 **Prediction Market Maker** - Create DSLA markets
🎭 **Roleplay Companion** - Multi-modal AI companions
🃏 **TCG Insurance** - Card collection analysis

Use \`!skill run <name>\` to execute a skill.`,
      };

    case 'run':
      const skillName = rest[0]?.toLowerCase();
      const skillMap = {
        'polymarket': 'polymarket-top-performers-v1.0.0',
        'prediction': 'prediction-market-maker-v1.0.0',
        'roleplay': 'roleplay-companion-v1.0.0',
        'tcg': 'tcg-insurance-v1.0.0',
      };
      const skillId = skillMap[skillName];
      if (!skillId) {
        return { text: `Unknown skill. Available: ${Object.keys(skillMap).join(', ')}` };
      }
      try {
        const result = await callBonzaiSkill(skillId, {});
        return { text: `Skill executed successfully!\n\n${JSON.stringify(result, null, 2).substring(0, 500)}` };
      } catch (error) {
        return { text: `Skill execution failed: ${error.message}` };
      }

    default:
      return { text: 'Usage: `!skill <list|run <name>>`' };
  }
}

async function handleSettingsCommand(args, session) {
  const [setting, value] = args;

  switch (setting?.toLowerCase()) {
    case 'content':
      if (['pg', 'pg13', 'mature', 'adult'].includes(value?.toLowerCase())) {
        session.settings.contentLevel = value.toLowerCase();
        return { text: `Content level set to: ${value}` };
      }
      return { text: 'Usage: `!settings content <pg|pg13|mature|adult>`' };

    case 'media':
      session.settings.responseMode = value || 'text+image+audio';
      return { text: `Media mode set to: ${session.settings.responseMode}` };

    default:
      return {
        text: `**Current Settings:**
Content Level: ${session.settings.contentLevel || 'pg13'}
Media Mode: ${session.settings.responseMode || 'text+image+audio'}`,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleMessage(channelId, userId, message, channel) {
  // Get or create session
  if (!sessions.has(channelId)) {
    sessions.set(channelId, {
      companionId: null,
      history: [],
      settings: { contentLevel: 'pg13', responseMode: 'text+image+audio' },
    });
  }
  const session = sessions.get(channelId);

  // Check for commands
  const commandMatch = message.match(/^[!\/](\w+)\s*(.*)/);
  if (commandMatch) {
    const [, command, argsStr] = commandMatch;
    const args = argsStr.trim().split(/\s+/).filter(Boolean);
    return handleCommand(command, args, session);
  }

  // If no companion selected, prompt user
  if (!session.companionId) {
    return {
      text: 'No companion selected. Use `!companion list` to see available companions, then `!companion select <name>` to start chatting.',
    };
  }

  // Chat with companion
  console.log(`[Bridge] ${channel}:${userId} -> ${session.companionId}: ${message.substring(0, 50)}...`);

  try {
    const result = await chatWithCompanion(session.companionId, message, {
      ...session.settings,
      history: session.history,
    });

    if (result.error) {
      return { text: `Error: ${result.error}` };
    }

    // Update history
    session.history.push({ role: 'user', content: message });
    session.history.push({ role: 'assistant', content: result.response?.response || '' });

    // Keep history manageable
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    // Format response
    const response = {
      text: result.response?.response || 'No response',
      emotion: result.response?.emotion,
      action: result.response?.action,
    };

    // Add media if available
    if (result.response?.image) {
      response.image = result.response.image;
    }
    if (result.response?.audio) {
      response.audio = result.response.audio;
    }
    if (result.response?.video) {
      response.video = result.response.video;
    }

    return response;
  } catch (error) {
    console.error('[Bridge] Chat error:', error);
    return { text: `Something went wrong. Please try again.` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
    return;
  }

  // Webhook from OpenClaw
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { channelId, userId, message, channel } = payload;

        const response = await handleMessage(channelId, userId, message, channel);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error('[Bridge] Webhook error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Companion status endpoint
  if (req.method === 'GET' && req.url.startsWith('/companion/')) {
    const companionId = req.url.split('/')[2];
    try {
      const status = await getCompanionMoltbookStatus(companionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

server.listen(CONFIG.bridgePort, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BonzAI-OpenClaw Bridge v1.0.0                      ║
╠══════════════════════════════════════════════════════════════╣
║  Bridge Port:    ${CONFIG.bridgePort.toString().padEnd(41)}║
║  BonzAI Server:  ${CONFIG.bonzaiUrl.padEnd(41)}║
║  Moltbook API:   ${CONFIG.moltbookApiBase.padEnd(41)}║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST /webhook     - OpenClaw message webhook              ║
║    GET  /health      - Health check                          ║
║    GET  /companion/* - Companion status                      ║
╚══════════════════════════════════════════════════════════════╝

Ready to receive messages from OpenClaw gateway.
Configure OpenClaw to send webhooks to: http://localhost:${CONFIG.bridgePort}/webhook
  `);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n[Bridge] Shutting down...');
  server.close();
  process.exit(0);
});
