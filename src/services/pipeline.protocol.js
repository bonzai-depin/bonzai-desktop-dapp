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
};

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
 * @param {Function} onRequest - Async handler for PIPELINE_REQUEST:
 *   (request, remotePeerId) => { ok, sessionId, rpcPort, computeScore, memoryMB }
 * @param {Function} onDone - Handler for PIPELINE_DONE:
 *   (sessionId, remotePeerId) => void
 * @param {Function} onError - Handler for PIPELINE_ERROR:
 *   (sessionId, error, remotePeerId) => void
 */
export function registerPipelineHandler({ onRequest, onDone, onError }) {
  const node = getP2PNode();

  node.onInferenceRequest(async (message, remotePeer) => {
    // Only handle pipeline protocol messages (others fall through to v1 handler)
    if (message._protocol !== PROTOCOLS.PIPELINE) return null;

    const { type, sessionId } = message;

    switch (type) {
      case PipelineMessageType.PIPELINE_REQUEST:
        return await onRequest(message, remotePeer);

      case PipelineMessageType.PIPELINE_DONE:
        await onDone?.(sessionId, remotePeer);
        return { ok: true };

      case PipelineMessageType.PIPELINE_ERROR:
        await onError?.(sessionId, message.error, remotePeer);
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
