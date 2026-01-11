/**
 * BonzAI — Shared Generation State Store
 * Maintains Socket.IO connection and generation progress state across view navigation.
 * This allows progress bars to persist when users switch between tabs.
 */

import { reactive, readonly } from 'vue';
import { io } from 'socket.io-client';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (typeof window !== 'undefined' && window?.electronAPI?.env?.API_BASE) ||
  'http://127.0.0.1:65000';

const WS_GEN = `${API_BASE}/generation`;

const socketOpts = {
  transports: ['polling', 'websocket'],
  upgrade: true,
  forceNew: false, // Reuse connection
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 60,
  reconnectionDelay: 1000,
  path: '/socket.io',
};

// Singleton socket instance
let genSocket = null;

// Shared generation state for each modality
const state = reactive({
  // Global lock - only one generation at a time
  globalLock: {
    isLocked: false,
    lockedBy: null, // which modality holds the lock
    startedAt: null,
  },
  // Per-modality generation state
  image: {
    active: false,
    id: null,
    pct: 0,
    stage: 'idle',
    error: null,
    blocked: false,
  },
  video: {
    active: false,
    id: null,
    pct: 0,
    stage: 'idle',
    error: null,
    blocked: false,
  },
  audio: {
    active: false,
    id: null,
    pct: 0,
    stage: 'idle',
    error: null,
    blocked: false,
  },
  text: {
    active: false,
    id: null,
    pct: 0,
    stage: 'idle',
    error: null,
    blocked: false,
  },
  '3d': {
    active: false,
    id: null,
    pct: 0,
    stage: 'idle',
    error: null,
    blocked: false,
  },
  // Mapping of generation_id -> modality for routing events
  _idToModality: {},
  // Socket connection state
  connected: false,
});

/**
 * Map pipeline/kind names to modality keys
 */
const kindToModality = (kind) => {
  if (!kind) return null;
  const k = kind.toLowerCase();
  if (k.includes('image') || k.includes('flux') || k.includes('sdxl')) return 'image';
  if (k.includes('video') || k.includes('ltx') || k.includes('wan')) return 'video';
  if (k.includes('audio') || k.includes('music') || k.includes('voice') || k.includes('tts') || k.includes('chatterbox')) return 'audio';
  if (k.includes('text') || k.includes('llm') || k.includes('chat')) return 'text';
  if (k.includes('3d') || k.includes('game') || k.includes('scene')) return '3d';
  return null;
};

/**
 * Initialize and connect to the generation Socket.IO namespace.
 * Safe to call multiple times - will reuse existing connection.
 */
export const ensureGenerationSocket = () => {
  if (genSocket && genSocket.connected) {
    return genSocket;
  }

  if (genSocket) {
    // Socket exists but not connected - try to reconnect
    try {
      genSocket.connect();
    } catch (e) {
      console.warn('[generationStore] Reconnect failed:', e);
    }
    return genSocket;
  }

  // Create new socket
  genSocket = io(WS_GEN, socketOpts);

  genSocket.on('connect', () => {
    state.connected = true;
    console.log('[generationStore] Connected to generation socket');
  });

  genSocket.on('disconnect', () => {
    state.connected = false;
    console.log('[generationStore] Disconnected from generation socket');
  });

  genSocket.on('gen_started', ({ generation_id, kind, meta }) => {
    const modality = kindToModality(kind) || meta?.modality;
    if (modality && state[modality]) {
      state._idToModality[generation_id] = modality;
      Object.assign(state[modality], {
        id: generation_id,
        active: true,
        error: null,
        stage: 'starting',
        pct: 0,
        blocked: false,
      });
    }
  });

  genSocket.on('gen_progress', ({ generation_id, stage, step, total, pct }) => {
    const modality = state._idToModality[generation_id];
    if (!modality || !state[modality]) return;

    const gen = state[modality];
    // Only update if this is the current generation
    if (gen.id && generation_id && gen.id !== generation_id) return;

    gen.stage = stage || gen.stage;
    if (typeof pct === 'number') {
      gen.pct = Math.max(gen.pct, pct);
    } else if (total) {
      gen.pct = Math.max(gen.pct, (Number(step) / Number(total)) * 100);
    }
  });

  genSocket.on('gen_finished', ({ generation_id }) => {
    const modality = state._idToModality[generation_id];
    if (!modality || !state[modality]) return;

    const gen = state[modality];
    if (gen.id && generation_id && gen.id !== generation_id) return;

    gen.pct = 100;
    gen.stage = 'finished';
    gen.active = false;

    // Release global lock
    if (state.globalLock.lockedBy === modality) {
      state.globalLock.isLocked = false;
      state.globalLock.lockedBy = null;
      state.globalLock.startedAt = null;
    }

    // Clean up mapping after a delay to allow final UI update
    setTimeout(() => {
      delete state._idToModality[generation_id];
    }, 1000);
  });

  genSocket.on('gen_error', ({ generation_id, error }) => {
    const modality = state._idToModality[generation_id];
    if (!modality || !state[modality]) return;

    const gen = state[modality];
    if (gen.id && generation_id && gen.id !== generation_id) return;

    gen.error = error || 'Unknown error';
    gen.stage = 'error';
    gen.active = false;

    // Release global lock
    if (state.globalLock.lockedBy === modality) {
      state.globalLock.isLocked = false;
      state.globalLock.lockedBy = null;
      state.globalLock.startedAt = null;
    }

    // Clean up mapping
    setTimeout(() => {
      delete state._idToModality[generation_id];
    }, 1000);
  });

  genSocket.on('connect_error', (e) => {
    console.warn('[generationStore] connect_error:', e?.message || e);
  });

  return genSocket;
};

/**
 * Check if a generation can be started (global lock not held)
 */
export const canStartGeneration = () => {
  return !state.globalLock.isLocked;
};

/**
 * Get info about the current locked generation
 */
export const getLockedGeneration = () => {
  if (!state.globalLock.isLocked) return null;
  return {
    modality: state.globalLock.lockedBy,
    startedAt: state.globalLock.startedAt,
    elapsed: Date.now() - state.globalLock.startedAt,
  };
};

/**
 * Start tracking a new generation for a specific modality.
 * Call this before making the HTTP request.
 * Returns false if another generation is already in progress.
 */
export const startGeneration = (modality, generationId = null) => {
  if (!state[modality]) return false;

  // Check global lock - only one generation at a time
  if (state.globalLock.isLocked && state.globalLock.lockedBy !== modality) {
    console.warn(`[generationStore] Cannot start ${modality} - ${state.globalLock.lockedBy} generation already in progress`);
    return false;
  }

  // Acquire global lock
  state.globalLock.isLocked = true;
  state.globalLock.lockedBy = modality;
  state.globalLock.startedAt = Date.now();

  // Reset state for new generation
  Object.assign(state[modality], {
    id: generationId,
    active: true,
    error: null,
    stage: 'starting',
    pct: 0,
    blocked: false,
  });

  if (generationId) {
    state._idToModality[generationId] = modality;
  }

  // Ensure socket is connected
  ensureGenerationSocket();
  return true;
};

/**
 * Release the global generation lock
 */
const releaseGlobalLock = (modality = null) => {
  // Only release if the requesting modality holds the lock (or force release)
  if (modality && state.globalLock.lockedBy !== modality) {
    return;
  }
  state.globalLock.isLocked = false;
  state.globalLock.lockedBy = null;
  state.globalLock.startedAt = null;
};

/**
 * Manually register a generation ID to a modality.
 * Useful when the ID is received from HTTP response.
 */
export const registerGeneration = (modality, generationId) => {
  if (!state[modality] || !generationId) return;

  state[modality].id = generationId;
  state._idToModality[generationId] = modality;
};

/**
 * Clear error state for a modality.
 */
export const clearError = (modality) => {
  if (state[modality]) {
    state[modality].error = null;
  }
};

/**
 * Set error state for a modality (e.g., HTTP errors).
 */
export const setError = (modality, error) => {
  if (state[modality]) {
    state[modality].error = error;
    state[modality].stage = 'error';
    state[modality].active = false;
    releaseGlobalLock(modality);
  }
};

/**
 * Stop an active generation (e.g., on request failure).
 */
export const stopGeneration = (modality) => {
  if (state[modality]) {
    state[modality].active = false;
    releaseGlobalLock(modality);
  }
};

/**
 * Mark generation as blocked (e.g., missing downloads).
 */
export const setBlocked = (modality, blocked = true) => {
  if (state[modality]) {
    state[modality].blocked = blocked;
  }
};

/**
 * Reset generation state for a modality.
 */
export const resetGeneration = (modality) => {
  if (state[modality]) {
    const oldId = state[modality].id;
    Object.assign(state[modality], {
      active: false,
      id: null,
      pct: 0,
      stage: 'idle',
      error: null,
      blocked: false,
    });
    if (oldId) {
      delete state._idToModality[oldId];
    }
    releaseGlobalLock(modality);
  }
};

/**
 * Force release the global lock (for error recovery)
 */
export const forceReleaseLock = () => {
  console.warn(`[generationStore] Force releasing global lock (was: ${state.globalLock.lockedBy})`);
  state.globalLock.isLocked = false;
  state.globalLock.lockedBy = null;
  state.globalLock.startedAt = null;
};

/**
 * Get the generation state for a specific modality.
 */
export const getGeneration = (modality) => {
  return state[modality] || null;
};

/**
 * Disconnect the socket (call on app shutdown if needed).
 */
export const disconnectSocket = () => {
  if (genSocket) {
    try {
      genSocket.disconnect();
    } catch (e) {
      console.warn('[generationStore] Disconnect error:', e);
    }
    genSocket = null;
    state.connected = false;
  }
};

export const generationStore = {
  state: readonly(state),
  ensureGenerationSocket,
  canStartGeneration,
  getLockedGeneration,
  startGeneration,
  registerGeneration,
  clearError,
  setError,
  setBlocked,
  stopGeneration,
  resetGeneration,
  forceReleaseLock,
  getGeneration,
  disconnectSocket,
};

export default generationStore;
