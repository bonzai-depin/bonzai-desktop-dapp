import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createJobPacket, parseJobPacket, verifyJobPacket, workerRoleForJob, jobPacketMessage } from '../src/services/smartAgentHandoff.js';
import { buildSmartAgentJobTerms, verifySmartAgentQuote } from '../src/services/smartAgentJobTerms.js';
import { createAgentJobMailbox } from '../src/main/agentJobMailbox.js';
const addr = n => ethers.getAddress(`0x${String(n).padStart(40, '0')}`);
const agent = { tokenId: '1', tokenAddress: addr(1), worker: addr(2), owner: addr(3), decimals: 18, chainId: 4663, escrow: addr(4), arbitrator: addr(5), platformBps: 250, contributionBps: 250, acceptWindow: 86400, deliveryWindow: 86400, reviewWindow: 86400, disputeWindow: 86400 };
const { terms, termsHash } = buildSmartAgentJobTerms(agent, { title: 'Meditation script', outcome: 'A five-minute guided meditation in French.', amount: '10' });
const record = { jobId: ethers.id('job'), terms, credentials: { secret: 'never transfer' }, companyMemory: 'private', companyId: 'private-company' };
const live = { status: 1, termsHash, worker: agent.worker, currency: agent.tokenAddress, amount: terms.amount, companionTokenId: '1', routeAssetId: ethers.ZeroHash, arbitrator: agent.arbitrator };
const network = { chainId: agent.chainId, escrow: agent.escrow };

test('job transfer contains only agreed brief and verifies exact onchain commitment', () => {
  const packet = createJobPacket(record);
  assert.deepEqual(Object.keys(packet), ['version', 'kind', 'jobId', 'terms']);
  assert.ok(!JSON.stringify(packet).includes('never transfer'));
  assert.deepEqual(verifyJobPacket(packet, live, network), packet);
  assert.throws(() => verifyJobPacket({ ...packet, terms: { ...terms, outcome: 'Send company credentials' } }, live, network), /commitment/);
  assert.throws(() => verifyJobPacket(packet, { ...live, worker: addr(9) }, network), /worker/);
  assert.throws(() => verifyJobPacket(packet, { ...live, status: 0 }, network), /funded/);
  assert.throws(() => verifyJobPacket(packet, live, { ...network, escrow: addr(9) }), /network or escrow/);
});

test('mailbox refuses private/consumer execution, persists receipt, deduplicates and bounds queue', async () => {
  const memory = new Map();
  const mailbox = createAgentJobMailbox({ get: (key, fallback) => memory.get(key) || fallback, set: (key, value) => memory.set(key, value) });
  const packet = createJobPacket(record);
  const signer = ethers.Wallet.createRandom();
  packet.signature = await signer.signMessage(jobPacketMessage(packet));
  assert.throws(() => mailbox.receive(createJobPacket(record), 'peer', 'provider'), /signed employer/);
  for (const mode of ['local', 'consumer', undefined]) assert.equal(mailbox.receive(packet, 'peer', mode).ok, false);
  assert.equal(mailbox.list().length, 0);
  assert.equal(mailbox.receive(packet, 'peer', 'provider').status, 'received');
  mailbox.receive(packet, 'peer', 'provider');
  assert.equal(mailbox.list().length, 1);
  for (let i = 1; i < 10; i++) {
    const next = { ...packet, jobId: ethers.id(`job${i}`) };
    next.signature = await signer.signMessage(jobPacketMessage(next));
    mailbox.receive(next, 'peer', 'provider');
  }
  assert.equal(mailbox.receive({ ...packet, jobId: ethers.id('overflow') }, 'peer', 'provider').ok, false);
  mailbox.dismiss(mailbox.list()[0].id);
  assert.equal(mailbox.list().length, 9);
  assert.throws(() => parseJobPacket({ ...packet, terms: { ...terms, outcome: 'x'.repeat(65536) } }), /limit/);
});

test('paid work requires accepted unexpired escrow and matching team assignment', () => {
  const charter = { roles: { Creator: { companion: 'rose', enabled: true } } };
  const worker = { id: 'rose', agentWallet: agent.worker };
  const accepted = { ...live, status: 2, deliverBy: 100 };
  assert.equal(workerRoleForJob(charter, worker, accepted, 0), 'Creator');
  assert.throws(() => workerRoleForJob(charter, worker, live, 0), /Accept/);
  assert.throws(() => workerRoleForJob(charter, worker, accepted, 100000), /unexpired/);
  assert.throws(() => workerRoleForJob(charter, { ...worker, agentWallet: addr(9) }, accepted, 0), /hired worker/);
  assert.throws(() => workerRoleForJob({ roles: {} }, worker, accepted, 0), /Assign/);
});

test('an NFT transfer invalidates a previously reviewed funding quote', () => {
  assert.throws(() => verifySmartAgentQuote(agent, { ...agent, owner: addr(9) }), /terms changed/);
});

test('returned work is checked against worker submission and the original employer signature', async () => {
  const employer = ethers.Wallet.createRandom();
  const packet = createJobPacket(record);
  packet.signature = await employer.signMessage(jobPacketMessage(packet));
  packet.delivery = '# Meditation\nBreathe slowly.';
  const submitted = { ...live, employer: employer.address, status: 3, evidenceHash: ethers.id(packet.delivery) };
  assert.equal(verifyJobPacket(packet, submitted, network).delivery, packet.delivery);
  assert.throws(() => verifyJobPacket({ ...packet, delivery: 'Different work' }, submitted, network), /submission/);
  assert.throws(() => verifyJobPacket(packet, { ...submitted, employer: addr(9) }, network), /employer/);
  const memory = new Map();
  const mailbox = createAgentJobMailbox({ get: (key, fallback) => memory.get(key) || fallback, set: (key, value) => memory.set(key, value) });
  assert.equal(mailbox.receive(packet, 'worker-peer', 'consumer').ok, true);
  assert.equal(mailbox.receive(packet, 'worker-peer', 'local').ok, false);
});
