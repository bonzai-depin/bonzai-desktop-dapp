import { parseJobPacket, jobPacketSender } from '../services/smartAgentHandoff.js';

/** Receipt is not acceptance: untrusted briefs never execute from the network handler. */
export function createAgentJobMailbox(store) {
  const key = 'smartAgentWorkerInbox';
  return {
    list: () => store.get(key, []),
    receive(raw, peerId, mode) {
      const packet = parseJobPacket(raw);
      if (mode !== 'provider' && !(mode === 'consumer' && packet.delivery)) return { ok: false, error: 'Enable Provider mode to receive worker assignments, or Consumer mode to receive deliveries.' };
      const sender = jobPacketSender(packet);
      const id = `${packet.terms.chainId}:${String(packet.terms.escrow).toLowerCase()}:${packet.jobId}:${packet.delivery ? 'delivery' : 'brief'}`;
      const records = store.get(key, []);
      if (records.some(entry => entry.id === id)) return { ok: true, status: 'received', id };
      if (records.length >= 100) return { ok: false, error: 'Worker inbox is full. Review pending assignments first.' };
      if (records.filter(entry => entry.peerId === peerId || entry.sender === sender).length >= 10) return { ok: false, error: 'Review this sender’s pending assignments before sending more.' };
      store.set(key, [...records, { id, packet, sender, peerId, receivedAt: Date.now() }]);
      return { ok: true, status: 'received', id };
    },
    dismiss(id) { store.set(key, store.get(key, []).filter(entry => entry.id !== id)); },
  };
}
