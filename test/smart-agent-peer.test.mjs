import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { identify } from '@libp2p/identify';
import { ethers } from 'ethers';
import { getP2PNode } from '../src/services/libp2p.service.js';
import { createAgentJobMailbox } from '../src/main/agentJobMailbox.js';
import { jobPacketMessage } from '../src/services/smartAgentHandoff.js';

test('two local encrypted peers deliver a signed worker brief exactly once', { skip: process.env.BONZAI_PEER_TEST !== '1', timeout: 45000 }, async () => {
  const wrappers = [];
  try {
    for (let i = 0; i < 2; i++) {
      const wrapper = new (getP2PNode().constructor)();
      wrappers.push(wrapper);
      wrapper.node = await createLibp2p({ addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] }, transports: [tcp()], connectionEncryption: [noise()], streamMuxers: [yamux()], services: { identify: identify() } });
      wrapper.isStarted = true;
    }
    const state = new Map();
    const mailbox = createAgentJobMailbox({ get: (key, fallback) => state.get(key) || fallback, set: (key, value) => state.set(key, value) });
    await wrappers[1].onAgentJob((packet, peer) => mailbox.receive(packet, peer, 'provider'));
    const packet = { version: 1, kind: 'bonzai-agent-job', jobId: ethers.id('loopback-fixture'), terms: { title: 'Prepare meditation', outcome: 'Five minute script', chainId: 4663, escrow: '0x0000000000000000000000000000000000000001' } };
    packet.signature = await ethers.Wallet.createRandom().signMessage(jobPacketMessage(packet));
    const target = wrappers[1].node.getMultiaddrs()[0].toString();
    assert.equal((await wrappers[0].sendAgentJob(target, packet)).status, 'received');
    assert.equal((await wrappers[0].sendAgentJob(target, packet)).status, 'received');
    assert.equal(mailbox.list().length, 1);
    assert.equal(mailbox.list()[0].peerId, wrappers[0].getPeerId());
    await wrappers[1].onHealthRequest(async () => ({ pipelines: ['llm'], version: 'fixture' }));
    assert.deepEqual((await wrappers[0].checkPeerHealth(wrappers[1].getPeerId())).pipelines, ['llm']);
    await wrappers[1].onInferenceRequest(async request => ({ ok: true, result: request.params }));
    const unicode = 'Équipe 日本語 🌸'.repeat(4000);
    const response = await wrappers[0].sendInferenceRequest(target, { pipeline: 'fixture', params: { text: unicode } });
    assert.equal(response.result.text, unicode);
  } finally { await Promise.all(wrappers.map(wrapper => wrapper.node?.stop())); }
});

test('existing inference and health protocols discover an authorized worker and deliver binary media', { skip: process.env.BONZAI_PEER_TEST !== '1', timeout: 45000 }, async () => {
  const { createAgentWorkerHost, mediaHash } = await import('../src/main/agentWorkerHost.js');
  const { workerGrantMessage, workerCallMessage, workerKey } = await import('../src/services/agentWorkerProtocol.js');
  const wrappers = [], state = new Map(), owner = ethers.Wallet.createRandom();
  const bytes = Buffer.alloc(400000); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  let executions = 0;
  try {
    for (let i = 0; i < 2; i++) {
      const wrapper = new (getP2PNode().constructor)(); wrappers.push(wrapper);
      wrapper.node = await createLibp2p({ addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] }, transports: [tcp()], connectionEncryption: [noise()], streamMuxers: [yamux()], services: { identify: identify() } }); wrapper.isStarted = true;
    }
    const grant = { version: 1, chainId: 4663, collection: owner.address, tokenId: '1', epoch: '1', peerId: wrappers[1].getPeerId(), expiresAt: Date.now() + 600000, capabilities: ['audio'], workflows: [], name: 'Rose' };
    const id = mediaHash(bytes), artifact = { id, sha256: id, size: bytes.length, ext: 'wav', mimeType: 'audio/wav' };
    const host = createAgentWorkerHost({ store: { get: (k,f) => state.get(k) ?? f, set: (k,v) => state.set(k,v) }, mode: () => 'provider', peerId: () => grant.peerId,
      resolveIdentity: async () => ({ owner: owner.address, epoch: '1' }), verifyJob: async () => {},
      run: async () => { executions++; return {}; }, media: { prepare: async () => ({ artifacts: [artifact] }), read: async (_, offset, count) => bytes.subarray(offset, offset + count) } });
    await host.publish({ grant, signature: await owner.signMessage(workerGrantMessage(grant)) }, { agentId: 'rose' });
    await wrappers[1].onHealthRequest(async () => ({ workers: await host.discover() }));
    await wrappers[1].onInferenceRequest(request => host.handle(request));
    const address = wrappers[1].node.getMultiaddrs()[0].toString();
    const discovered = await wrappers[0].checkPeerHealth(address); assert.equal(discovered.workers[0].grant.name, 'Rose');
    const requestId = ethers.id('media-worker');
    const request = async (action, rest = {}) => {
      const call = { version: 1, worker: workerKey(grant), requestId, action, expiresAt: Date.now() + 60000, ...rest };
      return wrappers[0].sendInferenceRequest(address, { kind: 'bonzai-worker', call, signature: await owner.signMessage(workerCallMessage(call)) });
    };
    await request('execute', { capability: 'audio', input: { prompt: 'Meditation' } });
    assert.equal((await request('status')).status, 'completed');
    const chunks = []; for (let offset = 0; offset < bytes.length;) {
      const response = await request('media', { artifactId: id, offset });
      const chunk = Buffer.from(response.data, 'base64'); chunks.push(chunk); offset += chunk.length;
    }
    assert.equal(mediaHash(Buffer.concat(chunks)), id); assert.equal(executions, 1);
  } finally { await Promise.all(wrappers.map(w => w.node?.stop())); }
});
