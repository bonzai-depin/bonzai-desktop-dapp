import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createAgentWorkerHost } from '../src/main/agentWorkerHost.js';
import { workerKey, workerGrantMessage, workerCallMessage, validateWorkerInput } from '../src/services/agentWorkerProtocol.js';

async function fixture() {
  const owner = ethers.Wallet.createRandom(), stranger = ethers.Wallet.createRandom(), state = new Map();
  let mode = 'provider', epoch = '1', executions = 0, finish;
  const grant = { version: 1, chainId: 4663, collection: ethers.Wallet.createRandom().address, tokenId: '1', epoch,
    peerId: 'fixture-peer', expiresAt: Date.now() + 86400000, capabilities: ['text', 'image'], workflows: [], name: 'Rose' };
  const descriptor = { grant, signature: await owner.signMessage(workerGrantMessage(grant)) };
  const host = createAgentWorkerHost({ store: { get: (k, f) => state.get(k) ?? f, set: (k, v) => state.set(k, v) },
    mode: () => mode, peerId: () => grant.peerId, resolveIdentity: async () => ({ owner: owner.address, wallet: owner.address, epoch }),
    verifyJob: async () => {}, run: async () => { executions++; return new Promise(resolve => { finish = resolve; }); },
    media: { prepare: async value => value, read: async () => Buffer.from('abc') } });
  await host.publish(descriptor, { agentId: 'rose' });
  const requestId = ethers.id('request');
  const envelope = async (changes = {}, signer = owner) => {
    const call = { version: 1, action: 'execute', requestId, worker: workerKey(grant), expiresAt: Date.now() + 60000, capability: 'text', input: { prompt: 'Meditation' }, ...changes };
    return { call, signature: await signer.signMessage(workerCallMessage(call)) };
  };
  return { host, owner, stranger, descriptor, envelope, state, mode: v => mode = v, epoch: v => epoch = v, count: () => executions, finish: v => finish(v) };
}
test('discovery is opt-in; private mode, expired and transferred grants cannot execute', async () => {
  const f = await fixture(); assert.equal((await f.host.discover()).length, 1);
  f.mode('local'); assert.deepEqual(await f.host.discover(), []); await assert.rejects(() => f.host.handle({}), /Provider/);
  f.mode('provider'); f.epoch('2'); assert.deepEqual(await f.host.discover(), []);
  await assert.rejects(async () => f.host.handle(await f.envelope()), /revoked/);
});
test('durable tickets deduplicate retries and do not expose another caller’s output', async () => {
  const f = await fixture(), request = await f.envelope();
  assert.equal((await f.host.handle(request)).status, 'running');
  assert.equal((await f.host.handle(request)).status, 'running'); assert.equal(f.count(), 1);
  await assert.rejects(async () => f.host.handle(await f.envelope({ action: 'status' }, f.stranger)), /another caller/);
  f.finish({ text: 'Completed', artifacts: [{ id: 'blob', size: 3 }] }); await new Promise(setImmediate);
  f.epoch('2'); // Transfer does not destroy an existing customer's delivery.
  assert.equal((await f.host.handle(await f.envelope({ action: 'status' }))).result.text, 'Completed');
  assert.equal((await f.host.handle(await f.envelope({ action: 'media', artifactId: 'blob', offset: 0 }))).data, 'YWJj');
});
test('capability restrictions, tampering, and missing escrow prevent execution', async () => {
  const f = await fixture();
  await assert.rejects(async () => f.host.handle(await f.envelope({ capability: 'fineTune' })), /outside/);
  await assert.rejects(async () => f.host.handle(await f.envelope({}, f.stranger)), /accepted social-token/);
  const forged = await f.envelope(); forged.call.input.prompt = 'Different';
  await assert.rejects(() => f.host.handle(forged), /accepted social-token/);
  assert.equal(f.count(), 0);
});
test('crashes become interrupted, never automatically replayed as successful', async () => {
  const f = await fixture(), request = await f.envelope(); await f.host.handle(request); f.host.recover();
  assert.equal((await f.host.handle(await f.envelope({ action: 'status' }))).status, 'interrupted');
  assert.equal(f.count(), 1);
});
test('remote inputs cannot select files, credentials, network URLs, or nested model datasets', () => {
  for (const input of [{ params: { file_path: '/etc/passwd' } }, { prompt: 'https://secret.invalid' }, { params: { nested: { apiKey: 'x' } } }, { params: { dataset_id: 'local' } }, { params: { image: '/etc/passwd' } }, { inputs: { reference: '../../private' } }, { params: { reference_audio: 'C:/secrets/file.wav' } }]) assert.throws(() => validateWorkerInput(input));
  assert.equal(validateWorkerInput({ prompt: 'Meditation', params: { image_base64: 'YWJj' } }).prompt, 'Meditation');
});

test('a claimed signer cannot impersonate the owner with another wallet signature',async()=>{
 const f=await fixture();const forged=await f.envelope({},f.stranger);forged.signer=f.owner.address;
 await assert.rejects(f.host.handle(forged),/signature/);assert.equal(f.count(),0);
});

test('a signed service carries its package into execution and keeps a durable receipt for the customer',async()=>{
 const {serviceOffer}=await import('../src/services/agentServiceOffer.js');const f=await fixture();
 const offer=serviceOffer({title:'Expert',outcome:'Diagnosis',price:'10',assets:[{chainId:4663,collection:f.descriptor.grant.collection,tokenId:'3',title:'Manual',kind:'text',digest:ethers.id('original'),use:'knowledge',license:'Job use'}]});
 const grant={...f.descriptor.grant,offer};await f.host.publish({grant,signature:await f.owner.signMessage(workerGrantMessage(grant))},{agentId:'rose',assets:[{id:'private-original-id'}]});
 assert.doesNotMatch(JSON.stringify(await f.host.discover()),/private-original-id/);
 await f.host.handle(await f.envelope());f.finish({pipeline:'text',text:'Diagnosis',serviceCitations:['source:1']});await new Promise(setImmediate);
 const result=(await f.host.handle(await f.envelope({action:'status'}))).result;
 assert.equal(result.serviceReceipt.offerHash,offer.hash);assert.deepEqual(result.serviceReceipt.citations,['source:1']);assert.equal(result.serviceReceipt.verification,'provider-declared');
});
