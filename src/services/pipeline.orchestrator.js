/**
 * BonzAI Pipeline Orchestrator
 *
 * Central coordinator for private distributed inference via llama.cpp RPC.
 *
 * Lifecycle:
 *   - Session STARTS on first pipeline inference request (or explicit start)
 *   - llama-server + tunnels PERSIST across multiple messages
 *   - Session ENDS when user disables pipeline mode or calls cancel
 *
 * The llama-server is NOT killed after each message — it stays warm for
 * fast subsequent requests (no model reload, no Metal shader recompilation).
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getP2PNode } from './libp2p.service.js';
import { createRPCTunnel } from './pipeline.tunnel.js';
import { negotiatePipeline, teardownPipeline } from './pipeline.protocol.js';
import { getShardProviders } from './p2p.contract.service.js';
import * as llamaServer from './llamaServer.manager.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PRIVACY_CONFIG = {
  localProportion: 0.25,
  dpEnabled: false,
  epsilon: 8.0,
  dimensionShuffle: true,
  localTest: false,
};

// Subprocess startup timeout + health polling now live in llamaServer.manager.

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT SESSION STATE
// ═══════════════════════════════════════════════════════════════════════════

let activeSession = null;

export function getActiveSession() {
  return activeSession;
}

// ═══════════════════════════════════════════════════════════════════════════
// GGUF METADATA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read only the 4 GGUF keys we need to decide how to shard a model.
 * Uses a minimal self-contained parser of the GGUF v2/v3 header, scoped to
 * string + uint32/uint64 value types (enough for architecture + block_count +
 * embedding_length + context_length). No dependency on node-llama-cpp.
 */
export function readGGUFMetadata(modelPath) {
  try {
    if (!fs.existsSync(modelPath)) throw new Error(`Not found: ${modelPath}`);

    // GGUF headers are small (< 1MB for any real model).
    const fd = fs.openSync(modelPath, 'r');
    const buf = Buffer.alloc(2 * 1024 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    let off = 0;
    const view = buf.subarray(0, bytesRead);
    const u32 = () => { const v = view.readUInt32LE(off); off += 4; return v; };
    const u64 = () => { const v = Number(view.readBigUInt64LE(off)); off += 8; return v; };
    const i32 = () => { const v = view.readInt32LE(off); off += 4; return v; };
    const i64 = () => { const v = Number(view.readBigInt64LE(off)); off += 8; return v; };
    const f32 = () => { const v = view.readFloatLE(off); off += 4; return v; };
    const f64 = () => { const v = view.readDoubleLE(off); off += 8; return v; };
    const bool = () => { const v = view.readUInt8(off) !== 0; off += 1; return v; };
    const str = () => {
      const len = u64();
      const s = view.toString('utf8', off, off + len);
      off += len;
      return s;
    };

    // GGUF magic "GGUF" (4 bytes) + version (u32)
    const magic = view.toString('ascii', 0, 4);
    if (magic !== 'GGUF') throw new Error(`Not a GGUF file (magic=${magic})`);
    off = 4;
    const version = u32();
    if (version < 2) throw new Error(`Unsupported GGUF version: ${version}`);
    const _tensorCount = u64();
    const kvCount = u64();

    const readValue = () => {
      const type = u32();
      switch (type) {
        case 0: return view.readUInt8(off++); // UINT8
        case 1: { const v = view.readInt8(off); off += 1; return v; } // INT8
        case 2: { const v = view.readUInt16LE(off); off += 2; return v; } // UINT16
        case 3: { const v = view.readInt16LE(off); off += 2; return v; } // INT16
        case 4: return u32();  // UINT32
        case 5: return i32();  // INT32
        case 6: return f32();  // FLOAT32
        case 7: return bool(); // BOOL
        case 8: return str();  // STRING
        case 9: { // ARRAY — skip, we don't need any array-valued keys here
          const elemType = u32();
          const n = u64();
          // Fast-skip: only called on keys we don't care about
          return _skipArray(elemType, n);
        }
        case 10: return u64(); // UINT64
        case 11: return i64(); // INT64
        case 12: return f64(); // FLOAT64
        default: throw new Error(`Unknown GGUF value type: ${type}`);
      }
    };

    const _skipArray = (elemType, n) => {
      const fixedSize = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 }[elemType];
      if (fixedSize != null) { off += n * fixedSize; return []; }
      if (elemType === 8) { for (let i = 0; i < n; i++) str(); return []; }
      if (elemType === 9) throw new Error("Nested arrays not supported");
      throw new Error(`Unknown array elem type: ${elemType}`);
    };

    const meta = {};
    for (let i = 0; i < kvCount; i++) {
      const key = str();
      const value = readValue();
      meta[key] = value;
    }

    const arch = meta['general.architecture'] || 'llama';
    const n_layer = Number(meta[`${arch}.block_count`]) || 32;
    const n_embd = Number(meta[`${arch}.embedding_length`]) || 4096;
    const contextLength = Number(meta[`${arch}.context_length`]) || 4096;

    return { n_layer, n_embd, architecture: arch, contextLength };
  } catch (e) {
    console.warn(`[Pipeline] GGUF metadata read failed, using defaults:`, e.message);
    return { n_layer: 32, n_embd: 4096, architecture: 'llama', contextLength: 4096 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BINARY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

// Binary resolution and subprocess lifecycle now live entirely in
// services/llamaServer.manager.js. The orchestrator keeps only the
// session-level concerns: shard discovery, tunnel lifecycle, negotiation,
// privacy audit metadata.

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure a pipeline session is running for the given model.
 * If a session already exists for the same model + config, reuse it.
 * If not, tear down the old one and create a new one.
 */
async function ensureSession(modelPath, privacyConfig, onStatus) {
  const config = { ...DEFAULT_PRIVACY_CONFIG, ...privacyConfig };

  // Reuse existing session if same model and llama-server is still alive.
  // The subprocess is owned by llamaServer.manager; we check its state
  // through the manager, not a private reference.
  if (activeSession &&
      activeSession.modelPath === modelPath &&
      llamaServer.isRunning()) {
    try {
      const port = llamaServer.getActivePort();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        onStatus?.('Using existing pipeline session');
        return activeSession;
      }
    } catch {}
    console.log('[Pipeline] Existing llama-server is unresponsive, restarting...');
    await cleanupSession(activeSession);
    activeSession = null;
  }

  // Tear down any stale session
  if (activeSession) {
    await cleanupSession(activeSession);
    activeSession = null;
  }

  const sessionId = crypto.randomUUID();
  const status = (msg) => {
    console.log(`[Pipeline ${sessionId.slice(0, 8)}] ${msg}`);
    onStatus?.(msg);
  };

  const session = {
    sessionId,
    modelPath,
    status: 'starting',
    tunnels: [],
    peerIds: [],
    startTime: Date.now(),
    requestCount: 0,
  };

  // ─── Read model metadata ──────────────────────────────────
  status('Reading model metadata...');
  const meta = readGGUFMetadata(modelPath);
  session.meta = meta;
  status(`Model: ${meta.architecture}, ${meta.n_layer} layers, ${meta.n_embd} dims`);

  // ─── Resolve RPC endpoints ────────────────────────────────
  const localPct = Math.round(config.localProportion * 100);
  const remotePct = 100 - localPct;
  let rpcAddresses;
  let tensorSplit;

  // Unified shard discovery: check local rpc-server, LAN peers, selected providers, on-chain registry
  {
    // P2P mode — use selected providers, LAN peers, or local rpc-server
    status('Discovering shard providers...');
    session.status = 'discovering';

    // 1. Check selected providers passed from inference handler or discovered via mDNS
    const p2pNode = getP2PNode();
    const selectedProviders = config.selectedProviders || [];

    // Filter to LAN providers with known addresses
    const lanShardPeers = selectedProviders.filter(p => p.lanAddress);

    // Also check auto-discovered LAN peers not in selection
    const discoveredLAN = (p2pNode?.getLANPeers() || []).filter(p => p.lanAddress);
    for (const lp of discoveredLAN) {
      if (!lanShardPeers.some(s => s.peerId === lp.peerId)) {
        lanShardPeers.push(lp);
      }
    }

    if (lanShardPeers.length > 0) {
      status(`Found ${lanShardPeers.length} LAN shard provider(s) (free, direct connection)`);
      rpcAddresses = lanShardPeers.map(p => `${p.lanAddress}:50052`).join(',');
      tensorSplit = `${localPct},${remotePct}`;
      status(`LAN pipeline: tensor-split ${tensorSplit}, rpc ${rpcAddresses}`);
    } else {
      // 2. Check if local rpc-server is running (Self Service mode — same machine testing)
      let localRpcAvailable = false;
      try {
        const net = await import('net');
        await new Promise((resolve, reject) => {
          const sock = net.default.createConnection({ host: '127.0.0.1', port: 50052 }, () => {
            sock.destroy();
            resolve();
          });
          sock.on('error', reject);
          sock.setTimeout(2000, () => { sock.destroy(); reject(new Error('timeout')); });
        });
        localRpcAvailable = true;
      } catch { /* */ }

      if (localRpcAvailable) {
        status('Using local rpc-server on :50052 (self-serve)');
        rpcAddresses = '127.0.0.1:50052';
        tensorSplit = `${localPct},${remotePct}`;
        status(`Self-serve pipeline: tensor-split ${tensorSplit}`);
      } else {
        // 3. Fall back to on-chain provider registry
        let candidatePeers;
        try {
          candidatePeers = await getShardProviders(4, 1024);
        } catch {
          candidatePeers = [];
        }

        if (candidatePeers.length === 0) {
          throw new Error(
            'No shard providers available. Start your node in Provider mode, ' +
            'connect to a LAN provider, or ensure remote providers are online.'
          );
        }

      status(`Found ${candidatePeers.length} shard provider(s)`);
      session.status = 'planning';

      const peerCount = Math.min(candidatePeers.length, 3);
      const selectedPeers = candidatePeers.slice(0, peerCount);
      const perPeerPct = Math.floor(remotePct / peerCount);

      const splits = [localPct];
      for (let i = 0; i < peerCount; i++) {
        splits.push(i === peerCount - 1 ? remotePct - perPeerPct * (peerCount - 1) : perPeerPct);
      }
      tensorSplit = splits.join(',');

      // Negotiate + create tunnels
      const peerAssignments = selectedPeers.map((p, i) => ({
        peerId: p.peerId, wallet: p.wallet, layerProportion: splits[i + 1] / 100,
      }));
      session.peerIds = peerAssignments.map((p) => p.peerId);

      await negotiatePipeline(peerAssignments, {
        sessionId, modelId: path.basename(modelPath), totalLayers: meta.n_layer, payment: null,
      });

      for (const assignment of peerAssignments) {
        const tunnel = await createRPCTunnel(p2pNode, assignment.peerId);
        session.tunnels.push(tunnel);
      }
      rpcAddresses = session.tunnels.map((t) => `127.0.0.1:${t.localPort}`).join(',');
      status(`Tunnels established: ${rpcAddresses}`);
      }
    }
  }

  // ─── Spawn llama-server ───────────────────────────────────
  status('Starting llama-server (persists across messages)...');
  session.status = 'starting';

  // Build privacy audit info (consumed by UI — no subprocess info needed).
  const rpcPeers = rpcAddresses.split(',').map((s) => s.trim()).filter(Boolean);
  session.privacyAudit = {
    totalLayers: meta.n_layer,
    localLayers: Math.round(meta.n_layer * config.localProportion),
    remoteLayers: meta.n_layer - Math.round(meta.n_layer * config.localProportion),
    tensorSplit,
    rpcAddresses,
    localTest: !!config.localTest,
    whatClientKeeps: [
      'Tokenizer (text → token IDs)',
      'Embedding layer (token IDs → vectors)',
      `First ${Math.ceil(meta.n_layer * config.localProportion / 2)} transformer layers`,
      `Last ${Math.floor(meta.n_layer * config.localProportion / 2)} transformer layers`,
      'Unembedding (vectors → token IDs)',
      'Sampling (token selection)',
      'Detokenization (token IDs → text)',
    ],
    whatPeerSees: [
      'Opaque float16 tensor multiply/add operations',
      'Tensor dimensions (public model architecture info)',
      'Timing of operations',
    ],
    whatPeerNeverSees: [
      'Prompt text or token IDs',
      'Generated output text',
      'Vocabulary / tokenizer',
      'Consumer identity (in P2P mode)',
    ],
  };

  // Delegate subprocess lifecycle to llamaServer.manager. Same process is
  // shared with private/consumer chat — the only difference is this spawn
  // carries -rpc + --tensor-split + --split-mode + --no-warmup + -np 1.
  const resourcesPath = process.resourcesPath || null;
  const { port } = await llamaServer.startModel(
    {
      modelPath,
      ctxSize: Math.min(meta.contextLength, 8192),
      ngl: 999,
      rpcPeers,
      tensorSplit,
      splitMode: 'layer',
      parallelSlots: 1,
      noWarmup: true,
      // Privacy sessions never use speculative decoding or mmproj — the
      // overhead of an extra model load would blow the startup window.
    },
    { resourcesPath },
  );

  // React to subprocess death so UI can notice and the session cleans up.
  if (!session._exitUnsub) {
    session._exitUnsub = llamaServer.onExit(() => {
      if (activeSession?.sessionId === sessionId) {
        activeSession.status = 'stopped';
      }
    });
  }

  session.llamaServerPort = port;
  session.status = 'ready';
  status(`llama-server ready on :${port} — session will persist across messages`);

  activeSession = session;
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run inference through the pipeline. Starts the session if not already running.
 * The session (llama-server) persists — subsequent calls are fast.
 */
export async function runPipelineInference({
  modelPath,
  request,
  privacyConfig = {},
  signer,
  onToken,
  onStatus,
}) {
  const session = await ensureSession(modelPath, privacyConfig, onStatus);

  onStatus?.('Running inference...');
  session.status = 'inferring';
  session.requestCount++;

  const result = await runLlamaServerInference(session.llamaServerPort, request, onToken);

  session.status = 'ready';
  onStatus?.(`Generated ${result.tokensGenerated} tokens`);

  return {
    ...result,
    sessionId: session.sessionId,
    peersUsed: session.peerIds.length,
    requestCount: session.requestCount,
  };
}

/**
 * Cancel the active pipeline session.
 * Kills llama-server, closes tunnels, notifies peers.
 */
export async function cancelPipelineSession() {
  if (!activeSession) return;
  console.log(`[Pipeline] Cancelling session ${activeSession.sessionId.slice(0, 8)}... (${activeSession.requestCount} requests served)`);
  await cleanupSession(activeSession);
  activeSession = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLAMA-SERVER INTERACTION
// ═══════════════════════════════════════════════════════════════════════════

async function runLlamaServerInference(_port, request, onToken) {
  // _port is ignored — the manager owns the subprocess and its port.
  const { prompt, maxTokens = 512, temperature = 0.7, systemPrompt } = request;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  if (onToken) {
    let tokensGenerated = 0;
    const fullText = await llamaServer.chatStream(
      { messages, maxTokens, temperature },
      (chunk) => { tokensGenerated++; onToken(chunk); },
    );
    return { text: fullText, tokensGenerated };
  }

  const result = await llamaServer.chat({ messages, maxTokens, temperature });
  const text = result.choices?.[0]?.message?.content ?? '';
  return {
    text,
    tokensGenerated: result.usage?.completion_tokens || text.split(/\s+/).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupSession(session) {
  // Subprocess is owned by llamaServer.manager — stop it through the manager.
  if (llamaServer.isRunning()) {
    try { await llamaServer.stopModel(); } catch (e) {
      console.warn('[Pipeline] llama-server stop warning:', e.message);
    }
  }

  if (session._exitUnsub) {
    try { session._exitUnsub(); } catch {}
    session._exitUnsub = null;
  }

  for (const tunnel of session.tunnels) {
    try { await tunnel.close(); } catch {}
  }

  if (session.peerIds.length > 0) {
    await teardownPipeline(session.sessionId, session.peerIds);
  }
}
