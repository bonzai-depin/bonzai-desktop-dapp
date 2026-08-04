// src/main/secretStore.js
//
// P9 — Narrow secret storage for agent wallet material.
//
// Wraps Electron `safeStorage` behind a tiny keyed API used by the
// wallet-secret:* IPC handlers in main.js. A "protected record" is the only
// thing that ever touches disk for these keys: a version tag, the
// safeStorage ciphertext (base64), and non-secret metadata (address,
// timestamps). Plaintext never reaches the backing store through this path.
//
// safeStorage.isEncryptionAvailable() can be false depending on the OS
// keyring/session (this varies across Linux desktop sessions in particular),
// so every operation here fails closed instead of silently degrading: no
// write happens without encryption, and a stored ciphertext is never handed
// back as if it were the usable secret.
//
// No Electron import here — `store` and `safeStorage` are injected so this
// stays a pure, unit-testable module (node --test, no app/session needed).

export const SECRET_RECORD_VERSION = 1;
export const SECRET_KEY_PREFIX = "wallet-secret:";

export function secretStoreKey(key) {
  return `${SECRET_KEY_PREFIX}${key}`;
}

/** True iff `record` is a well-formed protected record produced by this module. */
export function isProtectedSecretRecord(record) {
  return (
    !!record &&
    typeof record === "object" &&
    record.version === SECRET_RECORD_VERSION &&
    typeof record.ciphertext === "string" &&
    record.ciphertext.length > 0
  );
}

// Backends that do NOT provide real OS-level protection. Electron falls
// back to `basic_text` on some Linux desktop sessions (no keyring
// available): it "encrypts" with a hardcoded, publicly-known plaintext
// password, so anything stored through it is recoverable by reading the
// store file directly. isEncryptionAvailable() alone returns true for this
// backend, so it must be checked separately via getSelectedStorageBackend()
// — see https://www.electronjs.org/docs/latest/api/safe-storage
const INSECURE_STORAGE_BACKENDS = new Set(["basic_text"]);

function encryptionAvailable(safeStorage) {
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function" || !safeStorage.isEncryptionAvailable()) {
    return false;
  }
  if (typeof safeStorage.getSelectedStorageBackend === "function") {
    let backend;
    try {
      backend = safeStorage.getSelectedStorageBackend();
    } catch {
      return false;
    }
    if (INSECURE_STORAGE_BACKENDS.has(backend)) {
      return false;
    }
  }
  return true;
}

/**
 * Encrypt `plaintext` into a protected record. Never succeeds without a
 * live, available safeStorage seam — there is no plaintext fallback.
 */
export function encryptSecretRecord({ safeStorage, plaintext, address = null, createdAt = null }) {
  if (typeof plaintext !== "string" || !plaintext) {
    return { ok: false, reason: "invalid-secret" };
  }
  if (!encryptionAvailable(safeStorage)) {
    return { ok: false, reason: "encryption-unavailable" };
  }
  let ciphertext;
  try {
    ciphertext = safeStorage.encryptString(plaintext).toString("base64");
  } catch {
    return { ok: false, reason: "encrypt-failed" };
  }
  const now = Date.now();
  return {
    ok: true,
    record: {
      version: SECRET_RECORD_VERSION,
      ciphertext,
      address: address || null,
      createdAt: createdAt || now,
      updatedAt: now,
    },
  };
}

/**
 * Decrypt a protected record. Refuses (fail closed) when encryption is
 * unavailable rather than returning the ciphertext as a usable value.
 */
export function decryptSecretRecord({ safeStorage, record }) {
  if (!isProtectedSecretRecord(record)) {
    return { ok: false, reason: "not-a-protected-record" };
  }
  if (!encryptionAvailable(safeStorage)) {
    return { ok: false, reason: "encryption-unavailable" };
  }
  let plaintext;
  try {
    plaintext = safeStorage.decryptString(Buffer.from(record.ciphertext, "base64"));
  } catch {
    return { ok: false, reason: "decrypt-failed" };
  }
  return {
    ok: true,
    plaintext,
    address: record.address ?? null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
  };
}

/**
 * Build the narrow secret-store API backing the wallet-secret:* IPC
 * handlers. `store` is any object exposing get/set/delete (electron-store
 * in production, a plain Map-backed fake in tests).
 */
export function createSecretHandlers({ store, safeStorage }) {
  function setSecret(key, plaintext, { address } = {}) {
    const storeKey = secretStoreKey(key);
    const existing = store.get(storeKey, null);
    const createdAt = isProtectedSecretRecord(existing) ? existing.createdAt : null;
    const result = encryptSecretRecord({ safeStorage, plaintext, address, createdAt });
    if (!result.ok) {
      throw new Error(`Secure credential storage is unavailable on this device (${result.reason})`);
    }
    store.set(storeKey, result.record);
    return { ok: true };
  }

  function getSecret(key) {
    const record = store.get(secretStoreKey(key), null);
    if (!record) return null;
    const result = decryptSecretRecord({ safeStorage, record });
    if (!result.ok) {
      throw new Error(`Secure credential is unavailable on this device (${result.reason})`);
    }
    return {
      secret: result.plaintext,
      address: result.address,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  function hasSecret(key) {
    return isProtectedSecretRecord(store.get(secretStoreKey(key), null));
  }

  function deleteSecret(key) {
    store.delete(secretStoreKey(key));
    return { ok: true };
  }

  return { setSecret, getSecret, hasSecret, deleteSecret };
}
