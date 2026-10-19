// Media drafts use IndexedDB rather than localStorage's small string quota.
// Only public draft content is stored here; credentials stay in the secure vault.
async function database() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('bonzai-social-studio',1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(companionId, value, write) {
  const db = await database();
  try { return await new Promise((resolve,reject) => {
    const tx = db.transaction('drafts',write ? 'readwrite' : 'readonly');
    const request = write ? tx.objectStore('drafts').put(value,companionId) : tx.objectStore('drafts').get(companionId);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Draft storage was interrupted.'));
  }); } finally { db.close(); }
}
export const readSocialDraft = id => transaction(id,undefined,false);
export const saveSocialDraft = (id,value) => transaction(id,JSON.parse(JSON.stringify(value)),true);
