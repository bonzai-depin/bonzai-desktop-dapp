/** Lowercase display labels; never mutate case-sensitive download URLs. */
export const downloadName = value => String(value ?? '').trim().toLowerCase();
export const downloadPercent = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(100, Math.max(0, number))) : 0;
};

export function downloadCategory(value = {}, fallback = 'resources') {
  const key = String(value.category || value.type || value.pipeline || fallback).toLowerCase();
  if (/^(llm|text|language)(_|$)/.test(key)) return 'language';
  if (/^(image|diffusion)(_|$)/.test(key)) return 'image';
  if (/^(music)(_|$)/.test(key)) return 'music';
  if (/^(audio|speech)(_|$)/.test(key)) return 'audio';
  if (/^video(_|$)/.test(key)) return 'video';
  if (/^(3d|model3d)(_|$)/.test(key)) return '3d';
  if (/^(vision|qwen3_vision)(_|$)/.test(key)) return 'vision';
  if (/^forecast(_|$)/.test(key)) return 'forecast';
  return fallback !== 'resources' && key !== fallback ? downloadCategory({ category: fallback }) : 'resources';
}

export function downloadItems(items = [], fallback = 'resources') {
  const entries = new Map();
  for (const item of items) {
    if (!item) continue;
    const value = typeof item === 'string' ? { name: item } : item;
    const category = downloadCategory(value, fallback);
    const name = downloadName(value.filename || value.repo || value.name);
    const key = name || category;
    if (!entries.has(key)) entries.set(key, { category, name, size: String(value.size || value.filesize || '') });
  }
  return [...entries.values()];
}

export function downloadTasks(tasks = [], items = [], fallback = 'resources') {
  return tasks.map(task => {
    const name = downloadName(task.filename || task.name);
    const item = items.find(item => item && name && downloadName(typeof item === 'string' ? item : item.filename || item.repo || item.name) === name);
    const category = downloadCategory(task, downloadCategory(typeof item === 'object' ? item : {}, fallback));
    return { category, name, progress: downloadPercent(task.progress), status: downloadName(task.status) || 'downloading' };
  });
}
