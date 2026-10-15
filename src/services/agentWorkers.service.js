import { ethers } from 'ethers';
import { web3Service } from './web3.service.js';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { workerKey, workerGrantMessage, workerCallMessage, verifyWorkerGrant } from './agentWorkerProtocol.js';
import { resolveWorkerIdentity, verifyWorkerSignature } from './agentWorkerRuntime.js';

async function ownerSigner() {
  await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
  return (await web3Service.getBrowserProvider()).getSigner();
}
export async function publishWorker(agent, capabilities, workflows = [], defaults = {}, targetPeerId = null) {
  const peer = await window.electronAPI.p2pLocalPeerId();
  if (!peer?.peerId) throw new Error('Start the peer network first.');
  const ref = { chainId: Number(agent.chainId), collection: agent.contractAddress, tokenId: String(agent.tokenId) };
  const identity = await resolveWorkerIdentity(ref);
  if (identity.token === ethers.ZeroAddress) throw new Error('Issue this minted agent’s social token before offering paid work.');
  const signer = await ownerSigner();
  if ((await signer.getAddress()).toLowerCase() !== identity.owner.toLowerCase()) throw new Error('Connect the current NFT owner.');
  const { getAvailableAgentWorkflows } = await import('./agentWorkflows.js');
  const { companyWorkflowMode } = await import('./company/workflowExecution.js');
  const catalog = await getAvailableAgentWorkflows();
  const headless = workflows.filter(id => catalog.some(w => w.id === id && (id === 'meditation-forge-v1.0.0' || companyWorkflowMode(w) !== 'interactive')));
  const grant = { version: 1, ...ref, epoch: identity.epoch, peerId: targetPeerId || peer.peerId, name: agent.name,
    capabilities, workflows: headless, expiresAt: Date.now() + 7 * 86400000 };
  const descriptor = { grant, signature: await signer.signMessage(workerGrantMessage(grant)) };
  if (!targetPeerId || targetPeerId === peer.peerId) await window.electronAPI.agentWorkerPublish(descriptor, { agentId: agent.id, defaults });
  return descriptor;
}
export async function discoverWorkers() {
  const peers = await window.electronAPI.agentWorkerPeers();
  const result = [];
  // Bound concurrency and accept only owner-authorized advertisements from actual peers.
  for (let offset = 0; offset < peers.length && offset < 100; offset += 5) {
    await Promise.all(peers.slice(offset, offset + 5).map(async peer => {
      try {
        const health = await window.electronAPI.p2pHealth(peer);
        if (!Array.isArray(health?.workers) || health.workers.length > 100) return;
        for (const descriptor of health.workers) {
          try {
            const { grant, identity } = await verifyWorkerGrant(descriptor, resolveWorkerIdentity, peer, Date.now(), verifyWorkerSignature);
            result.push({ ...descriptor, identity, key: workerKey(grant), peerId: peer, busy: Boolean(health.busy) });
          } catch { /* Invalid or transferred advertisements are not workers. */ }
        }
      } catch { /* Unavailable peers are omitted rather than shown as online. */ }
    }));
  }
  return result;
}
/** The same API can be called by a person or a locally approved company-agent action. */
export async function callWorker(worker, action, options = {}, signer = null) {
  const signingWallet = signer || await ownerSigner();
  const call = { ...options, version: 1, action, worker: worker.key || workerKey(worker.grant),
    requestId: options.requestId || ethers.hexlify(ethers.randomBytes(32)), expiresAt: options.expiresAt || Date.now() + 15 * 60000 };
  const envelope = { kind: 'bonzai-worker', call, signer: await signingWallet.getAddress(), signature: await signingWallet.signMessage(workerCallMessage(call)) };
  const response = await window.electronAPI.p2pInference(worker.peerId || worker.grant.peerId, envelope);
  if (!response?.ok) throw new Error(response?.error || 'Worker did not respond.');
  return { ...response, call };
}
export async function receiveWorkerMedia(worker, requestId, artifact, signer = null) {
  if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0 || artifact.size > 32 * 1024 ** 3) throw new Error('Invalid artifact size.');
  const wallet = signer || await ownerSigner();
  const api = window.electronAPI;
  const transfer = await api.agentWorkerTransferStart(artifact);
  try {
    let envelope;
    for (let offset = 0; offset < artifact.size;) {
      if (!envelope || envelope.call.expiresAt < Date.now() + 60000) {
        const call = { version: 1, action: 'media', worker: worker.key || workerKey(worker.grant), requestId, artifactId: artifact.id, expiresAt: Date.now() + 3600000 };
        envelope = { kind: 'bonzai-worker', call, signer: await wallet.getAddress(), signature: await wallet.signMessage(workerCallMessage(call)) };
      }
      const response = await api.p2pInference(worker.peerId || worker.grant.peerId, { ...envelope, offset });
      if (!response?.ok) throw new Error(response?.error || 'Media transfer failed.');
      if (typeof response.data !== 'string' || response.data.length > 262144 || response.offset !== offset || response.size !== artifact.size || response.id !== artifact.id) throw new Error('Invalid media chunk.');
      const next = await api.agentWorkerTransferChunk(transfer, offset, response.data);
      if (next <= offset || next > artifact.size) throw new Error('Invalid delivery offset.');
      offset = next;
    }
    return await api.agentWorkerTransferFinish(transfer);
  } catch (error) { await api.agentWorkerTransferAbort(transfer).catch(() => {}); throw error; }
}
export async function transferWorker(agent, recipient) {
  if (!ethers.isAddress(recipient) || recipient === ethers.ZeroAddress) throw new Error('Enter a valid recipient.');
  const signer = await ownerSigner();
  const identity = await resolveWorkerIdentity({ chainId: agent.chainId, collection: agent.contractAddress, tokenId: agent.tokenId });
  if ((await signer.getAddress()).toLowerCase() !== identity.owner.toLowerCase()) throw new Error('Connect the NFT owner.');
  const collection = new ethers.Contract(CONFIG.smartAgentIssuance.contractAddress, ['function safeTransferFrom(address,address,uint256)'], signer);
  return collection.safeTransferFrom(identity.owner, recipient, agent.tokenId);
}
export async function setWorkerWallet(agent, wallet) {
  if (!ethers.isAddress(wallet) || wallet === ethers.ZeroAddress) throw new Error('Enter a valid execution wallet.');
  const identity = await resolveWorkerIdentity({ chainId: agent.chainId, collection: agent.contractAddress, tokenId: agent.tokenId });
  const signer = await ownerSigner();
  if ((await signer.getAddress()).toLowerCase() !== identity.owner.toLowerCase()) throw new Error('Connect the NFT owner.');
  const collection = new ethers.Contract(CONFIG.smartAgentIssuance.contractAddress, ['function setExecutionWallet(uint256,address)'], signer);
  return collection.setExecutionWallet(agent.tokenId, wallet);
}

export async function executeCompanyWorker(action, agentId, approved) {
  if (!approved) throw new Error('Approve the inputs shared with this worker first.');
  const { walletProviderService } = await import('./walletProvider.service.js');
  const requestId = action.requestId;
  if (!ethers.isHexString(requestId, 32)) throw new Error('A stable worker request ID is required before approval.');
  const worker = action.worker;
  if (!worker?.key || !worker.peerId) throw new Error('Select an available worker.');
  const send = async (type, extra = {}) => {
    const call = { version: 1, action: type, worker: worker.key, requestId, expiresAt: Date.now() + 3600000, ...extra };
    const signer = await walletProviderService.getAgentWorkerRequestSigner(agentId, { approved, message: workerCallMessage(call), chainId: CONFIG.contributionEconomy.chainId });
    const response = await window.electronAPI.p2pInference(worker.peerId, { kind: 'bonzai-worker', call, signer: await signer.getAddress(), signature: await signer.signMessage(workerCallMessage(call)) });
    if (!response?.ok) throw new Error(response?.error || 'Worker unavailable.');
    return response;
  };
  // Reconcile an existing ticket before dispatch: a timeout must never duplicate paid work.
  let response;
  try { response = await send('status'); } catch (error) {
    if (!error.message.includes('belongs to another caller')) throw error;
    response = await send('execute', { capability: action.capability, input: action.input, job: action.job, ...(action.callerAgent ? { callerAgent: action.callerAgent } : {}) });
  }
  const end = Date.now() + 28 * 60000;
  while (response.status === 'running' && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    response = await send('status');
  }
  if (response.status !== 'completed') throw new Error(response.error || 'Worker is still running. Retrieve this request before retrying.');
  const artifacts = [];
  const mediaSigner = {
    getAddress: () => walletProviderService.getAgentWalletAddress(agentId),
    async signMessage(message) {
      const signer = await walletProviderService.getAgentWorkerRequestSigner(agentId, { approved, message, chainId: CONFIG.contributionEconomy.chainId });
      return signer.signMessage(message);
    },
  };
  for (const artifact of response.result.artifacts || []) artifacts.push({ ...artifact, ...await receiveWorkerMedia(worker, requestId, artifact, mediaSigner) });
  return { ...response.result, artifacts, requestId };
}
