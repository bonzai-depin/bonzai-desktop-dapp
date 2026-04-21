/**
 * BonzAI Pipeline Tunnel
 *
 * Bidirectional TCP ↔ libp2p bridge for llama.cpp RPC traffic.
 *
 * Client side (consumer):
 *   Opens a libp2p stream to a remote peer's /bonzai/v2/rpc-tunnel protocol,
 *   then starts a local TCP server that forwards data to/from the libp2p stream.
 *   llama-server connects to this local TCP port as if it were a local rpc-server.
 *
 * Peer side (shard provider):
 *   Registers a handler for /bonzai/v2/rpc-tunnel that bridges incoming libp2p
 *   streams to the local rpc-server TCP port.
 *
 * Result: llama-server thinks it talks to local rpc-servers, rpc-server thinks
 * it receives local connections, but all traffic flows encrypted through libp2p
 * with NAT traversal via Circuit Relay or WebRTC.
 */

import net from 'net';
import { pushable } from 'it-pushable';
import { pipe } from 'it-pipe';
import { PROTOCOLS } from './libp2p.service.js';

/**
 * Bridge a TCP socket to a libp2p duplex stream (bidirectional).
 * Used by both client-side and peer-side tunnel code.
 *
 * @param {net.Socket} socket - TCP socket
 * @param {object} stream - libp2p duplex stream { source, sink }
 * @returns {{ bytesIn: () => number, bytesOut: () => number }}
 */
function bridgeTCPToStream(socket, stream) {
  let bytesIn = 0;
  let bytesOut = 0;

  // TCP → libp2p: push TCP data into a pushable iterable piped to stream.sink
  const outgoing = pushable({ objectMode: false });

  socket.on('data', (chunk) => {
    bytesOut += chunk.length;
    outgoing.push(new Uint8Array(chunk));
  });

  socket.on('end', () => outgoing.end());
  socket.on('error', () => outgoing.end());
  socket.on('close', () => outgoing.end());

  // Pipe the pushable into the libp2p stream sink (don't await — runs in background)
  pipe(outgoing, stream.sink).catch((e) => {
    if (!socket.destroyed) {
      console.error('[Pipeline Tunnel] Sink pipe error:', e.message);
    }
  });

  // libp2p → TCP: read from stream.source and write to TCP socket
  (async () => {
    try {
      for await (const chunk of stream.source) {
        if (socket.destroyed) break;
        const data = chunk.subarray ? chunk.subarray() : chunk;
        bytesIn += data.length;
        socket.write(Buffer.from(data));
      }
    } catch (e) {
      if (!socket.destroyed) {
        console.error('[Pipeline Tunnel] Source read error:', e.message);
      }
    }
    if (!socket.destroyed) socket.end();
  })();

  return {
    bytesIn: () => bytesIn,
    bytesOut: () => bytesOut,
  };
}

/**
 * Create a TCP ↔ libp2p tunnel to a remote peer's rpc-server.
 *
 * Returns a local TCP port that llama-server can use with --rpc localhost:{port}.
 * Data flows: llama-server → local TCP → libp2p stream → remote rpc-server.
 *
 * @param {BonzaiP2PNode} p2pNode - The libp2p node instance
 * @param {string} remotePeerId - Remote peer's libp2p peer ID
 * @returns {Promise<{ localPort: number, peerId: string, stats: Function, close: Function }>}
 */
export async function createRPCTunnel(p2pNode, remotePeerId) {
  let tcpServer = null;
  let bridge = null;
  let closed = false;

  // Open libp2p stream to remote peer's RPC tunnel handler
  const { stream } = await p2pNode.openRawStream(remotePeerId, PROTOCOLS.RPC_TUNNEL);

  // Create local TCP server that llama-server will connect to
  // llama.cpp's RPC client opens one persistent TCP connection per rpc-server
  tcpServer = net.createServer((socket) => {
    if (closed) {
      socket.destroy();
      return;
    }

    console.log(`[Pipeline Tunnel] llama-server connected to local proxy`);
    bridge = bridgeTCPToStream(socket, stream);

    socket.on('close', () => {
      console.log('[Pipeline Tunnel] llama-server disconnected from local proxy');
    });
  });

  // Listen on dynamic port bound to localhost only
  const localPort = await new Promise((resolve, reject) => {
    tcpServer.listen(0, '127.0.0.1', () => {
      const port = tcpServer.address().port;
      console.log(`[Pipeline Tunnel] Local proxy :${port} → peer ${remotePeerId.slice(0, 12)}...`);
      resolve(port);
    });
    tcpServer.on('error', reject);
  });

  return {
    localPort,
    peerId: remotePeerId,

    stats() {
      return {
        bytesIn: bridge?.bytesIn() || 0,
        bytesOut: bridge?.bytesOut() || 0,
        active: !closed,
      };
    },

    async close() {
      if (closed) return;
      closed = true;
      const stats = this.stats();
      console.log(
        `[Pipeline Tunnel] Closing tunnel to ${remotePeerId.slice(0, 12)}...` +
        ` (in: ${(stats.bytesIn / 1024).toFixed(1)} KB, out: ${(stats.bytesOut / 1024).toFixed(1)} KB)`
      );
      try { await stream.close(); } catch {}
      if (tcpServer) {
        tcpServer.close();
        tcpServer = null;
      }
    },
  };
}

/**
 * Register an RPC tunnel handler on the peer side (shard provider).
 *
 * When a consumer opens a /bonzai/v2/rpc-tunnel stream, this handler bridges
 * the libp2p stream to the local rpc-server TCP port.
 *
 * Data flows: remote llama-server → libp2p stream → local TCP → rpc-server.
 *
 * @param {BonzaiP2PNode} p2pNode - The libp2p node instance
 * @param {number} rpcServerPort - Local rpc-server TCP port (default: 50052)
 */
export async function registerRPCTunnelHandler(p2pNode, rpcServerPort = 50052) {
  await p2pNode.registerRawProtocolHandler(PROTOCOLS.RPC_TUNNEL, ({ stream, connection }) => {
    const remotePeer = connection.remotePeer.toString();
    console.log(`[Pipeline Tunnel] Incoming tunnel from ${remotePeer.slice(0, 12)}...`);

    // Connect to local rpc-server
    const socket = net.createConnection({ host: '127.0.0.1', port: rpcServerPort }, () => {
      console.log(`[Pipeline Tunnel] Bridged to local rpc-server :${rpcServerPort}`);
      bridgeTCPToStream(socket, stream);
    });

    socket.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        console.error(`[Pipeline Tunnel] rpc-server not running on port ${rpcServerPort}`);
      } else if (e.code !== 'ECONNRESET') {
        console.error('[Pipeline Tunnel] TCP error:', e.message);
      }
      try { stream.close(); } catch {}
    });
  });

  console.log(`[Pipeline Tunnel] Handler registered: ${PROTOCOLS.RPC_TUNNEL} → :${rpcServerPort}`);
}
