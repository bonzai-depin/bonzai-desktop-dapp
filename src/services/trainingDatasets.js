// User-curated examples stay in the existing device-local Electron store.
const KEY = 'bonzai.training.datasets.v1';
export async function listTrainingDatasets() {
  const store = window.electronAPI?.store;
  if (!store?.get) throw new Error('Open the desktop app to save datasets on this device.');
  const items = await store.get(KEY, []);
  return Array.isArray(items) ? items : [];
}
export async function saveTrainingDataset({name, purpose, rows}) {
  if (!name?.trim() || !Array.isArray(rows) || !rows.length) throw new Error('Name your dataset and add at least one example.');
  if (!rows.every(r => r && (typeof r.text === 'string' && r.text.trim() || typeof r.prompt === 'string' && r.prompt.trim() && typeof r.completion === 'string' && r.completion.trim()))) throw new Error('Each example needs text, or a request and a complete ideal response.');
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 5 * 1024 * 1024) throw new Error('Keep this dataset below 5 MB. Split larger collections into smaller datasets.');
  const items = await listTrainingDatasets();
  if (!window.electronAPI?.store?.set) throw new Error('Local dataset storage is unavailable.');
  const dataset = {id:crypto.randomUUID(),name:name.trim(),purpose,rows,createdAt:new Date().toISOString()};
  await window.electronAPI.store.set(KEY, [...items,dataset]);
  return dataset;
}
