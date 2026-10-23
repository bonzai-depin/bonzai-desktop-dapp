import { reactive } from 'vue';
export const remoteInference = reactive({ active: false, connected: false, model: '', source: 'network', maxTokens: 2048 });
let listening = false;
export async function refreshRemoteInference() {
  const api = window.electronAPI?.openRouter;
  if (!api) return remoteInference;
  if (!listening) { api.onChanged?.(state => Object.assign(remoteInference, state)); listening = true; }
  Object.assign(remoteInference, await api.status());
  return remoteInference;
}

export function remoteMediaEnabled(category) {
  return Boolean(remoteInference.active && remoteInference.connected && remoteInference.mediaModels?.[category]);
}

export function remoteRequirementSatisfied(model, state = remoteInference) {
  if (!state.active || !state.connected) return false;
  if (model.type === 'llm' && !model.parentKey) return true;
  const key = model.parentKey || model.key || '';
  const category = key.startsWith('image_') ? 'image' : key.startsWith('video_') ? 'video' : key.startsWith('audio_') ? 'speech' : ['vision', 'ocr'].includes(key) ? 'vision' : null;
  return Boolean(category && state.mediaModels?.[category]);
}
