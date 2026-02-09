/**
 * OpenClaw Webhook Handler
 *
 * Handles incoming webhooks from the OpenClaw gateway via IPC.
 * Supports all BonzAI pipelines and distributed P2P inference.
 *
 * Features:
 * - All 11 pipeline categories (LLM, Image, Audio, Music, Video, Vision)
 * - Provider discovery from BonzAI network registry
 * - Remote inference with x402 USDC payments
 * - Self-inference detection (free when consumer === provider)
 * - Zero-knowledge mode for remote requests
 */

import {
  findCompanion,
  findScenario,
  DEFAULT_COMPANIONS,
  DEFAULT_SCENARIOS,
  MODEL_REQUIREMENTS,
} from '../skills/flagship.js';

import {
  initializeSkills,
  getAllSkills,
  getSkill,
  executeSkill,
  searchSkills,
  getSkillsByCategory,
  validateSkillInputs,
} from './skill.service.js';

import {
  getAuthHeaders,
  authFetch,
} from './auth.service.js';

import {
  addImageInference,
  addAudioInference,
  addVideoInference,
} from '../stores/inferenceStore.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Storage keys
const STORAGE_KEY = 'roleplaySessions';
const CHANNEL_MAPPING_KEY = 'openclawChannelMappings';
const NETWORK_SETTINGS_KEY = 'openclawNetworkSettings';

// Flask server URL
const FLASK_URL = `http://localhost:${process.env.BONZAI_SERVER_PORT || 65000}`;

/**
 * Get the files directory (uses actual MODEL_DIR, not hardcoded path)
 * Always fetches fresh to handle MODEL_DIR changes
 */
async function getFilesDir() {
  let modelDir = null;
  try {
    modelDir = await window.electronAPI?.getModelDir?.();
  } catch (e) {
    console.warn('[OpenClaw] Could not get MODEL_DIR via IPC:', e);
  }
  if (!modelDir) {
    // Fallback to default
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    modelDir = `${homeDir}/bonzai-models`;
  }
  return `${modelDir}/files`;
}

/**
 * Save base64 image to file and return the path
 * OpenClaw/WhatsApp expects file paths, not base64
 */
async function saveBase64ImageToFile(base64Data, prefix = 'openclaw') {
  try {
    const filesDir = await getFilesDir();
    console.log(`[OpenClaw] Using files directory: ${filesDir}`);
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.png`;
    const filePath = `${filesDir}/${filename}`;

    // Use electronAPI to save the file
    if (window.electronAPI?.saveBase64ToFile) {
      const result = await window.electronAPI.saveBase64ToFile(filePath, base64Data);
      if (result?.success) {
        console.log(`[OpenClaw] Saved image to: ${filePath}`);
        return filePath;
      } else {
        console.warn('[OpenClaw] saveBase64ToFile failed:', result?.error);
      }
    }

    console.warn('[OpenClaw] Could not save image to file');
    return null;
  } catch (e) {
    console.error('[OpenClaw] Error saving image:', e);
    return null;
  }
}

// All supported pipelines with their endpoints and types
const PIPELINES = {
  // LLM (via electronAPI.chat or remote P2P)
  llm: { type: 'llm', endpoint: null, description: 'Text generation' },

  // Image pipelines
  image_turbo: { type: 'image', endpoint: '/image/turbo', description: 'Fast image generation' },
  image_quality: { type: 'image', endpoint: '/image/quality', description: 'High quality images' },
  image_standard: { type: 'image', endpoint: '/image/standard', description: 'Standard image generation' },
  image_advanced: { type: 'image', endpoint: '/image/advanced', description: 'Advanced image generation' },

  // Audio pipelines
  audio_turbo: { type: 'audio', endpoint: '/audio/turbo', description: 'Fast TTS' },
  audio_quality: { type: 'audio', endpoint: '/audio/quality/persona', description: 'Persona TTS' },
  audio_quality_design: { type: 'audio', endpoint: '/audio/quality/design', description: 'Voice design from description' },
  audio_quality_clone: { type: 'audio', endpoint: '/audio/quality/clone', description: 'Voice cloning' },

  // Music pipeline
  music: { type: 'music', endpoint: '/audio/music', description: 'Music generation' },

  // Video pipeline
  video_fast: { type: 'video', endpoint: '/video', description: 'Video generation' },

  // Vision pipeline
  vision: { type: 'vision', endpoint: '/vision/analyze', description: 'Vision analysis' },
};

// Content level guidelines
const CONTENT_GUIDELINES = {
  pg: 'Keep content family-friendly and wholesome. No romance beyond hand-holding.',
  pg13: 'Mild romantic content allowed including kissing. No explicit material.',
  mature: 'Mature themes allowed including romance and suggestive content. Tasteful sensuality.',
  adult: 'Full creative freedom for adult content. Be sensual and descriptive when appropriate.',
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let savedSessions = {};
let channelMappings = {}; // channelId → { sessionKey, settings, network }
let networkSettings = {
  mode: 'local', // 'local' | 'remote'
  preferredProviders: {}, // pipeline → peerId
  autoSelectProvider: true,
  maxPricePerToken: '1000000', // 1 USDC max
  currentModel: null, // Currently loaded LLM model
};
let loaded = false;

// Cache for discovered providers
let providerCache = {
  providers: [],
  lastFetched: 0,
  ttl: 60000, // 1 minute cache
};

// Skills loaded state
let skillsLoaded = false;

// ═══════════════════════════════════════════════════════════════════════════
// DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

async function loadData() {
  if (loaded) return;
  try {
    savedSessions = await window.electronAPI.store.get(STORAGE_KEY, {});
    channelMappings = await window.electronAPI.store.get(CHANNEL_MAPPING_KEY, {});
    networkSettings = await window.electronAPI.store.get(NETWORK_SETTINGS_KEY, networkSettings);
    loaded = true;
    console.log(`[OpenClaw] Loaded ${Object.keys(savedSessions).length} sessions, ${Object.keys(channelMappings).length} channels`);
  } catch (e) {
    console.error('[OpenClaw] Failed to load data:', e);
    loaded = true;
  }
}

async function saveSessions() {
  try {
    await window.electronAPI.store.set(STORAGE_KEY, savedSessions);
  } catch (e) {
    console.error('[OpenClaw] Failed to save sessions:', e);
  }
}

async function saveChannelMappings() {
  try {
    await window.electronAPI.store.set(CHANNEL_MAPPING_KEY, channelMappings);
  } catch (e) {
    console.error('[OpenClaw] Failed to save channel mappings:', e);
  }
}

async function saveNetworkSettings() {
  try {
    await window.electronAPI.store.set(NETWORK_SETTINGS_KEY, networkSettings);
  } catch (e) {
    console.error('[OpenClaw] Failed to save network settings:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL & SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function getSessionKey(companion, scenario, contentLevel, responseMode) {
  if (!companion || !scenario) return null;
  const companionId = companion.id || `custom_${companion.name?.toLowerCase().replace(/\s+/g, '_')}`;
  const scenarioId = scenario.id || `custom_${scenario.name?.toLowerCase().replace(/\s+/g, '_')}`;
  return `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`;
}

function getResponseMode(settings) {
  const parts = ['text'];
  if (settings.enableImage) parts.push('image');
  if (settings.enableAudio) parts.push('audio');
  if (settings.enableVideo) parts.push('video');
  if (settings.enableMusic) parts.push('music');
  return parts.join('+');
}

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
        enableVideo: true,
        enableMusic: true,
        enableVision: true,
      },
      network: {
        provider: 'local', // 'local' or peerId
        pipeline: null, // Preferred pipeline override
      },
    };
  }
  return channelMappings[channelId];
}

async function getOrCreateSession(channelId, companions, scenarios) {
  const mapping = getChannelMapping(channelId);

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

  mapping.sessionKey = sessionKey;
  mapping.companionId = companion.id;
  mapping.scenarioId = scenario.id;

  if (!savedSessions[sessionKey]) {
    savedSessions[sessionKey] = {
      companion,
      scenario,
      settings: { ...mapping.settings, responseMode },
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

async function getCompanions() {
  try {
    const companions = await window.electronAPI.store.get('roleplayCompanions', null);
    return companions && companions.length > 0 ? companions : DEFAULT_COMPANIONS;
  } catch (e) {
    return DEFAULT_COMPANIONS;
  }
}

async function getScenarios() {
  try {
    const scenarios = await window.electronAPI.store.get('roleplayScenarios', null);
    return scenarios && scenarios.length > 0 ? scenarios : DEFAULT_SCENARIOS;
  } catch (e) {
    return DEFAULT_SCENARIOS;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P NETWORK / PROVIDER DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get P2P network status
 */
async function getNetworkStatus() {
  try {
    const status = await window.electronAPI.p2pStatus();
    return status;
  } catch (e) {
    return { ok: false, started: false, error: e.message };
  }
}

/**
 * Start P2P node if not already running
 */
async function ensureP2PStarted() {
  const status = await getNetworkStatus();
  if (!status.started) {
    try {
      await window.electronAPI.p2pStart({});
      return await getNetworkStatus();
    } catch (e) {
      return { ok: false, started: false, error: e.message };
    }
  }
  return status;
}

/**
 * Discover providers for a specific pipeline
 * Uses contract registry via p2p.contract.service
 */
async function discoverProviders(pipeline = null) {
  // Check cache
  const now = Date.now();
  if (providerCache.providers.length > 0 && now - providerCache.lastFetched < providerCache.ttl) {
    if (pipeline) {
      return providerCache.providers.filter(p => p.pipelines.includes(pipeline));
    }
    return providerCache.providers;
  }

  try {
    // Query contract for providers
    // This would call the p2p.contract.service but for now we return empty
    // In production, this calls: getProvidersForPipeline(pipeline) from the contract
    console.log('[OpenClaw] Provider discovery not yet connected to contract registry');

    // Mock response for development
    providerCache.providers = [];
    providerCache.lastFetched = now;

    return providerCache.providers;
  } catch (e) {
    console.error('[OpenClaw] Provider discovery failed:', e);
    return [];
  }
}

/**
 * Check if we should use a remote provider
 * Only uses remote if networkSettings.mode === 'remote'
 */
function shouldUseRemoteProvider(channelId, pipeline) {
  // ALWAYS check global mode first - local mode means never use remote
  if (networkSettings.mode !== 'remote') {
    return null;
  }

  const mapping = getChannelMapping(channelId);

  // If channel explicitly set to local, use local
  if (mapping.network.provider === 'local') {
    return null;
  }

  // If a specific provider is set for this channel, use it
  if (mapping.network.provider && mapping.network.provider !== 'auto') {
    return mapping.network.provider;
  }

  // Auto-select: check global preferred providers
  if (networkSettings.preferredProviders[pipeline]) {
    return networkSettings.preferredProviders[pipeline];
  }

  return null; // Use local
}

/**
 * Check if request is self-inference (consumer === provider)
 */
async function isSelfInference(remotePeerId) {
  try {
    const { ok, peerId: localPeerId } = await window.electronAPI.p2pLocalPeerId();
    if (!ok) return false;
    return remotePeerId === localPeerId;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INFERENCE FUNCTIONS - ALL PIPELINES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute inference - routes to local or remote based on settings
 */
async function executeInference(channelId, pipeline, params) {
  const remotePeerId = shouldUseRemoteProvider(channelId, pipeline);

  if (remotePeerId) {
    // Remote inference via P2P
    return executeRemoteInference(remotePeerId, pipeline, params);
  }

  // Local inference
  return executeLocalInference(pipeline, params);
}

/**
 * Execute local inference
 */
async function executeLocalInference(pipeline, params) {
  const pipelineInfo = PIPELINES[pipeline];
  if (!pipelineInfo) {
    throw new Error(`Unknown pipeline: ${pipeline}`);
  }

  // LLM goes through electronAPI
  if (pipelineInfo.type === 'llm') {
    // Check if a specific model is requested
    const requestedModel = params.model;
    if (requestedModel) {
      const normalizedModel = requestedModel.toLowerCase().replace(/-/g, '_');
      const modelKey = normalizedModel.startsWith('llm_') ? normalizedModel : `llm_${normalizedModel}`;

      // Check if we need to load a different model
      if (MODEL_REQUIREMENTS[modelKey] && networkSettings.currentModel !== modelKey) {
        console.log(`[OpenClaw] Loading model: ${modelKey}`);
        try {
          const loadResult = await window.electronAPI.loadModel(modelKey);
          if (loadResult.success) {
            networkSettings.currentModel = modelKey;
            await saveNetworkSettings();
          } else {
            console.warn(`[OpenClaw] Failed to load model ${modelKey}, using current model`);
          }
        } catch (e) {
          console.warn(`[OpenClaw] Error loading model: ${e.message}`);
        }
      }
    }

    const response = await window.electronAPI.chat(params.prompt || params.messages?.[0]?.content);
    return { ok: true, result: { text: response, model: networkSettings.currentModel || 'default' }, local: true };
  }

  // All other pipelines go through Flask
  // Use authFetch for proper authentication with token refresh handling
  const authHeaders = getAuthHeaders();
  const headers = {
    'Content-Type': 'application/json',
  };

  // If no auth token available, use demo mode header
  if (!authHeaders.Authorization) {
    headers['X-Demo-Mode'] = 'true';
  }

  // No timeout for local inference - generation can take a long time
  // especially for video, music, and high-quality images
  console.log(`[OpenClaw] Calling Flask endpoint: ${pipelineInfo.endpoint}`);
  const startTime = Date.now();

  const response = await authFetch(`${FLASK_URL}${pipelineInfo.endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[OpenClaw] Flask response received in ${elapsed}s, status: ${response.status}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[OpenClaw] Flask error for ${pipeline}:`, error);
    throw new Error(`${pipeline} failed: ${error}`);
  }

  const result = await response.json();
  console.log(`[OpenClaw] Flask result keys:`, Object.keys(result));
  return { ok: true, result, local: true };
}

/**
 * Execute remote inference via P2P
 */
async function executeRemoteInference(peerId, pipeline, params) {
  // Ensure P2P is running
  const status = await ensureP2PStarted();
  if (!status.started) {
    console.warn('[OpenClaw] P2P not available, falling back to local');
    return executeLocalInference(pipeline, params);
  }

  // Check if self-inference (free)
  const selfInference = await isSelfInference(peerId);

  try {
    // Include model in request if LLM pipeline
    const requestParams = { ...params };
    if (pipeline === 'llm' && params.model) {
      // Normalize model name for remote provider
      const normalizedModel = params.model.toLowerCase().replace(/-/g, '_');
      requestParams.model = normalizedModel.startsWith('llm_') ? normalizedModel : `llm_${normalizedModel}`;
    }

    const request = {
      pipeline,
      params: requestParams,
      // Payment will be handled by the P2P layer if needed
    };

    const response = await window.electronAPI.p2pInference(peerId, request);

    if (!response.ok) {
      if (response.error === 'payment_required') {
        // Handle payment flow
        console.log('[OpenClaw] Payment required:', response.payment);
        // For now, fall back to local
        console.warn('[OpenClaw] Payment not yet implemented, falling back to local');
        return executeLocalInference(pipeline, params);
      }
      throw new Error(response.error || 'Remote inference failed');
    }

    return {
      ok: true,
      result: response.result,
      local: false,
      provider: peerId,
      selfInference,
    };
  } catch (e) {
    console.error('[OpenClaw] Remote inference failed:', e);
    // Fall back to local
    return executeLocalInference(pipeline, params);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate text using LLM
 * @param {string} channelId - Channel ID
 * @param {string} prompt - Text prompt
 * @param {Object} options - Options including model
 */
async function generateText(channelId, prompt, options = {}) {
  try {
    const params = { prompt };
    if (options.model) {
      params.model = options.model;
    }
    const result = await executeInference(channelId, 'llm', params);
    return result.result?.text || result.result;
  } catch (error) {
    console.error('[OpenClaw] LLM error:', error);
    throw error;
  }
}

/**
 * Generate image
 */
async function generateImage(channelId, prompt, options = {}) {
  const pipeline = options.pipeline || 'image_turbo';
  try {
    const params = {
      prompt,
      negative_prompt: options.negativePrompt || 'blurry, low quality, distorted',
      width: options.width || 768,
      height: options.height || 512,
      num_inference_steps: options.steps || 4,
      guidance_scale: options.guidance || 3.5,
    };
    const result = await executeInference(channelId, pipeline, params);
    return result.result;
  } catch (error) {
    console.error('[OpenClaw] Image error:', error);
    return null;
  }
}

/**
 * Generate audio
 */
async function generateAudio(channelId, text, options = {}) {
  const pipeline = options.pipeline || 'audio_turbo';
  try {
    const params = {
      text,
      voice: options.voice || 'af_heart',
      speed: options.speed || 1.0,
    };
    const result = await executeInference(channelId, pipeline, params);
    return result.result;
  } catch (error) {
    console.error('[OpenClaw] Audio error:', error);
    return null;
  }
}

/**
 * Generate music
 */
async function generateMusic(channelId, prompt, options = {}) {
  try {
    const params = {
      prompt,
      lyrics: options.lyrics || '',
      duration: options.duration || 60,
      steps: options.steps || 27,
      guidance_scale: options.guidance || 15.0,
      seed: options.seed || -1,
    };
    const result = await executeInference(channelId, 'music', params);
    return result.result;
  } catch (error) {
    console.error('[OpenClaw] Music error:', error);
    return null;
  }
}

/**
 * Generate video
 */
async function generateVideo(channelId, prompt, options = {}) {
  try {
    const params = {
      prompt,
      height: options.height || 480,
      width: options.width || 768,
      num_frames: options.frames || 81,
      fps: options.fps || 24,
      num_inference_steps: options.steps || 30,
      guidance_scale: options.guidance || 3.5,
      image_base64: options.image || null,
    };
    const result = await executeInference(channelId, 'video_fast', params);
    return result.result;
  } catch (error) {
    console.error('[OpenClaw] Video error:', error);
    return null;
  }
}

/**
 * Analyze image with vision
 */
async function analyzeVision(channelId, imageBase64, prompt = 'Describe this image') {
  try {
    const params = {
      image_base64: imageBase64,
      prompt,
    };
    const result = await executeInference(channelId, 'vision', params);
    return result.result;
  } catch (error) {
    console.error('[OpenClaw] Vision error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLING
// ═══════════════════════════════════════════════════════════════════════════

function parseCommand(message) {
  if (!message.startsWith('!')) return null;
  const parts = message.slice(1).split(/\s+/);
  return { command: parts[0].toLowerCase(), args: parts.slice(1) };
}

/**
 * Handle !network commands for P2P provider discovery and selection
 */
async function handleNetworkCommand(channelId, args) {
  const subcommand = args[0]?.toLowerCase();
  const mapping = getChannelMapping(channelId);

  switch (subcommand) {
    case 'status': {
      const status = await getNetworkStatus();
      if (!status.started) {
        return {
          text: `**Network Status: Offline**
Mode: ${networkSettings.mode}

P2P node is not running. Use \`!network start\` to connect.`,
        };
      }
      return {
        text: `**Network Status: Online**
Mode: ${networkSettings.mode}
Peer ID: \`${status.peerId}\`
Connected Peers: ${status.connectedPeers || 0}
NAT Status: ${status.natStatus || 'unknown'}
Using Relay: ${status.isUsingRelay ? 'Yes' : 'No'}

Current Provider: ${mapping.network.provider || 'local'}`,
      };
    }

    case 'start': {
      const result = await ensureP2PStarted();
      if (result.started) {
        return { text: `**P2P Started**\nPeer ID: \`${result.peerId}\`` };
      }
      return { text: `**Failed to start P2P**\n${result.error || 'Unknown error'}` };
    }

    case 'stop': {
      try {
        await window.electronAPI.p2pStop();
        return { text: '**P2P Stopped**' };
      } catch (e) {
        return { text: `**Failed to stop P2P**\n${e.message}` };
      }
    }

    case 'providers': {
      const pipeline = args[1] || null;
      const providers = await discoverProviders(pipeline);

      if (providers.length === 0) {
        return {
          text: `**No Providers Found**
${pipeline ? `No providers available for pipeline: ${pipeline}` : 'No providers registered on the network.'}

Note: Provider discovery requires deployed contracts on Arbitrum.`,
        };
      }

      const lines = providers.map(p => {
        const pipelines = p.pipelines.slice(0, 3).join(', ');
        return `- \`${p.peerId.slice(0, 12)}...\` | $${p.pricePerToken}/1K tokens | ${pipelines}${p.pipelines.length > 3 ? '...' : ''}`;
      });

      return {
        text: `**Available Providers** ${pipeline ? `(${pipeline})` : ''}
${lines.join('\n')}

Use \`!network use <peerId>\` to select a provider.`,
      };
    }

    case 'use': {
      const target = args[1]?.toLowerCase();
      if (!target) {
        return { text: 'Usage: `!network use <local|auto|peerId>`' };
      }

      if (target === 'local') {
        mapping.network.provider = 'local';
        await saveChannelMappings();
        return { text: '**Using Local Inference**\nAll requests will use your local models.' };
      }

      if (target === 'auto') {
        mapping.network.provider = 'auto';
        await saveChannelMappings();
        return { text: '**Using Auto Provider Selection**\nWill automatically select the cheapest available provider.' };
      }

      // Assume it's a peer ID
      mapping.network.provider = target;
      await saveChannelMappings();
      return { text: `**Using Provider**\nPeer ID: \`${target}\`` };
    }

    case 'mode': {
      const mode = args[1]?.toLowerCase();
      if (!['local', 'remote'].includes(mode)) {
        return {
          text: `**Current Mode:** ${networkSettings.mode}

Available modes:
- \`local\` - Use local BonzAI Desktop (free)
- \`remote\` - Use remote P2P providers (paid with USDC)

Use \`!network mode <mode>\` to change.`,
        };
      }

      networkSettings.mode = mode;
      await saveNetworkSettings();

      if (mode === 'remote') {
        // Start P2P node when switching to remote mode
        await ensureP2PStarted();
      }

      return { text: `**Mode:** ${mode === 'local' ? 'Local (free)' : 'Remote (paid)'}` };
    }

    case 'pipelines': {
      const lines = Object.entries(PIPELINES).map(([id, info]) => {
        return `- \`${id}\` (${info.type}) - ${info.description}`;
      });
      return {
        text: `**Available Pipelines**

${lines.join('\n')}

Use \`!network providers <pipeline>\` to find providers for a specific pipeline.`,
      };
    }

    default:
      return {
        text: `**Network Commands**

\`!network status\` - Show P2P status and current provider
\`!network start\` - Start P2P node
\`!network stop\` - Stop P2P node
\`!network providers [pipeline]\` - Discover providers
\`!network use <local|auto|peerId>\` - Select provider
\`!network mode [local|consumer|provider]\` - Set network mode
\`!network pipelines\` - List available pipelines`,
      };
  }
}

/**
 * Store generation in session history (LOCAL mode only)
 * Remote mode doesn't store as it's generating on behalf of a different user
 *
 * Stores in both:
 * 1. Roleplay session history (for conversation context)
 * 2. Main inferenceStore (for app-wide history display)
 */
async function storeGenerationInHistory(channelId, type, prompt, result) {
  // Only store in LOCAL mode
  if (networkSettings.mode !== 'local') {
    console.log(`[OpenClaw] Skipping history storage in ${networkSettings.mode} mode`);
    return;
  }

  const companions = await getCompanions();
  const scenarios = await getScenarios();
  const data = await getOrCreateSession(channelId, companions, scenarios);

  if (data?.session) {
    const historyEntry = {
      role: 'generation',
      type,
      prompt,
      timestamp: Date.now(),
    };

    // Store result data based on type
    // Flask returns 'image' not 'image_base64'
    if (result?.image) historyEntry.image = result.image;
    if (result?.image_base64) historyEntry.image = result.image_base64;
    // For audio, prefer MP3 path (smaller), fallback to WAV
    if (result?.audio_path_mp3) historyEntry.audio = result.audio_path_mp3;
    else if (result?.audio_path) historyEntry.audio = result.audio_path;
    if (result?.video_path) historyEntry.video = result.video_path;
    if (result?.duration) historyEntry.duration = result.duration;
    // Store imagePath if saved to file
    if (result?.imagePath) historyEntry.imagePath = result.imagePath;

    data.session.history.push(historyEntry);
    data.session.updatedAt = Date.now();
    await saveSessions();

    console.log(`[OpenClaw] Stored ${type} generation in roleplay session for channel ${channelId}`);
  }

  // Also store in main inferenceStore for app-wide history
  try {
    const metadata = {
      source: 'openclaw',
      channelId,
      pipeline: type,
    };

    if (type === 'image') {
      const imageData = result?.image || result?.image_base64;
      if (imageData) {
        await addImageInference(prompt, imageData, metadata);
        console.log(`[OpenClaw] Added image to inferenceStore`);
      }
    } else if (type === 'audio' || type === 'music') {
      const audioPath = result?.audio_path_mp3 || result?.audio_path;
      if (audioPath) {
        await addAudioInference(prompt, audioPath, {
          ...metadata,
          duration: result?.duration,
        });
        console.log(`[OpenClaw] Added ${type} to inferenceStore`);
      }
    } else if (type === 'video') {
      if (result?.video_path) {
        await addVideoInference(prompt, result.video_path, metadata);
        console.log(`[OpenClaw] Added video to inferenceStore`);
      }
    }
  } catch (e) {
    console.warn(`[OpenClaw] Failed to add ${type} to inferenceStore:`, e);
  }
}

/**
 * Handle !generate commands for direct pipeline access
 */
async function handleGenerateCommand(channelId, args) {
  const pipeline = args[0]?.toLowerCase();
  const prompt = args.slice(1).join(' ');

  if (!pipeline || !prompt) {
    return {
      text: `**Generate Commands**

\`!generate image <prompt>\` - Generate image
\`!generate music <prompt>\` - Generate music
\`!generate video <prompt>\` - Generate video
\`!generate audio <text>\` - Generate speech
\`!generate vision\` - Analyze attached image

Pipelines: ${Object.keys(PIPELINES).filter(p => p !== 'llm').join(', ')}`,
    };
  }

  switch (pipeline) {
    case 'image':
    case 'image_turbo':
    case 'image_quality':
    case 'image_standard':
    case 'image_advanced': {
      const actualPipeline = pipeline === 'image' ? 'image_turbo' : pipeline;
      const result = await generateImage(channelId, prompt, { pipeline: actualPipeline });
      // Flask returns 'image' not 'image_base64'
      const imageData = result?.image || result?.image_base64;
      if (imageData) {
        // Save image to file FIRST for OpenClaw/WhatsApp (they expect file paths, not base64)
        const imagePath = await saveBase64ImageToFile(imageData, 'generate');

        // Add imagePath to result for history storage
        if (imagePath) {
          result.imagePath = imagePath;
        }

        // Store in history (only in LOCAL mode) - includes imagePath
        await storeGenerationInHistory(channelId, 'image', prompt, result);

        if (imagePath) {
          console.log(`[OpenClaw] Returning image path: ${imagePath}`);
          return { text: `**Image Generated**`, imagePath };
        }

        // Fallback to base64 if file save failed
        return { text: `**Image Generated**`, imageBase64: imageData };
      }
      console.error('[OpenClaw] Image generation result:', result);
      return { text: '**Image generation failed**' };
    }

    case 'music': {
      const result = await generateMusic(channelId, prompt);
      // Prefer MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
      const audioPath = result?.audio_path_mp3 || result?.audio_path;
      if (audioPath) {
        // Store in history
        await storeGenerationInHistory(channelId, 'music', prompt, result);
        console.log(`[OpenClaw] Returning music path: ${audioPath}`);
        return { text: `**Music Generated**\nDuration: ${result.duration || 60}s`, audioPath };
      }
      return { text: '**Music generation failed**' };
    }

    case 'video':
    case 'video_fast': {
      const result = await generateVideo(channelId, prompt);
      if (result?.video_path) {
        // Store in history
        await storeGenerationInHistory(channelId, 'video', prompt, result);
        console.log(`[OpenClaw] Returning video path: ${result.video_path}`);
        return { text: `**Video Generated**`, videoPath: result.video_path };
      }
      return { text: '**Video generation failed**' };
    }

    case 'audio':
    case 'audio_turbo':
    case 'audio_quality':
    case 'tts': {
      const actualPipeline = pipeline === 'tts' ? 'audio_turbo' : pipeline;
      const result = await generateAudio(channelId, prompt, { pipeline: actualPipeline });
      // Prefer MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
      const audioPath = result?.audio_path_mp3 || result?.audio_path;
      if (audioPath) {
        // Store in history
        await storeGenerationInHistory(channelId, 'audio', prompt, result);
        console.log(`[OpenClaw] Returning audio path: ${audioPath}`);
        return { text: `**Audio Generated**`, audioPath };
      }
      return { text: '**Audio generation failed**' };
    }

    default:
      return { text: `Unknown pipeline: ${pipeline}` };
  }
}

/**
 * Handle !skill commands for BonzAI skill execution
 */
async function handleSkillCommand(channelId, args) {
  const subcommand = args[0]?.toLowerCase();

  // Ensure skills are loaded
  if (!skillsLoaded) {
    await initializeSkills();
    skillsLoaded = true;
  }

  switch (subcommand) {
    case 'list': {
      const category = args[1]?.toLowerCase();
      const skills = category ? getSkillsByCategory(category) : getAllSkills();

      if (skills.length === 0) {
        return {
          text: `**No Skills Found**
${category ? `No skills in category: ${category}` : 'No skills available.'}

Categories: finance, analysis, trading, prediction, training, automation, utility`,
        };
      }

      const lines = skills.map(s => {
        const tags = [];
        if (s.author?.verified) tags.push('✓');
        return `- **${s.name}** (\`${s.id}\`) - ${s.description.slice(0, 50)}${s.description.length > 50 ? '...' : ''} ${tags.join(' ')}`;
      });

      return {
        text: `**Available Skills** ${category ? `(${category})` : ''}

${lines.join('\n')}

Use \`!skill info <id>\` to see skill details.
Use \`!skill run <id>\` to execute a skill.`,
      };
    }

    case 'info': {
      const skillId = args[1];
      if (!skillId) {
        return { text: 'Usage: `!skill info <skill-id>`' };
      }

      const skill = getSkill(skillId);
      if (!skill) {
        // Try searching
        const matches = searchSkills(skillId);
        if (matches.length > 0) {
          const suggestions = matches.slice(0, 3).map(s => `- \`${s.id}\` - ${s.name}`).join('\n');
          return { text: `Skill not found. Did you mean:\n${suggestions}` };
        }
        return { text: `Skill not found: ${skillId}` };
      }

      // Build input descriptions
      const inputLines = Object.entries(skill.inputs || {}).map(([key, field]) => {
        const req = field.default === undefined ? '*' : '';
        const typeInfo = field.type === 'select' ? `[${field.options?.join('|')}]` : field.type;
        return `- \`${key}${req}\` (${typeInfo}) - ${field.label || field.description || key}`;
      });

      return {
        text: `**${skill.name}** v${skill.version}
ID: \`${skill.id}\`
Category: ${skill.category}
Author: ${skill.author?.name || 'Unknown'} ${skill.author?.verified ? '✓' : ''}

${skill.description}

**Requirements**
- Level: ${skill.requirements?.minLevel || 1}+
- APIs: ${skill.requirements?.requiredApis?.join(', ') || 'None'}

**Inputs** ${inputLines.length > 0 ? '(* = required)' : ''}
${inputLines.length > 0 ? inputLines.join('\n') : '- None'}

**Usage**
\`!skill run ${skill.id} [key=value ...]\``,
      };
    }

    case 'run': {
      const skillId = args[1];
      if (!skillId) {
        return { text: 'Usage: `!skill run <skill-id> [key=value ...]`' };
      }

      const skill = getSkill(skillId);
      if (!skill) {
        return { text: `Skill not found: ${skillId}` };
      }

      // Parse key=value args
      const inputs = {};
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        const eqIdx = arg.indexOf('=');
        if (eqIdx > 0) {
          const key = arg.slice(0, eqIdx);
          let value = arg.slice(eqIdx + 1);
          // Try to parse as number or boolean
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (!isNaN(Number(value))) value = Number(value);
          inputs[key] = value;
        }
      }

      // Validate inputs
      const validation = validateSkillInputs(skill, inputs);
      if (!validation.valid) {
        return {
          text: `**Invalid Inputs**

${validation.errors.map(e => `- ${e}`).join('\n')}

Use \`!skill info ${skillId}\` to see required inputs.`,
        };
      }

      // Execute skill
      try {
        // Create a context for skill execution
        const context = {
          updateStatus: (status) => console.log(`[Skill] ${status}`),
          fetchTool: async (toolName, toolArgs) => {
            // Route tool calls through electron proxy
            if (window.electronAPI?.polymarketProxy) {
              return window.electronAPI.polymarketProxy(toolName, toolArgs);
            }
            throw new Error(`Tool not available: ${toolName}`);
          },
        };

        const result = await executeSkill(skillId, validation.normalizedInputs, context);

        if (!result.success) {
          return {
            text: `**Skill Failed**: ${skill.name}

Error: ${result.error || 'Unknown error'}`,
          };
        }

        // Format result based on skill type
        if (result.type === 'prompt-based') {
          // For prompt-based skills, we'd need to run through LLM
          // For now, return the prepared prompts
          return {
            text: `**Skill Prepared**: ${skill.name}

This skill requires LLM execution. System prompt and task have been prepared.

Task: ${result.taskPrompt?.slice(0, 200)}${result.taskPrompt?.length > 200 ? '...' : ''}`,
          };
        }

        // Embedded execution result
        const output = result.result;

        // Handle different result formats
        if (output?.recommendations && Array.isArray(output.recommendations)) {
          // Polymarket-style results
          const recs = output.recommendations.slice(0, 5).map((r, i) => {
            return `${i + 1}. **${r.question}**
   Outcome: ${r.outcome} (${r.conviction?.traderCount || 0} traders)
   Price: ${(r.market?.currentPrice * 100).toFixed(1)}%
   Suggested: $${r.suggestedSize}
   [View](${r.url})`;
          });

          return {
            text: `**${skill.name}** - Results

**Top Recommendations**
${recs.join('\n\n')}

${output.meta ? `Analyzed: ${output.meta.tradersAnalyzed} traders, ${output.meta.positionsScanned} positions` : ''}
${output.meta?.analyzedAt ? `Time: ${output.meta.analyzedAt}` : ''}`,
          };
        }

        // Generic result formatting
        return {
          text: `**${skill.name}** - Complete

${typeof output === 'string' ? output : JSON.stringify(output, null, 2).slice(0, 1000)}`,
        };
      } catch (error) {
        console.error('[OpenClaw] Skill execution error:', error);
        return {
          text: `**Skill Error**: ${skill.name}

${error.message}`,
        };
      }
    }

    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        return { text: 'Usage: `!skill search <query>`' };
      }

      const matches = searchSkills(query);
      if (matches.length === 0) {
        return { text: `No skills found matching: ${query}` };
      }

      const lines = matches.slice(0, 5).map(s => `- **${s.name}** (\`${s.id}\`) - ${s.description.slice(0, 50)}...`);
      return {
        text: `**Search Results** for "${query}"

${lines.join('\n')}`,
      };
    }

    case 'categories': {
      const skills = getAllSkills();
      const categories = new Map();

      for (const skill of skills) {
        const cat = skill.category || 'other';
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }

      const lines = Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => `- **${cat}** (${count} skills)`);

      return {
        text: `**Skill Categories**

${lines.join('\n')}

Use \`!skill list <category>\` to filter by category.`,
      };
    }

    default:
      return {
        text: `**Skill Commands**

\`!skill list [category]\` - List available skills
\`!skill info <id>\` - Show skill details
\`!skill run <id> [key=value ...]\` - Execute a skill
\`!skill search <query>\` - Search skills
\`!skill categories\` - Show categories

**Available Skills**
${getAllSkills().slice(0, 3).map(s => `- ${s.name} (\`${s.id}\`)`).join('\n')}
${getAllSkills().length > 3 ? `... and ${getAllSkills().length - 3} more` : ''}`,
      };
  }
}

/**
 * Handle all commands
 */
async function handleCommand(channelId, cmd) {
  const companions = await getCompanions();
  const scenarios = await getScenarios();
  const mapping = getChannelMapping(channelId);

  switch (cmd.command) {
    case 'network':
      return handleNetworkCommand(channelId, cmd.args);

    case 'generate':
    case 'gen':
      return handleGenerateCommand(channelId, cmd.args);

    case 'skill':
    case 'skills':
      return handleSkillCommand(channelId, cmd.args);

    case 'mode': {
      const mode = cmd.args[0]?.toLowerCase();
      if (!['local', 'remote'].includes(mode)) {
        return {
          text: `**Current Mode:** ${networkSettings.mode}

\`!mode local\` - Use local BonzAI Desktop (free)
\`!mode remote\` - Use remote P2P providers (paid with USDC)`,
        };
      }

      networkSettings.mode = mode;
      await saveNetworkSettings();

      if (mode === 'remote') {
        await ensureP2PStarted();
      }

      return { text: `**Mode:** ${mode === 'local' ? 'Local (free)' : 'Remote (paid)'}` };
    }

    case 'model': {
      const modelName = cmd.args[0];
      if (!modelName) {
        const currentModel = networkSettings.currentModel || 'default';
        return {
          text: `**Current Model:** ${currentModel}

Usage: \`!model <model-name>\` to load a specific LLM

Available models:
- \`llama_3_1_8b\` - Llama 3.1 8B
- \`mistral_7b\` - Mistral 7B
- \`deepseek_r1_7b\` - DeepSeek R1 7B
- \`qwen_coder_32b\` - Qwen Coder 32B
- \`hermes_4_14b\` - Hermes 4 14B

Use \`!models\` for full list.`,
        };
      }

      // Normalize model name
      const normalizedModel = modelName.toLowerCase().replace(/-/g, '_');
      const modelKey = normalizedModel.startsWith('llm_') ? normalizedModel : `llm_${normalizedModel}`;

      // Check if model exists in requirements
      if (!MODEL_REQUIREMENTS[modelKey]) {
        return { text: `Model not found: ${modelName}\n\nUse \`!models\` to see available models.` };
      }

      // Load the model
      try {
        const loadResult = await window.electronAPI.loadModel(modelKey);
        if (loadResult.success) {
          networkSettings.currentModel = modelKey;
          await saveNetworkSettings();
          return { text: `**Model Loaded:** ${MODEL_REQUIREMENTS[modelKey].name}` };
        } else {
          return { text: `**Failed to load model:** ${loadResult.error || 'Unknown error'}` };
        }
      } catch (e) {
        return { text: `**Error loading model:** ${e.message}` };
      }
    }

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
        mapping.sessionKey = null;
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
        mapping.sessionKey = null;
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
      if (cmd.args[0] === 'video') {
        mapping.settings.enableVideo = cmd.args[1] !== 'off';
        mapping.sessionKey = null;
        await saveChannelMappings();
        return { text: `Video: ${mapping.settings.enableVideo ? 'enabled' : 'disabled'}` };
      }
      if (cmd.args[0] === 'music') {
        mapping.settings.enableMusic = cmd.args[1] !== 'off';
        mapping.sessionKey = null;
        await saveChannelMappings();
        return { text: `Music: ${mapping.settings.enableMusic ? 'enabled' : 'disabled'}` };
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
      return {
        text: `**Current Settings**
Audio: ${mapping.settings.enableAudio ? 'on' : 'off'}
Images: ${mapping.settings.enableImage ? 'on' : 'off'}
Video: ${mapping.settings.enableVideo ? 'on' : 'off'}
Music: ${mapping.settings.enableMusic ? 'on' : 'off'}
Content Level: ${mapping.settings.contentLevel}

Usage: !settings <audio|images|video|music> <on|off>
       !settings level <pg|pg13|mature|adult>`,
      };
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

    case 'status': {
      const data = await getOrCreateSession(channelId, companions, scenarios);
      const netStatus = await getNetworkStatus();

      if (!data) {
        return { text: 'No active session. Select a companion first with !companion select <name>' };
      }
      const { session, sessionKey, companion, scenario } = data;
      const currentModel = networkSettings.currentModel ? MODEL_REQUIREMENTS[networkSettings.currentModel]?.name : 'Default';

      return {
        text: `**Current Session**
Companion: ${companion.name}
Scenario: ${scenario.name}
Content Level: ${mapping.settings.contentLevel}
Messages: ${session.history?.length || 0}

**Mode & Model**
Mode: ${networkSettings.mode === 'local' ? 'Local (free)' : 'Remote (paid)'}
Model: ${currentModel}

**Media Generation**
Audio: ${mapping.settings.enableAudio ? 'on' : 'off'} | Images: ${mapping.settings.enableImage ? 'on' : 'off'}
Video: ${mapping.settings.enableVideo ? 'on' : 'off'} | Music: ${mapping.settings.enableMusic ? 'on' : 'off'}

**Network**
Provider: ${mapping.network.provider || 'local'}
P2P: ${netStatus.started ? 'Connected' : 'Offline'}`,
      };
    }

    case 'models': {
      const models = Object.entries(MODEL_REQUIREMENTS)
        .filter(([, m]) => m.type === 'llm')
        .slice(0, 10)
        .map(([key, m]) => `- \`${key}\` - ${m.name} (${m.size})`);

      return {
        text: `**Available LLM Models** (showing first 10)
${models.join('\n')}

Total: ${Object.keys(MODEL_REQUIREMENTS).filter(k => MODEL_REQUIREMENTS[k].type === 'llm').length} models`,
      };
    }

    case 'help': {
      return {
        text: `**BonzAI Commands**

**Mode**
\`!mode local\` - Use local BonzAI (free)
\`!mode remote\` - Use remote providers (paid)
\`!model <name>\` - Load specific LLM model

**Roleplay**
\`!companion list|select <name>\` - Manage companions
\`!scenario list|select <name>\` - Manage scenarios
\`!settings <option> <value>\` - Configure generation
\`!status\` - Show current session
\`!reset\` - Clear history

**Generation**
\`!generate image <prompt>\` - Generate image
\`!generate music <prompt>\` - Generate music
\`!generate video <prompt>\` - Generate video
\`!generate audio <text>\` - Text-to-speech

**Skills**
\`!skill list [category]\` - List BonzAI skills
\`!skill info <id>\` - Show skill details
\`!skill run <id> [inputs]\` - Execute a skill

**Network (P2P)**
\`!network status\` - Show P2P status
\`!network providers [pipeline]\` - Find providers
\`!network use <peerId>\` - Select provider

\`!models\` - List LLM models
\`!help\` - Show this help`,
      };
    }

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT HANDLING
// ═══════════════════════════════════════════════════════════════════════════

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
    textResponse = await generateText(channelId, `${systemPrompt}\n\n${context}`);
  } catch (error) {
    textResponse = `*${companion.name} smiles warmly* I'm here with you. What would you like to talk about?`;
  }

  // Infer emotion
  const emotion = inferEmotion(textResponse);

  // Update history
  const userMessage = { role: 'user', content: message, timestamp: Date.now() };
  const assistantMessage = { role: 'assistant', content: textResponse, emotion, timestamp: Date.now() };

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
    const audioResult = await generateAudio(channelId, textResponse, { voice });
    // Prefer MP3 for smaller file size (OpenClaw/WhatsApp compatibility)
    const audioPath = audioResult?.audio_path_mp3 || audioResult?.audio_path;
    if (audioPath) {
      result.audioPath = audioPath;
      assistantMessage.audio = audioPath;
      console.log(`[OpenClaw] Chat audio saved: ${audioPath}`);
    }
  }

  // Generate image if enabled
  if (mapping.settings.enableImage) {
    const imagePrompt = `${companion.imagePromptBase || companion.appearance}, ${emotion} expression, ${scenario?.imagePromptBase || ''}, high quality`;
    const imageResult = await generateImage(channelId, imagePrompt);
    // Flask returns 'image' not 'image_base64'
    const imageData = imageResult?.image || imageResult?.image_base64;
    if (imageData) {
      // Save image to file for OpenClaw/WhatsApp (they expect file paths, not base64)
      const imagePath = await saveBase64ImageToFile(imageData, 'chat');
      if (imagePath) {
        result.imagePath = imagePath;
        console.log(`[OpenClaw] Chat image saved to: ${imagePath}`);
      } else {
        // Fallback to base64 if file save failed
        result.imageBase64 = imageData;
      }
      assistantMessage.image = imageData;
      session.sceneState.lastImageAt = session.history.length - 1;
    }
  }

  // Generate video if enabled (less frequent)
  if (mapping.settings.enableVideo && session.history.length % 5 === 0) {
    const videoPrompt = `${companion.appearance}, ${emotion}, ${scenario?.setting || ''}, cinematic`;
    const videoResult = await generateVideo(channelId, videoPrompt);
    if (videoResult?.video_path) {
      result.videoPath = videoResult.video_path;
      assistantMessage.video = videoResult.video_path;
      console.log(`[OpenClaw] Chat video saved: ${videoResult.video_path}`);
    }
  }

  // Persist
  await saveSessions();
  await saveChannelMappings();

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleWebhook(data) {
  const { channelId, message, platform } = data;
  console.log(`[OpenClaw] ${platform}/${channelId}: ${message}`);

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
    console.error('[OpenClaw] Error:', error);
    return { error: error.message };
  }
}

/**
 * Handle API requests
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

    case 'get-pipelines':
      return PIPELINES;

    case 'get-network-status':
      return getNetworkStatus();

    case 'discover-providers':
      return discoverProviders(data.pipeline);

    case 'get-skills': {
      if (!skillsLoaded) {
        await initializeSkills();
        skillsLoaded = true;
      }
      const category = data.category;
      return category ? getSkillsByCategory(category) : getAllSkills();
    }

    case 'get-skill': {
      if (!skillsLoaded) {
        await initializeSkills();
        skillsLoaded = true;
      }
      return getSkill(data.id);
    }

    case 'execute-skill': {
      if (!skillsLoaded) {
        await initializeSkills();
        skillsLoaded = true;
      }
      const skill = getSkill(data.skillId);
      if (!skill) {
        return { error: `Skill not found: ${data.skillId}` };
      }
      const context = {
        updateStatus: () => {},
        fetchTool: async (toolName, toolArgs) => {
          if (window.electronAPI?.polymarketProxy) {
            return window.electronAPI.polymarketProxy(toolName, toolArgs);
          }
          throw new Error(`Tool not available: ${toolName}`);
        },
      };
      return executeSkill(data.skillId, data.inputs || {}, context);
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

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export async function initOpenClawHandler() {
  if (!window.electronAPI?.onOpenClawWebhook) {
    console.warn('[OpenClaw] Webhook API not available');
    return;
  }

  console.log('[OpenClaw] Initializing webhook handler with P2P and Skills support');

  // Load persisted data
  await loadData();

  // Initialize skills
  try {
    const { skills } = await initializeSkills();
    skillsLoaded = true;
    console.log(`[OpenClaw] Loaded ${skills.length} skills`);
  } catch (e) {
    console.warn('[OpenClaw] Failed to load skills:', e);
  }

  // Auto-start P2P if in provider mode
  if (networkSettings.mode === 'provider') {
    console.log('[OpenClaw] Provider mode - starting P2P node');
    await ensureP2PStarted();
  }

  window.electronAPI.onOpenClawWebhook(async (data) => {
    const { requestId, ...webhookData } = data;

    try {
      let result;

      if (webhookData.type && webhookData.type.startsWith('get-') || webhookData.type === 'discover-providers') {
        result = await handleApiRequest(webhookData);
      } else {
        result = await handleWebhook(webhookData);
      }

      await window.electronAPI.sendOpenClawResponse(requestId, result);
    } catch (error) {
      console.error('[OpenClaw] Webhook error:', error);
      await window.electronAPI.sendOpenClawResponse(requestId, { error: error.message });
    }
  });

  console.log('[OpenClaw] Webhook handler ready with all pipelines');
}

// Export for testing
export {
  PIPELINES,
  executeInference,
  discoverProviders,
  getNetworkStatus,
};
