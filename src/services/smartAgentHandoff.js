import { ethers } from 'ethers';

export const MAX_JOB_PACKET_BYTES = 64 * 1024;
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Only the agreed brief travels. Company memory, credentials and local paths do not. */
export function createJobPacket(record) {
  const packet = { version: 1, kind: 'bonzai-agent-job', jobId: record.jobId, terms: record.terms,
    ...(record.employerSignature ? { signature: record.employerSignature } : {}) };
  return parseJobPacket(JSON.stringify(packet));
}

export function parseJobPacket(raw) {
  const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > MAX_JOB_PACKET_BYTES) throw new Error('Job brief exceeds the transfer limit.');
  const packet = JSON.parse(serialized);
  if (packet?.version !== 1 || packet.kind !== 'bonzai-agent-job' || !ethers.isHexString(packet.jobId, 32)
    || !packet.terms || Array.isArray(packet.terms) || typeof packet.terms !== 'object') throw new Error('Invalid job handoff.');
  if (typeof packet.terms.title !== 'string' || !packet.terms.title.trim()
    || typeof packet.terms.outcome !== 'string' || !packet.terms.outcome.trim()) throw new Error('Missing job brief.');
  if (packet.delivery != null && (typeof packet.delivery !== 'string' || !packet.delivery.trim())) throw new Error('Missing delivery content.');
  return { version: 1, kind: packet.kind, jobId: packet.jobId, terms: packet.terms,
    ...(packet.delivery ? { delivery: packet.delivery } : {}),
    ...(packet.signature ? { signature: packet.signature } : {}) };
}

export function jobPacketMessage(packet) {
  const { jobId, terms } = parseJobPacket(packet);
  return `BonzAI worker assignment\n${terms.chainId}\n${String(terms.escrow).toLowerCase()}\n${jobId}\n${ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms)))}`;
}

export function jobPacketSender(packet) {
  if (typeof packet.signature !== 'string' || packet.signature.length > 2048) throw new Error('A signed employer brief is required.');
  return ethers.verifyMessage(jobPacketMessage(packet), packet.signature);
}

/** The onchain commitment is authoritative, never the sender's claimed status. */
export function verifyJobPacket(packet, live, network) {
  packet = parseJobPacket(packet);
  const t = packet.terms;
  if (!same(t.chainId, network.chainId) || !same(t.escrow, network.escrow)) throw new Error('Job belongs to another network or escrow.');
  if (![1, 2, 3, 4, 5, 6].includes(live.status)) throw new Error('Job has not been funded.');
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(t)));
  if (!same(hash, live.termsHash)) throw new Error('Job brief does not match its onchain commitment.');
  if (packet.signature && !same(jobPacketSender(packet), live.employer)) throw new Error('The brief was not signed by this job’s employer.');
  if (packet.delivery && !same(ethers.keccak256(ethers.toUtf8Bytes(packet.delivery)), live.evidenceHash)) throw new Error('Delivery does not match the worker’s onchain submission.');
  for (const [field, actual] of [['worker', live.worker], ['currency', live.currency], ['amount', live.amount],
    ['companionTokenId', live.companionTokenId], ['routeAssetId', live.routeAssetId], ['arbitrator', live.arbitrator]]) {
    if (!same(t[field], actual)) throw new Error(`Job ${field} does not match escrow.`);
  }
  return packet;
}

export function workerRoleForJob(charter, agent, live, now = Date.now()) {
  if (live.status !== 2 || live.deliverBy * 1000 <= now) throw new Error('Accept an unexpired job before adding its work to the backlog.');
  if (!same(agent.agentWallet, live.worker)) throw new Error('This local agent is not the hired worker.');
  const entry = Object.entries(charter.roles || {}).find(([, role]) => role.enabled !== false && role.companion === agent.id);
  if (!entry) throw new Error('Assign the hired agent to a team role first.');
  return entry[0];
}
