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

  unsubscribe = api.onMeshActivity?.((_event, activity) => push(activity));
  try {
    const discoveryEnabled = await api.store.get("p2p.discoveryEnabled", true);
    if (discoveryEnabled) {
      await api.p2pStart({ listenPort: 4002, enableRelay: false, bootstrapNodes: [] });
    }
    await refresh();
    await discoverRegistryPeers();
    pollTimer = setInterval(refresh, 15000);
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
  setMode,
  markRead,
  teardown,
};

export default meshStore;
