/**
 * Main-process coordinator for linked devices.
 *
 * Owns the persistent device identity, the pairing and status protocols, the
 * decision to lend this device's llama.cpp rpc-server to linked devices, and
 * the tunnels used to borrow their memory when a model does not fit here.
 * All traffic rides the encrypted libp2p transport; the rpc-server itself
 * stays bound to loopback.
 */
import os from 'node:os';
import { PROTOCOLS, createNodeIdentity } from '../services/libp2p.service.js';
import { createRPCTunnel, registerRPCTunnelHandler } from '../services/pipeline.tunnel.js';
import { modelMemoryNeed, planPool, pooledBudget } from '../services/meshPlan.js';

export const MESH_RPC_PORT = 50052;
const STATUS_TTL_MS = 10000;
const STATUS_TIMEOUT_MS = 4000;

export function createMeshController({
  devices, node, systemInformation, version, networkMode,
  startRpcServer, rpcServerRunning, notify = () => {},
  tunnel = { create: createRPCTunnel, register: registerRPCTunnelHandler },
  newIdentity = createNodeIdentity, hostname = os.hostname, now = Date.now,
}) {
  let system = {};
  let persistentIdentity = false;
  let statusCache = { at: 0, value: [] };
  let poolTunnels = [];
  let poolDevices = [];
  let lendingError = null;

  const started = () => node()?.isStarted === true;

  function selfProfile() {
    return {
      name: devices.settings().name || String(hostname() || '').replace(/\.(local|lan|home)$/i, '') || 'BonzAI device',
      platform: process.platform,
      arch: process.arch,
      gpu: system.gpu && system.gpu !== 'Unknown' ? system.gpu : '',
      memBudget: system.memBudget || 0,
      version: version(),
    };
  }

  async function refreshSystem() {
    try { system = (await systemInformation()) || {}; } catch { /* keep the last reading */ }
    return system;
  }

  /** Private key bytes for the libp2p node; created on first use. */
  async function identity() {
    const saved = devices.loadIdentity();
    if (saved) { persistentIdentity = true; return saved; }
    const created = await newIdentity();
    try { persistentIdentity = devices.saveIdentity(created); } catch { persistentIdentity = false; }
    return created;
  }

  /** May this peer use the local rpc-server? Checked for every stream. */
  function authorizeTunnel(peerId) {
    if (devices.isLinked(peerId) && devices.settings().sharing) return true;
    return networkMode() === 'provider';
  }

  /** Lend compute to linked devices: loopback rpc-server behind the tunnel. */
  async function ensureLending() {
    if (!started() || !devices.settings().sharing || devices.list().length === 0) return false;
    try {
      if (!rpcServerRunning()) {
        const result = await startRpcServer(MESH_RPC_PORT);
        if (!result?.ok) throw new Error(result?.error || 'rpc-server did not start');
      }
      await tunnel.register(node(), MESH_RPC_PORT, { authorize: authorizeTunnel });
      lendingError = null;
      return true;
    } catch (error) {
      lendingError = error.message;
      console.warn('[Mesh] Cannot lend compute to linked devices:', error.message);
      return false;
    }
  }

  async function handleDevice(message, remotePeer) {
    if (!devices.isLinked(remotePeer)) return { ok: false, error: 'not_linked' };
    if (message?.type === 'unlink') {
      devices.unlink(remotePeer);
      statusCache.at = 0;
      notify({ type: 'device_unlinked', peerId: remotePeer });
      return { ok: true };
    }
    if (message?.profile) devices.remember(remotePeer, message.profile);
    await refreshSystem();
    return { ok: true, profile: selfProfile(), sharing: devices.settings().sharing && rpcServerRunning() };
  }

  /** Register the linked-device protocols on a started node. */
  async function attach() {
    const p2p = node();
    await p2p.onJson(PROTOCOLS.MESH_PAIR, async (message, remotePeer) => {
      const reply = await devices.handlePair(message, remotePeer, p2p.getPeerId());
      if (reply.ok && reply.device) {
        statusCache.at = 0;
        notify({ type: 'device_linked', peerId: remotePeer });
        ensureLending();
        return { ok: true, proof: reply.proof, profile: reply.profile };
      }
      return reply;
    });
    await p2p.onJson(PROTOCOLS.MESH_DEVICE, handleDevice);
    await refreshSystem();
    await ensureLending();
  }

  /** Live view of every linked device. A device that unlinked us is dropped. */
  async function deviceStatuses({ fresh = false } = {}) {
    if (!started()) return devices.list().map(device => ({ ...device, online: false }));
    if (!fresh && now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;
    const p2p = node();
    const profile = selfProfile();
    const value = (await Promise.all(devices.list().map(async (device) => {
      try {
        const reply = await p2p.requestJson(device.peerId, PROTOCOLS.MESH_DEVICE, { type: 'status', profile }, { timeoutMs: STATUS_TIMEOUT_MS });
        if (reply?.error === 'not_linked') {
          devices.unlink(device.peerId);
          notify({ type: 'device_unlinked', peerId: device.peerId });
          return null;
        }
        if (!reply?.ok) return { ...device, online: false };
        devices.remember(device.peerId, reply.profile);
        const current = devices.list().find(item => item.peerId === device.peerId) || device;
        return { ...current, online: true, sharing: reply.sharing === true };
      } catch {
        return { ...device, online: false };
      }
    }))).filter(Boolean);
    statusCache = { at: now(), value };
    return value;
  }

  async function state() {
    await refreshSystem();
    const p2p = node();
    const linked = await deviceStatuses();
    const linkedIds = new Set(linked.map(device => device.peerId));
    const nearby = started() ? p2p.getLANPeers().filter(peer => !linkedIds.has(peer.peerId)).length : 0;
    return {
      ok: true,
      started: started(),
      self: { peerId: started() ? p2p.getPeerId() : null, ...selfProfile(), persistentIdentity },
      devices: linked,
      nearby,
      invitation: devices.invitationStatus(),
      settings: devices.settings(),
      lending: { active: devices.settings().sharing && linked.length > 0 && rpcServerRunning(), error: lendingError },
      pool: { active: poolTunnels.length > 0, devices: poolDevices.map(device => ({ peerId: device.peerId, name: device.name })) },
      pooledBudget: pooledBudget(system.memBudget, linked),
    };
  }

  function invite() {
    if (!started()) return { ok: false, error: 'mesh_offline' };
    return { ok: true, invitation: devices.invite() };
  }

  /** Try the code against nearby devices; only one with an open invitation answers. */
  async function join(code) {
    if (!started()) return { ok: false, error: 'mesh_offline' };
    const p2p = node();
    const self = p2p.getPeerId();
    const candidates = [...new Set([...p2p.getLANPeers().map(peer => peer.peerId), ...p2p.getConnectedPeerIds()])]
      .filter(peerId => peerId !== self && !devices.isLinked(peerId));
    if (candidates.length === 0) return { ok: false, error: 'no_devices' };
    let failure = 'no_invitation';
    for (const hostId of candidates) {
      let result;
      try {
        result = await devices.join(code, hostId, self, message => p2p.requestJson(hostId, PROTOCOLS.MESH_PAIR, message, { timeoutMs: 20000 }));
      } catch { continue; }
      if (result.ok) {
        statusCache.at = 0;
        notify({ type: 'device_linked', peerId: hostId });
        await ensureLending();
        return { ok: true, device: result.device };
      }
      // A device with an open invitation rejected the code, or answered
      // without proving it knows the code. Keep looking; report a wrong code.
      if (['invalid_code', 'untrusted_host'].includes(result.error)) failure = 'invalid_code';
    }
    return { ok: false, error: failure };
  }

  async function unlink(peerId) {
    const wasLinked = devices.isLinked(peerId);
    if (wasLinked && started()) {
      // Best effort: the other device also learns on its next status check.
      try { await node().requestJson(peerId, PROTOCOLS.MESH_DEVICE, { type: 'unlink' }, { timeoutMs: STATUS_TIMEOUT_MS }); } catch { /* offline */ }
    }
    devices.unlink(peerId);
    statusCache.at = 0;
    if (poolDevices.some(device => device.peerId === peerId)) await releasePool();
    return { ok: true, removed: wasLinked };
  }

  async function updateSettings(patch) {
    const settings = devices.updateSettings(patch);
    statusCache.at = 0;
    if (settings.sharing) await ensureLending();
    return { ok: true, settings };
  }

  /**
   * Borrow memory from linked devices for a model that does not fit here.
   * Resolves to local llama.cpp `--rpc` endpoints, or null to load locally.
   */
  async function preparePool({ filesizeBytes, localBudget }) {
    await releasePool();
    if (!started() || devices.list().length === 0) return null;
    const chosen = planPool({
      requiredBytes: modelMemoryNeed(filesizeBytes),
      localBudget,
      pooling: devices.settings().pooling,
      devices: await deviceStatuses({ fresh: true }),
    });
    if (chosen.length === 0) return null;
    const opened = [];
    for (const device of chosen) {
      try { opened.push({ device, tunnel: await tunnel.create(node(), device.peerId) }); }
      catch (error) { console.warn(`[Mesh] ${device.name} is not reachable for pooling:`, error.message); }
    }
    // A partial pool cannot hold the model; loading would only thrash.
    if (opened.length !== chosen.length) {
      await Promise.all(opened.map(item => item.tunnel.close().catch(() => {})));
      return null;
    }
    poolTunnels = opened.map(item => item.tunnel);
    poolDevices = opened.map(item => item.device);
    notify({ type: 'pool_started', devices: poolDevices.map(device => device.name) });
    return { rpcPeers: poolTunnels.map(item => `127.0.0.1:${item.localPort}`), devices: poolDevices };
  }

  async function releasePool() {
    const closing = poolTunnels;
    if (closing.length === 0) return;
    poolTunnels = [];
    poolDevices = [];
    await Promise.all(closing.map(item => item.close().catch(() => {})));
    notify({ type: 'pool_stopped' });
  }

  return {
    identity, attach, state, invite, cancelInvite: () => { devices.closeInvitation(); return { ok: true }; },
    join, unlink, updateSettings, authorizeTunnel, ensureLending, preparePool, releasePool,
    linkedPeerIds: () => devices.list().map(device => device.peerId),
  };
}
