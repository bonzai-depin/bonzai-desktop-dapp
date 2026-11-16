import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { Agent, fetch } from 'undici';
import axios from 'axios';
import { secureCertifiedPeerRecords } from '../src/services/certifiedPeerRecords.js';

test('patched dependencies preserve encrypted inference streams between real loopback peers', { timeout: 30000 }, async () => {
  const peers = [];
  try {
    for (let i = 0; i < 2; i++) {
      const peer = await createLibp2p({ start: false, addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] }, transports: [tcp()], connectionEncryption: [noise()], streamMuxers: [yamux()], services: { identify: identify() } });
      peers.push(peer);
      secureCertifiedPeerRecords(peer.peerStore);
      await peer.start();
    }
    await peers[1].handle('/bonzai/test/inference', async ({ stream }) => {
      const chunks = [];
      for await (const chunk of stream.source) chunks.push(Buffer.from(chunk.subarray()));
      const request = JSON.parse(Buffer.concat(chunks));
      await stream.sink([Buffer.from(JSON.stringify({ id: request.id, text: 'local fixture result' }))]);
      await stream.close();
    });
    const stream = await peers[0].dialProtocol(peers[1].getMultiaddrs()[0], '/bonzai/test/inference');
    await stream.sink([Buffer.from(JSON.stringify({ id: 'fixture-request' }))]);
    const chunks = [];
    for await (const chunk of stream.source) chunks.push(Buffer.from(chunk.subarray()));
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { id: 'fixture-request', text: 'local fixture result' });
    await stream.close();
  } finally {
    await Promise.all(peers.map(peer => peer.stop()));
  }
});

test('updated HTTP clients retain streamed completions, media bytes and cancellation', { timeout: 15000 }, async () => {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/waiting') return;
    if (req.url === '/media') {
      const parts = [];
      for await (const part of req) parts.push(part);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.concat(parts));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"token":"Hello"}\n\n');
    setTimeout(() => res.end('data: [DONE]\n\n'), 15);
  });
  const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(url, { dispatcher: agent });
    let text = '';
    for await (const bytes of response.body) text += new TextDecoder().decode(bytes);
    assert.equal(text, 'data: {"token":"Hello"}\n\ndata: [DONE]\n\n');
    const media = Buffer.from([0, 1, 2, 255]);
    const echoed = await axios.post(`${url}/media`, media, { responseType: 'arraybuffer', proxy: false });
    assert.deepEqual(Buffer.from(echoed.data), media);
    await assert.rejects(fetch(`${url}/waiting`, { dispatcher: agent, signal: AbortSignal.timeout(25) }), { name: 'TimeoutError' });
  } finally {
    await agent.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('optional wallet and livestream SDK entry points remain loadable', async () => {
  const [{ CdpClient }, { WebcastPushConnection }] = await Promise.all([import('@coinbase/cdp-sdk'), import('tiktok-live-connector')]);
  assert.equal(typeof CdpClient, 'function');
  assert.equal(typeof WebcastPushConnection, 'function');
});
