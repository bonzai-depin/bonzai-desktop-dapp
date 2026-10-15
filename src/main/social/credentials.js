/** SafeStorage at rest. Legacy credentials migrate on their first read. */
export function socialCredentialVault(store, safeStorage, key = 'bonzai-social-credentials') {
  const id = (platform, agent) => `${platform}:${agent}`;
  const write = (platform, agent, tokens) => {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('Secure credential storage is unavailable on this device.');
    const all = store.get(key, {});
    all[id(platform, agent)] = { encrypted: safeStorage.encryptString(JSON.stringify({ ...tokens, updatedAt: Date.now() })).toString('base64') };
    store.set(key, all);
  };
  const read = (platform, agent) => {
    const entry = store.get(key, {})[id(platform, agent)];
    if (!entry) return null;
    if (entry.encrypted) return JSON.parse(safeStorage.decryptString(Buffer.from(entry.encrypted, 'base64')));
    write(platform, agent, entry);
    return entry;
  };
  return { read, write, remove(platform, agent) { const all = store.get(key, {}); delete all[id(platform, agent)]; store.set(key, all); } };
}

export function credentialStatus(creds) { return creds?.access_token ? { connected: true, expires_at: creds.expires_at, refreshable: Boolean(creds.refresh_token) } : null; }
