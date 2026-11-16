/**
 * Linked devices: the user's own BonzAI computers on the local network.
 *
 * Discovery alone grants nothing. Two devices become linked only after the
 * user reads a one-time code from one device and types it on the other. Both
 * sides then prove knowledge of that code, bound to the peer identities that
 * the encrypted transport has already authenticated, so a device relaying or
 * imitating the exchange cannot complete it. Linked devices may lend each
 * other compute; every other peer keeps the existing network-mode rules.
 */
import crypto from 'node:crypto';

export const MESH_STORE_KEY = 'mesh-devices';
export const MESH_IDENTITY_KEY = 'mesh-identity-secret';
export const INVITE_TTL_MS = 5 * 60 * 1000;
export const MAX_INVITE_ATTEMPTS = 5;
export const MAX_LINKED_DEVICES = 16;

// No 0/O/1/I: the code is read from one screen and typed on another.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const POOLING_MODES = new Set(['auto', 'off']);
// Memory-hard stretch: a device that captures one proof cannot enumerate the
// 2^40 code space before the invitation expires.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

/** Generic preference IPC must not read the identity or grant trust. */
export function isMeshPrivateStoreKey(key) {
  return [MESH_STORE_KEY, MESH_IDENTITY_KEY].some(name => key === name || String(key).startsWith(`${name}.`));
}

export function normalizePairingCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LENGTH || [...code].some(char => !CODE_ALPHABET.includes(char))) return null;
  return code;
}

export function formatPairingCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function newPairingCode() {
  // 256 is a multiple of the alphabet size, so the modulo is unbiased.
  return [...crypto.randomBytes(CODE_LENGTH)].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function isNonce(value) {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

function derivePairingKey(code, { hostId, joinerId, hostNonce, joinerNonce }) {
  const salt = crypto.createHash('sha256')
    .update(['bonzai-mesh-pair-v1', hostId, joinerId, hostNonce, joinerNonce].join('\n'))
    .digest();
  return new Promise((resolve, reject) => {
    crypto.scrypt(code, salt, 32, SCRYPT, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

const proof = (key, label) => crypto.createHmac('sha256', key).update(label).digest('hex');

function sameProof(expected, received) {
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const bytes = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

/** A peer describes itself; keep only bounded display and planning fields. */
export function sanitizeDeviceProfile(profile = {}) {
  return {
    name: text(profile.name, 48) || 'BonzAI device',
    platform: text(profile.platform, 16),
    arch: text(profile.arch, 16),
    gpu: text(profile.gpu, 80),
    memBudget: bytes(profile.memBudget),
    version: text(profile.version, 24),
  };
}

export function createMeshDevices({ store, secureStorage, now = Date.now, selfProfile = () => ({}) }) {
  let invitation = null; // { code, expiresAt, attempts }
  const pending = new Map(); // joiner peerId -> { hostNonce, joinerNonce }

  const read = () => {
    const saved = store.get(MESH_STORE_KEY, null) || {};
    return {
      devices: Array.isArray(saved.devices) ? saved.devices : [],
      sharing: saved.sharing !== false,
      pooling: POOLING_MODES.has(saved.pooling) ? saved.pooling : 'auto',
      name: text(saved.name, 48),
    };
  };
  const write = next => store.set(MESH_STORE_KEY, next);

  function list() { return read().devices.map(device => ({ ...device })); }
  function isLinked(peerId) { return typeof peerId === 'string' && read().devices.some(device => device.peerId === peerId); }

  function link(peerId, profile) {
    const state = read();
    const others = state.devices.filter(device => device.peerId !== peerId);
    if (others.length >= MAX_LINKED_DEVICES) throw new Error('Too many linked devices. Unlink one first.');
    const device = { peerId, ...sanitizeDeviceProfile(profile), linkedAt: now() };
    write({ ...state, devices: [...others, device] });
    return device;
  }

  function unlink(peerId) {
    const state = read();
    const devices = state.devices.filter(device => device.peerId !== peerId);
    if (devices.length === state.devices.length) return false;
    write({ ...state, devices });
    return true;
  }

  /** Refresh what a linked device last said about itself. Never links. */
  function remember(peerId, profile) {
    const state = read();
    if (!state.devices.some(device => device.peerId === peerId)) return false;
    write({ ...state, devices: state.devices.map(device => (device.peerId === peerId ? { ...device, ...sanitizeDeviceProfile(profile), seenAt: now() } : device)) });
    return true;
  }

  function settings() {
    const { sharing, pooling, name } = read();
    return { sharing, pooling, name };
  }

  function updateSettings(patch = {}) {
    const state = read();
    const next = { ...state };
    if (typeof patch.sharing === 'boolean') next.sharing = patch.sharing;
    if (POOLING_MODES.has(patch.pooling)) next.pooling = patch.pooling;
    if (typeof patch.name === 'string') next.name = text(patch.name, 48);
    write(next);
    return settings();
  }

  function activeInvitation() {
    if (invitation && invitation.expiresAt <= now()) closeInvitation();
    return invitation;
  }

  function closeInvitation() {
    invitation = null;
    pending.clear();
  }

  function invite() {
    invitation = { code: newPairingCode(), expiresAt: now() + INVITE_TTL_MS, attempts: 0 };
    pending.clear();
    return invitationStatus();
  }

  function invitationStatus() {
    const open = activeInvitation();
    return open ? { code: formatPairingCode(open.code), expiresAt: open.expiresAt } : null;
  }

  /** Host side of the exchange. `joinerId` comes from the encrypted transport. */
  async function handlePair(message, joinerId, hostId) {
    const open = activeInvitation();
    if (!open) return { ok: false, error: 'no_invitation' };
    if (message?.type === 'hello') {
      if (!isNonce(message.nonce)) return { ok: false, error: 'invalid_request' };
      if (pending.size >= 8 && !pending.has(joinerId)) return { ok: false, error: 'busy' };
      const hostNonce = crypto.randomBytes(16).toString('hex');
      pending.set(joinerId, { hostNonce, joinerNonce: message.nonce });
      return { ok: true, nonce: hostNonce };
    }
    if (message?.type !== 'prove') return { ok: false, error: 'invalid_request' };
    const exchange = pending.get(joinerId);
    pending.delete(joinerId);
    if (!exchange) return { ok: false, error: 'invalid_request' };
    // Count before the expensive check so a failed or abandoned attempt is spent.
    open.attempts += 1;
    const key = await derivePairingKey(open.code, { hostId, joinerId, ...exchange });
    if (!sameProof(proof(key, 'join'), message.proof)) {
      if (open.attempts >= MAX_INVITE_ATTEMPTS) closeInvitation();
      return { ok: false, error: 'invalid_code' };
    }
    if (invitation !== open) return { ok: false, error: 'no_invitation' };
    // The joiner describes itself later, over the linked-device protocol.
    const device = link(joinerId, {});
    closeInvitation(); // single use
    return { ok: true, proof: proof(key, 'accept'), profile: sanitizeDeviceProfile(selfProfile()), device };
  }

  /**
   * Joiner side. `send` delivers one message to `hostId` over the encrypted
   * transport and resolves with the reply.
   */
  async function join(codeInput, hostId, joinerId, send) {
    const code = normalizePairingCode(codeInput);
    if (!code) return { ok: false, error: 'invalid_code' };
    if (hostId === joinerId) return { ok: false, error: 'invalid_request' };
    const joinerNonce = crypto.randomBytes(16).toString('hex');
    const hello = await send({ version: 1, type: 'hello', nonce: joinerNonce });
    if (!hello?.ok) return { ok: false, error: hello?.error || 'unreachable' };
    if (!isNonce(hello.nonce)) return { ok: false, error: 'invalid_response' };
    const key = await derivePairingKey(code, { hostId, joinerId, hostNonce: hello.nonce, joinerNonce });
    // No profile yet: the host has not proven it knows the code.
    const accepted = await send({ version: 1, type: 'prove', proof: proof(key, 'join') });
    if (!accepted?.ok) return { ok: false, error: accepted?.error || 'unreachable' };
    // Without this the host could be any device that merely saw our proof.
    if (!sameProof(proof(key, 'accept'), accepted.proof)) return { ok: false, error: 'untrusted_host' };
    return { ok: true, device: link(hostId, accepted.profile) };
  }

  /** Libp2p private key bytes, or null when none is stored or readable. */
  function loadIdentity() {
    const saved = store.get(MESH_IDENTITY_KEY, null);
    if (!saved?.encrypted || !secureStorage?.isEncryptionAvailable?.()) return null;
    try { return Buffer.from(secureStorage.decryptString(Buffer.from(saved.encrypted, 'base64')), 'base64'); }
    catch { return null; }
  }

  /** Returns false when the OS cannot protect the key; links then last one run. */
  function saveIdentity(identity) {
    if (!secureStorage?.isEncryptionAvailable?.()) return false;
    const encrypted = secureStorage.encryptString(Buffer.from(identity).toString('base64')).toString('base64');
    store.set(MESH_IDENTITY_KEY, { encrypted, createdAt: now() });
    return true;
  }

  return {
    list, isLinked, unlink, remember, settings, updateSettings,
    invite, invitationStatus, closeInvitation, handlePair, join,
    loadIdentity, saveIdentity,
  };
}
