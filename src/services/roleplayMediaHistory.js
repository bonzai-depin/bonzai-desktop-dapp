// Roleplay outputs use the same persisted histories as the creation views.
// Stable message/media IDs make repeated session saves and late media updates
// idempotent. No private content leaves the device.
let queue = Promise.resolve();
export function roleplayHistoryRecords(sessions = {}) {
  const records = { imageInferences: [], videoInferences: [], audioInferences: [] };
  for (const [sessionId, session] of Object.entries(sessions || {})) {
    for (const message of session?.history || []) {
      if (!message.id || message.role !== 'assistant') continue;
      const base = { question: message.content || '', source: 'roleplay',
        roleplaySessionId: sessionId, roleplayMessageId: message.id,
        timestamp: message.ts || message.timestamp || session.updatedAt || Date.now(),
        companionName: session.companion?.name || '', networkMode: message.networkMode || session.networkMode || 'unknown' };
      const images = [...new Set([message.image, ...(Array.isArray(message.images) ? message.images : []).map(image => typeof image === 'string' ? image : image?.image)].filter(Boolean))];
      for (const [index, image] of images.entries()) records.imageInferences.push({ ...base,
        id: `roleplay:${sessionId}:${message.id}:image:${index}`, type: 'image',
        answer: { status: 200, data: { image } } });
      for (const type of ['video', 'audio']) if (message[type]) records[`${type}Inferences`].push({ ...base,
        id: `roleplay:${sessionId}:${message.id}:${type}`, type,
        answer: { status: 200, data: { [`${type}_path`]: message[type] } } });
    }
  }
  return records;
}
export function saveRoleplayMediaHistory(sessions, api = globalThis.window?.electronAPI?.store) {
  const snapshot = roleplayHistoryRecords(sessions);
  const task = queue.catch(() => {}).then(async () => {
    if (!api?.get || !api?.set) return;
    for (const [key, additions] of Object.entries(snapshot)) {
      if (!additions.length) continue;
      const existing = await api.get(key, []);
      const merged = new Map((Array.isArray(existing) ? existing : []).map(row => [row.id, row]));
      for (const row of additions) merged.set(row.id, { ...merged.get(row.id), ...row });
      await api.set(key, [...merged.values()]);
    }
    globalThis.window?.dispatchEvent?.(new CustomEvent('bonzai:roleplay-history-changed')); 
  });
  queue = task;
  return task;
}
