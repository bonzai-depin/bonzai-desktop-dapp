import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibp2p } from 'libp2p';
import { PeerRecord, RecordEnvelope } from '@libp2p/peer-record';
import { createEd25519PeerId } from '@libp2p/peer-id-factory';
import { multiaddr } from '@multiformats/multiaddr';
import { secureCertifiedPeerRecords } from '../src/services/certifiedPeerRecords.js';

test('a signed record cannot certify an attacker address for another peer', async () => {
  const node = await createLibp2p({ start: false });
  secureCertifiedPeerRecords(node.peerStore);
  const attacker = await createEd25519PeerId(), victim = await createEd25519PeerId();
  const address = multiaddr('/ip4/127.0.0.1/tcp/4001');
  const forged = await RecordEnvelope.seal(new PeerRecord({ peerId: victim, multiaddrs: [address], seqNumber: 2n }), attacker);
  for (const expectedPeer of [undefined, attacker, victim]) {
    assert.equal(await node.peerStore.consumePeerRecord(forged.marshal(), expectedPeer), false);
    assert.equal(await node.peerStore.has(victim), false);
  }
  const valid = await RecordEnvelope.seal(new PeerRecord({ peerId: victim, multiaddrs: [address], seqNumber: 1n }), victim);
  assert.equal(await node.peerStore.consumePeerRecord(valid.marshal(), victim), true);
  assert.equal((await node.peerStore.get(victim)).addresses[0].isCertified, true);
  // Signature validation and replay protection remain in force.
  assert.equal(await node.peerStore.consumePeerRecord(valid.marshal(), victim), false);
  const tampered = await RecordEnvelope.seal(new PeerRecord({ peerId: victim, multiaddrs: [address], seqNumber: 3n }), victim);
  tampered.signature[0] ^= 1;
  await assert.rejects(node.peerStore.consumePeerRecord(tampered.marshal(), victim));
  await node.stop();
});
