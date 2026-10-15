import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, generateKeyPairSync, createPublicKey } from 'node:crypto';
import { createWalletCredentialStore, assertPublicStoreKey } from '../src/main/security/walletCredentials.js';
import { walletCredentials, ensureOWSPassphrase } from '../src/services/walletCredentials.service.js';
import { agentWalletService } from '../src/services/agentWallet.service.js';

// Fake credentials and an in-memory store only. Never reads real preferences/keychain.
const fakeKey = `0x${'12'.repeat(32)}`;
function fixture(initial = {}, overrides = {}) {
  const data = new Map(Object.entries(initial));
  const events = [];
  const key = Buffer.alloc(32, 8), iv = Buffer.alloc(12, 9);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString(value) {
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value) {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(value.subarray(0, 16));
      return Buffer.concat([decipher.update(value.subarray(16)), decipher.final()]).toString('utf8');
    },
    ...overrides.safeStorage,
  };
  const store = {
    get(key, fallback) { events.push(['get', key]); return data.has(key) ? data.get(key) : fallback; },
    set(key, value) { events.push(['set', key]); data.set(key, structuredClone(value)); },
    delete(key) { events.push(['delete', key]); data.delete(key); },
    ...overrides.store,
  };
  return { data, events, store, safeStorage, vault: createWalletCredentialStore({ store, safeStorage, generateSecret: () => fakeKey }) };
}

test('OWS plaintext is encrypted and verified before legacy deletion, preserving both credentials', () => {
  const f = fixture({ 'ows-passphrase-a': 'test-passphrase', 'ows-api-key-a': 'test-api-key' });
  assert.equal(f.vault.readOWS('a', 'passphrase'), 'test-passphrase');
  assert.equal(f.vault.readOWS('a', 'apiKey'), 'test-api-key');
  assert.equal(f.data.has('ows-passphrase-a'), false);
  assert.equal(f.data.has('ows-api-key-a'), false);
  for (const record of f.data.values()) {
    assert.equal(record.protected, true);
    assert.equal(JSON.stringify(record).includes('test-passphrase'), false);
    assert.equal(JSON.stringify(record).includes('test-api-key'), false);
  }
  for (const kind of ['passphrase', 'api-key']) {
    const deletion = f.events.findIndex(([op, key]) => op === 'delete' && key === `ows-${kind}-a`);
    assert.ok(f.events.slice(0, deletion).some(([op, key]) => op === 'set' && key.startsWith('wallet-credential:v1:')));
    assert.ok(f.events.slice(0, deletion).some(([op, key]) => op === 'get' && key.startsWith('wallet-credential:v1:')));
  }
});

test('unavailable encryption and Linux basic_text preserve legacy material without exposing it', () => {
  for (const safeStorage of [{ isEncryptionAvailable: () => false }, { getSelectedStorageBackend: () => 'basic_text' }]) {
    const f = fixture({ 'ows-passphrase-a': 'test-passphrase' }, { safeStorage });
    assert.throws(() => f.vault.readOWS('a', 'passphrase'), /Secure wallet storage is unavailable/);
    assert.throws(() => f.vault.writeOWS('a', 'passphrase', 'replacement'), /Secure wallet storage is unavailable/);
    assert.equal(f.data.get('ows-passphrase-a'), 'test-passphrase');
    assert.equal(f.events.length, 0);
  }
});

test('failed encrypted persistence or readback never removes the only recoverable secret', () => {
  for (const overrides of [
    { store: { set() { throw new Error('disk unavailable'); } } },
    { safeStorage: { decryptString() { return 'mismatched data'; } } },
  ]) {
    const f = fixture({ 'ows-passphrase-a': 'test-passphrase' }, overrides);
    assert.throws(() => f.vault.readOWS('a', 'passphrase'), /could not be securely saved/);
    assert.equal(f.data.get('ows-passphrase-a'), 'test-passphrase');
  }
});

test('a failed legacy cleanup leaves a protected recovery copy and can be retried', () => {
  const f = fixture({ 'ows-passphrase-a': 'test-passphrase' });
  const normalDelete = f.store.delete;
  f.store.delete = key => { if (key === 'ows-passphrase-a') throw new Error('disk unavailable'); normalDelete(key); };
  assert.throws(() => f.vault.readOWS('a', 'passphrase'), /old copy could not be removed/);
  assert.equal(f.data.has('ows-passphrase-a'), true);
  assert.equal([...f.data.values()].filter(v => v?.protected).length, 1);
  f.store.delete = normalDelete;
  assert.equal(f.vault.readOWS('a', 'passphrase'), 'test-passphrase');
  assert.equal(f.data.has('ows-passphrase-a'), false);
});

test('legacy wallet reads also protect master key without changing address or private key', () => {
  const original = { address: '0xTestAddress', privateKey: fakeKey, createdAt: 123 };
  const f = fixture({ 'agent-wallet-7': original, 'bonzai-agent-master-secret': fakeKey });
  assert.deepEqual(f.vault.readLegacyWallet(7), original);
  assert.equal(f.vault.getMasterSecret(), fakeKey);
  assert.equal(f.data.has('agent-wallet-7'), false);
  assert.equal(f.data.has('bonzai-agent-master-secret'), false);
  const restarted = createWalletCredentialStore({ store: f.store, safeStorage: f.safeStorage });
  assert.deepEqual(restarted.readLegacyWallet(7), original);
});

test('master-secret creation and passphrase creation remain stable across retries', () => {
  const f = fixture();
  assert.equal(f.vault.getMasterSecret(false), null);
  assert.equal(f.vault.getMasterSecret(true), fakeKey);
  assert.equal(f.vault.getMasterSecret(true), fakeKey);
  const passphrase = f.vault.ensureOWSPassphrase('a');
  assert.equal(passphrase.length, 32);
  assert.equal(f.vault.ensureOWSPassphrase('a'), passphrase);
});

test('attestation identity survives protected migration separately from payment capability', () => {
  const f = fixture({ 'bonzai-attestation-signer': fakeKey });
  assert.equal(f.vault.readAttestationKey(), fakeKey);
  assert.equal(f.data.has('bonzai-attestation-signer'), false);
  assert.equal(f.vault.readAttestationKey(), fakeKey);
});

test('general preferences cannot access secret namespaces or object-style bulk writes', () => {
  for (const key of ['ows-passphrase-a', 'ows-api-key-a', 'agent-wallet-a', 'bonzai-agent-master-secret', 'bonzai-attestation-signer', 'privy-session-signer-private-key', 'privy-session-signer-private-key.nested', 'wallet-credential:v1:master', {}, undefined]) {
    assert.throws(() => assertPublicStoreKey(key), /secure credential API/);
  }
  assert.doesNotThrow(() => assertPublicStoreKey('ows-wallet-a'));
  assert.doesNotThrow(() => assertPublicStoreKey('app.theme'));
});

test('renderer fails closed without credential IPC and keeps recovery reads available with IPC', async () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { electronAPI: { store: { get() { throw new Error('must not read preferences'); } } } };
    assert.throws(() => walletCredentials.getLegacyWallet('a'), /Secure wallet storage requires/);
    await assert.rejects(ensureOWSPassphrase('a'), /Secure wallet storage requires/);
    const original = { address: '0xTestAddress', privateKey: fakeKey };
    globalThis.window.electronAPI.walletCredentials = {
      ensureAvailable() { return true; }, getOWS() {}, setOWS() {},
      getLegacyWallet: async () => original,
    };
    assert.deepEqual(await agentWalletService.getAgentWalletCredentials('a'), original);
  } finally { globalThis.window = previous; }
});

test('legacy companion signers and transfers deny before reading credentials in receive-only mode', async () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { electronAPI: { get walletCredentials() { throw new Error('credential read must not happen'); } } };
    await assert.rejects(agentWalletService.getAgentWalletSigner('a'), /receive-only/);
    await assert.rejects(agentWalletService.getAgentWalletSignerForChain('a', 8453), /receive-only/);
    const result = await agentWalletService.sendEthFromAgentWallet('a', '0xTest', '0.1');
    assert.equal(result.success, false);
    assert.match(result.error, /receive-only/);
  } finally { globalThis.window = previous; }
});

test('a corrupt protected record fails closed instead of using the stale plaintext fallback', () => {
  const f = fixture({ 'ows-passphrase-a': 'test-passphrase' });
  f.vault.readOWS('a', 'passphrase');
  const protectedKey = [...f.data.keys()][0];
  f.data.set(protectedKey, { version: 1, protected: true, encrypted: 'corrupt' });
  f.data.set('ows-passphrase-a', 'stale-passphrase');
  assert.throws(() => f.vault.readOWS('a', 'passphrase'), /could not be unlocked/);
  assert.equal(f.data.get('ows-passphrase-a'), 'stale-passphrase');
});

test('an interrupted OWS migration reuses the imported address and adds no spending key in receive-only mode', async () => {
  const { owsService } = await import('../src/services/ows.service.js');
  const { migrateCompanion } = await import('../src/services/owsMigration.service.js');
  const oldWindow = globalThis.window;
  const originals = { getWallet: owsService.getWallet, importWalletPrivateKey: owsService.importWalletPrivateKey, createApiKey: owsService.createApiKey, getCredentials: agentWalletService.getAgentWalletCredentials };
  try {
    const mapping = new Map();
    const address = '0x0000000000000000000000000000000000000001';
    globalThis.window = { electronAPI: {
      walletCredentials: { ensureAvailable: () => true, getOWS() {}, setOWS() {}, ensureOWSPassphrase: () => 'test-passphrase' },
      store: { get: key => mapping.get(key), set: (key, value) => { mapping.set(key, value); return true; } },
    } };
    agentWalletService.getAgentWalletCredentials = async () => ({ address, privateKey: fakeKey });
    owsService.getWallet = async () => ({ address, name: 'bonzai-companion-a' });
    owsService.importWalletPrivateKey = async () => { throw new Error('must not re-import'); };
    owsService.createApiKey = async () => { throw new Error('must not create a spending key'); };
    const result = await migrateCompanion('a');
    assert.equal(result.success, true);
    assert.equal(result.address, address);
    assert.equal(mapping.get('ows-wallet-a').address, address);
  } finally {
    globalThis.window = oldWindow;
    owsService.getWallet = originals.getWallet;
    owsService.importWalletPrivateKey = originals.importWalletPrivateKey;
    owsService.createApiKey = originals.createApiKey;
    agentWalletService.getAgentWalletCredentials = originals.getCredentials;
  }
});


test('Privy session signer migration preserves its authorized Ed25519 identity and repairs only public metadata', () => {
  const privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('hex');
  const f = fixture({ 'privy-session-signer-private-key': privateKey, 'privy-session-signer-public-key': 'stale-public-metadata' });
  assert.deepEqual(f.vault.ensurePrivySessionSigner(), { privateKey, publicKey });
  assert.equal(f.data.has('privy-session-signer-private-key'), false);
  assert.equal(f.data.get('privy-session-signer-public-key'), publicKey);
  const restarted = createWalletCredentialStore({ store: f.store, safeStorage: f.safeStorage });
  assert.deepEqual(restarted.ensurePrivySessionSigner(), { privateKey, publicKey });
  assert.ok([...f.data.values()].every(value => !JSON.stringify(value).includes('PRIVATE KEY')));
});

test('Privy signer creation persists protection before identity and never replaces a missing authorized key', () => {
  const f = fixture();
  const pair = f.vault.ensurePrivySessionSigner();
  assert.deepEqual(f.vault.ensurePrivySessionSigner(), pair);
  const writes = f.events.filter(([operation]) => operation === 'set');
  assert.equal(writes[0][1], 'wallet-credential:v1:privy-session');
  assert.equal(writes[1][1], 'privy-session-signer-public-key');
  const missing = fixture({ 'privy-session-signer-public-key': pair.publicKey });
  assert.throws(() => missing.vault.ensurePrivySessionSigner(), /key is missing/);
  assert.equal(missing.data.size, 1);
});

test('Privy migration fails closed without keychain and preserves the legacy key on failed encrypted write', () => {
  const privateKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  for (const overrides of [
    { safeStorage: { isEncryptionAvailable: () => false } },
    { store: { set() { throw new Error('unavailable'); } } },
  ]) {
    const f = fixture({ 'privy-session-signer-private-key': privateKey }, overrides);
    assert.throws(() => f.vault.ensurePrivySessionSigner(), /unavailable|securely saved/);
    assert.equal(f.data.get('privy-session-signer-private-key'), privateKey);
    assert.equal(f.data.has('privy-session-signer-public-key'), false);
  }
});
