import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KadDHT } from '../node_modules/@libp2p/kad-dht/dist/src/kad-dht.js';
import { peerRoutingSymbol } from '@libp2p/interface';
import { withPacedPeerRouting } from '../src/services/pacedPeerRouting.js';

// Exercise the actual service orchestration with all transports replaced by inert
// factories. No network, persistent datastore, or user's P2P settings are accessed.
test('desktop keeps DHT in client mode even with relay/public-address options', async () => {
  const calls = [];
  const node = { peerId: { toString: () => 'test-peer' }, getMultiaddrs: () => [], addEventListener() {}, async start() {}, async stop() {} };
  const stubKey = `bonzai-dht-policy-test-${Date.now()}`;
  const dependencies = { withPacedPeerRouting, secureCertifiedPeerRecords: () => calls.push('secured'), createLibp2p: async options => {
    calls.push({ ...options, dht: options.services.dht({}) });
    return node;
  } };
  for (const name of ['noise', 'yamux', 'tcp', 'webSockets', 'webRTC', 'circuitRelayTransport', 'circuitRelayServer', 'identify', 'kadDHT', 'bootstrap', 'mdns']) {
    dependencies[name] = options => ({ type: name, options });
  }
  dependencies.kadDHT = options => () => ({
    options,
    [peerRoutingSymbol]: { async findPeer() {}, async *getClosestPeers() {} },
  });
  dependencies.pipe = () => { throw new Error('No streams expected'); };
  dependencies.fromString = () => {};
  dependencies.toString = () => {};
  globalThis[stubKey] = dependencies;
  try {
    const source = await readFile(new URL('../src/services/libp2p.service.js', import.meta.url), 'utf8');
    const stubbed = `const { ${Object.keys(dependencies).join(', ')} } = globalThis[${JSON.stringify(stubKey)}];\n` + source.replace(/^import .*;\n/gm, '');
    const service = await import(`data:text/javascript;base64,${Buffer.from(stubbed).toString('base64')}`);
    for (const options of [{}, { clientMode: false, enableRelay: true, announceAddresses: ['/ip4/203.0.113.1/tcp/4002'] }]) {
      await service.startP2PNode(options);
      assert.equal(calls.at(-1), 'secured');
      assert.equal(calls.at(-2).start, false);
      assert.equal(calls.at(-2).dht.options.clientMode, true);
      assert.equal(calls.at(-2).dht.options.protocol, '/bonzai/kad/1.0.0');
      assert.equal(calls.at(-2).transports.find(item => item.type === 'circuitRelayTransport').options.discoverRelays, 3);
      await service.stopP2PNode();
    }
  } finally { delete globalThis[stubKey]; }
});

test('installed DHT client mode removes inbound handlers rather than only changing a label', async () => {
  const operations = [];
  const log = () => {};
  const context = {
    protocol: '/bonzai/kad/1.0.0', clientMode: false, log,
    components: { registrar: {
      unhandle: async protocol => operations.push(['remove', protocol]),
      handle: async protocol => operations.push(['install', protocol]),
    } },
    rpc: { onIncomingStream() {} },
  };
  await KadDHT.prototype.setMode.call(context, 'server');
  assert.deepEqual(operations.map(([op]) => op), ['remove', 'install']);
  operations.length = 0;
  await KadDHT.prototype.setMode.call(context, 'client');
  assert.equal(context.clientMode, true);
  assert.deepEqual(operations, [['remove', '/bonzai/kad/1.0.0']]);
});
