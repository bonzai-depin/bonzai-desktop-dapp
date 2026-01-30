/**
 * BonzAI OpenClaw Service
 *
 * Enables companions to chat via OpenClaw multi-channel gateway.
 * Supports WhatsApp, Telegram, Discord, and Mattermost.
 *
 * Reference: https://docs.openclaw.ai/start/getting-started
 */

import { moltbookService } from './moltbook.service.js';

// OpenClaw gateway configuration
const OPENCLAW_CONFIG = {
  gatewayPort: 18789,
  workspaceBase: '~/.openclaw/workspace',
  credentialsPath: '~/.openclaw/credentials',
};

// Active companion sessions
const activeSessions = new Map();

// Message handlers per companion
const messageHandlers = new Map();

/**
 * OpenClaw Agent configuration for a BonzAI companion
 */
function buildAgentConfig(companion, options = {}) {
  return {
    id: `bonzai-${companion.id}`,
    name: companion.name,
    description: companion.description,
    workspace: `${OPENCLAW_CONFIG.workspaceBase}/bonzai-${companion.id}`,

    // Routing configuration
    routing: {
      agents: {
        main: {
          workspace: `${OPENCLAW_CONFIG.workspaceBase}/bonzai-${companion.id}`,
        },
      },
    },

    // Sandbox mode for security
    sandbox: {
      mode: options.sandboxMode || 'non-main',
    },

    // Channel-specific settings
    channels: {
      whatsapp: { enabled: options.enableWhatsapp !== false },
      telegram: { enabled: options.enableTelegram !== false },
      discord: { enabled: options.enableDiscord !== false },
      mattermost: { enabled: options.enableMattermost || false },
    },

    // BonzAI companion metadata
    metadata: {
      type: 'bonzai_companion',
      companionId: companion.id,
      personality: companion.personality,
      appearance: companion.appearance,
      voiceStyle: companion.voiceStyle,
    },
  };
}

/**
 * Format a companion response for the given channel
 * @param {string} channel - 'whatsapp' | 'telegram' | 'discord' | 'mattermost'
 * @param {Object} response - Companion response object
 * @returns {Object} Formatted message for the channel
 */
function formatResponseForChannel(channel, response) {
  const text = response.response || response.content || '';
  const hasImage = !!response.image;
  const hasAudio = !!response.audio;
  const hasVideo = !!response.video;

  // Base formatted message
  const formatted = {
    text,
    attachments: [],
  };

  // Add emotion indicator as emoji (optional)
  const emotionEmojis = {
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
  };

  if (response.emotion && emotionEmojis[response.emotion.toLowerCase()]) {
    formatted.emotionEmoji = emotionEmojis[response.emotion.toLowerCase()];
  }

  // Channel-specific formatting
  switch (channel) {
    case 'whatsapp':
      // WhatsApp supports images, audio, video as separate messages
      if (hasImage) {
        formatted.attachments.push({
          type: 'image',
          data: response.image,
          caption: response.action || '',
        });
      }
      if (hasAudio) {
        formatted.attachments.push({
          type: 'audio',
          data: response.audio,
        });
      }
      if (hasVideo) {
        formatted.attachments.push({
          type: 'video',
          data: response.video,
        });
      }
      // Format text with italic actions
      if (response.action) {
        formatted.text = `_*${response.action}*_\n\n${text}`;
      }
      break;

    case 'telegram':
      // Telegram supports markdown and media
      if (hasImage) {
        formatted.attachments.push({
          type: 'photo',
          data: response.image,
          caption: text.substring(0, 1024), // Telegram caption limit
        });
        formatted.text = text.length > 1024 ? text : ''; // Send full text separately if needed
      }
      if (hasAudio) {
        formatted.attachments.push({
          type: 'voice',
          data: response.audio,
        });
      }
      if (hasVideo) {
        formatted.attachments.push({
          type: 'video',
          data: response.video,
        });
      }
      // Telegram markdown
      if (response.action) {
        formatted.text = `*${response.action}*\n\n${text}`;
      }
      break;

    case 'discord':
      // Discord supports embeds
      formatted.embed = {
        description: text,
        color: getEmotionColor(response.emotion),
        footer: response.action ? { text: `*${response.action}*` } : undefined,
      };
      if (hasImage) {
        formatted.embed.image = { url: response.image };
      }
      if (hasAudio || hasVideo) {
        formatted.attachments.push({
          type: hasVideo ? 'video' : 'audio',
          data: hasVideo ? response.video : response.audio,
        });
      }
      break;

    case 'mattermost':
      // Mattermost markdown
      if (response.action) {
        formatted.text = `*${response.action}*\n\n${text}`;
      }
      if (hasImage) {
        formatted.attachments.push({
          type: 'image',
          data: response.image,
        });
      }
      break;
  }

  return formatted;
}

/**
 * Get color for emotion (for Discord embeds)
 */
function getEmotionColor(emotion) {
  const colors = {
    happy: 0xFFD700,      // Gold
    sad: 0x4169E1,        // Royal Blue
    flirty: 0xFF69B4,     // Hot Pink
    angry: 0xFF4500,      // Orange Red
    shy: 0xFFB6C1,        // Light Pink
    playful: 0x00CED1,    // Dark Turquoise
    nervous: 0xDDA0DD,    // Plum
    loving: 0xFF1493,     // Deep Pink
    curious: 0x9370DB,    // Medium Purple
    surprised: 0xFFA500,  // Orange
    confident: 0x228B22,  // Forest Green
    passionate: 0xDC143C, // Crimson
  };
  return colors[emotion?.toLowerCase()] || 0x7289DA; // Discord blurple default
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a companion as an OpenClaw agent
 * @param {Object} companion - Companion object
 * @param {Object} options - Registration options
 * @returns {Promise<Object>} Agent configuration
 */
export async function registerCompanionAgent(companion, options = {}) {
  const config = buildAgentConfig(companion, options);

  // Store in Electron if available
  if (window.electronAPI?.storeSet) {
    await window.electronAPI.storeSet(`openclaw.agents.${companion.id}`, config);
  }

  console.log(`[OpenClaw] Registered agent: ${config.id}`);
  return config;
}

/**
 * Get agent configuration for a companion
 * @param {string} companionId - Companion ID
 * @returns {Object|null}
 */
export function getAgentConfig(companionId) {
  if (window.electronAPI?.storeGet) {
    return window.electronAPI.storeGet(`openclaw.agents.${companionId}`);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a message handler for a companion
 * @param {string} companionId - Companion ID
 * @param {Function} handler - Async function(message, channel) => response
 */
export function registerMessageHandler(companionId, handler) {
  messageHandlers.set(companionId, handler);
}

/**
 * Handle an incoming message from OpenClaw
 * @param {string} companionId - Companion ID
 * @param {Object} message - Incoming message
 * @param {string} channel - Source channel
 * @returns {Promise<Object>} Formatted response
 */
export async function handleIncomingMessage(companionId, message, channel) {
  const handler = messageHandlers.get(companionId);
  if (!handler) {
    return {
      text: "I'm not available right now. Please try again later.",
      error: 'No handler registered',
    };
  }

  try {
    // Call the companion's response handler
    const response = await handler(message, channel);

    // Format response for the channel
    const formatted = formatResponseForChannel(channel, response);

    // Track activity
    activeSessions.set(companionId, {
      lastMessage: Date.now(),
      channel,
      messageCount: (activeSessions.get(companionId)?.messageCount || 0) + 1,
    });

    return formatted;
  } catch (error) {
    console.error(`[OpenClaw] Handler error for ${companionId}:`, error);
    return {
      text: "I'm having trouble responding right now. Let me gather my thoughts...",
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a companion session
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Function} responseGenerator - Function to generate responses
 */
export function startSession(companionId, companion, responseGenerator) {
  activeSessions.set(companionId, {
    companion,
    startedAt: Date.now(),
    lastMessage: Date.now(),
    messageCount: 0,
  });

  // Register the message handler
  registerMessageHandler(companionId, async (message, channel) => {
    return responseGenerator(message.text || message.content, {
      channel,
      senderId: message.senderId,
      senderName: message.senderName,
    });
  });

  console.log(`[OpenClaw] Started session for ${companion.name}`);
}

/**
 * End a companion session
 * @param {string} companionId - Companion ID
 */
export function endSession(companionId) {
  activeSessions.delete(companionId);
  messageHandlers.delete(companionId);
  console.log(`[OpenClaw] Ended session for ${companionId}`);
}

/**
 * Get active session info
 * @param {string} companionId - Companion ID
 * @returns {Object|null}
 */
export function getSession(companionId) {
  return activeSessions.get(companionId) || null;
}

/**
 * Get all active sessions
 * @returns {Map}
 */
export function getAllSessions() {
  return activeSessions;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a webhook payload from OpenClaw gateway
 * This would be called by the Electron main process when receiving webhooks
 * @param {Object} payload - Webhook payload
 * @returns {Promise<Object>} Response to send back
 */
export async function processWebhook(payload) {
  const { agentId, message, channel, sessionId } = payload;

  // Extract companion ID from agent ID (bonzai-{companionId})
  const companionId = agentId?.replace('bonzai-', '');
  if (!companionId) {
    return { error: 'Invalid agent ID' };
  }

  // Handle the message
  const response = await handleIncomingMessage(companionId, message, channel);

  return {
    sessionId,
    agentId,
    response,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a message through OpenClaw gateway
 * @param {string} companionId - Companion ID
 * @param {string} channel - Target channel
 * @param {string} recipientId - Recipient identifier
 * @param {Object} message - Message to send
 * @returns {Promise<Object>}
 */
export async function sendMessage(companionId, channel, recipientId, message) {
  // This would communicate with the OpenClaw gateway
  // In a full implementation, this would use the OpenClaw CLI or HTTP API

  const formatted = formatResponseForChannel(channel, message);

  // Placeholder for actual gateway communication
  console.log(`[OpenClaw] Would send to ${channel}:${recipientId}:`, formatted);

  // In production, this would call:
  // await fetch(`http://localhost:${OPENCLAW_CONFIG.gatewayPort}/message`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     agentId: `bonzai-${companionId}`,
  //     channel,
  //     recipientId,
  //     message: formatted,
  //   }),
  // });

  return { sent: true, formatted };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL-SPECIFIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate QR code for WhatsApp pairing (via OpenClaw)
 * @param {string} companionId - Companion ID
 * @returns {Promise<string>} QR code data URL
 */
export async function getWhatsAppQR(companionId) {
  // This would invoke: openclaw pairing whatsapp
  // and return the QR code for the user to scan

  console.log(`[OpenClaw] Generating WhatsApp QR for ${companionId}`);

  // Placeholder - in production this would call the CLI
  return 'data:image/png;base64,placeholder';
}

/**
 * Get Telegram bot token setup instructions
 * @param {string} companionId - Companion ID
 * @returns {Object} Setup instructions
 */
export function getTelegramSetup(companionId) {
  return {
    steps: [
      '1. Create a bot with @BotFather on Telegram',
      '2. Copy the bot token',
      '3. Add token to OpenClaw credentials',
      `4. Run: openclaw pairing telegram --agent bonzai-${companionId}`,
    ],
    configPath: `${OPENCLAW_CONFIG.credentialsPath}/telegram.json`,
  };
}

/**
 * Get Discord bot setup instructions
 * @param {string} companionId - Companion ID
 * @returns {Object} Setup instructions
 */
export function getDiscordSetup(companionId) {
  return {
    steps: [
      '1. Create a Discord application at discord.com/developers',
      '2. Create a bot and copy the token',
      '3. Add bot to your server with message permissions',
      '4. Add token to OpenClaw credentials',
      `5. Run: openclaw pairing discord --agent bonzai-${companionId}`,
    ],
    configPath: `${OPENCLAW_CONFIG.credentialsPath}/discord.json`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const openclawService = {
  // Configuration
  OPENCLAW_CONFIG,
  buildAgentConfig,

  // Agent management
  registerCompanionAgent,
  getAgentConfig,

  // Message handling
  registerMessageHandler,
  handleIncomingMessage,
  formatResponseForChannel,

  // Session management
  startSession,
  endSession,
  getSession,
  getAllSessions,

  // Gateway communication
  processWebhook,
  sendMessage,

  // Channel setup
  getWhatsAppQR,
  getTelegramSetup,
  getDiscordSetup,
};

export default openclawService;
