/** Private, device-local drafts; IndexedDB also retains reference media. */
export function draftTitle(state) {
  return String(state.songName || state.lyricsTheme || state.form?.prompt || state.prompt || 'Untitled draft').trim().slice(0, 100);
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bonzai-generation-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || request.error);
    });
  } finally { db.close(); }
}
export async function saveGenerationDraft(kind, state) {
  const record = { id: crypto.randomUUID(), version: 1, kind, title: draftTitle(state), savedAt: Date.now(), state };
  await transaction('readwrite', store => store.put(record));
  return record;
}
export async function listGenerationDrafts(kind) {
  return (await transaction('readonly', store => store.getAll())).filter(row => row.kind === kind && row.version === 1).sort((a,b) => b.savedAt-a.savedAt);
}
export const deleteGenerationDraft = id => transaction('readwrite', store => store.delete(id));
