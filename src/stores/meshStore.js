import { computed, readonly, shallowReactive } from "vue";
import { getProvidersForPipeline, getRelayNodes } from "../services/p2p.contract.service.js";

const state = shallowReactive({
  ready: false,
  started: false,
  mode: "local",
  connectedPeers: 0,
  lanPeers: 0,
  events: [],
  unread: 0,
  error: null,
  // Linked devices: the user's own computers, paired once with a code.
  self: null,
  devices: [],
  nearby: 0,
  invitation: null,
  settings: { sharing: true, pooling: "auto", name: "" },
  pool: { active: false, devices: [] },
  pooledBudget: 0,
  devicesReady: false,
});

let modeRevision = 0;
function setMode(mode) {
  if (!["local", "consumer", "provider"].includes(mode)) return;
  modeRevision += 1;
  state.mode = mode;
}

let unsubscribe = null;
let pollTimer = null;
let discoveryTimer = null;

function peerAlias(peerId) {
  const id = String(peerId || "");
  return id ? `Peer ${id.slice(-6)}` : "A nearby peer";
}

function describe(event) {
  const peer = peerAlias(event.peerId);
  const labels = {
    peer_discovered: `${peer} joined the mesh`,
    peer_connected: `${peer} connected`,
    peer_disconnected: `${peer} went offline`,
    inference_requested: `${peer} requested ${event.pipeline || "inference"}`,
    inference_completed: `${event.pipeline || "Inference"} completed for ${peer}`,
    device_linked: "A device was linked",
    device_unlinked: "A device was unlinked",
    pool_started: `Running with ${(event.devices || []).join(", ") || "linked devices"}`,
    pool_stopped: "Running on this device only",
  };
  return labels[event.type] || "Mesh activity updated";
}

function push(event) {
  if (!event?.type) return;
  const normalized = { ...event, id: `${event.type}:${event.ts || Date.now()}:${event.peerId || "mesh"}`, label: describe(event) };
  state.events = [normalized, ...state.events].slice(0, 30);
  state.unread += 1;
}

async function refresh() {
  const api = window.electronAPI;
  if (!api?.p2pStatus) return;
  const revision = modeRevision;
  const [status, mode] = await Promise.all([
    api.p2pStatus(),
    api.store.get("p2p.networkMode", "local"),
  ]);
  if (revision === modeRevision) state.mode = mode;
  if (status?.ok) {
    state.started = Boolean(status.started);
    state.connectedPeers = status.connectedPeers || 0;
    state.lanPeers = status.lanPeers || 0;
  }
}

const DEVICE_EVENTS = new Set(["device_linked", "device_unlinked", "pool_started", "pool_stopped", "peer_discovered", "peer_disconnected"]);

/** Linked-device view. Safe to call without the desktop bridge. */
async function refreshDevices() {
  const api = window.electronAPI?.mesh;
  if (!api?.state) return;
  try {
    const view = await api.state();
    if (!view?.ok) return;
    state.self = view.self || null;
    state.devices = view.devices || [];
    state.nearby = view.nearby || 0;
    state.invitation = view.invitation || null;
    state.settings = view.settings || state.settings;
    state.pool = view.pool || { active: false, devices: [] };
    state.pooledBudget = view.pooledBudget || 0;
    state.devicesReady = true;
  } catch {
    // The linked-device view is additive; local use never depends on it.
  }
}

async function invite() {
  const result = await window.electronAPI.mesh.invite();
  await refreshDevices();
  return result;
}

async function cancelInvite() {
  await window.electronAPI.mesh.cancelInvite();
  await refreshDevices();
}

async function join(code) {
  const result = await window.electronAPI.mesh.join(code);
  await refreshDevices();
  return result;
}

async function unlink(peerId) {
  const result = await window.electronAPI.mesh.unlink(peerId);
  await refreshDevices();
  return result;
}

async function updateDeviceSettings(patch) {
  const result = await window.electronAPI.mesh.updateSettings(patch);
  await refreshDevices();
  return result;
}

async function discoverRegistryPeers() {
  const api = window.electronAPI;
  if (!api?.p2pDial || !state.started) return;
  try {
    const [relays, llmProviders] = await Promise.all([
      getRelayNodes(),
      getProvidersForPipeline("llm"),
    ]);
    const peers = [...relays, ...llmProviders].filter((peer, index, all) =>
      peer?.isActive && peer.peerId && all.findIndex((item) => item.peerId === peer.peerId) === index,
    );
    await Promise.allSettled(peers.slice(0, 12).map((peer) => {
      const address = peer.multiaddrs?.find(Boolean) || peer.peerId;
      return api.p2pDial(address);
    }));
  } catch {
    // Registry discovery is additive. LAN discovery remains available when
    // the economy chain or registry cannot be reached.
  }
}

async function init() {
  if (state.ready) return;
  state.ready = true;
  const api = window.electronAPI;
  if (!api?.p2pStart) return;

  unsubscribe = api.onMeshActivity?.((_event, activity) => {
    push(activity);
    if (DEVICE_EVENTS.has(activity?.type)) refreshDevices();
  });
  try {
    const discoveryEnabled = await api.store.get("p2p.discoveryEnabled", true);
    if (discoveryEnabled) {
      await api.p2pStart({ listenPort: 4002, enableRelay: false, bootstrapNodes: [] });
    }
    await refresh();
    await refreshDevices();
    await discoverRegistryPeers();
    pollTimer = setInterval(() => { refresh(); refreshDevices(); }, 15000);
    discoveryTimer = setInterval(discoverRegistryPeers, 60000);
  } catch (error) {
    state.error = error?.message || String(error);
  }
}

function markRead() { state.unread = 0; }

function teardown() {
  unsubscribe?.();
  unsubscribe = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (discoveryTimer) clearInterval(discoveryTimer);
  discoveryTimer = null;
  state.ready = false;
}

const presenceLabel = computed(() => {
  if (!state.started) return "Mesh offline";
  const visible = Math.max(state.connectedPeers, state.lanPeers);
  if (!visible) return "Discovering peers";
  return `${visible} peer${visible === 1 ? "" : "s"} nearby`;
});

export const meshStore = {
  state: readonly(state),
  presenceLabel,
  init,
  refresh,
  refreshDevices,
  invite,
  cancelInvite,
  join,
  unlink,
  updateDeviceSettings,
  setMode,
  markRead,
  teardown,
};

export default meshStore;
