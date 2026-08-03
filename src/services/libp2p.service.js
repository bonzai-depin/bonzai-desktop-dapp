/**
 * BonzAI libp2p Service
 *
 * Provides decentralized P2P networking for the distributed inference network.
 * Handles peer discovery, NAT traversal, and encrypted communication.
 */

import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';
import { pipe } from 'it-pipe';
import { fromString, toString } from 'uint8arrays';

// Protocol identifiers
export const PROTOCOLS = {
  INFERENCE: '/bonzai/v1/inference',
  HEALTH: '/bonzai/v1/health',
  DISCOVERY: '/bonzai/v1/discovery',
  PIPELINE: '/bonzai/v2/pipeline',          // Pipeline negotiation (JSON)
  RPC_TUNNEL: '/bonzai/v2/rpc-tunnel',      // Raw TCP tunnel for llama.cpp RPC traffic
  SHARD_TUNNEL: '/bonzai/v2/shard-tunnel',  // Raw stream for sharded DiT activation frames
};

// Default configuration
const DEFAULT_CONFIG = {
  listenPort: 4002,
  enableRelay: false,
  maxRelayReservations: 128,
  bootstrapNodes: [],
  announceAddresses: [],
};

/**
 * BonzAI P2P Node
 *
 * Wraps libp2p with BonzAI-specific functionality.
 */
class BonzaiP2PNode {
  constructor() {
    this.node = null;
    this.isStarted = false;
    this.config = { ...DEFAULT_CONFIG };
    this.handlers = new Map();
    this.peerConnections = new Map();
    this.relayConnections = new Set();
    this.lanPeers = new Map(); // peerId → { multiaddrs, discoveredAt, free: true }
    this._onNetworkEvent = null;
  }

  _emitNetworkEvent(type, detail = {}) {
    try { this._onNetworkEvent?.({ type, ts: Date.now(), ...detail }); } catch {}
  }

  /**
   * Initialize and start the libp2p node
   *
   * @param {Object} options Configuration options
   * @param {number} options.listenPort Port to listen on (default: 4002)
   * @param {boolean} options.enableRelay Enable relay server (requires public IP)
   * @param {string[]} options.bootstrapNodes Initial peers to connect to
   * @param {string[]} options.announceAddresses Public addresses to announce
   */
  async start(options = {}) {
    if (this.isStarted) {
      console.log('[libp2p] Node already started');
      return this.node.peerId.toString();
    }

    this.config = { ...DEFAULT_CONFIG, ...options };
    const { listenPort, enableRelay, maxRelayReservations, bootstrapNodes, announceAddresses } = this.config;

    console.log('[libp2p] Starting node...');
    console.log('[libp2p] Config:', {
      listenPort,
      enableRelay,
      bootstrapCount: bootstrapNodes.length,
    });

    // Build services
    const services = {
      identify: identify(),
      dht: kadDHT({
        clientMode: false, // Full DHT participation
        protocol: '/bonzai/kad/1.0.0',
      }),
    };

    // Enable relay server if provider opts in and has public connectivity
    if (enableRelay) {
      console.log('[libp2p] Enabling relay server');
      services.relay = circuitRelayServer({
        reservations: {
          maxReservations: maxRelayReservations,
          reservationTtl: 3600000, // 1 hour
          defaultDataLimit: BigInt(1024 * 1024 * 100), // 100MB per reservation
        },
      });
    }

    // Build peer discovery
    const peerDiscovery = [
      // mDNS: auto-discover BonzAI peers on the local network (free inference)
      mdns({ interval: 10000 }),
    ];
    if (bootstrapNodes.length > 0) {
      peerDiscovery.push(
        bootstrap({
          list: bootstrapNodes,
          timeout: 10000,
        })
      );
    }

    // Create the node
    this.node = await createLibp2p({
      addresses: {
        listen: [
          `/ip4/0.0.0.0/tcp/${listenPort}`,
          `/ip4/0.0.0.0/tcp/${listenPort + 1}/ws`,
        ],
        announce: announceAddresses,
      },
      transports: [
        tcp(),
        webSockets(),
        webRTC(),
        circuitRelayTransport({
          discoverRelays: 3, // Try to discover up to 3 relay nodes
        }),
      ],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery,
      services,
      connectionManager: {
        maxConnections: 100,
        minConnections: 5,
      },
    });

    // Set up event listeners
    this._setupEventListeners();

    // Start the node
    await this.node.start();
    this.isStarted = true;

    const peerId = this.node.peerId.toString();
    const addrs = this.node.getMultiaddrs().map((ma) => ma.toString());

    console.log('[libp2p] Node started');
    console.log('[libp2p] Peer ID:', peerId);
    console.log('[libp2p] Listening on:', addrs);

    // Register default protocol handlers
    await this._registerDefaultHandlers();

    return peerId;
  }

  /**
   * Stop the libp2p node
   */
  async stop() {
    if (!this.isStarted) {
      return;
    }

    console.log('[libp2p] Stopping node...');
    await this.node.stop();
    this.isStarted = false;
    this.peerConnections.clear();
    this.relayConnections.clear();
    console.log('[libp2p] Node stopped');
  }

  /**
   * Get the peer ID
   */
  getPeerId() {
    if (!this.node) return null;
    return this.node.peerId.toString();
  }

  /**
   * Get multiaddresses
   */
  getMultiaddrs() {
    if (!this.node) return [];
    return this.node.getMultiaddrs().map((ma) => ma.toString());
  }

  /**
   * Get connected peers count
   */
  getConnectedPeersCount() {
    if (!this.node) return 0;
    return this.node.getConnections().length;
  }

  /**
   * Get relay connections count
   */
  getRelayConnectionsCount() {
    return this.relayConnections.size;
  }

  /**
   * Check if we're using a relay (behind NAT)
   */
  isUsingRelay() {
    const addrs = this.getMultiaddrs();
    return addrs.some((addr) => addr.includes('/p2p-circuit/'));
  }

  /**
   * Get NAT status
   */
  getNatStatus() {
    const addrs = this.getMultiaddrs();
    const hasPublic = addrs.some((addr) => {
      return !addr.includes('127.0.0.1') &&
             !addr.includes('/p2p-circuit/') &&
             (addr.includes('/ip4/') || addr.includes('/ip6/'));
    });

    if (hasPublic) {
      return 'public';
    } else if (this.isUsingRelay()) {
      return 'relayed';
    } else {
      return 'unknown';
    }
  }

  /**
   * Get all LAN-discovered peers (via mDNS). These providers serve for free.
   * @returns {Object[]} Array of { peerId, multiaddrs, lanAddress, discoveredAt, free }
   */
  getLANPeers() {
    return Array.from(this.lanPeers.values());
  }

  /**
   * Check if a peer was discovered on the LAN (free inference).
   * @param {string} peerId
   * @returns {boolean}
   */
  isLANPeer(peerId) {
    return this.lanPeers.has(peerId);
  }

  /**
   * Dial a peer by peer ID or multiaddr
   *
   * @param {string} peerIdOrAddr Peer ID or multiaddr string
   * @returns {Promise<Connection>} The connection
   */
  async dial(peerIdOrAddr) {
    if (!this.isStarted) {
      throw new Error('Node not started');
    }

    console.log('[libp2p] Dialing:', peerIdOrAddr);

    try {
      const connection = await this.node.dial(peerIdOrAddr);
      console.log('[libp2p] Connected to:', connection.remotePeer.toString());
      return connection;
    } catch (err) {
      console.error('[libp2p] Failed to dial:', err.message);
      throw err;
    }
  }

  /**
   * Send an inference request to a peer
   *
   * @param {string} peerId Target peer ID
   * @param {Object} request Inference request
   * @param {string} request.pipeline - Pipeline name (e.g. 'image_turbo', 'llm')
   * @param {Record<string, unknown>} request.params - Pipeline-specific parameters
   * @returns {Promise<{ok: boolean, result?: Record<string, unknown>, error?: string}>} Inference response
   */
  async sendInferenceRequest(peerId, request) {
    if (!this.isStarted) {
      throw new Error('Node not started');
    }

    console.log('[libp2p] Sending inference request to:', peerId);

    const connection = await this.dial(peerId);
    const stream = await connection.newStream(PROTOCOLS.INFERENCE);

    try {
      // Send request
      const requestData = JSON.stringify(request);
      await pipe(
        [fromString(requestData)],
        stream.sink
      );

      // Read response
      let responseData = '';
      await pipe(
        stream.source,
        async function* (source) {
          for await (const chunk of source) {
            responseData += toString(chunk.subarray());
          }
        }
      );

      const response = JSON.parse(responseData);
      console.log('[libp2p] Received response:', response.ok ? 'success' : response.error);

      return response;
    } finally {
      await stream.close();
    }
  }

  /**
   * Register a handler for inference requests
   *
   * @param {(request: {pipeline: string, params: Record<string, unknown>}, peerId: string) => Promise<{ok: boolean, result?: Record<string, unknown>, error?: string}>} handler
   */
  async onInferenceRequest(handler) {
    this.handlers.set(PROTOCOLS.INFERENCE, handler);

    if (this.isStarted) {
      await this._registerProtocolHandler(PROTOCOLS.INFERENCE, handler);
    }
  }

  /**
   * Register a handler for health checks
   *
   * @param {(peerId: string) => Promise<{pipelines: string[], version: string}>} handler
   */
  async onHealthRequest(handler) {
    this.handlers.set(PROTOCOLS.HEALTH, handler);

    if (this.isStarted) {
      await this._registerProtocolHandler(PROTOCOLS.HEALTH, handler);
    }
  }

  /**
   * Check health of a peer
   *
   * @param {string} peerId Target peer ID
   * @returns {Promise<Object>} Health info
   */
  async checkPeerHealth(peerId) {
    if (!this.isStarted) {
      throw new Error('Node not started');
    }

    const connection = await this.dial(peerId);
    const stream = await connection.newStream(PROTOCOLS.HEALTH);

    try {
      // Send empty request
      await pipe(
        [fromString('{}')],
        stream.sink
      );

      // Read response
      let responseData = '';
      await pipe(
        stream.source,
        async function* (source) {
          for await (const chunk of source) {
            responseData += toString(chunk.subarray());
          }
        }
      );

      return JSON.parse(responseData);
    } finally {
      await stream.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _setupEventListeners() {
    // Peer discovery — detect LAN peers via mDNS multiaddr patterns
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString();
      const addrs = evt.detail.multiaddrs || [];
      const addrStrings = addrs.map(a => a.toString());

      // Detect LAN peers by private IP ranges in their multiaddrs
      const lanAddr = addrStrings.find(a =>
        a.includes('/ip4/192.168.') || a.includes('/ip4/10.') ||
        a.match(/\/ip4\/172\.(1[6-9]|2\d|3[01])\./)
      );

      if (lanAddr) {
        const isNew = !this.lanPeers.has(peerId);
        const lanIP = lanAddr.match(/\/ip4\/([\d.]+)\//)?.[1] || null;
        this.lanPeers.set(peerId, {
          peerId,
          multiaddrs: addrStrings,
          lanAddress: lanIP,
          discoveredAt: Date.now(),
          free: true,
        });
        console.log(`[libp2p] Discovered LAN peer: ${peerId} at ${lanIP}`);

        // Notify main process of new LAN peer for desktop notification
        if (isNew && this._onLANPeerDiscovered) {
          this._onLANPeerDiscovered(peerId, lanIP);
        }
        if (isNew) this._emitNetworkEvent('peer_discovered', { peerId, scope: 'lan' });
      } else {
        console.log('[libp2p] Discovered peer:', peerId);
        this._emitNetworkEvent('peer_discovered', { peerId, scope: 'mesh' });
      }
    });

    // Peer connect
    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString();
      console.log('[libp2p] Connected to peer:', peerId);
      this.peerConnections.set(peerId, Date.now());
      this._emitNetworkEvent('peer_connected', { peerId });
    });

    // Peer disconnect
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      console.log('[libp2p] Disconnected from peer:', peerId);
      this.peerConnections.delete(peerId);
      this.lanPeers.delete(peerId);
      this._emitNetworkEvent('peer_disconnected', { peerId });
    });

    // Self peer update (new addresses)
    this.node.addEventListener('self:peer:update', (evt) => {
      console.log('[libp2p] Addresses updated:', this.getMultiaddrs());
    });
  }

  async _registerDefaultHandlers() {
    // Register any handlers that were set before start
    for (const [protocol, handler] of this.handlers) {
      if (handler?.raw) {
        try { await this.node.unhandle(protocol); } catch {}
        this.node.handle(protocol, handler.handler);
      } else {
        await this._registerProtocolHandler(protocol, handler);
      }
    }
  }

  /**
   * Open a raw bidirectional stream to a peer for binary data (e.g., RPC tunnel).
   * Unlike sendInferenceRequest which JSON-encodes, this returns the raw stream
   * for the caller to pipe TCP data through.
   *
   * @param {string} peerId Target peer ID
   * @param {string} protocol Protocol string (e.g., PROTOCOLS.RPC_TUNNEL)
   * @returns {Promise<{stream, connection}>} The raw duplex stream and connection
   */
  async openRawStream(peerId, protocol) {
    if (!this.isStarted) throw new Error('Node not started');

    const connection = await this.dial(peerId);
    const stream = await connection.newStream(protocol);
    return { stream, connection };
  }

  /**
   * Register a raw protocol handler that receives the raw duplex stream
   * instead of JSON-parsed data. Used for binary protocols like RPC tunnels.
   *
   * @param {string} protocol Protocol string
   * @param {Function} handler Async function({ stream, connection }) — caller owns the stream lifecycle
   */
  async registerRawProtocolHandler(protocol, handler) {
    if (!this.isStarted) {
      // Defer until start
      this.handlers.set(protocol, { raw: true, handler });
      return;
    }
    try { await this.node.unhandle(protocol); } catch {}
    this.node.handle(protocol, handler);
  }

  async _registerProtocolHandler(protocol, handler) {
    try { await this.node.unhandle(protocol); } catch {}
    this.node.handle(protocol, async ({ stream, connection }) => {
      const remotePeer = connection.remotePeer.toString();
      console.log(`[libp2p] ${protocol} request from ${remotePeer}`);

      try {
        // Read request
        let requestData = '';
        await pipe(
          stream.source,
          async function* (source) {
            for await (const chunk of source) {
              requestData += toString(chunk.subarray());
            }
          }
        );

        const request = JSON.parse(requestData || '{}');

        // Handle request
        const response = await handler(request, remotePeer);

        // Send response
        const responseData = JSON.stringify(response);
        await pipe(
          [fromString(responseData)],
          stream.sink
        );
      } catch (err) {
        console.error(`[libp2p] Error handling ${protocol}:`, err);

        // Send error response
        const errorResponse = JSON.stringify({
          ok: false,
          error: 'internal_error',
          detail: err.message,
        });
        await pipe(
          [fromString(errorResponse)],
          stream.sink
        );
      } finally {
        await stream.close();
      }
    });
  }
}

// Singleton instance
let instance = null;

/**
 * Get the BonzAI P2P node instance
 */
export function getP2PNode() {
  if (!instance) {
    instance = new BonzaiP2PNode();
  }
  return instance;
}

/**
 * Start the P2P node with the given options
 */
export async function startP2PNode(options = {}) {
  const node = getP2PNode();
  return node.start(options);
}

/**
 * Stop the P2P node
 */
export async function stopP2PNode() {
  if (instance) {
    await instance.stop();
  }
}

/**
 * Generate a deterministic peer ID from a wallet address
 *
 * Note: This is for future use when we want peer IDs to be
 * linked to wallet addresses for identity verification.
 * For now, libp2p generates random peer IDs.
 *
 * @param {string} walletAddress Ethereum wallet address
 * @returns {Promise<string>} Peer ID string
 */
export async function generatePeerIdFromWallet(walletAddress) {
  // TODO: Implement deterministic peer ID generation from wallet
  // This would use the wallet's private key to derive a libp2p key
  // For now, we just use random peer IDs generated by libp2p
  console.log('[libp2p] Deterministic peer ID from wallet not yet implemented');
  return null;
}

export default {
  getP2PNode,
  startP2PNode,
  stopP2PNode,
  generatePeerIdFromWallet,
  PROTOCOLS,
};
