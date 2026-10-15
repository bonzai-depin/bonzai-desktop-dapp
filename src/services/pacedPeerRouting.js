import { setTimeout as delay } from 'node:timers/promises';
import { peerRoutingSymbol } from '@libp2p/interface';

/**
 * libp2p 1.x's relay random walk immediately retries exhausted routing queries.
 * With an empty DHT, that creates an endless microtask chain which starves the
 * Electron main event loop. Pace completed queries while delivering peers as
 * soon as they arrive. This also bounds retries of already-known relay peers.
 */
export function pacePeerRouting(router, { intervalMs = 1000 } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('Peer routing interval must be positive');
  }
  return {
    findPeer: (...args) => router.findPeer(...args),
    async *getClosestPeers(key, options = {}) {
      options.signal?.throwIfAborted();
      const started = performance.now();
      let finished = false;
      try {
        try {
          yield* router.getClosestPeers(key, options);
          finished = true;
        } catch (error) {
          finished = true;
          throw error;
        }
      } finally {
        // A caller that found its peer and stopped iterating needs no delay.
        // Completed/error queries must yield to timers before a random-walk
        // retry, even when the router returned synchronously without results.
        const remaining = intervalMs - (performance.now() - started);
        if (finished && !options.signal?.aborted) {
          await delay(Math.max(0, remaining), undefined, { signal: options.signal });
        }
      }
    },
  };
}

export function withPacedPeerRouting(createService, options) {
  return components => {
    const service = createService(components);
    // This is libp2p's public service adapter, not its internal query manager.
    // Keep the original DHT object, lifecycle, content routing and discovery.
    Object.defineProperty(service, peerRoutingSymbol, {
      value: pacePeerRouting(service[peerRoutingSymbol], options),
      configurable: true,
    });
    return service;
  };
}
