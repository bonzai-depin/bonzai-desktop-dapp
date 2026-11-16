import { ethers } from 'ethers';
import { validateServiceOffer } from './agentServiceOffer.js';

export const WORKER_VERSION = 1;
export const WORKER_CAPABILITIES = Object.freeze(['text', 'image', 'audio', 'music', 'video', 'vision', '3d', 'skill', 'fineTune', 'workflow', 'assets']);
export const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const digest = value => ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(value)));
export const workerKey = ref => `${ref.chainId}:${String(ref.collection).toLowerCase()}:${ref.tokenId}`;
export const workerGrantMessage = grant => `BonzAI worker delegation v1\n${digest(grant)}`;
export const workerCallMessage = call => `BonzAI worker request v1\n${digest(call)}`;
export function validateWorkerGrant(grant, now = Date.now()) {
  if (grant?.version !== WORKER_VERSION || !Number.isSafeInteger(grant.chainId) || grant.chainId <= 0
    || !ethers.isAddress(grant.collection) || !/^\d+$/.test(String(grant.tokenId))
    || String(grant.tokenId).length > 78 || !/^\d{1,78}$/.test(String(grant.epoch)) || typeof grant.peerId !== 'string' || grant.peerId.length > 160 || !grant.peerId
    || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now || grant.expiresAt > now + 31 * 86400000
    || !Array.isArray(grant.capabilities) || !grant.capabilities.length || grant.capabilities.length > WORKER_CAPABILITIES.length
    || grant.capabilities.some(c => !WORKER_CAPABILITIES.includes(c))
    || !Array.isArray(grant.workflows) || grant.workflows.length > 100 || grant.workflows.some(w => typeof w !== 'string' || w.length > 160)
    || typeof grant.name !== 'string' || grant.name.length > 100) throw new Error('Invalid or expired worker delegation.');
  if (grant.offer) validateServiceOffer(grant.offer, grant);
  return grant;
}
export async function verifyWorkerGrant(descriptor, resolveIdentity, peerId, now = Date.now(), verifySignature) {
  const grant = validateWorkerGrant(descriptor.grant, now);
  if (peerId && grant.peerId !== peerId) throw new Error('Delegation belongs to another provider peer.');
  const identity = await resolveIdentity(grant);
  const valid = verifySignature
    ? await verifySignature({ signer: identity.owner, message: workerGrantMessage(grant), signature: descriptor.signature })
    : sameAddress(ethers.verifyMessage(workerGrantMessage(grant), descriptor.signature), identity.owner);
  if (!valid || String(identity.epoch) !== String(grant.epoch)) throw new Error('Worker delegation was revoked or NFT ownership changed.');
  return { grant, identity };
}
export function parseWorkerCall(raw, now = Date.now()) {
  if (BufferByteLength(JSON.stringify(raw)) > 2 * 1024 * 1024) throw new Error('Worker input exceeds 2 MiB.');
  const call = raw?.call;
  if (!call || call.version !== WORKER_VERSION || !['execute', 'status', 'media'].includes(call.action)
    || !ethers.isHexString(call.requestId, 32) || typeof call.worker !== 'string' || call.worker.length > 240
    || !Number.isSafeInteger(call.expiresAt) || call.expiresAt <= now || call.expiresAt > now + 3600000) throw new Error('Invalid or expired worker request.');
  if (typeof raw.signature !== 'string' || raw.signature.length > 16384) throw new Error('Invalid signature.');
  const caller = raw.signer || ethers.verifyMessage(workerCallMessage(call), raw.signature);
  if (!ethers.isAddress(caller)) throw new Error('Invalid request signer.');
  const { expiresAt: _expiry, ...operation } = call;
  return { call, caller, fingerprint: digest(operation) };
}
function BufferByteLength(value) { return new TextEncoder().encode(value).length; }

// Remote callers supply values, never file paths, URLs, arbitrary IPC names or credentials.
export function validateWorkerInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing worker inputs.');
  const walk = (value, depth = 0) => {
    if (depth > 12) throw new Error('Worker inputs are too deeply nested.');
    if (typeof value === 'string' && /(?:file:|https?:\/\/|bonzai-blob:|(?:^|\s)(?:\/Users\/|\/home\/|[a-z]:\\))/i.test(value)) throw new Error('Send media bytes, not private paths or external URLs.');
    if (typeof value === 'string' && /^(?:[\/\\]|[a-z]:[\/\\]|~[\/\\]|\.{1,2}[\/\\])/i.test(value.trim())) throw new Error('Remote inputs cannot reference local files.');
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (/(?:path|url|secret|credential|api.?key|access.?token|dataset|base_model|__proto__|constructor|prototype)/i.test(key)) throw new Error('This input requires local owner configuration.');
      const limits = { width: 2048, height: 2048, steps: 100, num_inference_steps: 100, duration: 600, max_tokens: 8192, batch_size: 1, num_images_per_prompt: 1 };
      if (Object.hasOwn(limits, key) && (typeof child !== 'number' || !Number.isFinite(child) || child <= 0 || child > limits[key])) throw new Error('Generation parameters exceed worker limits.');
      walk(child, depth + 1);
    }
  };
  walk(input);
  return input;
}
