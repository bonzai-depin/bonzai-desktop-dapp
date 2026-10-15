import { getAvailableAgentWorkflows } from './agentWorkflows.js';
import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { loadSmartAgents } from './smartAgentCatalog.js';
import { executeCreation } from './company/createCapabilities.js';
import { executeCompanyWorkflow } from './company/workflowExecution.js';
import { verifyAcceptedWorkerJob } from './workerJobAuthorization.js';
import { sameAddress, workerKey } from './agentWorkerProtocol.js';
import { fetchSmartAgentJob } from './smartAgentJobs.service.js';

export async function verifyWorkerSignature({ signer, message, signature }) {
  if (!ethers.isAddress(signer) || typeof message !== 'string' || message.length > 512 || typeof signature !== 'string' || signature.length > 16384) return false;
  try { if (sameAddress(ethers.verifyMessage(message, signature), signer)) return true; } catch {}
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  if (Number((await provider.getNetwork()).chainId) !== Number(CONFIG.contributionEconomy.chainId)) throw new Error('Signature verifier is on another network.');
  try {
    const wallet = new ethers.Contract(signer, ['function isValidSignature(bytes32,bytes) view returns(bytes4)'], provider);
    return await wallet.isValidSignature(ethers.hashMessage(message), signature) === '0x1626ba7e';
  } catch { return false; }
}

export async function resolveWorkerIdentity(ref) {
  const config = CONFIG.smartAgentIssuance;
  if (!config?.contractAddress || Number(ref.chainId) !== Number(CONFIG.contributionEconomy.chainId)
    || !sameAddress(ref.collection, config.contractAddress)) throw new Error('Agent collection is not configured on this network.');
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  if (Number((await provider.getNetwork()).chainId) !== Number(ref.chainId)) throw new Error('Worker RPC belongs to another network.');
  const contract = new ethers.Contract(config.contractAddress, [
    'function ownerOf(uint256) view returns(address)', 'function getAgentWallet(uint256) view returns(address)',
    'function controlEpoch(uint256) view returns(uint256)', 'function socialToken(uint256) view returns(address)',
  ], provider);
  const [owner, wallet, epoch, token] = await Promise.all([contract.ownerOf(ref.tokenId), contract.getAgentWallet(ref.tokenId), contract.controlEpoch(ref.tokenId), contract.socialToken(ref.tokenId)]);
  return { owner, wallet, epoch: epoch.toString(), token };
}
export async function verifyWorkerJob(packet, { caller, grant, identity, call }) {
  const live = await fetchSmartAgentJob(packet.jobId);
  return verifyAcceptedWorkerJob(packet, live, { caller, grant, identity, call, escrow: CONFIG.contributionEconomy.jobEscrowAddress });
}
export async function validateWorkerBinding(binding, grant) {
  const agent = (await loadSmartAgents()).find(a => a.id === binding?.agentId);
  if (!agent || workerKey({ chainId: agent.chainId, collection: agent.contractAddress, tokenId: agent.tokenId }) !== workerKey(grant)) throw new Error('Choose the local representation of this minted agent.');
  const catalog = await getAvailableAgentWorkflows();
  if (grant.workflows.some(id => !catalog.some(w => w.id === id))) throw new Error('The delegation includes an unavailable workflow.');
  if (grant.capabilities.includes('fineTune')) {
    const defaults = binding.defaults?.fineTune;
    if (!defaults?.base_model || !['llm', 'abliterate'].includes(defaults.mode) || (defaults.mode === 'llm' && !defaults.dataset_id)) throw new Error('Choose the local training model, mode and required dataset before enabling training.');
  }
  return true;
}
export async function executeWorkerCapability(binding, call) {
  const agent = (await loadSmartAgents()).find(a => a.id === binding.agentId);
  if (!agent || `${agent.chainId}:${agent.contractAddress?.toLowerCase()}:${agent.tokenId}` !== call.worker) throw new Error('Local agent does not match the hired NFT.');
  if (call.capability === 'workflow') {
    if (!(await getAvailableAgentWorkflows()).some(w => w.id === call.input.workflowId)) throw new Error('This workflow is unavailable.');
    if (call.input.workflowId === 'meditation-forge-v1.0.0') {
      const { createMeditation } = await import('./chat/meditation.js');
      const result = await createMeditation(call.input.inputs || {}, { agentId: agent.id, companyId: `worker:${agent.id}` });
      return { text: result.meditation.script, artifacts: result.artifacts };
    }
    // Reuse assignment checks and honest requires_input states in the company adapter.
    const charter = { id: `worker:${agent.id}`, roles: { worker: { companion: agent.id } } };
    const result = await executeCompanyWorkflow(charter, 'worker', agent.id, { type: 'runWorkflow', ...call.input }, { issueId: call.requestId, workerExecution: true });
    if (!result.ok) return result;
    if (result.artifacts) return result;
    return { pipeline: result.pipeline || 'text', payload: result.payload, meta: result.meta };
  }
  // Fine-tunes need owner-chosen local datasets/models; remote input cannot select paths.
  const configured = binding.defaults?.[call.capability] || {};
  return executeCreation({ ...call.input, type: 'produce', pipeline: call.capability,
    ...(call.capability === 'fineTune' ? { mode: configured.mode } : {}),
    params: { ...(call.input.params || {}), ...configured } }, {
    agentId: agent.id, companyId: `worker:${agent.id}`, issueId: call.requestId,
    instructions: agent.mission, approved: call.capability === 'fineTune' && Boolean(configured.base_model),
  });
}
