import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { identify } from '@libp2p/identify';
import { createFromProtobuf } from '@libp2p/peer-id-factory';
import { getP2PNode } from '../src/services/libp2p.service.js';
import { createRPCTunnel, registerRPCTunnelHandler } from '../src/services/pipeline.tunnel.js';
import { createMeshDevices } from '../src/main/meshDevices.js';
import { createMeshController } from '../src/main/meshController.js';

const keychain = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(`sealed:${value}`), decryptString: bytes => bytes.toString().replace(/^sealed:/, '') };
function memoryStore() {
  const data = new Map();
  return { get: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback), set: (key, value) => data.set(key, structuredClone(value)) };
}

/** Stands in for llama.cpp's rpc-server: loopback only, echoes what it receives. */
async function echoServer() {
  const sockets = new Set();
  let accepted = 0;
  const server = net.createServer(socket => { accepted++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); socket.pipe(socket); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, accepted: () => accepted, close: () => { for (const socket of sockets) socket.destroy(); server.close(); } };
}

/** One BonzAI device: real encrypted libp2p node, its own store and controller. */
async function device(name, memBudget, { mode = 'local' } = {}) {
  const store = memoryStore();
  const devices = createMeshDevices({ store, secureStorage: keychain, selfProfile: () => controller ? { name, platform: 'test', memBudget } : {} });
  const wrapper = new (getP2PNode().constructor)();
  const rpc = await echoServer();
  const activity = [];
  let rpcRunning = false;
  let controller = null;
  controller = createMeshController({
    devices, node: () => wrapper, hostname: () => `${name}.local`, version: () => 'test',
    systemInformation: async () => ({ memBudget, gpu: 'Test GPU' }), networkMode: () => mode,
    startRpcServer: async () => { rpcRunning = true; return { ok: true }; }, rpcServerRunning: () => rpcRunning,
    notify: event => activity.push(event),
    tunnel: { create: createRPCTunnel, register: (node, _port, options) => registerRPCTunnelHandler(node, rpc.port, options) },
  });
  const identity = await controller.identity();
  wrapper.node = await createLibp2p({ peerId: await createFromProtobuf(identity), addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] }, transports: [tcp()], connectionEncryption: [noise()], streamMuxers: [yamux()], services: { identify: identify() } });
  wrapper.isStarted = true;
  await controller.attach();
  return { name, wrapper, controller, devices, rpc, activity, identity, address: () => wrapper.node.getMultiaddrs()[0].toString(), stop: async () => { rpc.close(); await wrapper.node.stop(); } };
}

/** Send bytes through a local tunnel port; resolves with the echo or 'closed'. */
function roundTrip(port, payload) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let received = Buffer.alloc(0);
    const finish = value => { clearTimeout(timer); socket.destroy(); resolve(value); };
    const timer = setTimeout(() => finish('timeout'), 8000);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', chunk => { received = Buffer.concat([received, chunk]); if (received.length >= payload.length) finish(received); });
    socket.on('close', () => finish('closed'));
    socket.on('error', () => finish('closed'));
  });
}

test('linked devices pool memory through an authorized encrypted tunnel; strangers get nothing', { skip: process.env.BONZAI_PEER_TEST !== '1', timeout: 60000 }, async () => {
  const studio = await device('Studio', 96e9), laptop = await device('Laptop', 8e9), stranger = await device('Stranger', 8e9);
  const all = [studio, laptop, stranger];
  try {
    await laptop.wrapper.dial(studio.address());
    await stranger.wrapper.dial(studio.address());

    // Before linking: on the same network, yet no profile and no compute.
    assert.equal((await laptop.controller.state()).devices.length, 0);
    assert.deepEqual(await laptop.wrapper.requestJson(studio.wrapper.getPeerId(), '/bonzai/v2/mesh-device', { type: 'status' }), { ok: false, error: 'not_linked' });
    assert.equal(await laptop.controller.preparePool({ filesizeBytes: 40e9, localBudget: 8e9 }), null);

    // Link with the code shown on the studio.
    assert.deepEqual(await stranger.controller.join('AAAA-AAAA'), { ok: false, error: 'no_invitation' });
    const { invitation } = studio.controller.invite();
    assert.deepEqual(await stranger.controller.join('AAAA-AAAA'), { ok: false, error: 'invalid_code' });
    const joined = await laptop.controller.join(invitation.code);
    assert.equal(joined.ok, true);
    assert.equal(joined.device.name, 'Studio');
    assert.ok(studio.activity.some(event => event.type === 'device_linked' && event.peerId === laptop.wrapper.getPeerId()));

    // Each side now sees the other, with the memory it can lend.
    const laptopView = await laptop.controller.state();
    assert.deepEqual(laptopView.devices.map(d => [d.name, d.online, d.sharing, d.memBudget]), [['Studio', true, true, 96e9]]);
    assert.ok(laptopView.pooledBudget > 80e9);
    assert.equal(laptopView.nearby, 0);
    const studioView = await studio.controller.state();
    assert.deepEqual(studioView.devices.map(d => [d.name, d.online]), [['Laptop', true]]);
    assert.equal(studioView.lending.active, true);

    // A model that fits locally stays local; a larger one borrows the studio.
    assert.equal(await laptop.controller.preparePool({ filesizeBytes: 3e9, localBudget: 8e9 }), null);
    const pool = await laptop.controller.preparePool({ filesizeBytes: 40e9, localBudget: 8e9 });
    assert.equal(pool.rpcPeers.length, 1);
    assert.match(pool.rpcPeers[0], /^127\.0\.0\.1:\d+$/);
    assert.equal((await laptop.controller.state()).pool.active, true);
    const port = Number(pool.rpcPeers[0].split(':')[1]);
    // llama.cpp opens several connections in turn; each must reach the server intact.
    const large = Buffer.alloc(300000); for (let i = 0; i < large.length; i++) large[i] = i % 251;
    for (const payload of [Buffer.from('device probe'), large, Buffer.from('second backend')]) {
      const echoed = await roundTrip(port, payload);
      assert.ok(Buffer.isBuffer(echoed) && echoed.equals(payload));
    }

    // The stranger shares the network but was never linked: its tunnel carries nothing.
    const before = studio.rpc.accepted();
    const intruder = await createRPCTunnel(stranger.wrapper, studio.wrapper.getPeerId());
    assert.equal(await roundTrip(intruder.localPort, Buffer.from('let me in')), 'closed');
    assert.equal(studio.rpc.accepted(), before);
    await intruder.close();

    // Turning lending off on the studio cuts new use immediately.
    await studio.controller.updateSettings({ sharing: false });
    assert.equal(await roundTrip(port, Buffer.from('after opt-out')), 'closed');
    assert.equal(await laptop.controller.preparePool({ filesizeBytes: 40e9, localBudget: 8e9 }), null);
    assert.equal((await laptop.controller.state()).pool.active, false);
    await studio.controller.updateSettings({ sharing: true });

    // Unlinking on one device removes trust on both.
    await laptop.controller.unlink(studio.wrapper.getPeerId());
    assert.equal(studio.devices.isLinked(laptop.wrapper.getPeerId()), false);
    assert.equal(laptop.devices.isLinked(studio.wrapper.getPeerId()), false);
    assert.equal(await laptop.controller.preparePool({ filesizeBytes: 40e9, localBudget: 8e9 }), null);
  } finally { await Promise.all(all.map(item => item.stop().catch(() => {}))); }
});

test('a device keeps its identity across restarts so links survive', { skip: process.env.BONZAI_PEER_TEST !== '1', timeout: 30000 }, async () => {
  const studio = await device('Studio', 96e9);
  try {
    const again = await studio.controller.identity();
    assert.ok(Buffer.from(again).equals(Buffer.from(studio.identity)));
    assert.equal((await createFromProtobuf(again)).toString(), studio.wrapper.getPeerId());
    assert.equal((await studio.controller.state()).self.persistentIdentity, true);
  } finally { await studio.stop(); }
});

test('provider mode still serves the tunnel publicly, by explicit choice', { skip: process.env.BONZAI_PEER_TEST !== '1', timeout: 30000 }, async () => {
  const provider = await device('Provider', 96e9, { mode: 'provider' }), consumer = await device('Consumer', 8e9);
  try {
    await registerRPCTunnelHandler(provider.wrapper, provider.rpc.port, { authorize: provider.controller.authorizeTunnel });
    await consumer.wrapper.dial(provider.address());
    const tunnel = await createRPCTunnel(consumer.wrapper, provider.wrapper.getPeerId());
    const echoed = await roundTrip(tunnel.localPort, Buffer.from('selected provider'));
    assert.equal(echoed.toString(), 'selected provider');
    await tunnel.close();
    await assert.rejects(() => registerRPCTunnelHandler(provider.wrapper, provider.rpc.port), /authorize/);
  } finally { await Promise.all([provider.stop(), consumer.stop()]); }
});
