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

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getP2PNode } from './libp2p.service.js';
import { createRPCTunnel } from './pipeline.tunnel.js';
import { negotiatePipeline, teardownPipeline } from './pipeline.protocol.js';
import {
  signPipelinePayment,
  calculatePipelinePaymentSplit,
} from './x402.service.js';
import { getShardProviders } from './p2p.contract.service.js';

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

const LLAMA_SERVER_STARTUP_TIMEOUT = 60000; // 60s (includes Metal shader compilation)
const LLAMA_SERVER_HEALTH_INTERVAL = 2000;

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

export function readGGUFMetadata(modelPath) {
  try {
    // Use --key to read specific fields instead of dumping entire metadata
    // (avoids ENOBUFS for models with large vocab like Qwen 248K tokens)
    const readKey = (key) => {
      try {
        return execSync(
          `npx node-llama-cpp inspect gguf -m "${modelPath}" --key "${key}"`,
          { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
      } catch { return null; }
    };

    const arch = readKey('general.architecture') || 'llama';
    const n_layer = parseInt(readKey(`${arch}.block_count`), 10) || 32;
    const n_embd = parseInt(readKey(`${arch}.embedding_length`), 10) || 4096;
    const contextLength = parseInt(readKey(`${arch}.context_length`), 10) || 4096;

    return { n_layer, n_embd, architecture: arch, contextLength };
  } catch (e) {
    console.warn(`[Pipeline] GGUF metadata read failed, using defaults:`, e.message);
    return { n_layer: 32, n_embd: 4096, architecture: 'llama', contextLength: 4096 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BINARY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

function findLlamaServerBinary() {
  const platform = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform] || process.platform;
  const arch = process.arch;
  const ext = process.platform === 'win32' ? '.exe' : '';
  const name = `llama-server${ext}`;
  const resourcesPath = process.resourcesPath || '';

  const searchPaths = [
    path.join(process.cwd(), 'bin', `${platform}-${arch}`, name),
    // electron-packager bundles app source under Resources/app/
    resourcesPath ? path.join(resourcesPath, 'app', 'bin', `${platform}-${arch}`, name) : null,
    // electron-forge copies to Resources/server/llama-runtime/
    resourcesPath ? path.join(resourcesPath, 'server', 'llama-runtime', `${platform}-${arch}`, name) : null,
  ].filter(Boolean);

  const found = searchPaths.find(p => fs.existsSync(p));
  if (found) return found;

  throw new Error(`llama-server binary not found at: ${searchPaths.join(', ')}`);
}

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

  // Reuse existing session if same model and llama-server is still alive
  if (activeSession &&
      activeSession.modelPath === modelPath &&
      activeSession.llamaServerProcess &&
      !activeSession.llamaServerProcess.killed) {
    // Verify llama-server is still healthy
    try {
      const res = await fetch(`http://127.0.0.1:${activeSession.llamaServerPort}/health`);
      if (res.ok) {
        onStatus?.('Using existing pipeline session');
        return activeSession;
      }
    } catch {}
    // Server died — clean up and recreate
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
    llamaServerProcess: null,
    llamaServerPort: null,
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
      // 2. Check if local rpc-server is running (self-serve: same machine is both consumer + provider)
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

  const llamaBin = findLlamaServerBinary();
  const dynamicPort = 8080 + Math.floor(Math.random() * 1000);

  const args = [
    '--model', modelPath,
    '--rpc', rpcAddresses,
    '--tensor-split', tensorSplit,
    '--split-mode', 'layer',
    '--port', String(dynamicPort),
    '--host', '127.0.0.1',
    '-ngl', '999',
    '--ctx-size', String(Math.min(meta.contextLength, 8192)),
    '--parallel', '1',   // Single slot — prevents duplicate completions
    '--no-warmup',       // Skip warmup run — faster startup
  ];

  // Build privacy audit info
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

  session.llamaServerPort = dynamicPort;
  session.llamaServerProcess = spawn(llamaBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  session.llamaServerProcess.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[llama-server] ${line}`);
  });
  session.llamaServerProcess.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[llama-server:err] ${line}`);
  });
  session.llamaServerProcess.on('exit', (code) => {
    console.log(`[Pipeline] llama-server exited with code ${code}`);
    if (activeSession?.sessionId === sessionId) {
      activeSession.status = 'stopped';
    }
  });

  await waitForLlamaServer(dynamicPort);
  session.status = 'ready';
  status(`llama-server ready on :${dynamicPort} — session will persist across messages`);

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

async function waitForLlamaServer(port) {
  const start = Date.now();
  while (Date.now() - start < LLAMA_SERVER_STARTUP_TIMEOUT) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, LLAMA_SERVER_HEALTH_INTERVAL));
  }
  throw new Error(`llama-server failed to start within ${LLAMA_SERVER_STARTUP_TIMEOUT / 1000}s`);
}

async function runLlamaServerInference(port, request, onToken) {
  const { prompt, maxTokens = 512, temperature = 0.7, systemPrompt } = request;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: 'pipeline',
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: !!onToken,
  };

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`llama-server inference failed (${response.status}): ${errText}`);
  }

  if (onToken && body.stream) {
    let fullText = '';
    let tokensGenerated = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            tokensGenerated++;
            onToken(token);
          }
        } catch {}
      }
    }

    return { text: fullText, tokensGenerated };
  } else {
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return {
      text,
      tokensGenerated: data.usage?.completion_tokens || text.split(/\s+/).length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupSession(session) {
  if (session.llamaServerProcess && !session.llamaServerProcess.killed) {
    session.llamaServerProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
    if (!session.llamaServerProcess.killed) {
      session.llamaServerProcess.kill('SIGKILL');
    }
    console.log(`[Pipeline] llama-server stopped`);
  }

  for (const tunnel of session.tunnels) {
    try { await tunnel.close(); } catch {}
  }

  if (session.peerIds.length > 0) {
    await teardownPipeline(session.sessionId, session.peerIds);
  }
}
