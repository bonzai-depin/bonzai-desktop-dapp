import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { peerRoutingSymbol } from '@libp2p/interface';
import { pacePeerRouting, withPacedPeerRouting } from '../src/services/pacedPeerRouting.js';

test('known peers are returned immediately and direct peer lookup keeps its receiver', async () => {
  const peer = { id: 'known-relay', multiaddrs: ['/ip4/127.0.0.1/tcp/4002'] };
  const router = {
    peer,
    findPeer(id) { assert.equal(id, 'known-relay'); return this.peer; },
    async *getClosestPeers() { yield this.peer; },
  };
  const paced = pacePeerRouting(router, { intervalMs: 10_000 });
  assert.equal(await paced.findPeer('known-relay'), peer);
  const iterator = paced.getClosestPeers(new Uint8Array(32));
  // Race against a short timer so an accidental delay before yielding a known
  // relay fails without making this test wait for the complete retry interval.
  let timer;
  try {
    const result = await Promise.race([
      iterator.next(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Known peer was delayed')), 100); }),
    ]);
    assert.equal(result.value, peer);
    await iterator.return();
  } finally { clearTimeout(timer); }
});

test('empty-query delay is cancellable so stopping the mesh does not wait for a retry', async () => {
  const controller = new AbortController();
  const paced = pacePeerRouting({ async *getClosestPeers() {} }, { intervalMs: 10_000 });
  const next = paced.getClosestPeers(new Uint8Array(32), { signal: controller.signal }).next();
  setImmediate(() => controller.abort());
  await assert.rejects(next, { name: 'AbortError' });
});

test('failed queries yield to timers and preserve the original routing error', async () => {
  const failure = new Error('No route to DHT peer');
  let heartbeat = false;
  const timer = setTimeout(() => { heartbeat = true; }, 0);
  const paced = pacePeerRouting({ async *getClosestPeers() { throw failure; } }, { intervalMs: 20 });
  try {
    await assert.rejects(paced.getClosestPeers(new Uint8Array(32)).next(), error => error === failure);
    assert.equal(heartbeat, true);
  } finally { clearTimeout(timer); }
});

test('an already-aborted request does not start another routing query', async () => {
  let queried = false;
  const controller = new AbortController();
  controller.abort();
  const paced = pacePeerRouting({ async *getClosestPeers() { queried = true; } });
  await assert.rejects(paced.getClosestPeers(new Uint8Array(32), { signal: controller.signal }).next(), { name: 'AbortError' });
  assert.equal(queried, false);
});

test('DHT public routing adapter preserves the service and its other capabilities', () => {
  const routing = { findPeer() {}, async *getClosestPeers() {} };
  class Service {
    get [peerRoutingSymbol]() { return routing; }
    start() {}
    stop() {}
  }
  const service = new Service();
  const wrapped = withPacedPeerRouting(() => service)({});
  assert.equal(wrapped, service);
  assert.equal(Object.getPrototypeOf(wrapped), Service.prototype);
  assert.notEqual(wrapped[peerRoutingSymbol], routing);
  assert.equal(wrapped.start, Service.prototype.start);
});

test('installed relay random walk yields to application timers when no DHT peers exist', async () => {
  // Use a separate process: an unpaced regression starves its own timers, so an
  // in-process test timeout cannot stop it. The parent watchdog remains live.
  const routingUrl = new URL('../src/services/pacedPeerRouting.js', import.meta.url).href;
  const randomWalkUrl = new URL('../node_modules/libp2p/dist/src/random-walk.js', import.meta.url).href;
  const source = `
    import { RandomWalk } from ${JSON.stringify(randomWalkUrl)};
    import { pacePeerRouting } from ${JSON.stringify(routingUrl)};
    let queries = 0;
    let heartbeats = 0;
    const log = Object.assign(() => {}, { error() {}, trace() {} });
    const walker = new RandomWalk({
      logger: { forComponent: () => log },
      peerRouting: pacePeerRouting({ async *getClosestPeers() { queries++; } }, { intervalMs: 25 }),
    });
    const controller = new AbortController();
    const heartbeat = setInterval(() => { heartbeats++; }, 10);
    const consume = (async () => {
      try { for await (const _peer of walker.walk({ signal: controller.signal })) {} }
      catch (error) { if (!controller.signal.aborted) throw error; }
    })();
    setTimeout(() => controller.abort(), 160);
    await consume;
    walker.stop();
    clearInterval(heartbeat);
    console.log(JSON.stringify({ queries, heartbeats }));
  `;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Relay random walk starved the main event loop'));
    }, 3000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(watchdog);
      if (code !== 0) reject(new Error(`Random-walk child failed: ${stderr}`));
      else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }
    });
  });
  assert.ok(result.heartbeats >= 5, `Only ${result.heartbeats} application heartbeats ran`);
  assert.ok(result.queries >= 2 && result.queries <= 10, `Unbounded routing retries: ${result.queries}`);
});
