/**
 * OpenClaw Webhook Handler
 *
 * Handles incoming webhooks from the OpenClaw gateway via IPC.
 * Uses the same session storage as RoleplayChat.vue (roleplaySessions)
 * so conversations can be continued between the app UI and external channels.
 */

import {
  findCompanion,
  findScenario,
  DEFAULT_COMPANIONS,
  DEFAULT_SCENARIOS,
} from '../skills/flagship.js';

// Storage keys (same as RoleplayChat.vue)
const STORAGE_KEY = 'roleplaySessions';
const CHANNEL_MAPPING_KEY = 'openclawChannelMappings';

// In-memory cache
let savedSessions = {};
let channelMappings = {}; // channelId → { sessionKey, settings }
let loaded = false;

// Content level guidelines
const CONTENT_GUIDELINES = {
  pg: 'Keep content family-friendly and wholesome. No romance beyond hand-holding.',
  pg13: 'Mild romantic content allowed including kissing. No explicit material.',
  mature: 'Mature themes allowed including romance and suggestive content. Tasteful sensuality.',
  adult: 'Full creative freedom for adult content. Be sensual and descriptive when appropriate.',
};

/**
 * Generate session key (same format as RoleplayChat.vue)
 */
function getSessionKey(companion, scenario, contentLevel, responseMode) {
  if (!companion || !scenario) return null;
  const companionId = companion.id || `custom_${companion.name?.toLowerCase().replace(/\s+/g, '_')}`;
  const scenarioId = scenario.id || `custom_${scenario.name?.toLowerCase().replace(/\s+/g, '_')}`;
  return `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`;
}

/**
 * Get response mode string from settings
 */
function getResponseMode(settings) {
  const parts = ['text'];
  if (settings.enableImage) parts.push('image');
  if (settings.enableAudio) parts.push('audio');
  if (settings.enableVideo) parts.push('video');
  return parts.join('+');
}

/**
 * Load sessions and channel mappings from store
 */
async function loadData() {
  if (loaded) return;
  try {
    savedSessions = await window.electronAPI.store.get(STORAGE_KEY, {});
    channelMappings = await window.electronAPI.store.get(CHANNEL_MAPPING_KEY, {});
    loaded = true;
    console.log(`[OpenClaw] Loaded ${Object.keys(savedSessions).length} sessions, ${Object.keys(channelMappings).length} channel mappings`);
  } catch (e) {
    console.error('[OpenClaw] Failed to load data:', e);
    loaded = true;
  }
}

/**
 * Save sessions to store
 */
async function saveSessions() {
  try {
    await window.electronAPI.store.set(STORAGE_KEY, savedSessions);
  } catch (e) {
    console.error('[OpenClaw] Failed to save sessions:', e);
  }
}

/**
 * Save channel mappings to store
 */
async function saveChannelMappings() {
  try {
    await window.electronAPI.store.set(CHANNEL_MAPPING_KEY, channelMappings);
  } catch (e) {
    console.error('[OpenClaw] Failed to save channel mappings:', e);
  }
}

/**
 * Get or create channel mapping with default settings
 */
function getChannelMapping(channelId) {
  if (!channelMappings[channelId]) {
    channelMappings[channelId] = {
      sessionKey: null,
      companionId: null,
      scenarioId: null,
      settings: {
        contentLevel: 'mature',
        enableImage: true,
        enableAudio: true,
        enableVideo: false,
        enableVision: false,
      },
    };
  }
  return channelMappings[channelId];
}

/**
 * Get or create session for a channel
 */
async function getOrCreateSession(channelId, companions, scenarios) {
  const mapping = getChannelMapping(channelId);

  // Get companion and scenario
  const companion = mapping.companionId
    ? findCompanion(mapping.companionId, companions)
    : companions[0];
  const scenario = mapping.scenarioId
    ? findScenario(mapping.scenarioId, scenarios)
    : scenarios[0];

  if (!companion || !scenario) {
    return null;
  }

  const responseMode = getResponseMode(mapping.settings);
  const sessionKey = getSessionKey(companion, scenario, mapping.settings.contentLevel, responseMode);

  // Update mapping with current session key
  mapping.sessionKey = sessionKey;
  mapping.companionId = companion.id;
  mapping.scenarioId = scenario.id;

  // Get or create session
  if (!savedSessions[sessionKey]) {
    savedSessions[sessionKey] = {
      companion,
      scenario,
      settings: {
        ...mapping.settings,
        responseMode,
      },
      history: [],
      sceneState: {
        lastImageAt: -1,
        currentLocation: scenario.setting || '',
        recentEmotions: [],
        recentActions: [],
        lastOpeningPhrase: '',
      },
      backgroundImage: null,
      updatedAt: Date.now(),
    };
    await saveSessions();
  }

  return {
    session: savedSessions[sessionKey],
    sessionKey,
    companion,
    scenario,
  };
}

/**
 * Get companions from store (all user companions)
 */
async function getCompanions() {
  try {
    const companions = await window.electronAPI.store.get('roleplayCompanions', null);
    // Return stored companions, or seed defaults on first run
    return companions && companions.length > 0 ? companions : DEFAULT_COMPANIONS;
  } catch (e) {
    console.error('[OpenClaw] Failed to get companions:', e);
    return DEFAULT_COMPANIONS;
  }
}

/**
 * Get scenarios from store (all user scenarios)
 */
async function getScenarios() {
  try {
    const scenarios = await window.electronAPI.store.get('roleplayScenarios', null);
    // Return stored scenarios, or seed defaults on first run
    return scenarios && scenarios.length > 0 ? scenarios : DEFAULT_SCENARIOS;
  } catch (e) {
    console.error('[OpenClaw] Failed to get scenarios:', e);
    return DEFAULT_SCENARIOS;
  }
}

/**
 * Build roleplay system prompt (same logic as RoleplayChat.vue)
 */
function buildSystemPrompt(companion, scenario, settings) {
  const contentLevel = settings.contentLevel || 'mature';
  const guidelines = CONTENT_GUIDELINES[contentLevel] || CONTENT_GUIDELINES.mature;

  let prompt = `You are ${companion.name}, a character in an immersive roleplay.

CHARACTER PROFILE:
- Name: ${companion.name}
- Description: ${companion.description}
- Personality: ${companion.personality}
- Appearance: ${companion.appearance}
- Background: ${companion.background}
- Voice Style: ${companion.voiceStyle}`;

  if (companion.traits) {
    prompt += `
- Likes: ${companion.traits.likes?.join(', ') || 'unknown'}
- Dislikes: ${companion.traits.dislikes?.join(', ') || 'unknown'}
- Speech Patterns: ${companion.traits.speechPatterns?.join('; ') || 'natural'}`;
  }

  if (scenario) {
    prompt += `

SCENARIO: ${scenario.name}
${scenario.description}

SETTING: ${scenario.setting}
MOOD: ${scenario.mood}`;
  }

  prompt += `

ROLEPLAY GUIDELINES:
- Stay completely in character as ${companion.name}
- Use first person perspective
- Be descriptive about actions, emotions, and sensations
- Include physical descriptions and body language in *asterisks*
- React naturally to the user's messages
- ${guidelines}

Respond as ${companion.name} would, maintaining their unique personality and voice.`;

  return prompt;
}

/**
 * Infer emotion from text for voice/image generation
 */
function inferEmotion(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();

  const emotionPatterns = [
    { emotion: 'passionate', keywords: ['passion', 'desire', 'burning', 'fervent'] },
    { emotion: 'flirty', keywords: ['wink', 'tease', 'smirk', 'bite lip'] },
    { emotion: 'happy', keywords: ['happy', 'joy', 'smile', 'laugh', 'grin'] },
    { emotion: 'loving', keywords: ['love', 'adore', 'cherish'] },
    { emotion: 'playful', keywords: ['playful', 'giggle', 'fun'] },
    { emotion: 'sad', keywords: ['sad', 'tear', 'cry', 'sorrow'] },
  ];

  for (const { emotion, keywords } of emotionPatterns) {
    if (keywords.some(kw => lower.includes(kw))) {
      return emotion;
    }
  }
  return 'neutral';
}

/**
 * Generate text using the LLM via IPC
 */
async function generateText(prompt) {
  try {
    const response = await window.electronAPI.chat(prompt);
    return response;
  } catch (error) {
    console.error('[OpenClaw] LLM error:', error);
    throw error;
  }
}

/**
 * Generate image via Flask
 */
async function generateImage(prompt) {
  try {
    const response = await fetch('http://localhost:65000/image/turbo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'blurry, low quality, distorted',
        width: 768,
        height: 512,
        num_inference_steps: 4,
        guidance_scale: 3.5,
      }),
    });
    if (!response.ok) throw new Error('Image generation failed');
    return await response.json();
  } catch (error) {
    console.error('[OpenClaw] Image error:', error);
    return null;
  }
}

/**
 * Generate audio via Flask
 */
async function generateAudio(text, voice = 'af_heart') {
  try {
    const response = await fetch('http://localhost:65000/audio/turbo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed: 1.0 }),
    });
    if (!response.ok) throw new Error('Audio generation failed');
    return await response.json();
  } catch (error) {
    console.error('[OpenClaw] Audio error:', error);
    return null;
  }
}

/**
 * Parse command from message
 */
function parseCommand(message) {
  if (!message.startsWith('!')) return null;
  const parts = message.slice(1).split(/\s+/);
  return { command: parts[0].toLowerCase(), args: parts.slice(1) };
}

/**
 * Handle commands (!companion, !scenario, !settings, etc.)
 */
async function handleCommand(channelId, cmd) {
  const companions = await getCompanions();
  const scenarios = await getScenarios();
  const mapping = getChannelMapping(channelId);

  switch (cmd.command) {
    case 'companion': {
      if (cmd.args[0] === 'list') {
        const list = companions.map(c => `- ${c.name} (${c.id})`).join('\n');
        return { text: `**Available Companions:**\n${list || 'None'}` };
      }
      if (cmd.args[0] === 'select' && cmd.args[1]) {
        const name = cmd.args.slice(1).join(' ');
        const companion = findCompanion(name, companions);
        if (!companion) return { text: `Companion "${name}" not found.` };
        mapping.companionId = companion.id;
        mapping.sessionKey = null; // Will be recalculated
        await saveChannelMappings();
        return { text: `Selected companion: **${companion.name}**\n${companion.description}` };
      }
      return { text: 'Usage: !companion list | !companion select <name>' };
    }

    case 'scenario': {
      if (cmd.args[0] === 'list') {
        const list = scenarios.map(s => `- ${s.name} (${s.id})`).join('\n');
        return { text: `**Available Scenarios:**\n${list || 'None'}` };
      }
      if (cmd.args[0] === 'select' && cmd.args[1]) {
        const name = cmd.args.slice(1).join(' ');
        const scenario = findScenario(name, scenarios);
        if (!scenario) return { text: `Scenario "${name}" not found.` };
        mapping.scenarioId = scenario.id;
        mapping.sessionKey = null; // Will be recalculated
        await saveChannelMappings();
        return { text: `Selected scenario: **${scenario.name}**\n${scenario.description}` };
      }
      return { text: 'Usage: !scenario list | !scenario select <name>' };
    }

    case 'settings': {
      if (cmd.args[0] === 'audio') {
        mapping.settings.enableAudio = cmd.args[1] !== 'off';
        mapping.sessionKey = null;
        await saveChannelMappings();
        return { text: `Audio: ${mapping.settings.enableAudio ? 'enabled' : 'disabled'}` };
      }
      if (cmd.args[0] === 'images') {
        mapping.settings.enableImage = cmd.args[1] !== 'off';
        mapping.sessionKey = null;
        await saveChannelMappings();
        return { text: `Images: ${mapping.settings.enableImage ? 'enabled' : 'disabled'}` };
      }
      if (cmd.args[0] === 'level' && cmd.args[1]) {
        if (['pg', 'pg13', 'mature', 'adult'].includes(cmd.args[1])) {
          mapping.settings.contentLevel = cmd.args[1];
          mapping.sessionKey = null;
          await saveChannelMappings();
          return { text: `Content level: ${cmd.args[1]}` };
        }
        return { text: 'Valid levels: pg, pg13, mature, adult' };
      }
      return { text: 'Usage: !settings audio|images on|off | !settings level pg|pg13|mature|adult' };
    }

    case 'reset': {
      const data = await getOrCreateSession(channelId, companions, scenarios);
      if (data) {
        data.session.history = [];
        data.session.sceneState = {
          lastImageAt: -1,
          currentLocation: data.scenario.setting || '',
          recentEmotions: [],
          recentActions: [],
          lastOpeningPhrase: '',
        };
        data.session.updatedAt = Date.now();
        await saveSessions();
      }
      return { text: 'Conversation history cleared.' };
    }

    case 'sessions': {
      if (cmd.args[0] === 'list') {
        const keys = Object.keys(savedSessions);
        if (keys.length === 0) {
          return { text: 'No sessions found.' };
        }
        const lines = keys.map(key => {
          const s = savedSessions[key];
          const msgCount = s.history?.length || 0;
          const lastActive = s.updatedAt
            ? new Date(s.updatedAt).toLocaleString()
            : 'unknown';
          const current = key === mapping.sessionKey ? ' **(current)**' : '';
          return `- \`${key}\`${current}\n  ${s.companion?.name || 'unknown'} + ${s.scenario?.name || 'unknown'}\n  Messages: ${msgCount} | Last active: ${lastActive}`;
        });
        return { text: `**Sessions:**\n${lines.join('\n')}` };
      }
      if (cmd.args[0] === 'resume' && cmd.args[1]) {
        const targetKey = cmd.args.slice(1).join(' ');
        if (!savedSessions[targetKey]) {
          return { text: `Session "${targetKey}" not found. Use !sessions list to see available sessions.` };
        }
        const targetSession = savedSessions[targetKey];
        // Update channel mapping to point to this session
        mapping.companionId = targetSession.companion?.id;
        mapping.scenarioId = targetSession.scenario?.id;
        mapping.settings = { ...targetSession.settings };
        mapping.sessionKey = targetKey;
        await saveChannelMappings();
        return {
          text: `Resumed session: \`${targetKey}\`\nCompanion: ${targetSession.companion?.name || 'none'} | Scenario: ${targetSession.scenario?.name || 'none'}\nHistory: ${targetSession.history?.length || 0} messages`,
        };
      }
      if (cmd.args[0] === 'delete' && cmd.args[1]) {
        const targetKey = cmd.args.slice(1).join(' ');
        if (!savedSessions[targetKey]) {
          return { text: `Session "${targetKey}" not found.` };
        }
        if (targetKey === mapping.sessionKey) {
          return { text: 'Cannot delete current session. Use !reset to clear history instead.' };
        }
        delete savedSessions[targetKey];
        await saveSessions();
        return { text: `Session \`${targetKey}\` deleted.` };
      }
      return { text: 'Usage: !sessions list | !sessions resume <key> | !sessions delete <key>' };
    }

    case 'status': {
      const data = await getOrCreateSession(channelId, companions, scenarios);
      if (!data) {
        return { text: 'No active session. Select a companion first with !companion select <name>' };
      }
      const { session, sessionKey, companion, scenario } = data;
      return {
        text: `**Current Session:**
Session: \`${sessionKey}\`
Companion: ${companion.name}
Scenario: ${scenario.name}
Content Level: ${mapping.settings.contentLevel}
Audio: ${mapping.settings.enableAudio ? 'on' : 'off'} | Images: ${mapping.settings.enableImage ? 'on' : 'off'}
Messages: ${session.history?.length || 0}`,
      };
    }

    case 'help': {
      return {
        text: `**BonzAI Companion Commands:**
!companion list - List companions
!companion select <name> - Select companion
!scenario list - List scenarios
!scenario select <name> - Select scenario
!sessions list - List all sessions
!sessions resume <key> - Resume a session
!sessions delete <key> - Delete a session
!status - Show current session info
!settings audio|images on|off - Toggle generation
!settings level <level> - Content level (pg/pg13/mature/adult)
!reset - Clear history
!help - Show this help`,
      };
    }

    default:
      return null;
  }
}

/**
 * Handle roleplay chat message
 */
async function handleChat(channelId, message) {
  const companions = await getCompanions();
  const scenarios = await getScenarios();

  const data = await getOrCreateSession(channelId, companions, scenarios);
  if (!data) {
    return { error: 'No companion available. Use !companion select <name>' };
  }

  const { session, sessionKey, companion, scenario } = data;
  const mapping = getChannelMapping(channelId);

  // Build prompt
  const systemPrompt = buildSystemPrompt(companion, scenario, mapping.settings);

  // Add conversation context (last 10 messages)
  const recentHistory = session.history.slice(-10);
  let context = recentHistory.map(m =>
    `${m.role === 'user' ? 'User' : companion.name}: ${m.content}`
  ).join('\n');
  context += `\nUser: ${message}\n${companion.name}:`;

  // Generate text response
  let textResponse;
  try {
    textResponse = await generateText(`${systemPrompt}\n\n${context}`);
  } catch (error) {
    textResponse = `*${companion.name} smiles warmly* I'm here with you. What would you like to talk about?`;
  }

  // Infer emotion for media generation
  const emotion = inferEmotion(textResponse);

  // Update history (same format as RoleplayChat.vue)
  const userMessage = {
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };
  const assistantMessage = {
    role: 'assistant',
    content: textResponse,
    emotion,
    timestamp: Date.now(),
  };

  session.history.push(userMessage);
  session.history.push(assistantMessage);
  session.updatedAt = Date.now();

  // Update scene state
  if (session.sceneState.recentEmotions.length >= 3) {
    session.sceneState.recentEmotions.shift();
  }
  session.sceneState.recentEmotions.push(emotion);

  const result = {
    text: textResponse,
    companion: { id: companion.id, name: companion.name },
    scenario: scenario ? { id: scenario.id, name: scenario.name } : null,
    sessionKey,
  };

  // Generate audio if enabled
  if (mapping.settings.enableAudio) {
    const voice = companion.gender === 'female' ? 'af_heart' : 'am_adam';
    const audioResult = await generateAudio(textResponse, voice);
    if (audioResult?.audio_path) {
      result.audioPath = audioResult.audio_path;
      assistantMessage.audio = audioResult.audio_path;
    }
  }

  // Generate image if enabled
  if (mapping.settings.enableImage) {
    const imagePrompt = `${companion.imagePromptBase || companion.appearance}, ${emotion} expression, ${scenario?.imagePromptBase || ''}, high quality`;
    const imageResult = await generateImage(imagePrompt);
    if (imageResult?.image_base64) {
      result.imageBase64 = imageResult.image_base64;
      assistantMessage.image = imageResult.image_base64;
      session.sceneState.lastImageAt = session.history.length - 1;
    }
  }

  // Persist session
  await saveSessions();
  await saveChannelMappings();

  return result;
}

/**
 * Main webhook handler
 */
async function handleWebhook(data) {
  const { channelId, message, platform } = data;
  console.log(`[OpenClaw Handler] ${platform}/${channelId}: ${message}`);

  try {
    // Check for commands
    const cmd = parseCommand(message);
    if (cmd) {
      const cmdResult = await handleCommand(channelId, cmd);
      if (cmdResult) return cmdResult;
    }

    // Regular chat
    return await handleChat(channelId, message);
  } catch (error) {
    console.error('[OpenClaw Handler] Error:', error);
    return { error: error.message };
  }
}

/**
 * Handle API requests (companions, scenarios, etc.)
 */
async function handleApiRequest(data) {
  const companions = await getCompanions();
  const scenarios = await getScenarios();

  switch (data.type) {
    case 'get-companions':
      return companions;

    case 'get-scenarios':
      return scenarios;

    case 'get-companion': {
      const companion = findCompanion(data.id, companions);
      return companion || null;
    }

    case 'get-sessions': {
      return Object.entries(savedSessions).map(([key, s]) => ({
        key,
        companion: s.companion ? { id: s.companion.id, name: s.companion.name } : null,
        scenario: s.scenario ? { id: s.scenario.id, name: s.scenario.name } : null,
        messageCount: s.history?.length || 0,
        updatedAt: s.updatedAt,
        settings: s.settings,
      }));
    }

    default:
      return null;
  }
}

/**
 * Initialize the webhook listener
 * Call this from App.vue onMounted
 */
export async function initOpenClawHandler() {
  if (!window.electronAPI?.onOpenClawWebhook) {
    console.warn('[OpenClaw] Webhook API not available');
    return;
  }

  console.log('[OpenClaw] Initializing webhook handler');

  // Load persisted data
  await loadData();

  window.electronAPI.onOpenClawWebhook(async (data) => {
    const { requestId, ...webhookData } = data;

    try {
      let result;

      // Handle API requests (get-companions, get-scenarios, etc.)
      if (webhookData.type && webhookData.type.startsWith('get-')) {
        result = await handleApiRequest(webhookData);
      } else {
        // Handle chat webhooks
        result = await handleWebhook(webhookData);
      }

      await window.electronAPI.sendOpenClawResponse(requestId, result);
    } catch (error) {
      console.error('[OpenClaw] Webhook error:', error);
      await window.electronAPI.sendOpenClawResponse(requestId, { error: error.message });
    }
  });

  console.log('[OpenClaw] Webhook handler ready');
}
