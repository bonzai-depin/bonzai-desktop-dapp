import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicStorage } from '../src/main/publicStorage.js';
import { confirmedReceipt } from '../src/services/transactionReceipt.js';
import { privateStorageBuildGuard } from '../scripts/private-storage-build-guard.mjs';
import { protocolActivities } from '../src/services/protocolActivities.js';
const cid = 'bafy' + 'a'.repeat(50);
function fixture({ ok = true, backend = 'keychain' } = {}) {
  const records = new Map(), requests = [];
  const store = { get: (key, fallback) => records.get(key) ?? fallback, set: (key, value) => records.set(key, structuredClone(value)) };
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend, encryptString: value => Buffer.from([...value].reverse().join('')), decryptString: bytes => [...bytes.toString()].reverse().join('') };
  const api = createPublicStorage({ store, safeStorage, fetchImpl: async (url, init) => { requests.push({ url, init }); return { ok, status: ok ? 200 : 403, text: async () => 'SECRET echoed upstream', json: async () => ({ IpfsHash: cid, PinSize: 4 }) }; } });
  return { api, records, requests, store };
}
test('storage requires user credentials and keeps secrets out of statuses and receipts', async () => {
  const { api, records, requests } = fixture();
  assert.equal(api.status().configured, false);
  await assert.rejects(api.uploadMetadata({ metadata: { name: 'test' } }), /Set up IPFS/);
  assert.equal(requests.length, 0);
  api.configure('PRIVATE-JWT');
  assert.doesNotMatch(JSON.stringify([...records.values()]), /PRIVATE-JWT/);
  assert.deepEqual(api.status(), { configured: true, persistent: true });
  const receipt = await api.uploadMetadata({ metadata: { name: 'test' } });
  assert.equal(receipt.cid, cid); assert.equal(receipt.url, `ipfs://${cid}`);
  assert.equal(requests[0].url, 'https://api.pinata.cloud/pinning/pinJSONToIPFS');
  assert.equal(requests[0].init.redirect, 'error');
  assert.doesNotMatch(JSON.stringify(api.receipts()), /PRIVATE-JWT/);
  api.disconnect(); assert.equal(api.status().configured, false); assert.equal(api.receipts().length, 1);
});
test('insecure secret storage and echoed upstream errors fail without exposing credentials', async () => {
  assert.throws(() => fixture({ backend: 'basic_text' }).api.configure('PRIVATE'), /Secure credential storage/);
  const { api } = fixture({ ok: false }); api.configure('PRIVATE');
  await assert.rejects(api.uploadMetadata({ metadata: {} }), error => /permissions/.test(error.message) && !/SECRET|PRIVATE/.test(error.message));
});
test('successful public upload remains successful when saving the local receipt fails', async () => {
  const { api, store, requests } = fixture(); api.configure('PRIVATE');
  const set = store.set; store.set = (key, value) => { if (key === 'bonzai-storage-receipts') throw new Error('Disk full'); set(key, value); };
  const receipt = await api.upload({ data: new Uint8Array([1, 2, 3]), contentType: 'image/png', name: 'image.png' });
  assert.equal(receipt.cid, cid); assert.match(receipt.localRecordWarning, /Uploaded/);
  assert.equal(requests.length, 1);
  await assert.rejects(api.upload({ data: '/private/file', contentType: 'text/plain' }), /non-empty/);
});
test('a successful fee replacement is confirmed; uncertain submission is not retryable failure', async () => {
  const receipt = { status: 1, hash: 'replacement' };
  assert.equal(await confirmedReceipt({ wait: async () => { throw { code: 'TRANSACTION_REPLACED', cancelled: false, receipt }; } }), receipt);
  await assert.rejects(confirmedReceipt({ hash: 'submitted', wait: async () => { throw new Error('timeout'); } }), error => error.confirmationPending && error.transactionHash === 'submitted');
  await assert.rejects(confirmedReceipt({ hash: 'submitted', wait: async () => ({ status: 0 }) }), error => !error.confirmationPending);
});
test('guide does not call absent or zero contracts available and separates the money flows', () => {
  const activities = protocolActivities({});
  for (const id of ['mint', 'stake', 'rewards', 'agents', 'models', 'games', 'fees', 'jobs', 'provider', 'contributions']) assert.equal(activities.find(row => row.id === id).configured, false, id);
  assert.match(activities.find(row => row.id === 'jobs').limitation, /not implemented/);
  assert.match(activities.find(row => row.id === 'storage').result, /not a permanent/);
  assert.equal(protocolActivities({ basketRewards: { contractAddress: '0x0000000000000000000000000000000000000000' } }).find(row => row.id === 'rewards').configured, false);
  const routes = new Set(['connect', 'storage', 'image', 'rewards', 'agent', 'tune', 'game', 'markets', 'company', 'network', 'datasets']);
  for (const activity of activities) assert.ok(routes.has(activity.action), activity.id);
});


test('build rejects legacy Vite credentials without echoing the secret', () => {
  const guard = privateStorageBuildGuard();
  assert.throws(() => guard.configResolved({env:{VITE_PINATA_JWT:'private-secret-value'}}), error => /Remove legacy/.test(error.message) && !error.message.includes('private-secret-value'));
  assert.doesNotThrow(() => guard.configResolved({env:{VITE_API_BASE:'http://localhost',VITE_PINATA_JWT:''}}));
});
