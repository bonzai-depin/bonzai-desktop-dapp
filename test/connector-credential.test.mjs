// Business reason: a connector secret saved by an old version must not stay
// readable on disk once the app has touched it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readStoredConnectorCredential } from '../src/main/connectors/connectorCredential.js';

function fixture(entry, { available = true } = {}) {
  const values = new Map([['k', entry]]), writes = [];
  const store = { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => { writes.push(value); values.set(key, value); } };
  const safeStorage = { isEncryptionAvailable: () => available, encryptString: value => Buffer.from(`protected:${value}`), decryptString: bytes => bytes.toString().slice(10) };
  return { store, safeStorage, values, writes, read: () => readStoredConnectorCredential({ store, safeStorage, key: 'k', now: () => 77 }) };
}
const plain = value => Buffer.from(value, 'utf8').toString('base64');

test('a legacy plaintext entry is protected on first read and keeps working', () => {
  const secret = JSON.stringify({ accessToken: 'legacy-token' });
  const f = fixture({ encrypted: plain(secret), kind: 'hubspot', accountIdentifier: 'acct', updatedAt: 1 });
  const first = f.read();
  assert.deepEqual(first.credential, { accessToken: 'legacy-token' });
  const saved = f.values.get('k');
  assert.deepEqual(first.stored, saved, 'callers compare against what is now on disk');
  assert.equal(saved.protected, true);
  assert.equal(saved.kind, 'hubspot');
  assert.equal(saved.accountIdentifier, 'acct');
  assert.equal(saved.updatedAt, 77);
  assert.doesNotMatch(Buffer.from(saved.encrypted, 'base64').toString(), /^\{/);
  assert.notEqual(saved.encrypted, plain(secret));
  // The second read decrypts and does not write again.
  assert.deepEqual(f.read().credential, { accessToken: 'legacy-token' });
  assert.equal(f.writes.length, 1);
});

test('a legacy bare API key is upgraded the same way', () => {
  const f = fixture({ encrypted: plain('sk_legacy'), kind: 'stripe' });
  assert.deepEqual(f.read().credential, { apiKey: 'sk_legacy', token: 'sk_legacy' });
  assert.equal(f.values.get('k').protected, true);
  assert.deepEqual(f.read().credential, { apiKey: 'sk_legacy', token: 'sk_legacy' });
});

test('without secure storage an existing connection keeps working and is left untouched', () => {
  // Business reason: an upgrade must not disconnect a team on a device without a keyring.
  const entry = { encrypted: plain('sk_legacy'), kind: 'stripe' };
  const f = fixture(entry, { available: false });
  assert.deepEqual(f.read().credential, { apiKey: 'sk_legacy', token: 'sk_legacy' });
  assert.equal(f.writes.length, 0);
  assert.equal(f.values.get('k'), entry);
});

test('protected entries are read without rewriting; missing ones stay unavailable', () => {
  const f = fixture({ encrypted: Buffer.from('protected:{"apiKey":"k1"}').toString('base64'), protected: true, kind: 'notion' });
  assert.deepEqual(f.read().credential, { apiKey: 'k1' });
  assert.equal(f.writes.length, 0);
  assert.throws(fixture(undefined).read, /unavailable or locked/);
  assert.throws(fixture({ kind: 'notion' }).read, /unavailable or locked/);
});
