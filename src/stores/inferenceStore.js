/**
 * BonzAI — Unified Inference Store
 * Tracks all generation results (chat, image, video, audio, game, robotic)
 * with persistence to Electron store and optional NFT minting capability
 */

import { reactive, readonly, computed } from 'vue';
import { v4 as uuid } from 'uuid';

const STORE_KEYS = {
  textInferences: 'textInferences',
  imageInferences: 'imageInferences',
  videoInferences: 'videoInferences',
  audioInferences: 'audioInferences',
  objectInferences: 'objectInferences',
  gameInferences: 'gameInferences',
  roboticDatasets: 'roboticDatasets',
};

const state = reactive({
  textInferences: [],
  imageInferences: [],
  videoInferences: [],
  audioInferences: [],
  objectInferences: [],
  gameInferences: [],
  roboticDatasets: [],

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
    await store.set(key, [...state[key]]);
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
    state.objectInferences.length +
    state.gameInferences.length +
    state.roboticDatasets.length;
    
  console.log(`[InferenceStore] Initialized with ${state.totalInferences} total inferences`);
};

// ==================== Text/Chat Inferences ====================

export const addTextInference = async (question, answer, metadata = {}) => {
  const record = createInferenceRecord('text', {
    question,
    answer,
    model: metadata.model || 'unknown',
    tokensUsed: metadata.tokensUsed || 0,
    ...metadata,
  });
  
  state.textInferences.push(record);
  state.totalInferences++;
  await persist(STORE_KEYS.textInferences);
  return record;
};

export const loadTextInferences = async () => {
  state.textInferences = await load(STORE_KEYS.textInferences);
  return state.textInferences;
};

// ==================== Image Inferences ====================

export const addImageInference = async (prompt, imageData, metadata = {}) => {
  const record = createInferenceRecord('image', {
    prompt,
    imageData, // base64 encoded
    pipeline: metadata.pipeline || 'unknown',
    width: metadata.width,
    height: metadata.height,
    steps: metadata.steps,
    ...metadata,
  });
  
  state.imageInferences.push(record);
  state.totalInferences++;
  await persist(STORE_KEYS.imageInferences);
  return record;
};

export const loadImageInferences = async () => {
  state.imageInferences = await load(STORE_KEYS.imageInferences);
  return state.imageInferences;
};

// ==================== Video Inferences ====================

export const addVideoInference = async (prompt, videoPath, metadata = {}) => {
  const record = createInferenceRecord('video', {
    prompt,
    videoPath,
    pipeline: metadata.pipeline || 'unknown',
    duration: metadata.duration,
    fps: metadata.fps,
    width: metadata.width,
    height: metadata.height,
    ...metadata,
  });
  
  state.videoInferences.push(record);
  state.totalInferences++;
  await persist(STORE_KEYS.videoInferences);
  return record;
};

export const loadVideoInferences = async () => {
  state.videoInferences = await load(STORE_KEYS.videoInferences);
  return state.videoInferences;
};

// ==================== Audio Inferences ====================

export const addAudioInference = async (prompt, audioPath, metadata = {}) => {
  const record = createInferenceRecord('audio', {
    prompt,
    audioPath,
    pipeline: metadata.pipeline || 'vibevoice',
    duration: metadata.duration,
    sampleRate: metadata.sampleRate,
    ...metadata,
  });
  
  state.audioInferences.push(record);
  state.totalInferences++;
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
    screenshots: Array.isArray(metadata.screenshots) ? metadata.screenshots : [],
    visionVerified: Boolean(metadata.visionVerified),
    success: Boolean(metadata.success ?? true),
    title: metadata.title ? String(metadata.title) : undefined,
    notes: metadata.notes ? String(metadata.notes) : undefined,
  });

  // Deep clone to ensure serializability before storing
  try {
    const safeRecord = JSON.parse(JSON.stringify(record));
    state.objectInferences.push(safeRecord);
    state.totalInferences++;
    await persist(STORE_KEYS.objectInferences);
    return safeRecord;
  } catch (e) {
    console.error('[InferenceStore] Failed to serialize record:', e);
    // Fallback: store minimal record
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
  await persist(STORE_KEYS.objectInferences);
  return true;
};

export const clearObjectInferences = async () => {
  const count = state.objectInferences.length;
  state.objectInferences = [];
  state.totalInferences -= count;
  await persist(STORE_KEYS.objectInferences);
};

// ==================== Game Inferences ====================

export const addGameInference = async (prompt, code, metadata = {}) => {
  const record = createInferenceRecord('game', {
    prompt,
    code,
    renderMode: metadata.renderMode || '3d',
    sceneMode: metadata.sceneMode || 'replace',
    title: metadata.title,
    success: metadata.success ?? true,
    ...metadata,
  });
  
  state.gameInferences.push(record);
  state.totalInferences++;
  await persist(STORE_KEYS.gameInferences);
  return record;
};

export const loadGameInferences = async () => {
  state.gameInferences = await load(STORE_KEYS.gameInferences);
  return state.gameInferences;
};

// ==================== Robotic Datasets ====================

export const addRoboticDataset = async (datasetInfo) => {
  const record = createInferenceRecord('robotic', {
    name: datasetInfo.name || `dataset_${Date.now()}`,
    robot: datasetInfo.robot,
    task: datasetInfo.task,
    architecture: datasetInfo.architecture,
    numEpisodes: datasetInfo.numEpisodes || 0,
    totalFrames: datasetInfo.totalFrames || 0,
    finalLoss: datasetInfo.finalLoss,
    successRate: datasetInfo.successRate,
    modelPath: datasetInfo.modelPath,
    ...datasetInfo,
  });
  
  state.roboticDatasets.push(record);
  state.totalInferences++;
  await persist(STORE_KEYS.roboticDatasets);
  return record;
};

export const loadRoboticDatasets = async () => {
  state.roboticDatasets = await load(STORE_KEYS.roboticDatasets);
  return state.roboticDatasets;
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
      chainId: nftData.chainId || 42161, // Arbitrum
      explorerUrl: nftData.explorerUrl,
    };
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== ZK Privacy Support ====================

/**
 * Mark an inference as having ZK privacy proof
 */
export const markWithZKProof = async (type, inferenceId, zkProofData) => {
  const storeKey = STORE_KEYS[`${type}Inferences`] || STORE_KEYS[`${type}Datasets`];
  const stateKey = `${type}Inferences` in state ? `${type}Inferences` : `${type}Datasets`;
  
  const items = state[stateKey];
  const item = items.find(i => i.id === inferenceId);
  
  if (item) {
    item.zkProof = {
      proofHash: zkProofData.proofHash,
      verificationKey: zkProofData.verificationKey,
      generatedAt: Date.now(),
      proverType: zkProofData.proverType || 'sp1',
    };
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== Peer Offloading Support ====================

/**
 * Mark an inference as having been offloaded to a peer
 */
export const markAsPeerOffloaded = async (type, inferenceId, peerData) => {
  const storeKey = STORE_KEYS[`${type}Inferences`] || STORE_KEYS[`${type}Datasets`];
  const stateKey = `${type}Inferences` in state ? `${type}Inferences` : `${type}Datasets`;
  
  const items = state[stateKey];
  const item = items.find(i => i.id === inferenceId);
  
  if (item) {
    item.peerId = peerData.peerId;
    item.peerWallet = peerData.walletAddress;
    item.bidAmount = peerData.bidAmount;
    item.offloadedAt = Date.now();
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== Media Validation ====================

/**
 * Check if a media file exists (for file:// paths or local paths)
 */
const checkMediaExists = async (path) => {
  if (!path) return false;

  // For base64 data URLs, they're embedded so always "exist"
  if (path.startsWith('data:')) return true;

  // For file paths, check via electronAPI
  if (window.electronAPI?.fileExists) {
    try {
      return await window.electronAPI.fileExists(path);
    } catch {
      return false;
    }
  }

  // For http/https URLs, do a HEAD request
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const response = await fetch(path, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Fallback: assume exists if we can't check
  return true;
};

/**
 * Validate a single inference's media and return whether it's valid
 */
export const validateInferenceMedia = async (inference) => {
  if (!inference) return false;

  switch (inference.type) {
    case 'video':
      return await checkMediaExists(inference.videoPath);
    case 'audio':
      return await checkMediaExists(inference.audioPath);
    case 'image':
      // Images are stored as base64, always valid
      return !!inference.imageData;
    default:
      return true;
  }
};

/**
 * Remove inferences with missing/invalid media files
 * Returns array of removed inference IDs
 */
export const cleanupInvalidMedia = async () => {
  const removed = [];

  // Check videos
  for (const video of [...state.videoInferences]) {
    const exists = await checkMediaExists(video.videoPath);
    if (!exists) {
      await removeInference('video', video.id);
      removed.push({ type: 'video', id: video.id, path: video.videoPath });
    }
  }

  // Check audio
  for (const audio of [...state.audioInferences]) {
    const exists = await checkMediaExists(audio.audioPath);
    if (!exists) {
      await removeInference('audio', audio.id);
      removed.push({ type: 'audio', id: audio.id, path: audio.audioPath });
    }
  }

  if (removed.length > 0) {
    console.log(`[InferenceStore] Cleaned up ${removed.length} invalid media entries:`, removed);
  }

  return removed;
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
    await persist(storeKey);
    return true;
  }
  return false;
};

// ==================== Computed & Readonly State ====================

export const allInferences = computed(() => [
  ...state.textInferences,
  ...state.imageInferences,
  ...state.videoInferences,
  ...state.audioInferences,
  ...state.gameInferences,
  ...state.roboticDatasets,
].sort((a, b) => b.timestamp - a.timestamp));

export const mintedInferences = computed(() => 
  allInferences.value.filter(i => i.nft !== null)
);

export const zkProtectedInferences = computed(() =>
  allInferences.value.filter(i => i.zkProof !== null)
);

export const peerOffloadedInferences = computed(() =>
  allInferences.value.filter(i => i.peerId !== null)
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

  // Game
  addGameInference,
  loadGameInferences,

  // Robotic
  addRoboticDataset,
  loadRoboticDatasets,

  // NFT
  markAsMinted,

  // ZK
  markWithZKProof,

  // Peer
  markAsPeerOffloaded,

  // Removal & Validation
  removeInference,
  validateInferenceMedia,
  cleanupInvalidMedia,

  // Computed
  allInferences,
  mintedInferences,
  zkProtectedInferences,
  peerOffloadedInferences,
};

export default inferenceStore;
