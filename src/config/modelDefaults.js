export const DEFAULT_LLM_ID = 'qwen3_5_9b';
export const DEFAULT_LLM_TIER = 'q4';
export const DEFAULT_LLM_FILENAME = 'qwen3.5-9b-ud-q4_k_xl.gguf';
// Keep the 3D release and migrations independent of the first-run chat choice.
export const DEFAULT_3D_LLM_FILENAME = 'qwen3.8-27b-turbofcfusion-735-882-here-uncen-neo-coder-max-low-mtp-iq4_xs.gguf';
export const DEFAULT_3D_LLM_ID = 'qwen3_8_27b_low';
export const DEFAULT_3D_LLM_TIER = 'q4';
export const MODEL_PREFERENCE_KEY = 'bonzai.preferredLlm';

export function preferredModelFilename(storage) {
  try {
    const saved = storage?.getItem(MODEL_PREFERENCE_KEY);
    if (typeof saved === 'string' && saved.trim()) return migrateModelPreference(saved.trim());
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  return DEFAULT_LLM_FILENAME;
}

// Upgrade the replaced Qwen3.8 release; preserve unrelated explicit choices.
export function migrateModelPreference(filename) {
  if (/^qwen3\.8-27b-turbofcfusion-735-882-here-uncen-neo-coder-max-mtp-q4_k_m\.gguf$/i.test(filename || '')) return DEFAULT_3D_LLM_FILENAME;
  const legacy = /^qwen3\.8-27b-ud-q([248])_k_xl\.gguf$/i.exec(filename || '');
  if (!legacy) return filename;
  const quant = { 2: 'iq2_m', 4: 'q4_k_m', 8: 'q8_0' }[legacy[1]];
  if (legacy[1] === '4') return DEFAULT_3D_LLM_FILENAME;
  return `qwen3.8-27b-turbofcfusion-735-882-here-uncen-neo-coder-max-mtp-${quant}.gguf`;
}

/** Preference selects a model; it never starts a download or loads a runtime. */
export function selectPreferredModel(models, filename = DEFAULT_LLM_FILENAME) {
  const entries = Array.isArray(models) ? models : Object.values(models || {});
  const match = target => entries.find(model => model.filename?.toLowerCase() === target?.toLowerCase());
  return match(migrateModelPreference(filename)) || match(DEFAULT_LLM_FILENAME) || null;
}
