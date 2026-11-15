/** Reads a stored connector credential. Entries written before credentials
 * were protected are re-encrypted on first read so plaintext does not persist. */
export function readStoredConnectorCredential({ store, safeStorage, key, now = Date.now }) {
  let stored = store.get(key, null);
  if (!stored?.encrypted) throw new Error("Connector credential is unavailable or locked");
  const bytes = Buffer.from(stored.encrypted, "base64");
  let raw;
  if (stored.protected) raw = safeStorage.decryptString(bytes);
  else {
    raw = bytes.toString("utf8");
    // Protect it as soon as the device can. Until then an existing connection
    // keeps working; only new secrets are refused without secure storage.
    if (safeStorage.isEncryptionAvailable()) {
      stored = { ...stored, encrypted: safeStorage.encryptString(raw).toString("base64"), protected: true, updatedAt: now() };
      store.set(key, stored);
    }
  }
  let credential;
  try { credential = JSON.parse(raw); } catch { credential = { apiKey: raw, token: raw }; }
  return { stored, credential };
}
