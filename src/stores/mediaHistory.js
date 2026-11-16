import { shallowRef } from 'vue';

// A generation owns its result even after its originating view is destroyed.
// Share arrays between mounts and serialize writes so an older completion cannot
// replace a newer result with a stale view's history snapshot.
const histories = new Map();
const writes = new Map();
const loaded = new Set();
export function mediaHistory(kind) {
  if (!histories.has(kind)) histories.set(kind, shallowRef([]));
  return histories.get(kind);
}
export function persistMediaHistory(kind, rows) {
  const snapshot = JSON.parse(JSON.stringify(rows));
  const write = (writes.get(kind) || Promise.resolve()).catch(() => {}).then(async () => {
    await window.electronAPI?.store?.set?.(`${kind}Inferences`, snapshot);
  });
  writes.set(kind, write);
  return write;
}
export async function loadMediaHistory(kind) {
  const history = mediaHistory(kind);
  if (loaded.has(kind)) return history.value;
  const before = history.value;
  await writes.get(kind)?.catch(() => {});
  const saved = await window.electronAPI?.store?.get?.(`${kind}Inferences`, []);
  const rows = Array.isArray(saved) ? saved : [];
  history.value = history.value === before ? rows : [...new Map([...rows, ...history.value].map(row => [row.id, row])).values()];
  loaded.add(kind);
  return history.value;
}
