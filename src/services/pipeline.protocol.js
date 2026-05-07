/**
 * BonzAI Pipeline Protocol
 *
 * JSON-based negotiation layer over /bonzai/v2/pipeline.
 * Handles session setup, shard assignment, payment authorization, and teardown.
 *
 * The heavy tensor data flows through the separate /bonzai/v2/rpc-tunnel stream.
 * This protocol handles only the control plane.
 */

import { PROTOCOLS, getP2PNode } from './libp2p.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const PipelineMessageType = {
  PIPELINE_REQUEST: 'pipeline_request',
  PIPELINE_ACK: 'pipeline_ack',
  PIPELINE_DONE: 'pipeline_done',
  PIPELINE_ERROR: 'pipeline_error',

  // Sharded DiT inference for Flask diffusers — additive to the LLM
  // RPC-tunnel pipeline above. SHARD_LOAD/UNLOAD travel over
  // /bonzai/v2/pipeline (JSON); per-step activation tensors travel over
  // /bonzai/v2/rpc-tunnel using the binary frame format below.
  SHARD_LOAD: 'shard_load',
  SHARD_LOAD_ACK: 'shard_load_ack',
  SHARD_UNLOAD: 'shard_unload',
  SHARD_ERROR: 'shard_error',
};

// ═══════════════════════════════════════════════════════════════════════════
// SHARD DATA-PLANE FRAME FORMAT (rpc-tunnel)
// ═══════════════════════════════════════════════════════════════════════════
//
// Authoritative spec — JS (src/main/shardSession.js) and Python
// (src/server/pipeline_transport.py) MUST agree byte-for-byte. Any frame
// schema change must bump SHARD_FRAME_VERSION and add a negotiation step
// in SHARD_LOAD_ACK.
//
// Layout (big-endian where multi-byte):
//
//   byte  0       1       2..5            6..37             38..end
//        ┌──────┬──────┬───────────────┬─────────────────┬─────────────┐
//        │ type │flags │  body length  │   tensor meta   │   payload   │
//        │  u8  │  u8  │     u32 BE    │     32 bytes    │  body-bytes │
//        └──────┴──────┴───────────────┴─────────────────┴─────────────┘
//
// type:
//   0x00  CTRL_BEGIN     — open session, body is a UTF-8 JSON header:
//                          { shardId, expectedSteps, hiddenShape, dtype,
//                            condShape?, permKeyHash?, codecFlags }
//   0x01  ACT_FORWARD    — client → provider, hidden activation for one step
//   0x02  ACT_RETURN     — provider → client, processed activation
//   0x03  COND_FORWARD   — client → provider, conditioning tensor (sent once
//                          per session unless `recond` flag is set)
//   0x04  CTRL_DONE      — release shard, no body
//   0x05  CTRL_ERROR     — body is UTF-8 JSON: { code, message }
//
// flags (bit field — both sides must support before negotiating in
// SHARD_LOAD_ACK):
//   0x01  COMPRESSED_LZ4   — payload is LZ4-frame compressed (lz4.frame /
//                            node `lz4` pkg)
//   0x02  QUANTIZED_INT8   — first 2 bytes of payload are an fp16 scale
//                            (big-endian uint16 reinterpreted as fp16),
//                            rest is int8 quantized tensor; recover via
//                            `(int8.to(fp16)) * scale`. NOT fp8 — fp8 ops
//                            are unreliable on MPS (see feedback memory).
//   0x04  DIM_SHUFFLED     — tensor's last dim has been permuted by the
//                            session permutation key. Provider applies its
//                            shard with the matching permuted projection
//                            weights set up at SHARD_LOAD time.
//   0x08  reserved for native fp8 on CUDA↔CUDA links (future)
//
// tensor meta (32 bytes, fixed; same for ACT_FORWARD / ACT_RETURN /
// COND_FORWARD):
//   off   size   field
//    0     1     dtype     (1=fp16, 2=fp32, 3=int8, 4=bf16)
//    1     1     rank      (number of valid dims in shape, ≤ 6)
//    2    12     shape     (6 × u16 BE — unused dims = 0)
//   14     2     step      (u16 BE — 0 for COND_FORWARD)
//   16    16     reserved  (must be zero on send, ignored on receive)
//
// body length: payload AFTER the 32-byte meta. Total wire size of one
// frame = 38 + length.

export const SHARD_FRAME_VERSION = 1;

export const ShardFrameType = {
  CTRL_BEGIN:   0x00,
  ACT_FORWARD:  0x01,
  ACT_RETURN:   0x02,
  COND_FORWARD: 0x03,
  CTRL_DONE:    0x04,
  CTRL_ERROR:   0x05,
};

export const ShardFrameFlag = {
  COMPRESSED_LZ4: 0x01,
  QUANTIZED_INT8: 0x02,
  DIM_SHUFFLED:   0x04,
};

export const ShardDtype = {
  FP16: 1,
  FP32: 2,
  INT8: 3,
  BF16: 4,
};

export const SHARD_FRAME_HEADER_SIZE = 6;       // ty + fl + len
export const SHARD_FRAME_META_SIZE   = 32;
export const SHARD_FRAME_PREAMBLE    = SHARD_FRAME_HEADER_SIZE + SHARD_FRAME_META_SIZE;

/**
 * Send a pipeline negotiation request to a remote peer.
 *
 * @param {string} peerId - Remote peer's libp2p peer ID
 * @param {Object} request
 * @param {string} request.sessionId - Unique pipeline session ID
 * @param {string} request.modelId - GGUF model filename or identifier
 * @param {number} request.layerProportion - Fraction of layers assigned to this peer (0.0-1.0)
 * @param {number} request.totalLayers - Total transformer layers in the model
 * @param {Object} request.payment - x402 PipelinePayment authorization
 * @param {string} request.payment.signature - EIP-712 signature
 * @param {string[]} request.payment.providers - Provider addresses
 * @param {string[]} request.payment.amounts - Per-provider amounts (wei strings)
 * @param {string} request.payment.totalAmount - Total payment (wei string)
 * @param {string} request.payment.sessionId - Payment session ID (bytes32)
 * @returns {Promise<Object>} PIPELINE_ACK response
 */
export async function sendPipelineRequest(peerId, request) {
  const node = getP2PNode();
  const response = await node.sendInferenceRequest(peerId, {
    _protocol: PROTOCOLS.PIPELINE,
    type: PipelineMessageType.PIPELINE_REQUEST,
    ...request,
  });

  if (!response.ok) {
    throw new Error(`Pipeline request rejected by ${peerId.slice(0, 12)}...: ${response.error || 'unknown'}`);
  }

  return response;
}

/**
 * Send pipeline done notification to a remote peer.
 * Signals the peer to unload its model shard and release VRAM.
 *
 * @param {string} peerId - Remote peer's libp2p peer ID
 * @param {string} sessionId - Pipeline session ID
 */
export async function sendPipelineDone(peerId, sessionId) {
  const node = getP2PNode();
  try {
    await node.sendInferenceRequest(peerId, {
      _protocol: PROTOCOLS.PIPELINE,
      type: PipelineMessageType.PIPELINE_DONE,
      sessionId,
    });
  } catch (e) {
    // Best-effort — peer may have already disconnected
    console.warn(`[Pipeline Protocol] Failed to send DONE to ${peerId.slice(0, 12)}...:`, e.message);
  }
}

/**
 * Send pipeline error notification to a remote peer.
 *
 * @param {string} peerId - Remote peer's libp2p peer ID
 * @param {string} sessionId - Pipeline session ID
 * @param {string} error - Error description
 */
export async function sendPipelineError(peerId, sessionId, error) {
  const node = getP2PNode();
  try {
    await node.sendInferenceRequest(peerId, {
      _protocol: PROTOCOLS.PIPELINE,
      type: PipelineMessageType.PIPELINE_ERROR,
      sessionId,
      error,
    });
  } catch (e) {
    console.warn(`[Pipeline Protocol] Failed to send ERROR to ${peerId.slice(0, 12)}...:`, e.message);
  }
}

/**
 * Register a pipeline protocol handler on the peer side.
 * Called when this node acts as a shard provider.
 *
 * @param {Object} handlers
 * @param {Function} [handlers.onRequest]    PIPELINE_REQUEST (LLM RPC pipeline)
 * @param {Function} [handlers.onDone]       PIPELINE_DONE
 * @param {Function} [handlers.onError]      PIPELINE_ERROR
 * @param {Function} [handlers.onShardLoad]  SHARD_LOAD — (request, remotePeerId)
 *   → { ok, shardId, vramMB, supportedCodecFlags, frameVersion } | { ok:false, error }
 * @param {Function} [handlers.onShardUnload] SHARD_UNLOAD — (sessionId, shardId, remotePeerId)
 * @param {Function} [handlers.onShardError]  SHARD_ERROR  — (sessionId, error, remotePeerId)
 */
export function registerPipelineHandler({
  onRequest,
  onDone,
  onError,
  onShardLoad,
  onShardUnload,
  onShardError,
}) {
  const node = getP2PNode();

  node.onInferenceRequest(async (message, remotePeer) => {
    // Only handle pipeline protocol messages (others fall through to v1 handler)
    if (message._protocol !== PROTOCOLS.PIPELINE) return null;

    const { type, sessionId } = message;

    switch (type) {
      case PipelineMessageType.PIPELINE_REQUEST:
        return await onRequest?.(message, remotePeer);

      case PipelineMessageType.PIPELINE_DONE:
        await onDone?.(sessionId, remotePeer);
        return { ok: true };

      case PipelineMessageType.PIPELINE_ERROR:
        await onError?.(sessionId, message.error, remotePeer);
        return { ok: true };

      case PipelineMessageType.SHARD_LOAD:
        if (!onShardLoad) return { ok: false, error: 'shard load not supported by this peer' };
        return await onShardLoad(message, remotePeer);

      case PipelineMessageType.SHARD_UNLOAD:
        await onShardUnload?.(sessionId, message.shardId, remotePeer);
        return { ok: true };

      case PipelineMessageType.SHARD_ERROR:
        await onShardError?.(sessionId, message.error, remotePeer);
        return { ok: true };

      default:
        return { ok: false, error: `Unknown pipeline message type: ${type}` };
    }
  });
}

/**
 * Negotiate a pipeline session with multiple peers.
 * Sends PIPELINE_REQUEST to each peer in parallel, collects ACKs.
 *
 * @param {Object[]} peerAssignments - Array of { peerId, layerProportion, wallet }
 * @param {Object} sessionConfig
 * @param {string} sessionConfig.sessionId
 * @param {string} sessionConfig.modelId
 * @param {number} sessionConfig.totalLayers
 * @param {Object} sessionConfig.payment - Multi-payee x402 payment
 * @param {number} [timeout=10000] - ACK timeout per peer (ms)
 * @returns {Promise<Object[]>} Array of ACK responses with rpcPort per peer
 * @throws If any peer rejects or times out
 */
export async function negotiatePipeline(peerAssignments, sessionConfig, timeout = 10000) {
  const { sessionId, modelId, totalLayers, payment } = sessionConfig;

  const results = await Promise.all(
    peerAssignments.map(async ({ peerId, layerProportion, wallet }) => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Peer ${peerId.slice(0, 12)}... timed out`)), timeout)
      );

      const requestPromise = sendPipelineRequest(peerId, {
        sessionId,
        modelId,
        totalLayers,
        layerProportion,
        payment,
      });

      const response = await Promise.race([requestPromise, timeoutPromise]);
      return { peerId, wallet, ...response };
    })
  );

  console.log(`[Pipeline Protocol] All ${results.length} peers acknowledged session ${sessionId.slice(0, 8)}...`);
  return results;
}

/**
 * Tear down a pipeline session — notify all peers to release resources.
 *
 * @param {string} sessionId
 * @param {string[]} peerIds - All pipeline peer IDs
 */
export async function teardownPipeline(sessionId, peerIds) {
  await Promise.allSettled(
    peerIds.map((peerId) => sendPipelineDone(peerId, sessionId))
  );
  console.log(`[Pipeline Protocol] Session ${sessionId.slice(0, 8)}... torn down (${peerIds.length} peers notified)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARD CONTROL PLANE — DiT-specific (Flask diffuser sharding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ask a remote peer to load a transformer-block slice.
 * Provider responds with a shardId + the rpc-tunnel session token used to
 * route ACT_FORWARD / ACT_RETURN frames over /bonzai/v2/rpc-tunnel.
 *
 * @param {string} peerId
 * @param {Object} req
 * @param {string} req.sessionId          - Session UUID (matches frame stream tag)
 * @param {string} req.modelId            - "z_image_turbo" | "ltx2_video" | "wan22_high" | ...
 * @param {[number, number]} req.blockRange - Inclusive [start, end] block indices in the model
 * @param {string} req.precision          - "gguf-q5km" | "gguf-q4km" | "gguf-q3ks" | "fp16"
 * @param {number} req.hiddenDim          - For sanity-checking activation tensors
 * @param {number} [req.codecFlags]       - Client-supported flags bitfield (see ShardFrameFlag)
 * @returns {Promise<{ ok, shardId, vramMB, supportedCodecFlags, frameVersion }>}
 */
export async function sendShardLoad(peerId, req) {
  const node = getP2PNode();
  const response = await node.sendInferenceRequest(peerId, {
    _protocol: PROTOCOLS.PIPELINE,
    type: PipelineMessageType.SHARD_LOAD,
    frameVersion: SHARD_FRAME_VERSION,
    ...req,
  });
  if (!response.ok) {
    throw new Error(`SHARD_LOAD rejected by ${peerId.slice(0, 12)}: ${response.error || 'unknown'}`);
  }
  if (response.frameVersion !== SHARD_FRAME_VERSION) {
    throw new Error(
      `Frame version mismatch with ${peerId.slice(0, 12)}: peer=${response.frameVersion} client=${SHARD_FRAME_VERSION}`,
    );
  }
  return response;
}

/**
 * Tell a peer to release a loaded shard. Best-effort — provider also
 * evicts on idle timeout, so a missed call is recoverable.
 */
export async function sendShardUnload(peerId, sessionId, shardId) {
  const node = getP2PNode();
  try {
    await node.sendInferenceRequest(peerId, {
      _protocol: PROTOCOLS.PIPELINE,
      type: PipelineMessageType.SHARD_UNLOAD,
      sessionId,
      shardId,
    });
  } catch (e) {
    console.warn(`[Pipeline Protocol] SHARD_UNLOAD to ${peerId.slice(0, 12)} failed (peer will idle-evict):`, e.message);
  }
}

/**
 * Negotiate codec flags. Consumer sends its supported flags; provider
 * intersects with its own. Final flags ride on every frame this session.
 * Order of preference (client side, top wins):
 *   1. INT8_QUANT + LZ4   (~5× bandwidth reduction, works on every backend)
 *   2. INT8_QUANT only    (~2× reduction without LZ4 dep)
 *   3. LZ4 only           (modest gain on dense fp16, useful when quant
 *                          isn't acceptable for numerical reasons)
 *   4. raw                (always available, fallback)
 */
export function pickCodecFlags(clientSupported, providerSupported) {
  const both = clientSupported & providerSupported;
  const has = (f) => (both & f) === f;
  if (has(ShardFrameFlag.QUANTIZED_INT8 | ShardFrameFlag.COMPRESSED_LZ4)) {
    return ShardFrameFlag.QUANTIZED_INT8 | ShardFrameFlag.COMPRESSED_LZ4;
  }
  if (has(ShardFrameFlag.QUANTIZED_INT8)) return ShardFrameFlag.QUANTIZED_INT8;
  if (has(ShardFrameFlag.COMPRESSED_LZ4)) return ShardFrameFlag.COMPRESSED_LZ4;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARD DATA PLANE — frame encode/decode
// ═══════════════════════════════════════════════════════════════════════════
//
// These run inside the Electron main process (shardSession.js) on both
// ends. Tensor compression / decompression is the caller's job — these
// helpers only handle the framing.

/**
 * Encode one frame for transmission over rpc-tunnel.
 *
 * @param {number} type    - ShardFrameType value
 * @param {number} flags   - ShardFrameFlag bitfield (set by caller after compression)
 * @param {Object|null} meta - { dtype, rank, shape: number[<=6], step }
 *                              null/undefined for CTRL_DONE (zeros out meta)
 * @param {Uint8Array} payload - Body bytes (already compressed/quantized
 *                               if the corresponding flags are set)
 * @returns {Buffer}
 */
export function encodeShardFrame(type, flags, meta, payload) {
  const body = payload ?? new Uint8Array(0);
  const buf = Buffer.alloc(SHARD_FRAME_PREAMBLE + body.length);
  buf.writeUInt8(type & 0xff, 0);
  buf.writeUInt8(flags & 0xff, 1);
  buf.writeUInt32BE(body.length, 2);

  if (meta) {
    const { dtype = 0, rank = 0, shape = [], step = 0 } = meta;
    buf.writeUInt8(dtype & 0xff, 6);
    buf.writeUInt8(rank & 0xff, 7);
    for (let i = 0; i < 6; i++) {
      buf.writeUInt16BE((shape[i] | 0) & 0xffff, 8 + i * 2);
    }
    buf.writeUInt16BE(step & 0xffff, 20);
    // bytes 22..37 are reserved zeros (Buffer.alloc already zero-fills)
  }

  if (body.length) buf.set(body, SHARD_FRAME_PREAMBLE);
  return buf;
}

/**
 * Decode a single frame. Caller is responsible for assembling stream bytes
 * into a complete frame first (see splitShardFrames below).
 *
 * @param {Buffer} buf - Exactly one frame's worth of bytes
 * @returns {{ type, flags, meta, payload }}
 */
export function decodeShardFrame(buf) {
  if (buf.length < SHARD_FRAME_PREAMBLE) {
    throw new Error(`Shard frame truncated: ${buf.length} < ${SHARD_FRAME_PREAMBLE}`);
  }
  const type  = buf.readUInt8(0);
  const flags = buf.readUInt8(1);
  const len   = buf.readUInt32BE(2);
  if (buf.length !== SHARD_FRAME_PREAMBLE + len) {
    throw new Error(
      `Shard frame length mismatch: header says ${len} body bytes, buffer has ${buf.length - SHARD_FRAME_PREAMBLE}`,
    );
  }
  const meta = {
    dtype: buf.readUInt8(6),
    rank:  buf.readUInt8(7),
    shape: [
      buf.readUInt16BE(8),  buf.readUInt16BE(10),
      buf.readUInt16BE(12), buf.readUInt16BE(14),
      buf.readUInt16BE(16), buf.readUInt16BE(18),
    ],
    step:  buf.readUInt16BE(20),
  };
  const payload = buf.subarray(SHARD_FRAME_PREAMBLE);
  return { type, flags, meta, payload };
}

/**
 * Stateful stream splitter. Pass each chunk from the rpc-tunnel
 * `pushable` source; emit completed frames via the `onFrame` callback.
 * Holds a single growing buffer to handle arbitrary chunk boundaries.
 *
 * Usage:
 *   const splitter = createShardFrameSplitter(frame => handle(frame));
 *   for await (const chunk of stream.source) splitter.push(chunk);
 */
export function createShardFrameSplitter(onFrame) {
  let buffered = Buffer.alloc(0);
  return {
    push(chunk) {
      buffered = buffered.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([buffered, Buffer.from(chunk)]);
      while (buffered.length >= SHARD_FRAME_PREAMBLE) {
        const len = buffered.readUInt32BE(2);
        const total = SHARD_FRAME_PREAMBLE + len;
        if (buffered.length < total) break;
        const frameBuf = buffered.subarray(0, total);
        buffered = buffered.subarray(total);
        try {
          onFrame(decodeShardFrame(frameBuf));
        } catch (err) {
          // Surface decoder errors but don't kill the stream — caller can
          // teardown the session via SHARD_ERROR control message.
          console.error('[Pipeline Protocol] Frame decode failed:', err.message);
        }
      }
    },
    /** Bytes still waiting for a complete frame — for diagnostics. */
    pending() { return buffered.length; },
  };
}
