import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMeshDevices, normalizePairingCode, isMeshPrivateStoreKey, sanitizeDeviceProfile,
  MESH_STORE_KEY, MESH_IDENTITY_KEY, INVITE_TTL_MS, MAX_INVITE_ATTEMPTS,
} from '../src/main/meshDevices.js';
import { assertPublicStoreKey } from '../src/main/security/walletCredentials.js';
import { planPool, pooledBudget, modelMemoryNeed, lendableMemory, MAX_POOL_DEVICES } from '../src/services/meshPlan.js';
import { recommendFirstRunModel } from '../src/services/modelRecommendation.js';

function memoryStore() {
  const data = new Map();
  return { get: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback), set: (key, value) => data.set(key, structuredClone(value)), data };
}
const keychain = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`sealed:${value}`), decryptString: bytes => bytes.toString().replace(/^sealed:/, '') };

function device(name, clock = { now: 1000 }) {
  const store = memoryStore();
  return { store, clock, mesh: createMeshDevices({ store, secureStorage: keychain, now: () => clock.now, selfProfile: () => ({ name, platform: 'darwin', memBudget: 64e9 }) }) };
}
/** Deliver the joiner's messages to a host as the encrypted transport would. */
const transport = (host, joinerId, hostId) => message => host.mesh.handlePair(structuredClone(message), joinerId, hostId);

test('two devices link only when the code shown on one is typed on the other', async () => {
  const studio = device('Studio'), spark = device('Spark');
  const { code } = studio.mesh.invite();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

  const linked = await spark.mesh.join(code.toLowerCase(), 'peer-studio', 'peer-spark', transport(studio, 'peer-spark', 'peer-studio'));
  assert.equal(linked.ok, true);
  assert.equal(linked.device.name, 'Studio');
  assert.equal(spark.mesh.isLinked('peer-studio'), true);
  assert.equal(studio.mesh.isLinked('peer-spark'), true);
  // The code is single use: a second device cannot reuse it.
  assert.equal(studio.mesh.invitationStatus(), null);
  const reuse = await device('Other').mesh.join(code, 'peer-studio', 'peer-other', transport(studio, 'peer-other', 'peer-studio'));
  assert.deepEqual(reuse, { ok: false, error: 'no_invitation' });
});

test('a wrong code never links, and repeated guesses close the invitation', async () => {
  const studio = device('Studio');
  studio.mesh.invite();
  for (let attempt = 1; attempt <= MAX_INVITE_ATTEMPTS; attempt++) {
    const guess = await device('Guess').mesh.join('AAAA-AAAA', 'peer-studio', `peer-guess-${attempt}`, transport(studio, `peer-guess-${attempt}`, 'peer-studio'));
    assert.deepEqual(guess, { ok: false, error: 'invalid_code' });
  }
  assert.equal(studio.mesh.invitationStatus(), null);
  assert.deepEqual(studio.mesh.list(), []);
});

test('a device that relays or imitates the exchange cannot complete it', async () => {
  const studio = device('Studio'), spark = device('Spark');
  const { code } = studio.mesh.invite();
  // A relay forwards Spark's messages to Studio under its own transport
  // identity. Studio binds the proof to the peer it actually talks to.
  const relayed = await spark.mesh.join(code, 'peer-studio', 'peer-spark', transport(studio, 'peer-relay', 'peer-studio'));
  assert.equal(relayed.ok, false);
  assert.equal(studio.mesh.isLinked('peer-relay'), false);
  assert.equal(studio.mesh.isLinked('peer-spark'), false);
  assert.equal(spark.mesh.isLinked('peer-studio'), false);

  // An impostor answers without knowing the code. The joiner must not trust it.
  const impostor = async message => (message.type === 'hello' ? { ok: true, nonce: 'ab'.repeat(16) } : { ok: true, proof: 'cd'.repeat(32), profile: { name: 'Studio' } });
  assert.deepEqual(await spark.mesh.join(code, 'peer-impostor', 'peer-spark', impostor), { ok: false, error: 'untrusted_host' });
  assert.equal(spark.mesh.isLinked('peer-impostor'), false);
});

test('an invitation expires and malformed codes are rejected before any exchange', async () => {
  const studio = device('Studio'), spark = device('Spark');
  const { code, expiresAt } = studio.mesh.invite();
  assert.equal(expiresAt, studio.clock.now + INVITE_TTL_MS);
  studio.clock.now += INVITE_TTL_MS;
  assert.deepEqual(await spark.mesh.join(code, 'peer-studio', 'peer-spark', transport(studio, 'peer-spark', 'peer-studio')), { ok: false, error: 'no_invitation' });
  let sent = 0;
  assert.deepEqual(await spark.mesh.join('12', 'peer-studio', 'peer-spark', async () => { sent++; }), { ok: false, error: 'invalid_code' });
  assert.equal(sent, 0);
  assert.equal(normalizePairingCode('abcd efgh'), 'ABCDEFGH');
  assert.equal(normalizePairingCode('ABCD-EFG1'), null); // 1 is not in the alphabet
});

test('the device identity is sealed by the OS and unreachable through preferences', () => {
  const { mesh, store } = device('Studio');
  assert.equal(mesh.loadIdentity(), null);
  assert.equal(mesh.saveIdentity(Buffer.from('private-key-bytes')), true);
  assert.equal(mesh.loadIdentity().toString(), 'private-key-bytes');
  assert.equal(JSON.stringify(store.data.get(MESH_IDENTITY_KEY)).includes('private-key-bytes'), false);
  for (const key of [MESH_IDENTITY_KEY, MESH_STORE_KEY, `${MESH_STORE_KEY}.devices`]) {
    assert.equal(isMeshPrivateStoreKey(key), true);
    assert.throws(() => assertPublicStoreKey(key), /device linking/);
  }
  assert.doesNotThrow(() => assertPublicStoreKey('p2p.networkMode'));
  // Without OS protection the key is not written at all.
  const unprotected = createMeshDevices({ store: memoryStore(), secureStorage: { isEncryptionAvailable: () => false } });
  assert.equal(unprotected.saveIdentity(Buffer.from('k')), false);
  assert.equal(unprotected.loadIdentity(), null);
});

test('peer-supplied profiles are bounded and unlinking removes trust', () => {
  const { mesh } = device('Studio');
  assert.equal(mesh.remember('peer-unknown', { name: 'Intruder' }), false);
  assert.deepEqual(mesh.list(), []);
  const profile = sanitizeDeviceProfile({ name: `Lab\u0000 ${'x'.repeat(200)}`, memBudget: -5, extra: 'dropped' });
  assert.equal(profile.name.length, 48);
  assert.equal(profile.name.includes('\u0000'), false);
  assert.equal(profile.memBudget, 0);
  assert.equal('extra' in profile, false);
  assert.deepEqual(mesh.settings(), { sharing: true, pooling: 'auto', name: '' });
  assert.equal(mesh.updateSettings({ pooling: 'everything', sharing: false }).pooling, 'auto');
  assert.equal(mesh.settings().sharing, false);
});

test('pooling borrows only when a model does not fit locally and the pool can hold it', () => {
  const studio = { peerId: 'a', name: 'Studio', online: true, sharing: true, memBudget: 180e9 };
  const spark = { peerId: 'b', name: 'Spark', online: true, sharing: true, memBudget: 100e9 };
  const asleep = { peerId: 'c', name: 'Asleep', online: false, sharing: true, memBudget: 500e9 };
  const private_ = { peerId: 'd', name: 'Private', online: true, sharing: false, memBudget: 500e9 };
  const devices = [spark, asleep, private_, studio];
  // Fits locally: stay local, it is faster.
  assert.deepEqual(planPool({ requiredBytes: 20e9, localBudget: 44e9, devices }), []);
  // One lender is enough: take the largest only.
  assert.deepEqual(planPool({ requiredBytes: 150e9, localBudget: 44e9, devices }).map(d => d.name), ['Studio']);
  // Needs both; offline and non-lending devices are never counted.
  assert.deepEqual(planPool({ requiredBytes: 250e9, localBudget: 44e9, devices }).map(d => d.name), ['Studio', 'Spark']);
  // Too large even for the pool: no partial pool.
  assert.deepEqual(planPool({ requiredBytes: 900e9, localBudget: 44e9, devices }), []);
  assert.deepEqual(planPool({ requiredBytes: 150e9, localBudget: 44e9, pooling: 'off', devices }), []);
  assert.equal(lendableMemory(asleep), 0);
  assert.equal(pooledBudget(44e9, devices), 44e9 + lendableMemory(studio) + lendableMemory(spark));
  assert.equal(pooledBudget(44e9, Array(6).fill(spark)), 44e9 + MAX_POOL_DEVICES * lendableMemory(spark));
  assert.ok(modelMemoryNeed(100e9) > 100e9);
  assert.equal(modelMemoryNeed(undefined), 0);
});

test('first run recommends a larger model when linked devices can lend memory', () => {
  const models = [4, 9, 27].map(size => ({ baseKey: `qwen3_5_${size}b`, filename: `qwen-${size}-q4_k_xl.gguf`, parameters: size * 1e9, filesizeBytes: size * 0.6e9 }));
  const laptop = { platform: 'darwin', gpu: 'Apple M2', memBudget: 16 * 0.7e9 };
  const alone = recommendFirstRunModel(models, laptop);
  assert.equal(alone.model.parameters, 9e9);
  assert.equal(alone.pooled, false);
  const pooled = recommendFirstRunModel(models, laptop, { pooledBudget: pooledBudget(laptop.memBudget, [{ online: true, sharing: true, memBudget: 96e9 }]) });
  assert.equal(pooled.model.parameters, 27e9);
  assert.equal(pooled.pooled, true);
  assert.equal(pooled.local.model.parameters, 9e9);
  // A pool that adds nothing changes nothing.
  assert.equal(recommendFirstRunModel(models, laptop, { pooledBudget: laptop.memBudget }).pooled, false);
});
