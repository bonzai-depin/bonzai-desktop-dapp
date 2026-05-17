/**
 * Privacy-pipeline bridge — Electron main process side.
 *
 * Sits between the local Python diffuser and the libp2p network. Two roles,
 * dispatched by the user's networking-modal selection (`p2p.networkMode`):
 *
 *   CONSUMER mode
 *     ─────────────
 *     The local Python process is running ShardedDiTPipeline and wants to
 *     ship intermediate activations to a remote shard provider. This module
 *     exposes a UDS server (Unix domain socket) at a deterministic path. For
 *     each new sharded inference session, Python opens one UDS connection,
 *     sends an `open` control message, and then streams shard frames. We:
 *       1. dial the chosen peer over /bonzai/v2/pipeline → SHARD_LOAD
 *       2. on SHARD_LOAD_ACK, open /bonzai/v2/rpc-tunnel for the data plane
 *       3. forward UDS-bound frames → libp2p, libp2p-bound frames → UDS
 *       4. on UDS close (or libp2p close), send SHARD_UNLOAD and tear down
 *
 *   PROVIDER mode
 *     ─────────────
 *     A remote consumer is asking us to run a shard. We register a handler
 *     for /bonzai/v2/pipeline (already done by pipeline.protocol.js) that
 *     accepts SHARD_LOAD, calls our local Flask `/shard/load` HTTP endpoint
 *     (port 65000) to allocate the slice, then accepts the consumer's
 *     /bonzai/v2/rpc-tunnel stream and bridges it to a localhost WebSocket
 *     to Flask `/shard/run/<shardId>`. Time-tracking happens here — the
 *     bridge knows when the data-plane stream opens and closes, which is the
 *     right granularity for ServiceTime accounting.
 *
 * No payment plumbing on either side — remote inference is free and
 * providers are rewarded out of BonzaiMintPool at epoch end via
 * BonzaiServiceTime.recordServiceTime(pid, secondsServed). This module just
 * appends `(pipelineId, seconds)` rows to an NDJSON ledger; the on-chain
 * submission is a separate scheduled job.
 *
 * UDS protocol (Python ↔ this module). One connection = one session. Each
 * message on the wire:
 *
 *   ┌──────┬──────────────┬──────────────┐
 *   │ type │  body length │  body bytes  │
 *   │  u8  │    u32 BE    │              │
 *   └──────┴──────────────┴──────────────┘
 *
 *   type 0x01  CONTROL — UTF-8 JSON, see UdsControlOp below
 *   type 0x02  FRAME   — binary shard frame (38-byte preamble + payload)
 *                        same bytes as travel over libp2p rpc-tunnel
 */

import { createServer, createConnection } from 'node:net';
import { unlinkSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pipe } from 'it-pipe';

import { PROTOCOLS, getP2PNode } from '../services/libp2p.service.js';
import {
  sendShardLoad,
  sendShardUnload,
  pickCodecFlags,
  createShardFrameSplitter,
  encodeShardFrame,
  registerPipelineHandler,
  ShardFrameType,
  ShardFrameFlag,
  SHARD_FRAME_VERSION,
} from '../services/pipeline.protocol.js';

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────

const UDS_TYPE_CONTROL = 0x01;
const UDS_TYPE_FRAME   = 0x02;
const UDS_HEADER_SIZE  = 5; // u8 type + u32 len

const UdsControlOp = Object.freeze({
  OPEN:          'open',
  OPEN_OK:       'open_ok',
  OPEN_ERR:      'open_err',
  REMOTE_ERROR:  'remote_error',
  CLOSE:         'close',
});

// JS supports all flags by default — pure CPU work.
const CLIENT_SUPPORTED_FLAGS = ShardFrameFlag.COMPRESSED_LZ4
  | ShardFrameFlag.QUANTIZED_INT8
  | ShardFrameFlag.DIM_SHUFFLED;

// ─────────────────────────────────────────────────────────────────────────
// PUSHABLE SOURCE — feeds libp2p stream.sink without `it-pushable` dep
// ─────────────────────────────────────────────────────────────────────────

function makePushable() {
  const queue = [];
  const waiters = [];
  let ended = false;
  let error = null;

  return {
    push(chunk) {
      if (ended) return;
      const w = waiters.shift();
      if (w) w.resolve({ value: chunk, done: false });
      else queue.push(chunk);
    },
    end(err) {
      if (ended) return;
      ended = true;
      if (err) error = err;
      while (waiters.length) {
        const w = waiters.shift();
        if (err) w.reject(err);
        else w.resolve({ value: undefined, done: true });
      }
    },
    [Symbol.asyncIterator]() { return this; },
    next() {
      if (error) return Promise.reject(error);
      if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
      if (ended)        return Promise.resolve({ value: undefined,    done: true  });
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    return() { this.end(); return Promise.resolve({ value: undefined, done: true }); },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// UDS FRAMING — matches src/server/pipeline_transport.py
// ─────────────────────────────────────────────────────────────────────────

function encodeUdsMessage(type, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const buf = Buffer.alloc(UDS_HEADER_SIZE + payload.length);
  buf.writeUInt8(type, 0);
  buf.writeUInt32BE(payload.length, 1);
  if (payload.length) payload.copy(buf, UDS_HEADER_SIZE);
  return buf;
}

function encodeControl(op, fields = {}) {
  return encodeUdsMessage(UDS_TYPE_CONTROL, JSON.stringify({ op, ...fields }));
}

/** Stateful splitter for the UDS wire. */
function createUdsSplitter(onMessage) {
  let buffered = Buffer.alloc(0);
  return {
    push(chunk) {
      buffered = buffered.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([buffered, Buffer.from(chunk)]);
      while (buffered.length >= UDS_HEADER_SIZE) {
        const len = buffered.readUInt32BE(1);
        const total = UDS_HEADER_SIZE + len;
        if (buffered.length < total) break;
        const type = buffered.readUInt8(0);
        const body = buffered.subarray(UDS_HEADER_SIZE, total);
        buffered = buffered.subarray(total);
        try { onMessage(type, body); }
        catch (e) { console.error('[shard-bridge] UDS message handler threw:', e); }
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SOCKET PATHS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick a UDS path that's writable on macOS, Linux, and Windows 10 1803+.
 * Lengths matter: Linux caps at 108 bytes, macOS at 104, including the NUL.
 * `tmpdir()` resolves to short paths on all three (even Electron-packaged
 * sandboxed app instances), so we stay well under the cap.
 *
 * Per-pid suffix avoids collisions when the user has two BonzAI instances
 * running (the integration smoke test in CI runs two against each other).
 */
export function defaultShardSocketPath() {
  const fname = `bonzai-shard-${process.pid}.sock`;
  return join(tmpdir(), fname);
}

// ─────────────────────────────────────────────────────────────────────────
// SERVICE-TIME LEDGER
// ─────────────────────────────────────────────────────────────────────────
//
// Provider-side only. Each completed shard session appends one line:
//   { ts, pipelineId, seconds, peerId, model, blockRange }
// to NDJSON. A separate scheduled job (serviceTime.service.js, separate
// commit) reads + truncates this ledger and submits batched
// recordServiceTime() calls on Arbitrum.

let _ledgerPath = null;
function ledgerPath() {
  if (_ledgerPath) return _ledgerPath;
  // Same dir convention the rest of the server uses (~/bonzai-server/...).
  // We don't import the constant here to avoid pulling diffuser.py-shaped
  // assumptions into main; resolve lazily.
  const home = process.env.HOME || process.env.USERPROFILE || tmpdir();
  _ledgerPath = join(home, 'bonzai-server', 'service_time.ndjson');
  return _ledgerPath;
}

function appendServiceTime(entry) {
  try {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    // Ledger is best-effort — better to lose one row than crash the bridge.
    console.warn('[shard-bridge] service-time ledger append failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CONSUMER MODE — UDS server, dial out to providers
// ─────────────────────────────────────────────────────────────────────────

let _consumerServer = null;
let _consumerSocketPath = null;
const _activeConsumerSessions = new Set();

/**
 * Start the UDS server that local Python connects to for sharded inference.
 * Idempotent — calling twice is a no-op on the second call.
 *
 * @param {{ socketPath?: string }} [opts]
 * @returns {Promise<string>} the socket path the server is listening on
 */
export async function startConsumerBridge(opts = {}) {
  if (_consumerServer) return _consumerSocketPath;

  const socketPath = opts.socketPath || defaultShardSocketPath();
  // Stale socket from a crash blocks bind — clean up first.
  if (existsSync(socketPath)) {
    try { unlinkSync(socketPath); } catch {}
  }

  _consumerServer = createServer((socket) => {
    handleConsumerConnection(socket).catch((err) => {
      console.error('[shard-bridge consumer] session crashed:', err);
      try { socket.destroy(err); } catch {}
    });
  });

  await new Promise((resolve, reject) => {
    _consumerServer.once('error', reject);
    _consumerServer.listen(socketPath, () => resolve());
  });

  _consumerSocketPath = socketPath;
  console.log(`[shard-bridge] consumer UDS listening at ${socketPath}`);
  return socketPath;
}

export async function stopConsumerBridge() {
  if (!_consumerServer) return;
  // Tell every active session to teardown. We don't wait for SHARD_UNLOAD
  // ACKs — providers idle-evict if we vanish.
  for (const session of _activeConsumerSessions) {
    try { session.teardown('consumer-bridge-stop'); } catch {}
  }
  await new Promise((resolve) => _consumerServer.close(() => resolve()));
  if (_consumerSocketPath && existsSync(_consumerSocketPath)) {
    try { unlinkSync(_consumerSocketPath); } catch {}
  }
  _consumerServer = null;
  _consumerSocketPath = null;
}

async function handleConsumerConnection(socket) {
  let session = null;
  let pushableToLibp2p = null;
  let libp2pStream = null;
  let frameSplitter = null;
  let openedAt = null;

  const teardown = (reason) => {
    if (session) _activeConsumerSessions.delete(session);
    try { pushableToLibp2p?.end(); } catch {}
    try { libp2pStream?.close(); } catch {}
    try { socket.destroy(); } catch {}
    if (session?.peerId && session?.openedRemotely) {
      // Best-effort SHARD_UNLOAD via control plane. peer-side will also
      // idle-evict, so we don't care if this fails.
      sendShardUnload(session.peerId, session.sessionId, session.shardId)
        .catch(() => {});
    }
    if (openedAt && session) {
      console.log(
        `[shard-bridge consumer] session ${session.sessionId.slice(0, 8)} closed ` +
        `(${reason}) — wall ${(Date.now() - openedAt) / 1000}s`,
      );
    }
  };

  socket.on('error', (err) => {
    console.warn('[shard-bridge consumer] UDS socket error:', err.message);
    teardown('uds-error');
  });
  socket.on('close', () => teardown('uds-close'));

  const splitter = createUdsSplitter(async (type, body) => {
    if (type === UDS_TYPE_CONTROL) {
      let msg;
      try { msg = JSON.parse(body.toString('utf8')); }
      catch (e) {
        console.warn('[shard-bridge consumer] bad control JSON:', e.message);
        return;
      }
      if (msg.op === UdsControlOp.OPEN) {
        try {
          session = await openConsumerSession(msg);
          _activeConsumerSessions.add(session);
          // Open the libp2p data-plane stream now that SHARD_LOAD_ACKed.
          const node = getP2PNode();
          const { stream } = await node.openRawStream(session.peerId, PROTOCOLS.SHARD_TUNNEL);
          libp2pStream = stream;
          pushableToLibp2p = makePushable();

          // First frame on rpc-tunnel: CTRL_BEGIN with sessionId/shardId.
          // The provider's raw RPC_TUNNEL handler reads this frame to
          // identify which shard the new stream belongs to (one peer
          // can have multiple concurrent sessions). Body is UTF-8 JSON;
          // tensor meta block stays zeroed (rank=0).
          const beginBody = Buffer.from(JSON.stringify({
            sessionId: session.sessionId,
            shardId:   session.shardId,
            codecFlags: session.codecFlags,
          }), 'utf8');
          pushableToLibp2p.push(encodeShardFrame(
            ShardFrameType.CTRL_BEGIN,
            session.codecFlags,
            null,
            beginBody,
          ));

          // pump pushable → libp2p sink (caller awaits to surface errors)
          pipe(pushableToLibp2p, libp2pStream.sink).catch((err) => {
            console.warn('[shard-bridge consumer] libp2p sink ended:', err?.message);
            teardown('libp2p-sink-end');
          });

          // pump libp2p source → UDS socket
          (async () => {
            try {
              for await (const chunk of libp2pStream.source) {
                const buf = chunk.subarray ? chunk.subarray() : chunk;
                if (!socket.writable) break;
                socket.write(encodeUdsMessage(UDS_TYPE_FRAME, Buffer.from(buf)));
              }
            } catch (err) {
              console.warn('[shard-bridge consumer] libp2p source ended:', err?.message);
            } finally {
              teardown('libp2p-source-end');
            }
          })();

          openedAt = Date.now();
          session.teardown = teardown;

          socket.write(encodeControl(UdsControlOp.OPEN_OK, {
            shardId: session.shardId,
            codecFlags: session.codecFlags,
            frameVersion: SHARD_FRAME_VERSION,
          }));
        } catch (err) {
          socket.write(encodeControl(UdsControlOp.OPEN_ERR, { error: err.message }));
          teardown('open-failed');
        }
      } else if (msg.op === UdsControlOp.CLOSE) {
        teardown('python-close');
      }
    } else if (type === UDS_TYPE_FRAME) {
      // Forward this frame straight to libp2p. The body IS already a
      // complete shard frame (Python framed it). No re-framing here.
      if (pushableToLibp2p) pushableToLibp2p.push(body);
    }
  });

  socket.on('data', (chunk) => splitter.push(chunk));
}

async function openConsumerSession(msg) {
  // msg shape (from Python pipeline_transport):
  //   { op: "open", peerId, sessionId, modelId, blockRange: [k,m],
  //     precision, hiddenDim, codecFlags (Python-supported) }
  const { peerId, sessionId, modelId, blockRange, precision, hiddenDim } = msg;
  const peerSupported = msg.codecFlags ?? 0;
  if (!peerId || !sessionId || !modelId) {
    throw new Error('open message missing required fields (peerId/sessionId/modelId)');
  }

  const ack = await sendShardLoad(peerId, {
    sessionId,
    modelId,
    blockRange,
    precision,
    hiddenDim,
    codecFlags: CLIENT_SUPPORTED_FLAGS & peerSupported,
  });

  return {
    sessionId,
    peerId,
    shardId: ack.shardId,
    codecFlags: pickCodecFlags(CLIENT_SUPPORTED_FLAGS, ack.supportedCodecFlags ?? 0),
    openedRemotely: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PROVIDER MODE — accept SHARD_LOAD, bridge to local Flask /shard/run/<id>
// ─────────────────────────────────────────────────────────────────────────
//
// Provider-side time tracking: the worker (shard.py) records seconds
// served and writes the NDJSON ledger row. We don't double-count here —
// this module just bridges bytes and trusts the worker's wall-clock.

const _pendingProviderSessions = new Map(); // sessionId → { shardId, socketPath, peerId, modelId, blockRange }
const _activeProviderSessions = new Map();  // sessionId → { tunnelStream, udsSocket, ... }
let _providerRegistered = false;

/**
 * Register provider-side handlers. Idempotent — calling twice is a no-op.
 * Called from main.js at p2p start when `networkMode === "provider"`.
 */
export async function startProviderBridge({ flaskPort = 65000 } = {}) {
  if (_providerRegistered) return;
  _providerRegistered = true;

  const node = getP2PNode();

  // ─── Control plane: SHARD_LOAD over /bonzai/v2/pipeline ─────────────
  registerPipelineHandler({
    onShardLoad: async (req, remotePeer) => {
      // Forward to local Flask which actually allocates the slice and
      // returns the worker UDS path the data plane will land on.
      try {
        const res = await fetch(`http://127.0.0.1:${flaskPort}/shard/load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId:  req.sessionId,
            modelId:    req.modelId,
            blockRange: req.blockRange,
            precision:  req.precision,
            hiddenDim:  req.hiddenDim,
            codecFlags: req.codecFlags ?? 0,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          return { ok: false, error: `flask /shard/load ${res.status}: ${detail.slice(0, 200)}` };
        }
        const ack = await res.json();
        if (!ack.ok) return { ok: false, error: ack.error || 'shard/load rejected' };

        _pendingProviderSessions.set(req.sessionId, {
          shardId:    ack.shardId,
          socketPath: ack.socketPath,
          socketHost: ack.socketHost,
          socketPort: ack.socketPort,
          peerId:     remotePeer,
          modelId:    req.modelId,
          blockRange: req.blockRange,
          loadedAt:   Date.now(),
        });
        // Stale-pending eviction — if the consumer never opens the
        // rpc-tunnel, drop the slot so a follow-up doesn't ghost on the
        // worker side. shard.py's idle evictor catches the orphaned
        // slice within _IDLE_SECONDS regardless.
        setTimeout(() => {
          if (_pendingProviderSessions.has(req.sessionId) && !_activeProviderSessions.has(req.sessionId)) {
            console.warn(`[shard-bridge provider] session ${req.sessionId.slice(0, 8)} never opened tunnel — dropping`);
            _pendingProviderSessions.delete(req.sessionId);
            fetch(`http://127.0.0.1:${flaskPort}/shard/unload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shardId: ack.shardId }),
            }).catch(() => {});
          }
        }, 30_000).unref();

        return {
          ok: true,
          shardId:             ack.shardId,
          vramMB:              ack.vramMB,
          supportedCodecFlags: ack.supportedCodecFlags,
          frameVersion:        ack.frameVersion ?? SHARD_FRAME_VERSION,
        };
      } catch (err) {
        return { ok: false, error: `provider bridge failure: ${err.message}` };
      }
    },

    onShardUnload: async (sessionId, shardId) => {
      _pendingProviderSessions.delete(sessionId);
      // Active session teardown happens via stream close; this is just
      // for sessions that haven't started flowing data yet.
      try {
        await fetch(`http://127.0.0.1:${flaskPort}/shard/unload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shardId }),
        });
      } catch {}
    },

    onShardError: async (sessionId, error) => {
      console.warn(`[shard-bridge provider] consumer reported error in session ${sessionId?.slice(0, 8)}: ${error}`);
      _pendingProviderSessions.delete(sessionId);
    },
  });

  // ─── Data plane: incoming /bonzai/v2/shard-tunnel streams ───────────
  // Separate protocol path from the LLM RPC tunnel — pipeline.tunnel.js
  // owns RPC_TUNNEL, we own SHARD_TUNNEL. Sharing the path would mean
  // whoever registered last wins.
  await node.registerRawProtocolHandler(PROTOCOLS.SHARD_TUNNEL, async ({ stream, connection }) => {
    const remotePeer = connection.remotePeer.toString();
    handleProviderTunnel(stream, remotePeer, flaskPort).catch((err) => {
      console.error('[shard-bridge provider] tunnel session crashed:', err);
    });
  });

  console.log(`[shard-bridge provider] registered (Flask :${flaskPort})`);
}

export async function stopProviderBridge() {
  // libp2p has no public 'unregister' for handlers; on shutdown we stop
  // the whole node, which clears them. Mark unregistered so a re-start
  // doesn't refuse to wire up.
  _providerRegistered = false;
  // Best-effort unload of any still-pending slots
  for (const [sessionId, ctx] of _pendingProviderSessions) {
    fetch(`http://127.0.0.1:65000/shard/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shardId: ctx.shardId }),
    }).catch(() => {});
  }
  _pendingProviderSessions.clear();
}

/**
 * Run one provider-side tunnel session: read CTRL_BEGIN, look up the
 * pending slot, open UDS to shard.py, bridge bidirectionally until the
 * tunnel closes.
 */
async function handleProviderTunnel(stream, remotePeer, flaskPort) {
  let udsSocket = null;
  let pushableToTunnel = null;
  let sessionId = null;
  // Frame queue for the brief window between CTRL_BEGIN arrival and the
  // UDS connection finishing its async connect. Drained inside the
  // connect callback before any further writes.
  const pendingForUds = [];
  let udsReady = false;

  const teardown = (reason) => {
    try { pushableToTunnel?.end(); } catch {}
    try { udsSocket?.destroy(); } catch {}
    try { stream.close(); } catch {}
    if (sessionId) {
      _activeProviderSessions.delete(sessionId);
      console.log(`[shard-bridge provider] session ${sessionId.slice(0, 8)} closed (${reason})`);
    }
  };

  const splitter = createShardFrameSplitter((frame) => {
    if (!sessionId) {
      if (frame.type !== ShardFrameType.CTRL_BEGIN) {
        teardown(`first frame must be CTRL_BEGIN, got 0x${frame.type.toString(16)}`);
        return;
      }
      let begin;
      try { begin = JSON.parse(frame.payload.toString('utf8')); }
      catch { teardown('CTRL_BEGIN body is not valid JSON'); return; }
      const ctx = _pendingProviderSessions.get(begin.sessionId);
      if (!ctx) {
        teardown(`unknown sessionId ${begin.sessionId?.slice(0, 8)} from ${remotePeer.slice(0, 12)}`);
        return;
      }
      _pendingProviderSessions.delete(begin.sessionId);
      sessionId = begin.sessionId;
      _activeProviderSessions.set(sessionId, { remotePeer, ctx, openedAt: Date.now() });

      // Open the local shard.py worker — UDS where available, loopback
      // TCP on Python/Windows builds without AF_UNIX. Connection
      // completes async; queue
      // any frames that arrive before it's ready.
      const workerTarget = ctx.socketPath || { host: ctx.socketHost || '127.0.0.1', port: ctx.socketPort };
      udsSocket = createConnection(workerTarget, () => {
        const runMsg = encodeUdsMessage(UDS_TYPE_CONTROL,
          Buffer.from(JSON.stringify({ op: 'run', shardId: ctx.shardId }), 'utf8'));
        udsSocket.write(runMsg);
        udsReady = true;
        for (const buf of pendingForUds) udsSocket.write(buf);
        pendingForUds.length = 0;
      });

      udsSocket.on('error', (err) => {
        console.warn(`[shard-bridge provider] UDS error for ${sessionId.slice(0, 8)}:`, err.message);
        teardown('uds-error');
      });
      udsSocket.on('close', () => teardown('uds-close'));

      pushableToTunnel = makePushable();
      pipe(pushableToTunnel, stream.sink).catch((err) => {
        console.warn(`[shard-bridge provider] tunnel sink ended:`, err?.message);
        teardown('tunnel-sink-end');
      });

      const udsSplitter = createUdsSplitter((type, body) => {
        if (type === UDS_TYPE_FRAME) {
          pushableToTunnel.push(body);
        } else if (type === UDS_TYPE_CONTROL) {
          let ctrl;
          try { ctrl = JSON.parse(body.toString('utf8')); } catch { return; }
          if (ctrl.op === 'remote_error') {
            // Surface worker error as CTRL_ERROR back to the consumer so
            // it doesn't hang waiting for an ACT_RETURN that'll never
            // come. The consumer's recv_activation raises on this.
            const errFrame = encodeShardFrame(
              ShardFrameType.CTRL_ERROR, 0, null,
              Buffer.from(JSON.stringify({ code: 'worker_error', message: ctrl.error }), 'utf8'),
            );
            pushableToTunnel.push(errFrame);
            teardown('worker-error');
          }
        }
      });
      udsSocket.on('data', (chunk) => udsSplitter.push(chunk));
      return;
    }

    // Frames after CTRL_BEGIN: re-encode and forward to UDS. Re-encoding
    // is required because the splitter consumed the original byte run;
    // re-emitting from the parsed parts is byte-identical (Buffer.alloc
    // zero-fills meta reserved bytes the same way the encoder does).
    const encoded = encodeShardFrame(frame.type, frame.flags, frame.meta, frame.payload);
    const wrapped = encodeUdsMessage(UDS_TYPE_FRAME, encoded);
    if (udsReady && udsSocket) udsSocket.write(wrapped);
    else pendingForUds.push(wrapped);
  });

  // Pump tunnel.source → splitter
  try {
    for await (const chunk of stream.source) {
      const buf = chunk.subarray ? chunk.subarray() : chunk;
      splitter.push(Buffer.from(buf));
    }
  } catch (err) {
    console.warn('[shard-bridge provider] tunnel source ended:', err?.message);
  } finally {
    teardown('tunnel-source-end');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EXPOSED FOR TESTING
// ─────────────────────────────────────────────────────────────────────────

export const __test = {
  encodeUdsMessage,
  encodeControl,
  createUdsSplitter,
  UDS_TYPE_CONTROL,
  UDS_TYPE_FRAME,
  UdsControlOp,
};
