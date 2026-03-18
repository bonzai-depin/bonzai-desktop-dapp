/**
 * BonzAI — Unified Inference Store
 * Tracks all generation results (chat, image, video, audio, game, robotic)
 * with persistence to Electron store and optional NFT minting capability
 */

import { shallowReactive, readonly, computed } from 'vue';
import { v4 as uuid } from 'uuid';

const STORE_KEYS = {
  textInferences: 'textInferences',
  imageInferences: 'imageInferences',
  videoInferences: 'videoInferences',
  audioInferences: 'audioInferences',
  objectInferences: 'objectInferences',
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

/**
 * Save a specific store key to persistence
 */
const persist = async (key) => {
  const store = getStore();
  if (!store?.set) return false;

  try {
    // Deep clone via JSON to strip Vue reactivity proxies and ensure serializability
    // This is required because Electron IPC uses structured clone which can't handle proxies
    const safeData = structuredClone(state[key]);
    await store.set(key, safeData);
    state.lastSyncTime = Date.now();
    return true;
  } catch (e) {
    console.error(`[InferenceStore] Failed to persist ${key}:`, e);
    return false;
  }
};

/**
 * Load a specific store key from persistence
 */
const load = async (key) => {
  const store = getStore();
  if (!store?.get) return [];
  
  try {
    const data = await store.get(key, []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`[InferenceStore] Failed to load ${key}:`, e);
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
    
  console.log(`[InferenceStore] Initialized with ${state.totalInferences} total inferences`);
};

// ==================== Text/Chat Inferences ====================

// Format matches GenerativeText.vue component expectations:
// { id, question, answer: { text, id }, ...metadata }
export const addTextInference = async (question, answerText, metadata = {}) => {
  const recordId = uuid();
  // Use component-compatible format
  const record = {
    id: recordId,
    question,
    answer: {
      text: answerText,
      id: recordId,
    },
    // Additional metadata
    type: 'text',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    model: metadata.model || 'unknown',
    tokensUsed: metadata.tokensUsed || 0,
    source: metadata.source || 'bonzai',
  };

  state.textInferences.push(record);
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

export const addImageInference = async (prompt, imageData, metadata = {}) => {
  // Use component-compatible format
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        image: imageData, // base64 encoded
        image_path: metadata.image_path || null, // file path if saved
      },
    },
    // Additional metadata
    type: 'image',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'unknown',
    width: metadata.width,
    height: metadata.height,
    steps: metadata.steps,
    source: metadata.source || 'bonzai',
  };

  state.imageInferences.push(record);
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

export const addVideoInference = async (prompt, videoPath, metadata = {}) => {
  // Use component-compatible format
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        video_path: videoPath,
      },
    },
    // Additional metadata
    type: 'video',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'unknown',
    duration: metadata.duration,
    fps: metadata.fps,
    width: metadata.width,
    height: metadata.height,
    source: metadata.source || 'bonzai',
  };

  state.videoInferences.push(record);
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

export const addAudioInference = async (prompt, audioPath, metadata = {}) => {
  // Use component-compatible format
  const record = {
    id: uuid(),
    question: prompt,
    answer: {
      status: 200,
      data: {
        audio_path: audioPath,
      },
    },
    // Additional metadata
    type: 'audio',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    pipeline: metadata.pipeline || 'vibevoice',
    duration: metadata.duration,
    sampleRate: metadata.sampleRate,
    source: metadata.source || 'bonzai',
  };

  state.audioInferences.push(record);
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

export const addObjectInference = async (prompt, code, metadata = {}) => {
  // Create record with explicit fields to avoid non-serializable data
  const record = createInferenceRecord('object', {
    prompt: String(prompt || ''),
    code: String(code || ''),
    mode: String(metadata.mode || 'normal'),
    model: metadata.model ? String(metadata.model) : undefined,
    screenshots: Array.isArray(metadata.screenshots) ? metadata.screenshots : [],
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
    state.objectInferences.push(safeRecord);
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
    };
    state.objectInferences.push(minimalRecord);
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
  state.objectInferences.splice(index, 1);
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
    items.splice(index, 1);
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
};

export default inferenceStore;
