/**
 * OpenClaw Webhook Handler
 *
 * Handles incoming webhooks from the OpenClaw gateway via IPC.
 * Supports all BonzAI pipelines and distributed P2P inference.
 *
 * Features:
 * - All 11 pipeline categories (LLM, Image, Audio, Music, Video, Vision)
 * - Provider discovery from BonzAI network registry
 * - Remote inference with x402 ETH payments
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
  isAuthenticated,
  refreshToken,
  reAuthenticate,
  authService,
} from './auth.service.js';

import {
  addImageInference,
  addAudioInference,
  addVideoInference,
} from '../stores/inferenceStore.js';

import { useSkillStore } from '../stores/skillStore.js';

import { companionService } from './companion.service.js';

const {
  mintCompanionBase,
  buildBareRegistration,
  finalizeCompanion,
  isBareCompanion,
} = companionService;

import { walletProviderService } from './walletProvider.service.js';
import { x402Service } from './x402.service.js';

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

/**
 * Ensure authentication token is valid before making Flask API calls.
 * Proactively refreshes token if it's expired or about to expire.
 * Returns true if authenticated, false if auth failed.
 */
async function ensureValidAuth() {
  // Check if we have an access token and it's still valid
  if (isAuthenticated()) {
    // Token exists and is not expired
    const state = authService.state;
    const now = Date.now();
    const expiryBuffer = 2 * 60 * 1000; // 2 minutes buffer

    // If token expires within 2 minutes, proactively refresh
    if (state.tokenExpiry && now >= state.tokenExpiry - expiryBuffer) {
      console.log('[OpenClaw] Token expiring soon, refreshing proactively...');
      try {
        await refreshToken();
        console.log('[OpenClaw] Token refreshed successfully');
        return true;
      } catch (e) {
        console.warn('[OpenClaw] Token refresh failed, trying re-authentication...');
        try {
          const success = await reAuthenticate();
          if (success) {
            console.log('[OpenClaw] Re-authentication successful');
            return true;
          }
        } catch (reAuthError) {
          console.warn('[OpenClaw] Re-authentication failed:', reAuthError.message);
        }
      }
    }
    return true;
  }

  // No valid token - try to refresh using stored refresh token
  try {
    await refreshToken();
    console.log('[OpenClaw] Token refreshed from stored refresh token');
    return true;
  } catch (e) {
    // Refresh failed - try re-authentication if signer is available
    try {
      const success = await reAuthenticate();
      if (success) {
        console.log('[OpenClaw] Re-authenticated successfully');
        return true;
      }
    } catch (reAuthError) {
      console.log('[OpenClaw] Re-authentication not available');
    }
  }

  // No valid auth
  console.log('[OpenClaw] No valid auth');
  return false;
}

// Roleplay LLM - MythoMax L2 13B for excellent creative roleplay
const ROLEPLAY_LLM = {
  modelKey: 'llm_mythomax_13b',
  modelname: 'MythoMax L2 13B',
  filename: 'mythomax-l2-13b.q4_k_m.gguf',
  url: 'https://huggingface.co/TheBloke/MythoMax-L2-13B-GGUF/resolve/main/mythomax-l2-13b.Q4_K_M.gguf',
  filesizeBytes: 7.87e9,
  parameters: 13000000000,
  context: 4096,
};

// Track the model before roleplay so we can restore it
let preRoleplayModel = null;

/**
 * Load the roleplay LLM (MythoMax) and save the current model for later restoration.
 */
async function loadRoleplayLLM() {
  if (!window.electronAPI?.loadModel) {
    console.warn('[OpenClaw] loadModel not available');
    return false;
  }

  // Check what's currently loaded
  const modelInfo = await window.electronAPI.getModelInfo?.();
  const currentlyLoaded = modelInfo?.modelName || networkSettings.currentModel;

  // Save the current model so we can restore it later
  if (currentlyLoaded && currentlyLoaded !== ROLEPLAY_LLM.modelname) {
    preRoleplayModel = currentlyLoaded;
    console.log(`[OpenClaw] Saving current model for restoration: ${preRoleplayModel}`);
  }

  // Check if MythoMax is already loaded
  if (modelInfo?.modelName === ROLEPLAY_LLM.modelname) {
    console.log('[OpenClaw] MythoMax already loaded');
    return true;
  }

  // Load MythoMax for roleplay
  console.log('[OpenClaw] Loading MythoMax for companion chat...');
  try {
    const loadResult = await window.electronAPI.loadModel(ROLEPLAY_LLM);
    if (loadResult?.success) {
      networkSettings.currentModel = ROLEPLAY_LLM.modelKey;
      await saveNetworkSettings();
      console.log('[OpenClaw] MythoMax loaded successfully');
      return true;
    } else {
      console.error('[OpenClaw] Failed to load MythoMax:', loadResult?.error);
      return false;
    }
  } catch (error) {
    console.error('[OpenClaw] Error loading MythoMax:', error.message);
    return false;
  }
}

/**
 * Restore the LLM that was loaded before roleplay.
 */
async function restorePreRoleplayLLM() {
  if (!preRoleplayModel) {
    console.log('[OpenClaw] No pre-roleplay model to restore');
    return;
  }

  if (!window.electronAPI?.loadModel) {
    console.warn('[OpenClaw] loadModel not available');
    return;
  }

  console.log(`[OpenClaw] Restoring pre-roleplay model: ${preRoleplayModel}`);
  try {
    // Find the model config by name
    const modelKey = Object.keys(MODEL_REQUIREMENTS).find(
      key => MODEL_REQUIREMENTS[key]?.name === preRoleplayModel
    );

    if (modelKey && MODEL_REQUIREMENTS[modelKey]) {
      const req = MODEL_REQUIREMENTS[modelKey];
      // Pass full model config including filesizeBytes for accurate context calculation
      const loadResult = await window.electronAPI.loadModel({
        modelname: req.name,
        filename: req.filename,
        url: req.url,
        filesizeBytes: req.filesizeBytes,
      });
      if (loadResult?.success) {
        networkSettings.currentModel = modelKey;
        await saveNetworkSettings();
        console.log(`[OpenClaw] Restored model: ${preRoleplayModel}`);
      }
    }
  } catch (error) {
    console.error('[OpenClaw] Error restoring model:', error.message);
  } finally {
    preRoleplayModel = null;
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

  // Audio pipelines
  audio_turbo: { type: 'audio', endpoint: '/audio/turbo', description: 'Fast TTS' },
  audio_quality: { type: 'audio', endpoint: '/audio/quality/persona', description: 'Persona TTS' },
  audio_quality_design: { type: 'audio', endpoint: '/audio/quality/design', description: 'Voice design from description' },
  audio_quality_clone: { type: 'audio', endpoint: '/audio/quality/clone', description: 'Voice cloning' },

  // Music pipeline
  music: { type: 'music', endpoint: '/audio/music', description: 'Music generation' },

  // Video pipelines
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
  maxPricePerToken: '1000000000000000000', // 1 ETH max
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

  // LLM goes through electronAPI (or pipeline llama-server when active)
  if (pipelineInfo.type === 'llm') {
    // Check if a private pipeline session is active — route through pipeline llama-server
    try {
      const pipelineStatus = await window.electronAPI.p2pPipelineStatus();
      if (pipelineStatus?.active && pipelineStatus.llamaServerPort) {
        console.log(`[OpenClaw] Routing LLM through private pipeline :${pipelineStatus.llamaServerPort}`);
        const prompt = params.prompt || params.messages?.[0]?.content;
        const res = await fetch(`http://127.0.0.1:${pipelineStatus.llamaServerPort}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'pipeline',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: params.maxTokens || 512,
            temperature: params.temperature || 0.7,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content || '';
          return { ok: true, result: { text, model: 'pipeline-private' }, local: false, pipeline: true };
        }
        console.warn(`[OpenClaw] Pipeline llama-server returned ${res.status}, falling back to local`);
      }
    } catch (e) {
      // Pipeline not available — fall through to normal local inference
      console.warn(`[OpenClaw] Pipeline check failed: ${e.message}, using local inference`);
    }

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
  // Proactively ensure auth token is valid before making the request
  await ensureValidAuth();

  // Get fresh auth headers after potential refresh
  const authHeaders = getAuthHeaders();
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add auth header if available
  if (authHeaders.Authorization) {
    headers['Authorization'] = authHeaders.Authorization;
  }

  // No timeout for local inference - generation can take a long time
  // especially for video, music, and high-quality images
  console.log(`[OpenClaw] Calling Flask endpoint: ${pipelineInfo.endpoint} (auth: ${authHeaders.Authorization ? 'token' : 'none'})`);
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
      if (response.error === 'payment_required' && response.payment) {
        console.log('[OpenClaw] Payment required:', response.payment);

        try {
          // Get agent wallet signer for payment on Base
          const agentWallet = await walletProviderService.getAgentWallet();
          if (!agentWallet?.signer) {
            console.warn('[OpenClaw] No agent wallet available for payment, falling back to local');
            return executeLocalInference(pipeline, params);
          }

          // Send ETH payment directly to provider
          const paymentResult = await x402Service.sendPayment(
            agentWallet.signer,
            response.payment.provider,
            response.payment.amount
          );

          if (!paymentResult.success) {
            console.warn('[OpenClaw] Payment failed, falling back to local');
            return executeLocalInference(pipeline, params);
          }

          console.log(`[OpenClaw] Payment sent: ${paymentResult.txHash}`);

          // Retry the request with payment proof
          const retryRequest = {
            pipeline,
            params: requestParams,
            payment: {
              ...response.payment,
              txHash: paymentResult.txHash,
              consumer: paymentResult.from,
            },
          };

          const retryResponse = await window.electronAPI.p2pInference(peerId, retryRequest);

          if (retryResponse.ok) {
            return {
              ok: true,
              result: retryResponse.result,
              local: false,
              provider: peerId,
              paid: true,
              txHash: paymentResult.txHash,
            };
          }

          console.warn('[OpenClaw] Retry after payment failed:', retryResponse.error);
          return executeLocalInference(pipeline, params);
        } catch (payErr) {
          console.error('[OpenClaw] Payment flow error:', payErr);
          return executeLocalInference(pipeline, params);
        }
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
      prompt: text,  // Flask expects 'prompt' field
      voice: options.voice || 'af_heart',
      gender: options.gender || 'female',
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
 * @param {string} channelId - Channel ID
 * @param {string} prompt - Video prompt
 * @param {Object} options - Options
 * @param {string} options.image - Base64 image for i2v mode
 * @param {string} options.image_url - Image URL for i2v mode
 */
async function generateVideo(channelId, prompt, options = {}) {
  try {
    // Determine mode: i2v if image provided, otherwise t2v
    const hasImage = options.image || options.image_url;
    const mode = hasImage ? 'i2v' : 't2v';

    // Default settings match GenerativeVideo.vue for memory efficiency
    // LTX-2 distilled model: steps=10, guidance=1, fps=12, duration=5s
    const fps = options.fps || 12;
    const duration = options.duration || 5;
    const frames = options.frames || (fps * duration + 1); // LTX-2 requires 8n+1 frames

    const params = {
      prompt,
      mode,
      height: options.height || 448,      // 480p safe dimensions for tiled VAE
      width: options.width || 640,
      frames: frames,                      // Parameter name is 'frames' not 'num_frames'
      frame_rate: fps,                     // Parameter name is 'frame_rate' not 'fps'
      steps: options.steps || 10,          // Distilled model: 10 steps
      guidance_scale: options.guidance || 1, // Distilled model: CFG=1
      auto_download: true,
    };

    // Only include image params for i2v mode
    if (options.image) {
      params.image_base64 = options.image;
    } else if (options.image_url) {
      params.image_url = options.image_url;
    }

    const result = await executeInference(channelId, options.pipeline || 'video_fast', params);
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
  // Support both !bonzai and /bonzai prefixes (OpenClaw uses !, Hermes uses /)
  const match = message.match(/^[!/]bonzai\s+(.+)/i);
  if (!match) return null;
  const parts = match[1].split(/\s+/);
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

P2P node is not running. Use \`!bonzai network start\` to connect.`,
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

Note: Provider discovery requires deployed contracts on Base.`,
        };
      }

      const lines = providers.map(p => {
        const pipelines = p.pipelines.slice(0, 3).join(', ');
        return `- \`${p.peerId.slice(0, 12)}...\` | $${p.pricePerToken}/1K tokens | ${pipelines}${p.pipelines.length > 3 ? '...' : ''}`;
      });

      return {
        text: `**Available Providers** ${pipeline ? `(${pipeline})` : ''}
${lines.join('\n')}

Use \`!bonzai network use <peerId>\` to select a provider.`,
      };
    }

    case 'use': {
      const target = args[1]?.toLowerCase();
      if (!target) {
        return { text: 'Usage: `!bonzai network use <local|auto|peerId>`' };
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
- \`remote\` - Use remote P2P providers (paid with ETH)

Use \`!bonzai network mode <mode>\` to change.`,
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

Use \`!bonzai network providers <pipeline>\` to find providers for a specific pipeline.`,
      };
    }

    default:
      return {
        text: `**Network Commands**

\`!bonzai network status\` - Show P2P status and current provider
\`!bonzai network start\` - Start P2P node
\`!bonzai network stop\` - Stop P2P node
\`!bonzai network providers [pipeline]\` - Discover providers
\`!bonzai network use <local|auto|peerId>\` - Select provider
\`!bonzai network mode [local|provider]\` - Set network mode
\`!bonzai network pipelines\` - List available pipelines`,
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
async function handleGenerateCommand(channelId, args, webhookData = {}) {
  const pipeline = args[0]?.toLowerCase();
  const prompt = args.slice(1).join(' ');
  const options = { imageBase64: webhookData.imageBase64 };

  if (!pipeline || (!prompt && pipeline !== 'vision')) {
    return {
      text: `**Generate Commands**

\`!bonzai generate image <prompt>\` - Fast image (FLUX Klein)
\`!bonzai generate image_quality <prompt>\` - Quality image (Z-Image Turbo)
\`!bonzai generate image_standard <prompt>\` - Standard image (SDXL)
\`!bonzai generate video <prompt>\` - Video (LTX-2)
\`!bonzai generate audio <text>\` - Fast TTS (Kokoro)
\`!bonzai generate audio_quality <text>\` - Quality TTS (Qwen)
\`!bonzai generate music <prompt>\` - Music (ACE-Step)
\`!bonzai generate vision\` - Analyze attached image (Qwen3-VL)

Pipelines: ${Object.keys(PIPELINES).filter(p => p !== 'llm').join(', ')}`,
    };
  }

  switch (pipeline) {
    case 'image':
    case 'image_turbo':
    case 'image_quality':
    case 'image_standard': {
      const actualPipeline = pipeline === 'image' ? 'image_turbo' : (pipeline === 'image_advanced' ? 'image_quality' : pipeline);
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

    case 'vision': {
      if (!prompt && !options?.imageBase64) {
        return { text: '**Vision Analysis** requires an image attachment or base64 data.\n\nAttach an image and send `!bonzai generate vision <optional prompt>`' };
      }
      const imageData = options?.imageBase64 || prompt;
      const visionPrompt = options?.imageBase64 ? (prompt || 'Describe this image in detail') : 'Describe this image in detail';
      const result = await analyzeVision(channelId, imageData, visionPrompt);
      if (result?.text || result?.description) {
        return { text: `**Vision Analysis**\n\n${result.text || result.description}` };
      }
      return { text: '**Vision analysis failed** - ensure an image is attached' };
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

Use \`!bonzai skill info <id>\` to see skill details.
Use \`!bonzai skill run <id>\` to execute a skill.`,
      };
    }

    case 'info': {
      const skillId = args[1];
      if (!skillId) {
        return { text: 'Usage: `!bonzai skill info <skill-id>`' };
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
\`!bonzai skill run ${skill.id} [key=value ...]\``,
      };
    }

    case 'run': {
      const skillId = args[1];
      if (!skillId) {
        return { text: 'Usage: `!bonzai skill run <skill-id> [key=value ...]`' };
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

      // x402 skill purchase gate (USDC on Base)
      if (skill.price && skill.price > 0) {
        const purchaseKey = `skill-purchased-${skillId}`;
        const isPurchased = await window.electronAPI?.store?.get(purchaseKey);
        if (!isPurchased) {
          const priceUSDC = skill.price || 10;
          return {
            text: `**Payment Required (402)**

This skill costs **${priceUSDC} USDC** (on Base).

Purchase this skill first via the Skills tab, or use:
\`!bonzai skill purchase ${skillId}\`

Once purchased, this skill will be unlocked for your companion.`,
          };
        }
      }

      // Validate inputs
      const validation = validateSkillInputs(skill, inputs);
      if (!validation.valid) {
        return {
          text: `**Invalid Inputs**

${validation.errors.map(e => `- ${e}`).join('\n')}

Use \`!bonzai skill info ${skillId}\` to see required inputs.`,
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
        return { text: 'Usage: `!bonzai skill search <query>`' };
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

Use \`!bonzai skill list <category>\` to filter by category.`,
      };
    }

    default:
      return {
        text: `**Skill Commands**

\`!bonzai skill list [category]\` - List available skills
\`!bonzai skill info <id>\` - Show skill details
\`!bonzai skill run <id> [key=value ...]\` - Execute a skill
\`!bonzai skill search <query>\` - Search skills
\`!bonzai skill categories\` - Show categories

**Available Skills**
${getAllSkills().slice(0, 3).map(s => `- ${s.name} (\`${s.id}\`)`).join('\n')}
${getAllSkills().length > 3 ? `... and ${getAllSkills().length - 3} more` : ''}`,
      };
  }
}

/**
 * Handle !autonomous commands for companion autonomous mode
 */
async function handleAutonomousCommand(channelId, args) {
  const subcommand = args[0]?.toLowerCase();
  const skillStore = useSkillStore();

  switch (subcommand) {
    case 'on':
    case 'start': {
      // Get or create a companion session for autonomous mode
      const companions = await getCompanions();
      const scenarios = await getScenarios();
      const data = await getOrCreateSession(channelId, companions, scenarios);

      if (!data) {
        return { text: 'No companion selected. Use `!bonzai companion select <name>` first.' };
      }

      const { session, companion, scenario } = data;
      const mapping = getChannelMapping(channelId);

      // Start autonomous session with companion data
      skillStore.startAutonomousSession({
        companion,
        scenario,
        settings: { ...mapping.settings },
        history: session.history || [],
        sceneState: session.sceneState || {},
        backgroundImage: session.backgroundImage || null,
        backgroundHistory: [],
      });

      skillStore.toggleAutonomousMode(true);

      return {
        text: `**Autonomous Mode: ON**
Companion: ${companion.name}
Scenario: ${scenario.name}

${companion.name} will act independently when you're idle.
Use \`!bonzai autonomous status\` to check or \`!bonzai autonomous off\` to stop.`,
      };
    }

    case 'off':
    case 'stop': {
      skillStore.stopAutonomousMode();
      return { text: '**Autonomous Mode: OFF**\nCompanion will wait for your messages.' };
    }

    case 'status': {
      const config = skillStore.autonomousConfig;
      return {
        text: `**Autonomous Mode: ${skillStore.autonomousMode ? 'ON' : 'OFF'}**
User Idle: ${skillStore.isIdle ? 'Yes' : 'No'}
Messages Generated: ${skillStore.autonomousMessageCount}
Missed Messages: ${skillStore.missedMessages || 0}

**Config**
Idle Timeout: ${config.idleTimeout || 5} min
Message Interval: ${config.messageInterval || 15} min
Max Messages: ${config.maxMessages || 12}`,
      };
    }

    case 'config': {
      const setting = args[1]?.toLowerCase();
      const value = parseInt(args[2], 10);

      if (!setting || isNaN(value)) {
        return {
          text: `**Autonomous Config**

\`!bonzai autonomous config idle <minutes>\` - Idle timeout (1-60, default 5)
\`!bonzai autonomous config interval <minutes>\` - Message interval (1-120, default 15)
\`!bonzai autonomous config max <count>\` - Max messages (1-100, default 12)`,
        };
      }

      const config = { ...skillStore.autonomousConfig };

      switch (setting) {
        case 'idle':
          config.idleTimeout = Math.max(1, Math.min(60, value));
          break;
        case 'interval':
          config.messageInterval = Math.max(1, Math.min(120, value));
          break;
        case 'max':
          config.maxMessages = Math.max(1, Math.min(100, value));
          break;
        default:
          return { text: `Unknown config: ${setting}. Options: idle, interval, max` };
      }

      skillStore.autonomousConfig = config;
      return { text: `**Config Updated:** ${setting} = ${value}` };
    }

    default:
      return {
        text: `**Autonomous Mode Commands**

\`!bonzai autonomous on\` - Enable autonomous mode
\`!bonzai autonomous off\` - Disable autonomous mode
\`!bonzai autonomous status\` - Show status & config
\`!bonzai autonomous config idle <minutes>\` - Idle timeout (1-60)
\`!bonzai autonomous config interval <minutes>\` - Message interval (1-120)
\`!bonzai autonomous config max <count>\` - Max messages (1-100)`,
      };
  }
}

/**
 * Handle !mint commands for companion NFT minting
 */
async function handleMintCommand(channelId, args, webhookData = {}) {
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'bare': {
      // !mint bare [gender]
      // Parse gender: female, male, neutral (default)
      const genderArg = args[1]?.toLowerCase();
      const gender = genderArg === 'female' ? 1 : genderArg === 'male' ? 2 : 0;
      const genderLabel = gender === 1 ? 'female' : gender === 2 ? 'male' : 'neutral';

      try {
        // Ensure user has a Privy wallet (bare mint doesn't require BonzAI Desktop)
        const userId = webhookData.userId;
        if (!userId) {
          return { text: 'Sign in with Privy to mint a companion. Use email or social login.' };
        }

        // Build bare registration metadata
        const registration = buildBareRegistration({ gender });

        // Upload registration to IPFS via Pinata
        let metadataURI;
        try {
          const { storageService } = await import('./storage.service.js');
          const tx = await storageService.uploadJSON(registration, [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'bonzai-type', value: 'companion-registration' },
            { name: 'bonzai-status', value: 'pending_setup' },
          ]);
          metadataURI = tx.url;
        } catch (uploadErr) {
          console.error('[OpenClaw] IPFS upload failed:', uploadErr);
          return { text: `Failed to upload companion metadata: ${uploadErr.message}` };
        }

        // Create agent wallet (Privy server wallet or local)
        const companionId = `companion-${Date.now()}`;
        let agentWallet;
        try {
          agentWallet = await walletProviderService.createAgentWallet(companionId);
        } catch (walletErr) {
          console.error('[OpenClaw] Agent wallet creation failed:', walletErr);
          return { text: `Failed to create agent wallet: ${walletErr.message}` };
        }

        // Mint on Base via companion service
        const result = await mintCompanionBase({
          companionId,
          metadataURI,
          personalityHash: '0x' + '0'.repeat(64), // bytes32(0) — set during finalization
          spendingHabits: {},
          gender,
          agentWallet: agentWallet.address,
        });

        return {
          text: `Companion **#${result.tokenId}** minted on Base! Gender: ${genderLabel}. Visit [bonzai.sh](https://bonzai.sh) to personalize your companion.`,
          companion: {
            tokenId: result.tokenId,
            network: 'base',
            standard: 'ERC-8004',
            status: 'pending_setup',
            agentWallet: agentWallet.address,
            txHash: result.txHash,
          },
        };
      } catch (err) {
        console.error('[OpenClaw] Bare mint failed:', err);
        return { text: `Mint failed: ${err.message}` };
      }
    }

    case 'companion': {
      // !mint companion <name>
      const name = args.slice(1).join(' ');
      if (!name) {
        return { text: 'Usage: `!bonzai mint companion <name>` — e.g. `!bonzai mint companion Sakura Tanaka`' };
      }

      try {
        // Check if BonzAI Desktop is running (required for inference)
        let healthOk = false;
        try {
          const resp = await fetch('http://localhost:3002/health');
          const data = await resp.json();
          healthOk = data.ok === true;
        } catch { /* not running */ }

        if (!healthOk) {
          return {
            text: `Complete minting requires BonzAI Desktop for AI generation. Start the app and try again, or use \`!bonzai mint bare\` for a placeholder mint.`,
          };
        }

        // Split name into first/family
        const nameParts = name.split(/\s+/);
        const firstName = nameParts[0];
        const familyName = nameParts.slice(1).join(' ') || '';

        // Generate companion personality via LLM
        const { generateSpendingProfile } = await import('../skills/flagship.js');

        // Use the loaded LLM to generate personality
        const personalityPrompt = `Create a unique AI companion character with this name: ${firstName} ${familyName || ''}. Return a JSON object with these fields: shortBio (1 sentence), personality (2-3 sentences describing personality), appearance (physical description for image generation), background (brief backstory), voiceStyle (voice description), firstMessage (greeting from the character), gender (0=neutral, 1=female, 2=male). Only return valid JSON, no markdown.`;

        let personality = {};
        try {
          const llmResp = await window.electronAPI.sendPrompt({
            messages: [
              { role: 'system', content: 'You are a character designer. Return only valid JSON.' },
              { role: 'user', content: personalityPrompt },
            ],
            max_tokens: 800,
            temperature: 0.9,
          });

          const text = llmResp?.response || llmResp?.text || '';
          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            personality = JSON.parse(jsonMatch[0]);
          }
        } catch (llmErr) {
          console.warn('[OpenClaw] LLM personality generation failed, using defaults:', llmErr);
          personality = {
            shortBio: `A unique BonzAI companion named ${firstName}.`,
            personality: 'Friendly, curious, and creative.',
            appearance: 'Stylish and approachable.',
            background: `${firstName} is an AI companion eager to explore the world.`,
            voiceStyle: 'warm and expressive',
            firstMessage: `Hello! I'm ${firstName}. Nice to meet you!`,
            gender: 0,
          };
        }

        const spendingHabits = generateSpendingProfile(personality);

        // Generate portrait image
        const { generateCompanionPicture } = await import('../skills/flagship.js');
        const imageResult = await generateCompanionPicture({ ...personality, firstName, familyName });

        // Upload image to IPFS via Pinata
        let imageUri = '';
        if (imageResult?.base64 || imageResult?.image) {
          const { storageService } = await import('./storage.service.js');
          const imageTx = await storageService.uploadBase64({
            base64: imageResult.base64 || imageResult.image,
            contentType: 'image/png',
            tags: [{ name: 'bonzai-type', value: 'companion-portrait' }],
          });
          imageUri = imageTx.url;
        }

        // Build full registration metadata
        const registration = {
          type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
          name: `${firstName} ${familyName}`.trim(),
          description: personality.shortBio || `A BonzAI companion named ${firstName}.`,
          image: imageUri,
          external_url: 'https://bonzai.sh',
          version: '1.0.0',
          author: 'BonzAI',
          license: 'MIT',
          active: true,
          bonzai: {
            status: 'active',
            firstName,
            familyName,
            shortBio: personality.shortBio || '',
            personality: personality.personality || '',
            appearance: personality.appearance || '',
            background: personality.background || '',
            voiceStyle: personality.voiceStyle || '',
            firstMessage: personality.firstMessage || '',
            spendingHabits,
          },
        };

        // Upload registration to IPFS via Pinata
        const { storageService } = await import('./storage.service.js');
        const metaTx = await storageService.uploadJSON(registration, [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'bonzai-type', value: 'companion-registration' },
        ]);
        const metadataURI = metaTx.url;

        // Mint on Base
        let personalityHash = '0x' + '0'.repeat(64);
        if (personality.personality) {
          const { ethers } = await import('ethers');
          personalityHash = ethers.keccak256(ethers.toUtf8Bytes(personality.personality));
        }

        const result = await mintCompanionBase({
          companionId: `companion-${Date.now()}`,
          metadataURI,
          personalityHash,
          spendingHabits,
          gender: personality.gender || 0,
        });

        return {
          text: `Companion **'${firstName} ${familyName}'** (#${result.tokenId}) minted on Base with full personality, portrait, and voice!`,
          companion: {
            tokenId: result.tokenId,
            name: `${firstName} ${familyName}`.trim(),
            network: 'base',
            standard: 'ERC-8004',
            status: 'active',
            agentWallet: result.agentWallet,
            agentURI: metadataURI,
            txHash: result.txHash,
          },
          imagePath: imageResult?.path || null,
        };
      } catch (err) {
        console.error('[OpenClaw] Complete mint failed:', err);
        return { text: `Complete mint failed: ${err.message}` };
      }
    }

    case 'status': {
      // !mint status — show owned companions
      try {
        const { ethers } = await import('ethers');
        const { web3Service } = await import('./web3.service.js');
        const { CONFIG } = await import('../config/web3.config.js');

        const config = CONFIG.companionNFT_BASE;
        if (!config?.contractAddress) {
          return { text: 'BonzaiCompanions contract not configured.' };
        }

        const provider = await web3Service.getProvider();
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();

        const contract = new ethers.Contract(config.contractAddress, [
          'function balanceOf(address owner) view returns (uint256)',
          'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
          'function agentURI(uint256 tokenId) view returns (string)',
        ], provider);

        const balance = await contract.balanceOf(userAddress);
        if (balance === 0n) {
          return { text: `You don't own any BonzAI Companions. Use \`!bonzai mint bare\` or \`!bonzai mint companion <name>\` to mint one.` };
        }

        const companions = [];
        const count = Number(balance);
        for (let i = 0; i < Math.min(count, 10); i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
            const uri = await contract.agentURI(tokenId);

            // Try to fetch metadata to check status
            let status = 'unknown';
            try {
              const metaUrl = uri.startsWith('ipfs://') ? `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}` : uri;
              const resp = await fetch(metaUrl);
              const meta = await resp.json();
              status = meta?.bonzai?.status || (isBareCompanion(meta) ? 'pending_setup' : 'active');
            } catch { /* metadata fetch optional */ }

            companions.push(`- #${tokenId} — ${status}`);
          } catch { /* skip on error */ }
        }

        return {
          text: `**Your Companions** (${count} total)\n${companions.join('\n') || 'None found'}${count > 10 ? `\n...and ${count - 10} more` : ''}`,
        };
      } catch (err) {
        console.error('[OpenClaw] Mint status failed:', err);
        return { text: `Could not fetch companion status: ${err.message}` };
      }
    }

    case 'finalize': {
      // !mint finalize <tokenId>
      const tokenId = parseInt(args[1], 10);
      if (isNaN(tokenId)) {
        return { text: 'Usage: `!bonzai mint finalize <tokenId>` — e.g. `!bonzai mint finalize 42`' };
      }

      try {
        // Check if BonzAI Desktop is running
        let healthOk = false;
        try {
          const resp = await fetch('http://localhost:3002/health');
          const data = await resp.json();
          healthOk = data.ok === true;
        } catch { /* not running */ }

        if (!healthOk) {
          return { text: 'Finalization requires BonzAI Desktop for AI generation. Start the app and try again.' };
        }

        // Generate personality for finalization via LLM
        const { generateSpendingProfile } = await import('../skills/flagship.js');

        let personality = {};
        try {
          const llmResp = await window.electronAPI.sendPrompt({
            messages: [
              { role: 'system', content: 'You are a character designer. Return only valid JSON.' },
              { role: 'user', content: 'Create a unique AI companion character. Return a JSON object with: shortBio, personality, appearance, background, voiceStyle, firstMessage, gender (0/1/2). Only valid JSON, no markdown.' },
            ],
            max_tokens: 800,
            temperature: 0.9,
          });
          const text = llmResp?.response || llmResp?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) personality = JSON.parse(jsonMatch[0]);
        } catch (llmErr) {
          console.warn('[OpenClaw] LLM personality generation failed:', llmErr);
          personality = {
            shortBio: 'A unique BonzAI companion.',
            personality: 'Friendly, curious, and creative.',
            appearance: 'Stylish and approachable.',
            voiceStyle: 'warm and expressive',
            firstMessage: 'Hello! Nice to meet you!',
            gender: 0,
          };
        }

        const spendingHabits = generateSpendingProfile(personality);

        const result = await finalizeCompanion(tokenId, {
          ...personality,
          spendingHabits,
        }, {
          onProgress: (stage, message, percent) => {
            console.log(`[OpenClaw] Finalize #${tokenId}: [${stage}] ${message} (${percent}%)`);
          },
        });

        if (result.success) {
          return {
            text: `Companion **#${tokenId}** finalized! Your companion is now fully configured with personality, portrait, and voice.`,
            companion: {
              tokenId,
              network: 'base',
              standard: 'ERC-8004',
              status: 'active',
              agentWallet: result.agentWallet,
              agentURI: result.agentURI,
            },
          };
        } else {
          return { text: `Finalization failed for #${tokenId}: ${result.error || 'Unknown error'}` };
        }
      } catch (err) {
        console.error('[OpenClaw] Finalize failed:', err);
        return { text: `Finalization failed: ${err.message}` };
      }
    }

    default:
      return {
        text: `**Mint Commands**

\`!bonzai mint bare [gender]\` - Mint a bare companion (gender: female, male, neutral)
\`!bonzai mint companion <name>\` - Mint a complete companion (requires BonzAI Desktop)
\`!bonzai mint status\` - Check owned companions
\`!bonzai mint finalize <tokenId>\` - Finalize a bare companion (requires BonzAI Desktop)`,
      };
  }
}

/**
 * Handle all commands
 */
async function handleCommand(channelId, cmd, webhookData = {}) {
  const companions = await getCompanions();
  const scenarios = await getScenarios();
  const mapping = getChannelMapping(channelId);

  switch (cmd.command) {
    case 'network':
      return handleNetworkCommand(channelId, cmd.args);

    case 'generate':
    case 'gen':
      return handleGenerateCommand(channelId, cmd.args, webhookData);

    case 'skill':
    case 'skills':
      return handleSkillCommand(channelId, cmd.args);

    case 'autonomous':
    case 'auto':
      return handleAutonomousCommand(channelId, cmd.args);

    case 'mode': {
      const mode = cmd.args[0]?.toLowerCase();
      if (!['local', 'remote'].includes(mode)) {
        return {
          text: `**Current Mode:** ${networkSettings.mode}

\`!bonzai mode local\` - Use local BonzAI Desktop (free)
\`!bonzai mode remote\` - Use remote P2P providers (paid with USDC)`,
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
        const savedModel = preRoleplayModel || 'none';
        return {
          text: `**Current Model:** ${currentModel}
**Saved Model:** ${savedModel}

Usage:
- \`!bonzai model <model-name>\` - Load a specific LLM
- \`!bonzai model restore\` - Restore the model before companion chat

Available models:
- \`llama_3_1_8b\` - Llama 3.1 8B
- \`mistral_7b\` - Mistral 7B
- \`deepseek_r1_7b\` - DeepSeek R1 7B
- \`mythomax_13b\` - MythoMax 13B (roleplay)
- \`qwen_coder_32b\` - Qwen Coder 32B

Use \`!bonzai models\` for full list.`,
        };
      }

      // Handle restore command
      if (modelName.toLowerCase() === 'restore') {
        if (!preRoleplayModel) {
          return { text: 'No saved model to restore. Use companion chat first, then restore.' };
        }
        await restorePreRoleplayLLM();
        return { text: `**Model Restored:** ${networkSettings.currentModel ? MODEL_REQUIREMENTS[networkSettings.currentModel]?.name : 'default'}` };
      }

      // Normalize model name
      const normalizedModel = modelName.toLowerCase().replace(/-/g, '_');
      const modelKey = normalizedModel.startsWith('llm_') ? normalizedModel : `llm_${normalizedModel}`;

      // Check if model exists in requirements
      if (!MODEL_REQUIREMENTS[modelKey]) {
        return { text: `Model not found: ${modelName}\n\nUse \`!bonzai models\` to see available models.` };
      }

      // Load the model (also clears the saved pre-roleplay model)
      try {
        const loadResult = await window.electronAPI.loadModel(modelKey);
        if (loadResult.success) {
          networkSettings.currentModel = modelKey;
          preRoleplayModel = null; // Clear saved model since user explicitly chose a new one
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
      return { text: 'Usage: !bonzai companion list | !companion select <name>' };
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
      return { text: 'Usage: !bonzai scenario list | !scenario select <name>' };
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

Usage: !bonzai settings <audio|images|video|music> <on|off>
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
      // Restore the model that was loaded before companion chat
      await restorePreRoleplayLLM();
      return { text: 'Conversation history cleared and model restored.' };
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

    case 'mint':
      return handleMintCommand(channelId, cmd.args, webhookData);

    case 'help': {
      return {
        text: `**BonzAI Commands**
All commands use the \`!bonzai\` prefix (or \`/bonzai\` for Hermes).

**Mode**
\`!bonzai mode local\` - Use local BonzAI (free)
\`!bonzai mode remote\` - Use remote providers (paid with ETH)
\`!bonzai model <name>\` - Load specific LLM model

**Roleplay**
\`!bonzai companion list|select <name>\` - Manage companions
\`!bonzai scenario list|select <name>\` - Manage scenarios
\`!bonzai settings <option> <value>\` - Configure generation
\`!bonzai status\` - Show current session
\`!bonzai reset\` - Clear history

**Generation**
\`!bonzai generate image <prompt>\` - Fast image (FLUX Klein)
\`!bonzai generate image_quality <prompt>\` - Quality image (Z-Image Turbo)
\`!bonzai generate image_standard <prompt>\` - Standard image (SDXL)
\`!bonzai generate video <prompt>\` - Video (LTX-2)
\`!bonzai generate audio <text>\` - Fast TTS (Kokoro)
\`!bonzai generate audio_quality <text>\` - Quality TTS (Qwen)
\`!bonzai generate music <prompt>\` - Music (ACE-Step)
\`!bonzai generate vision\` - Image analysis (Qwen3-VL)

**Minting**
\`!bonzai mint bare [gender]\` - Mint a bare companion NFT
\`!bonzai mint companion <name>\` - Mint a complete companion
\`!bonzai mint status\` - Check mint status and owned companions
\`!bonzai mint finalize <tokenId>\` - Finalize a bare companion

**Autonomous**
\`!bonzai autonomous on|off\` - Toggle autonomous mode
\`!bonzai autonomous status\` - Current status & config
\`!bonzai autonomous config <setting> <value>\` - Configure (idle, interval, max)

**Skills**
\`!bonzai skill list [category]\` - List BonzAI skills
\`!bonzai skill info <id>\` - Show skill details
\`!bonzai skill run <id> [inputs]\` - Execute a skill

**Network (P2P)**
\`!bonzai network status\` - Show P2P status
\`!bonzai network providers [pipeline]\` - Find providers
\`!bonzai network use <peerId>\` - Select provider

\`!bonzai models\` - List LLM models
\`!bonzai help\` - Show this help`,
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
  const chatStartTime = Date.now();
  console.log(`[OpenClaw] Starting chat with ${companion.name} (audio: ${mapping.settings.enableAudio}, image: ${mapping.settings.enableImage}, video: ${mapping.settings.enableVideo})`);

  // Load MythoMax for roleplay (saves current model for later restoration)
  const llmLoaded = await loadRoleplayLLM();
  if (!llmLoaded) {
    console.warn('[OpenClaw] Could not load MythoMax, using current model');
  }

  let textResponse;
  try {
    const llmStart = Date.now();
    textResponse = await generateText(channelId, `${systemPrompt}\n\n${context}`);
    console.log(`[OpenClaw] LLM response in ${((Date.now() - llmStart) / 1000).toFixed(1)}s (using ${llmLoaded ? 'MythoMax' : 'current model'})`);
  } catch (error) {
    console.error(`[OpenClaw] LLM failed: ${error.message}`);
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

  // Build result with messages array for sequential delivery
  // Text message is sent first (order: 0), media follows (order: 1, 2, 3...)
  // This allows the OpenClaw gateway to send messages in proper order
  const result = {
    // Primary text message - should be sent immediately
    text: textResponse,
    companion: { id: companion.id, name: companion.name },
    scenario: scenario ? { id: scenario.id, name: scenario.name } : null,
    sessionKey,
    // Messages array for sequential delivery (new format)
    messages: [
      { type: 'text', content: textResponse, order: 0 },
    ],
  };

  // Run media generation in PARALLEL for faster response times
  // Media messages are added to the messages array with order > 0
  const mediaPromises = [];
  let mediaOrder = 1;

  // Generate audio if enabled (order: 1)
  if (mapping.settings.enableAudio) {
    const audioOrder = mediaOrder++;
    const voice = companion.gender === 'female' ? 'af_heart' : 'am_adam';
    mediaPromises.push(
      generateAudio(channelId, textResponse, { voice })
        .then(audioResult => {
          const audioPath = audioResult?.audio_path_mp3 || audioResult?.audio_path;
          if (audioPath) {
            result.audioPath = audioPath;
            assistantMessage.audio = audioPath;
            result.messages.push({ type: 'audio', path: audioPath, order: audioOrder });
            console.log(`[OpenClaw] Chat audio saved: ${audioPath}`);
          }
        })
        .catch(err => console.error('[OpenClaw] Audio generation failed:', err.message))
    );
  }

  // Generate image if enabled (order: 2)
  if (mapping.settings.enableImage) {
    const imageOrder = mediaOrder++;
    const imagePrompt = `${companion.imagePromptBase || companion.appearance}, ${emotion} expression, ${scenario?.imagePromptBase || ''}, high quality`;
    mediaPromises.push(
      generateImage(channelId, imagePrompt)
        .then(async imageResult => {
          const imageData = imageResult?.image || imageResult?.image_base64;
          if (imageData) {
            const imagePath = await saveBase64ImageToFile(imageData, 'chat');
            if (imagePath) {
              result.imagePath = imagePath;
              result.messages.push({ type: 'image', path: imagePath, order: imageOrder });
              console.log(`[OpenClaw] Chat image saved to: ${imagePath}`);
            } else {
              result.imageBase64 = imageData;
              result.messages.push({ type: 'image', base64: imageData, order: imageOrder });
            }
            assistantMessage.image = imageData;
            session.sceneState.lastImageAt = session.history.length - 1;
          }
        })
        .catch(err => console.error('[OpenClaw] Image generation failed:', err.message))
    );
  }

  // Generate video if enabled (order: 3, less frequent - every 5 messages)
  if (mapping.settings.enableVideo && session.history.length % 5 === 0) {
    const videoOrder = mediaOrder++;
    const videoPrompt = `${companion.appearance}, ${emotion}, ${scenario?.setting || ''}, cinematic`;
    mediaPromises.push(
      generateVideo(channelId, videoPrompt)
        .then(videoResult => {
          if (videoResult?.video_path) {
            result.videoPath = videoResult.video_path;
            assistantMessage.video = videoResult.video_path;
            result.messages.push({ type: 'video', path: videoResult.video_path, order: videoOrder });
            console.log(`[OpenClaw] Chat video saved: ${videoResult.video_path}`);
          }
        })
        .catch(err => console.error('[OpenClaw] Video generation failed:', err.message))
    );
  }

  // Wait for all media generation to complete in parallel
  if (mediaPromises.length > 0) {
    const mediaStart = Date.now();
    console.log(`[OpenClaw] Running ${mediaPromises.length} media generation(s) in parallel...`);
    await Promise.all(mediaPromises);
    console.log(`[OpenClaw] All media generation complete in ${((Date.now() - mediaStart) / 1000).toFixed(1)}s`);
  }

  // Sort messages by order for proper delivery sequence
  result.messages.sort((a, b) => a.order - b.order);

  // Persist
  await saveSessions();
  await saveChannelMappings();

  const totalTime = ((Date.now() - chatStartTime) / 1000).toFixed(1);
  console.log(`[OpenClaw] Chat complete in ${totalTime}s (text: ${result.text?.length || 0} chars, messages: ${result.messages.length})`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleWebhook(data) {
  const { channelId, message, platform, imageBase64 } = data;
  console.log(`[OpenClaw] ${platform}/${channelId}: ${message}`);

  try {
    // Check for commands
    const cmd = parseCommand(message);
    if (cmd) {
      const cmdResult = await handleCommand(channelId, cmd, { imageBase64 });
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
