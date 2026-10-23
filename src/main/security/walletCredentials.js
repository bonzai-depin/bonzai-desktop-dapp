import { randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';

const PREFIX = 'wallet-credential:v1:';
const MASTER_LEGACY_KEY = 'bonzai-agent-master-secret';
const ATTESTATION_LEGACY_KEY = 'bonzai-attestation-signer';
const PRIVY_LEGACY_KEY = 'privy-session-signer-private-key';
const PRIVY_PUBLIC_KEY = 'privy-session-signer-public-key';
const OWS_KINDS = new Set(['passphrase', 'apiKey']);

// Generic preferences must never be a second path to read/write wallet secrets.
export function assertPublicStoreKey(key) {
  if (typeof key !== 'string' || !key || key === 'openrouter-secret'
      || key.startsWith('openrouter-secret.') || key === 'openrouter' || key.startsWith('openrouter.') || key === MASTER_LEGACY_KEY
      || key.startsWith(`${MASTER_LEGACY_KEY}.`) || key === ATTESTATION_LEGACY_KEY
      || key.startsWith(`${ATTESTATION_LEGACY_KEY}.`) || key === PRIVY_LEGACY_KEY
      || key.startsWith(`${PRIVY_LEGACY_KEY}.`) || key.startsWith('agent-wallet-')
      || key.startsWith('ows-passphrase-') || key.startsWith('ows-api-key-')
      || key.startsWith(PREFIX)) {
    throw new Error('Wallet credentials require the secure credential API');
  }
}

const identity = value => {
  if (!['string', 'number'].includes(typeof value)) throw new Error('Invalid wallet identity');
  const id = String(value);
  if (!id || id.length > 256 || /[\u0000-\u001f]/.test(id)) throw new Error('Invalid wallet identity');
  return id;
};
const encodedIdentity = value => Buffer.from(identity(value), 'utf8').toString('hex');
const validateSecret = value => {
  if (typeof value !== 'string' || !value || value.length > 65536) throw new Error('Invalid wallet credential');
  return value;
};

/** OS-protected wallet secrets. No plaintext fallback; inject dependencies in tests. */
export function createWalletCredentialStore({ store, safeStorage, generateSecret = () => `0x${randomBytes(32).toString('hex')}` }) {
  function ensureAvailable() {
    if (!safeStorage?.isEncryptionAvailable?.()
        || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Secure wallet storage is unavailable. Unlock your system keychain and retry.');
    }
    return true;
  }

  function decrypt(record) {
    if (record?.version !== 1 || record?.protected !== true || typeof record.encrypted !== 'string') {
      throw new Error('The protected wallet credential is invalid');
    }
    try { return validateSecret(safeStorage.decryptString(Buffer.from(record.encrypted, 'base64'))); }
    catch { throw new Error('The wallet credential could not be unlocked'); }
  }

  function write(key, legacyKey, secret) {
    ensureAvailable();
    validateSecret(secret);
    const previous = store.get(key, null);
    try {
      const encrypted = safeStorage.encryptString(secret).toString('base64');
      store.set(key, { version: 1, protected: true, encrypted });
      if (decrypt(store.get(key, null)) !== secret) throw new Error('Verification failed');
    } catch {
      // A failed write/readback must never destroy the only recoverable copy.
      try { if (previous !== null) store.set(key, previous); else store.delete(key); } catch {}
      throw new Error('The wallet credential could not be securely saved');
    }
    // This happens only after decrypting the persisted value successfully.
    try { store.delete(legacyKey); }
    catch { throw new Error('The protected credential was saved, but the old copy could not be removed'); }
    return true;
  }

  function read(key, legacyKey, encodeLegacy = validateSecret) {
    ensureAvailable();
    const record = store.get(key, null);
    if (record !== null) {
      const secret = decrypt(record);
      // Retry cleanup if the earlier encrypted write succeeded but deletion failed.
      try { store.delete(legacyKey); }
      catch { throw new Error('The old wallet credential copy could not be removed'); }
      return secret;
    }
    const legacy = store.get(legacyKey, null);
    if (legacy === null) return null;
    const secret = encodeLegacy(legacy);
    write(key, legacyKey, secret);
    return secret;
  }

  function owsKeys(companionId, kind) {
    if (!OWS_KINDS.has(kind)) throw new Error('Invalid OWS credential kind');
    const id = identity(companionId);
    return [`${PREFIX}ows:${kind}:${encodedIdentity(id)}`, `${kind === 'passphrase' ? 'ows-passphrase' : 'ows-api-key'}-${id}`];
  }
  const legacyWalletKeys = companionId => [`${PREFIX}legacy:${encodedIdentity(companionId)}`, `agent-wallet-${identity(companionId)}`];
  function encodeWallet(wallet) {
    if (!wallet || typeof wallet.address !== 'string' || typeof wallet.privateKey !== 'string'
        || !/^0x[0-9a-f]{64}$/i.test(wallet.privateKey)) throw new Error('Invalid legacy wallet credential');
    return JSON.stringify(wallet);
  }

  return {
    ensureAvailable,
    readOWS(id, kind) {
      const keys = owsKeys(id, kind);
      // Protect both stored credentials when either capability is first used.
      read(...owsKeys(id, kind === 'passphrase' ? 'apiKey' : 'passphrase'));
      return read(...keys);
    },
    ensureOWSPassphrase(id) {
      const keys = owsKeys(id, 'passphrase');
      read(...owsKeys(id, 'apiKey'));
      const existing = read(...keys);
      if (existing !== null) return existing;
      const passphrase = randomBytes(24).toString('base64url');
      write(...keys, passphrase);
      return passphrase;
    },
    ensurePrivySessionSigner() {
      const key = `${PREFIX}privy-session`;
      const validatePrivateKey = value => {
        validateSecret(value);
        try {
          if (createPrivateKey(value).asymmetricKeyType !== 'ed25519') throw new Error();
        } catch { throw new Error('The session signer credential is invalid'); }
        return value;
      };
      let privateKey = read(key, PRIVY_LEGACY_KEY, validatePrivateKey);
      if (privateKey === null) {
        // Never silently replace the identity already authorized by the user.
        if (store.get(PRIVY_PUBLIC_KEY, null)) throw new Error('The session signer key is missing. Restore the local wallet credentials.');
        privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
        write(key, PRIVY_LEGACY_KEY, privateKey);
      }
      validatePrivateKey(privateKey);
      const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('hex');
      // Public identity can be repaired from the protected private key, never vice versa.
      if (store.get(PRIVY_PUBLIC_KEY, null) !== publicKey) store.set(PRIVY_PUBLIC_KEY, publicKey);
      return { privateKey, publicKey };
    },
    readAttestationKey: () => read(`${PREFIX}attestation`, ATTESTATION_LEGACY_KEY),
    writeAttestationKey: secret => write(`${PREFIX}attestation`, ATTESTATION_LEGACY_KEY, secret),
    writeOWS: (id, kind, secret) => write(...owsKeys(id, kind), secret),
    readLegacyWallet(id) {
      read(`${PREFIX}master`, MASTER_LEGACY_KEY);
      const value = read(...legacyWalletKeys(id), encodeWallet);
      if (value === null) return null;
      let wallet;
      try { wallet = JSON.parse(value); } catch { throw new Error('The protected wallet credential is invalid'); }
      encodeWallet(wallet);
      return wallet;
    },
    writeLegacyWallet: (id, wallet) => write(...legacyWalletKeys(id), encodeWallet(wallet)),
    deleteLegacyWallet(id) {
      ensureAvailable();
      const [key, legacyKey] = legacyWalletKeys(id);
      store.delete(legacyKey);
      store.delete(key);
      return true;
    },
    getMasterSecret(create = false) {
      const key = `${PREFIX}master`;
      const existing = read(key, MASTER_LEGACY_KEY);
      if (existing !== null || !create) return existing;
      const secret = generateSecret();
      write(key, MASTER_LEGACY_KEY, secret);
      return secret;
    },
  };
}
