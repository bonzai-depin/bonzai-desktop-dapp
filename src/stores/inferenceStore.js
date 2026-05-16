/**
 * BonzAI — Unified Inference Store
 * Tracks all generation results (chat, image, video, audio, game, robotic)
 * with persistence to Electron store and optional NFT minting capability
 */

import { shallowReactive, readonly, computed } from 'vue';
import { v4 as uuid } from 'uuid';

/**
 * @typedef {Object} HardwareSpecs
 * @property {string} cpu - CPU model name
 * @property {number} cpuCores - Number of CPU cores
 * @property {number} cpuThreads - Number of CPU threads
 * @property {number} cpuSpeed - CPU speed in GHz
 * @property {string} gpu - GPU model name
 * @property {number} ram - Total RAM in GB
 * @property {number} memBudget - Available memory budget in GB
 * @property {number} vram - Available VRAM in GB
 * @property {string} os - Operating system name
 * @property {string} arch - CPU architecture
 * @property {string} platform - Platform identifier
 */

/**
 * @typedef {Object} InferenceMetadata
 * @property {string} [model] - Model identifier used for generation
 * @property {number} [tokensUsed] - Number of tokens consumed
 * @property {number|null} [tokensPerSecond] - Generation speed
 * @property {number|null} [elapsed] - Elapsed time in milliseconds
 * @property {string} [source] - Inference source ("bonzai" | provider ID)
 * @property {'local'|'remote'|'private'} [networkMode] - Network mode used
 * @property {string} [pipeline] - Pipeline name (for image/audio/video)
 * @property {number} [width] - Output width (images/video)
 * @property {number} [height] - Output height (images/video)
 * @property {number} [steps] - Inference steps (images)
 * @property {string} [image_path] - Local file path for saved images
 */

/**
 * @typedef {Object} InferenceRecord
 * @property {string} id - Unique record ID (UUID)
 * @property {string} type - Content type ("text"|"image"|"video"|"audio"|"object")
 * @property {number} timestamp - Unix timestamp in milliseconds
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} question - Input prompt
 * @property {Object} answer - Output data (structure varies by type)
 * @property {Object|null} nft - NFT minting data if minted
 * @property {HardwareSpecs|null} hardware - Hardware snapshot at generation time
 */

const STORE_KEYS = {
  textInferences: 'unifiedTextInferences',
  imageInferences: 'unifiedImageInferences',
  videoInferences: 'unifiedVideoInferences',
  audioInferences: 'unifiedAudioInferences',
  objectInferences: 'unifiedObjectInferences',
};

// Cached hardware snapshot — fetched once, attached to every generation
let _hardwareSpecs = null;

const getHardwareSpecs = async () => {
  if (_hardwareSpecs) return _hardwareSpecs;
  try {
    const info = await window.electronAPI?.systemInformation();
    if (info) {
      _hardwareSpecs = {
        cpu: info.cpu || 'Unknown',
        cpuCores: info.cpuCores || 0,
        cpuThreads: info.cpuThreads || 0,
        cpuSpeed: info.cpuSpeed || 0,
        gpu: info.gpu || 'Unknown',
        ram: info.ram || 0,
        memBudget: info.memBudget || 0,
        vram: info.vram || 0,
        os: info.os || 'Unknown',
        arch: info.arch || 'Unknown',
        platform: info.platform || 'Unknown',
      };
    }
  } catch (e) {
    console.warn('[InferenceStore] Failed to fetch hardware specs:', e);
  }
  return _hardwareSpecs;
};

const state = shallowReactive({
  textInferences: [],
  imageInferences: [],
  videoInferences: [],
  audioInferences: [],
  objectInferences: [],

  // Aggregated stats
  totalInferences: 0,
  lastSyncTime: null,
});

/**
 * Get the electron store API if available
 */
const getStore = () => window.electronAPI?.store;

// Reverse lookup: store key → state key
const STORE_TO_STATE = Object.fromEntries(
  Object.entries(STORE_KEYS).map(([stateKey, storeKey]) => [storeKey, stateKey])
);

/**
 * Save a specific store key to persistence
 * @param {string} storeKey - The Electron Store key (e.g. 'unifiedTextInferences')
 */
const persist = async (storeKey) => {
  const store = getStore();
  if (!store?.set) return false;

  const stateKey = STORE_TO_STATE[storeKey] || storeKey;
  try {
    // Deep clone via JSON to strip Vue reactivity proxies and ensure serializability
    // This is required because Electron IPC uses structured clone which can't handle proxies
    const safeData = structuredClone(state[stateKey]);
    await store.set(storeKey, safeData);
    state.lastSyncTime = Date.now();
    return true;
  } catch (e) {
    console.error(`[InferenceStore] Failed to persist ${storeKey}:`, e);
    return false;
  }
};

/**
 * Load a specific store key from persistence
 * @param {string} storeKey - The Electron Store key (e.g. 'unifiedTextInferences')
 */
const load = async (storeKey) => {
  const store = getStore();
  if (!store?.get) return [];

  try {
    const data = await store.get(storeKey, []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`[InferenceStore] Failed to load ${storeKey}:`, e);
    return [];
  }
};

/**
 * Create a standardized inference record
 */
const createInferenceRecord = (type, data) => ({
  id: uuid(),
  type,
  timestamp: Date.now(),
  createdAt: new Date().toISOString(),
  nft: null, // Will be populated if minted
  zkProof: null, // Will be populated if ZK privacy enabled
  peerId: null, // Will be populated if offloaded to peer
  ...data,
});

// ==================== Public API ====================

/**
 * Initialize the store by loading all persisted data
 */
export const initializeStore = async () => {
  for (const [stateKey, storeKey] of Object.entries(STORE_KEYS)) {
    state[stateKey] = await load(storeKey);
  }
  
  state.totalInferences =
    state.textInferences.length +
    state.imageInferences.length +
    state.videoInferences.length +
    state.audioInferences.length +
    state.objectInferences.length;
    
};

// ==================== Text/Chat Inferences ====================

// Format matches GenerativeText.vue component expectations:
// { id, question, answer: { text, id }, ...metadata }
/**
 * @param {string} question - User prompt
 * @param {string} answerText - LLM response text
 * @param {InferenceMetadata} [metadata] - Generation metadata
 * @returns {Promise<InferenceRecord>}
 */
export const addTextInference = async (question, answerText, metadata = {}) => {
  const recordId = uuid();
  const hardware = await getHardwareSpecs();
  const record = {
    id: recordId,
    question,
    answer: {
      text: answerText,
      id: recordId,
    },
    type: 'text',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    model: metadata.model || 'unknown',
    tokensUsed: metadata.tokensUsed || 0,
    tokensPerSecond: metadata.tokensPerSecond || null,
    elapsed: metadata.elapsed || null,
    source: metadata.source || 'bonzai',
    networkMode: metadata.networkMode || 'local', // 'local' | 'remote' | 'private'
    hardware: hardware || null,
  };

  state.textInferences = [...state.textInferences, record];
  state.totalInferences++;
  _mergedVersion++;
  await persist(STORE_KEYS.textInferences);
  return record;
};

export const loadTextInferences = async () => {
  state.textInferences = await load(STORE_KEYS.textInferences);
  return state.textInferences;
};

// ==================== Image Inferences ====================
// Format matches GenerativeImage.vue component expectations:
// { id, question, answer: { status, data: { image, image_path } }, ...metadata }

/**
 * @param {string} prompt - Image generation prompt
 * @param {string} imageData - Base64-encoded image data
 * @param {InferenceMetadata} [metadata] - Generation metadata
 * @returns {Promise<InferenceRecord>}
 */
export const addImageInference = async (prompt, imageData, metadata = {}) => {
  const hardware = await getHardwareSpecs();
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        image: imageData,
        image_path: metadata.image_path || null,
      },
    },
    type: 'image',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'unknown',
    width: metadata.width,
    height: metadata.height,
    steps: metadata.steps,
    elapsed: metadata.elapsed || null,
    source: metadata.source || 'bonzai',
    networkMode: metadata.networkMode || 'local',
    hardware: hardware || null,
  };

  state.imageInferences = [...state.imageInferences, record];
  state.totalInferences++;
  _mergedVersion++;
  await persist(STORE_KEYS.imageInferences);
  return record;
};

export const loadImageInferences = async () => {
  state.imageInferences = await load(STORE_KEYS.imageInferences);
  return state.imageInferences;
};

// ==================== Video Inferences ====================
// Format matches GenerativeVideo.vue component expectations:
// { id, question, answer: { status, data: { video_path } }, ...metadata }

/**
 * @param {string} prompt - Video generation prompt
 * @param {string} videoPath - Local file path to generated video
 * @param {InferenceMetadata & {duration?: number, fps?: number}} [metadata] - Generation metadata
 * @returns {Promise<InferenceRecord>}
 */
export const addVideoInference = async (prompt, videoPath, metadata = {}) => {
  const hardware = await getHardwareSpecs();
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        video_path: videoPath,
      },
    },
    type: 'video',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'unknown',
    duration: metadata.duration,
    fps: metadata.fps,
    width: metadata.width,
    height: metadata.height,
    elapsed: metadata.elapsed || null,
    source: metadata.source || 'bonzai',
    networkMode: metadata.networkMode || 'local',
    hardware: hardware || null,
  };

  state.videoInferences = [...state.videoInferences, record];
  state.totalInferences++;
  _mergedVersion++;
  await persist(STORE_KEYS.videoInferences);
  return record;
};

export const loadVideoInferences = async () => {
  state.videoInferences = await load(STORE_KEYS.videoInferences);
  return state.videoInferences;
};

// ==================== Audio Inferences ====================
// Format matches GenerativeAudio.vue component expectations:
// { id, question, answer: { status, data: { audio_path } }, ...metadata }

/**
 * @param {string} prompt - Audio generation prompt
 * @param {string} audioPath - Local file path to generated audio
 * @param {InferenceMetadata & {duration?: number, sampleRate?: number}} [metadata] - Generation metadata
 * @returns {Promise<InferenceRecord>}
 */
export const addAudioInference = async (prompt, audioPath, metadata = {}) => {
  const hardware = await getHardwareSpecs();
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        audio_path: audioPath,
      },
    },
    type: 'audio',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'vibevoice',
    duration: metadata.duration,
    sampleRate: metadata.sampleRate,
    elapsed: metadata.elapsed || null,
    source: metadata.source || 'bonzai',
    networkMode: metadata.networkMode || 'local',
    hardware: hardware || null,
  };

  state.audioInferences = [...state.audioInferences, record];
  state.totalInferences++;
  _mergedVersion++;
  await persist(STORE_KEYS.audioInferences);
  return record;
};

export const loadAudioInferences = async () => {
  state.audioInferences = await load(STORE_KEYS.audioInferences);
  return state.audioInferences;
};

// ==================== 3D Object Inferences ====================

/**
 * @param {string} prompt - 3D generation prompt
 * @param {string} code - Generated Three.js code
 * @param {InferenceMetadata & {mode?: string}} [metadata] - Generation metadata
 * @returns {Promise<InferenceRecord>}
 */
export const addObjectInference = async (prompt, code, metadata = {}) => {
  const hardware = await getHardwareSpecs();
  const record = createInferenceRecord('object', {
    prompt: String(prompt || ''),
    hardware: hardware || null,
    code: String(code || ''),
    mode: String(metadata.mode || 'normal'),
    model: metadata.model ? String(metadata.model) : undefined,
    screenshots: Array.isArray(metadata.screenshots) ? metadata.screenshots : [],
    thumbnail: metadata.thumbnail ? String(metadata.thumbnail) : undefined,
    visionVerified: Boolean(metadata.visionVerified),
    success: Boolean(metadata.success ?? true),
    title: metadata.title ? String(metadata.title) : undefined,
    notes: metadata.notes ? String(metadata.notes) : undefined,
    blueprint: metadata.blueprint ? String(metadata.blueprint) : undefined,
    tokensPerSecond: metadata.tokensPerSecond ? String(metadata.tokensPerSecond) : undefined,
  });

  // Deep clone to ensure serializability before storing
  try {
    const safeRecord = structuredClone(record);
    state.objectInferences = [...state.objectInferences, safeRecord];
    state.totalInferences++;
    _mergedVersion++;
    await persist(STORE_KEYS.objectInferences);
    return safeRecord;
  } catch (e) {
    console.error('[InferenceStore] Failed to serialize record:', e);
    const minimalRecord = {
      id: record.id,
      type: 'object',
      timestamp: record.timestamp,
      createdAt: record.createdAt,
      prompt: String(prompt || ''),
      code: String(code || ''),
      mode: String(metadata.mode || 'normal'),
      success: Boolean(metadata.success ?? true),
      screenshots: [],
      thumbnail: metadata.thumbnail ? String(metadata.thumbnail) : undefined,
    };
    state.objectInferences = [...state.objectInferences, minimalRecord];
    state.totalInferences++;
    _mergedVersion++;
    await persist(STORE_KEYS.objectInferences);
    return minimalRecord;
  }
};

export const loadObjectInferences = async () => {
  state.objectInferences = await load(STORE_KEYS.objectInferences);
  return state.objectInferences;
};

export const removeObjectInference = async (index) => {
  if (index < 0 || index >= state.objectInferences.length) return false;
  state.objectInferences = state.objectInferences.filter((_, i) => i !== index);
  state.totalInferences--;
  _mergedVersion++;
  await persist(STORE_KEYS.objectInferences);
  return true;
};

export const clearObjectInferences = async () => {
  const count = state.objectInferences.length;
  state.objectInferences = [];
  state.totalInferences -= count;
  _mergedVersion++;
  await persist(STORE_KEYS.objectInferences);
};

// ==================== NFT Minting Support ====================

/**
 * Mark an inference as having been minted as an NFT
 * @param {'text'|'image'|'video'|'audio'|'object'} type - Inference type
 * @param {string} inferenceId - UUID of the inference record
 * @param {Object} nftData - NFT minting result
 * @param {string|number} nftData.tokenId - On-chain token ID
 * @param {string} nftData.contractAddress - NFT contract address
 * @param {string} nftData.transactionHash - Minting transaction hash
 * @param {number} [nftData.chainId] - Chain ID (default: 8453 Base)
 * @param {string} [nftData.explorerUrl] - Block explorer URL
 * @returns {Promise<boolean>} True if inference was found and updated
 */
export const markAsMinted = async (type, inferenceId, nftData) => {
  const storeKey = STORE_KEYS[`${type}Inferences`] || STORE_KEYS[`${type}Datasets`];
  const stateKey = `${type}Inferences` in state ? `${type}Inferences` : `${type}Datasets`;
  
  const items = state[stateKey];
  const item = items.find(i => i.id === inferenceId);
  
  if (item) {
    item.nft = {
      tokenId: nftData.tokenId,
      contractAddress: nftData.contractAddress,
      transactionHash: nftData.transactionHash,
      mintedAt: Date.now(),
      chainId: nftData.chainId || 8453, // Base
      explorerUrl: nftData.explorerUrl,
    };
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== Removal ====================

export const removeInference = async (type, inferenceId) => {
  const storeKey = STORE_KEYS[`${type}Inferences`] || STORE_KEYS[`${type}Datasets`];
  const stateKey = `${type}Inferences` in state ? `${type}Inferences` : `${type}Datasets`;
  
  const items = state[stateKey];
  const index = items.findIndex(i => i.id === inferenceId);

  if (index !== -1) {
    state[stateKey] = items.filter((_, i) => i !== index);
    state.totalInferences--;
    _mergedVersion++;
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== Computed & Readonly State ====================

let _mergedCache = [];
let _mergedVersion = 0;
let _lastMergedVersion = -1;

const _inferenceCount = computed(() =>
  state.textInferences.length +
  state.imageInferences.length +
  state.videoInferences.length +
  state.audioInferences.length
);

export const allInferences = computed(() => {
  void _inferenceCount.value;
  if (_mergedVersion === _lastMergedVersion) return _mergedCache;
  _lastMergedVersion = _mergedVersion;
  _mergedCache = state.textInferences
    .concat(state.imageInferences, state.videoInferences, state.audioInferences);
  _mergedCache.sort((a, b) => b.timestamp - a.timestamp);
  return _mergedCache;
});

export const mintedInferences = computed(() =>
  allInferences.value.filter(i => i.nft !== null)
);

/**
 * Compute average performance stats per content type from stored inferences.
 * Returns { text: { count, avgTokPerSec }, image: { count, avgElapsed }, ... }
 */
export const getPerformanceStats = () => {
  const stats = {
    text: { count: 0, totalTokPerSec: 0, avgTokPerSec: 0 },
    image: { count: 0, totalElapsed: 0, avgElapsed: 0 },
    video: { count: 0, totalElapsed: 0, avgElapsed: 0 },
    audio: { count: 0, totalElapsed: 0, avgElapsed: 0 },
    audioTts: { count: 0, totalElapsed: 0, avgElapsed: 0 },
    audioMusic: { count: 0, totalElapsed: 0, avgElapsed: 0 },
    object: { count: 0, totalTokPerSec: 0, avgTokPerSec: 0 },
  };

  for (const inf of state.textInferences) {
    if (inf.tokensPerSecond || inf.tokPerSec) {
      const tps = parseFloat(inf.tokensPerSecond || inf.tokPerSec);
      if (tps > 0) { stats.text.count++; stats.text.totalTokPerSec += tps; }
    }
  }
  if (stats.text.count > 0) stats.text.avgTokPerSec = stats.text.totalTokPerSec / stats.text.count;

  for (const inf of state.imageInferences) {
    if (inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) { stats.image.count++; stats.image.totalElapsed += e; }
    }
  }
  if (stats.image.count > 0) stats.image.avgElapsed = stats.image.totalElapsed / stats.image.count;

  for (const inf of state.videoInferences) {
    if (inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) { stats.video.count++; stats.video.totalElapsed += e; }
    }
  }
  if (stats.video.count > 0) stats.video.avgElapsed = stats.video.totalElapsed / stats.video.count;

  for (const inf of state.audioInferences) {
    if (inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) {
        stats.audio.count++; stats.audio.totalElapsed += e;
        if (inf.pipeline === 'music') {
          stats.audioMusic.count++; stats.audioMusic.totalElapsed += e;
        } else {
          stats.audioTts.count++; stats.audioTts.totalElapsed += e;
        }
      }
    }
  }
  if (stats.audio.count > 0) stats.audio.avgElapsed = stats.audio.totalElapsed / stats.audio.count;
  if (stats.audioTts.count > 0) stats.audioTts.avgElapsed = stats.audioTts.totalElapsed / stats.audioTts.count;
  if (stats.audioMusic.count > 0) stats.audioMusic.avgElapsed = stats.audioMusic.totalElapsed / stats.audioMusic.count;

  for (const inf of state.objectInferences) {
    if (inf.tokensPerSecond) {
      const tps = parseFloat(inf.tokensPerSecond);
      if (tps > 0) { stats.object.count++; stats.object.totalTokPerSec += tps; }
    }
  }
  if (stats.object.count > 0) stats.object.avgTokPerSec = stats.object.totalTokPerSec / stats.object.count;

  return stats;
};

/**
 * Get performance stats grouped by peerId (for provider comparison).
 * Returns { [peerId]: { text: {...}, image: {...}, ... } }
 */
export const getProviderPerformanceStats = () => {
  const providers = {};
  const allRecords = [
    ...state.textInferences,
    ...state.imageInferences,
    ...state.videoInferences,
    ...state.audioInferences,
  ];

  for (const inf of allRecords) {
    if (!inf.peerId) continue;
    if (!providers[inf.peerId]) {
      providers[inf.peerId] = {
        peerId: inf.peerId,
        hardware: inf.hardware || null,
        totalGenerations: 0,
        text: { count: 0, totalTokPerSec: 0, avgTokPerSec: 0 },
        image: { count: 0, totalElapsed: 0, avgElapsed: 0 },
        video: { count: 0, totalElapsed: 0, avgElapsed: 0 },
        audio: { count: 0, totalElapsed: 0, avgElapsed: 0 },
      };
    }
    const p = providers[inf.peerId];
    p.totalGenerations++;

    if (inf.type === 'text' && (inf.tokensPerSecond || inf.tokPerSec)) {
      const tps = parseFloat(inf.tokensPerSecond || inf.tokPerSec);
      if (tps > 0) { p.text.count++; p.text.totalTokPerSec += tps; }
    } else if (inf.type === 'image' && inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) { p.image.count++; p.image.totalElapsed += e; }
    } else if (inf.type === 'video' && inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) { p.video.count++; p.video.totalElapsed += e; }
    } else if (inf.type === 'audio' && inf.elapsed) {
      const e = parseFloat(inf.elapsed);
      if (e > 0) { p.audio.count++; p.audio.totalElapsed += e; }
    }
  }

  for (const p of Object.values(providers)) {
    if (p.text.count > 0) p.text.avgTokPerSec = p.text.totalTokPerSec / p.text.count;
    if (p.image.count > 0) p.image.avgElapsed = p.image.totalElapsed / p.image.count;
    if (p.video.count > 0) p.video.avgElapsed = p.video.totalElapsed / p.video.count;
    if (p.audio.count > 0) p.audio.avgElapsed = p.audio.totalElapsed / p.audio.count;
  }

  return providers;
};

export { getHardwareSpecs };

export const inferenceStore = {
  state: readonly(state),

  // Initialization
  initializeStore,

  // Text
  addTextInference,
  loadTextInferences,

  // Image
  addImageInference,
  loadImageInferences,

  // Video
  addVideoInference,
  loadVideoInferences,

  // Audio
  addAudioInference,
  loadAudioInferences,

  // 3D Object
  addObjectInference,
  loadObjectInferences,
  removeObjectInference,
  clearObjectInferences,

  // NFT
  markAsMinted,

  // Removal
  removeInference,

  // Computed
  allInferences,
  mintedInferences,

  // Performance
  getPerformanceStats,
  getProviderPerformanceStats,
  getHardwareSpecs,
};

export default inferenceStore;
