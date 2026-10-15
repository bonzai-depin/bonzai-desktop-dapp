import { createHash } from 'node:crypto';
import { parseWorkerCall, verifyWorkerGrant, workerKey, workerCallMessage, validateWorkerInput, sameAddress } from '../services/agentWorkerProtocol.js';
import { ethers } from 'ethers';

/** One durable execution journal on the existing peer transport. No discovery-triggered execution. */
export function createAgentWorkerHost({ store, journal, peerId, mode, resolveIdentity, verifyJob, run, media, verifySignature = async ({signer,message,signature}) => sameAddress(ethers.verifyMessage(message,signature),signer) }) {
  const grantsKey = 'smartAgentWorkerGrants', jobsKey = 'smartAgentWorkerRuns';
  let busy = false;
  const grants = () => store.get(grantsKey, []);
  const runs = () => journal ? journal.all() : store.get(jobsKey, {});
  const get = id => journal ? journal.get(id) : runs()[id];
  const save = (id, value) => journal ? journal.set(id, value) : store.set(jobsKey, { ...runs(), [id]: value });
  const publicRecord = record => ({ requestId: record.requestId, status: record.status, result: record.result, error: record.error });
  return {
    get busy() { return busy; },
    list() { return journal ? journal.list() : Object.values(runs()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100); },
    async publish(descriptor, binding) {
      const { grant } = await verifyWorkerGrant(descriptor, resolveIdentity, peerId(), Date.now(), verifySignature);
      if (!binding?.agentId || typeof binding.agentId !== 'string') throw new Error('Select a local smart agent.');
      if (grants().length >= 100 && !grants().some(g => workerKey(g.descriptor.grant) === workerKey(grant))) throw new Error('This device already offers 100 workers.');
      if (JSON.stringify(binding).length > 65536) throw new Error('Worker configuration is too large.');
      const key = workerKey(grant);
      store.set(grantsKey, [...grants().filter(g => workerKey(g.descriptor.grant) !== key), { descriptor, binding }]);
      return key;
    },
    unpublish(key) { store.set(grantsKey, grants().filter(g => workerKey(g.descriptor.grant) !== key)); },
    async discover() {
      if (mode() !== 'provider') return [];
      const visible = await Promise.all(grants().map(async record => {
        try { await verifyWorkerGrant(record.descriptor, resolveIdentity, peerId(), Date.now(), verifySignature); return record.descriptor; }
        catch { return null; }
      }));
      return visible.filter(Boolean);
    },
    recover() {
      for (const [id, record] of Object.entries(runs())) if (record.status === 'running') save(id, { ...record, status: 'interrupted', error: 'Execution interrupted. Review before creating a new request.' });
    },
    async handle(envelope) {
      if (mode() !== 'provider') throw new Error('Worker execution requires Provider mode.');
      const { call, caller, fingerprint } = parseWorkerCall(envelope);
      if (!await verifySignature({ signer: caller, message: workerCallMessage(call), signature: envelope.signature })) throw new Error('Invalid worker request signature.');
      const id = `${call.worker}:${call.requestId}`;
      const previous = get(id);
      const record = grants().find(g => workerKey(g.descriptor.grant) === call.worker);

      if (call.action !== 'execute') {
        if (!previous || !sameAddress(caller, previous.caller) && !sameAddress(caller, previous.owner)) throw new Error('This request belongs to another caller.');
        if (call.action === 'status') return { ok: true, ...publicRecord(previous) };
        const artifact = previous.result?.artifacts?.find(a => a.id === call.artifactId);
        if (!artifact || previous.status !== 'completed') throw new Error('Artifact is not part of this delivery.');
        const offset = envelope.offset ?? call.offset;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= artifact.size) throw new Error('Invalid media offset.');
        const bytes = await media.read(artifact, offset, Math.min(192 * 1024, artifact.size - offset));
        return { ok: true, offset, data: Buffer.from(bytes).toString('base64'), id: artifact.id, size: artifact.size };
      }
      if (!record) throw new Error('Worker is not published on this peer.');
      const { grant, identity } = await verifyWorkerGrant(record.descriptor, resolveIdentity, peerId(), Date.now(), verifySignature);
      if (previous) {
        if (previous.fingerprint !== fingerprint || !sameAddress(previous.caller, caller)) throw new Error('Request ID already used for different inputs.');
        return { ok: true, ...publicRecord(previous) };
      }
      if (busy) throw new Error('Provider is busy. Retry this same request later.');
      if (!grant.capabilities.includes(call.capability)) throw new Error('Capability is outside this delegation.');
      if (call.capability === 'workflow' && !grant.workflows.includes(call.input?.workflowId)) throw new Error('Workflow is outside this delegation.');
      validateWorkerInput(call.input);
      // A caller-agent may consume a worker, but cannot impersonate a different agent.
      if (call.callerAgent) {
        const source = await resolveIdentity(call.callerAgent);
        if (!sameAddress(caller, source.owner) && !sameAddress(caller, source.wallet)) throw new Error('Caller does not control the requesting agent.');
      }
      if (!sameAddress(caller, identity.owner)) {
        if (!call.job) throw new Error('An accepted social-token job is required.');
        await verifyJob(call.job, { caller, grant, identity, call });
        const paidId = `${call.job.terms.chainId}:${call.job.terms.escrow.toLowerCase()}:${call.job.jobId}`;
        if (journal ? journal.hasPaid(paidId) : Object.values(runs()).some(r => r.paidId === paidId)) throw new Error('This paid job already has an execution. Retrieve its existing result.');
      }
      if (busy) throw new Error('Provider is busy. Retry this same request later.');
      if (get(id)) throw new Error('This request is already recorded. Retrieve its status.');
      const paidId = call.job ? `${call.job.terms.chainId}:${call.job.terms.escrow.toLowerCase()}:${call.job.jobId}` : null;
      const execution = { requestId: call.requestId, agentId: record.binding.agentId, worker: call.worker, owner: identity.owner, jobId: call.job?.jobId || null, title: call.job?.terms?.title || call.capability, capability: call.capability, caller, fingerprint, paidId, status: 'running', createdAt: Date.now() };
      save(id, execution); busy = true;
      // Return a durable ticket immediately; long media generation never relies on a held stream.
      void (async () => {
        try {
          const output = await run(record.binding, call);
          if (output?.status === 'requires_input') { save(id, { ...execution, status: 'requires_input', error: output.error }); return; }
          if (output?.ok === false) throw new Error(output.error || 'Worker execution failed.');
          const result = await media.prepare(output, { sourceId: id });
          save(id, { ...execution, status: 'completed', result });
        } catch (error) { save(id, { ...execution, status: 'failed', error: error.message }); }
        finally { busy = false; }
      })().catch(error => console.error('[worker] Could not persist execution outcome:', error.message));
      return { ok: true, requestId: call.requestId, status: 'running' };
    },
  };
}
export const mediaHash = bytes => createHash('sha256').update(bytes).digest('hex');
