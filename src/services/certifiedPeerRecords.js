import { PeerRecord, RecordEnvelope } from '@libp2p/peer-record';

/** Backport GHSA-vrf4-mx87-p53w's identity invariant to the libp2p 1.x API.
 * Install before node.start(). The original consumer still verifies signatures,
 * expected peer IDs and sequence numbers before making any datastore writes.
 */
export function secureCertifiedPeerRecords(peerStore) {
  const consume = peerStore.consumePeerRecord.bind(peerStore);
  peerStore.consumePeerRecord = async (bytes, expectedPeer) => {
    const envelope = await RecordEnvelope.createFromProtobuf(bytes);
    const record = PeerRecord.createFromProtobuf(envelope.payload);
    if (!record.peerId.equals(envelope.peerId)) return false;
    return consume(bytes, expectedPeer);
  };
}
