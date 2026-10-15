/**
 * BonzAI — Model Store
 * Tracks the currently loaded LLM across all components.
 * Stays in sync with main process via IPC events.
 */

import { reactive, readonly } from 'vue';
import { MODEL_PREFERENCE_KEY, preferredModelFilename } from '../config/modelDefaults.js';

const preferenceStorage = () => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

const state = reactive({
  /** Currently loaded model info, or null if none */
  current: null,
  /** Selected model may still need a download; never report it as loaded. */
  preferredFilename: preferredModelFilename(preferenceStorage()),
  /** Whether "always loaded" is enabled */
  alwaysLoaded: false,
});

/** Initialize: query main process for current state */
const initialize = async () => {
  try {
    const model = await window.electronAPI?.getLoadedModel?.();
    state.current = model || null;
    const always = await window.electronAPI?.getAlwaysLoaded?.();
    state.alwaysLoaded = !!always;
  } catch (e) {
    console.warn('[ModelStore] Init failed:', e);
  }
};

/** Subscribe to model-changed IPC events from main process */
let unsubscribe = null;
const startListening = () => {
  if (unsubscribe) return;
  unsubscribe = window.electronAPI?.onModelChanged?.((model) => {
    state.current = model || null;
  });
};

const stopListening = () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
};

/** Toggle always-loaded setting */
const setAlwaysLoaded = async (enabled) => {
  try {
    const result = await window.electronAPI?.setAlwaysLoaded?.(enabled);
    state.alwaysLoaded = !!result;
  } catch (e) {
    console.error('[ModelStore] Failed to set always-loaded:', e);
  }
};

/** Update current model from renderer side (when user picks a model) */
const setCurrent = (model) => {
  state.current = model ? {
    filename: model.filename,
    modelname: model.modelname || model.filename,
    parameters: model.parameters,
    context: model.context,
    isMultimodal: model.isMultimodal || false,
  } : null;
};

const setPreferred = model => {
  if (!model?.filename) return;
  state.preferredFilename = model.filename;
  try { preferenceStorage()?.setItem(MODEL_PREFERENCE_KEY, model.filename); } catch { /* Session preference still works. */ }
};

export const modelStore = {
  state: readonly(state),
  initialize,
  startListening,
  stopListening,
  setAlwaysLoaded,
  setCurrent,
  setPreferred,
};

export default modelStore;
