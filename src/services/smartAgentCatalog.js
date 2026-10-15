import { reactive } from 'vue';
import { hasMintReference } from './agentMintEligibility.js';
import { getAvailableAgentWorkflows, getAgentWorkflowIds } from './agentWorkflows.js';

export const SMART_AGENT_CREATE_CAPABILITIES = Object.freeze(['text', 'image', 'audio', 'video', '3d', 'music', 'vision', 'fineTune']);

// A view of Roleplay Companion's existing roster, not another agent store.
export const smartAgentCatalog = reactive({ agents: [], loaded: false, pendingHireId: null });
let pendingLoad;

export function projectCompanion(companion, workflows) {
  const reference = { ...companion, tokenId: companion.tokenId ?? companion.nft?.tokenId, chainId: companion.chainId ?? companion.nft?.chainId, contractAddress: companion.contractAddress ?? companion.nft?.contractAddress };
  const tokenAddress = hasMintReference(reference) ? (companion.tokenAddress || companion.socialToken?.address || companion.nft?.tokenAddress || null) : null;
  const name = companion.name || [companion.firstName, companion.familyName || companion.lastName].filter(Boolean).join(' ');
  return {
    ...reference,
    name,
    mission: companion.shortBio || companion.description || companion.personality || '',
    assignedWorkflowIds: getAgentWorkflowIds(companion, workflows),
    capabilities: [...SMART_AGENT_CREATE_CAPABILITIES],
    tokenId: companion.tokenId ?? companion.nft?.tokenId ?? null,
    tokenAddress,
    tokenSymbol: companion.tokenSymbol || companion.socialToken?.symbol || companion.nft?.tokenSymbol || '',
    agentWallet: companion.agentWallet || companion.nft?.agentWallet || null,
    isLocal: !hasMintReference(reference),
  };
}

export async function loadSmartAgents() {
  if (pendingLoad) return pendingLoad;
  pendingLoad = (async () => {
    const [{ loadCompanions }, workflows] = await Promise.all([
      import('./roleplayStore.service.js'), getAvailableAgentWorkflows(),
    ]);
    const companions = await loadCompanions();
    smartAgentCatalog.agents = companions.filter(companion => companion?.id)
      .map(companion => projectCompanion(companion, workflows));
    smartAgentCatalog.loaded = true;
    return smartAgentCatalog.agents;
  })();
  try { return await pendingLoad; }
  finally { pendingLoad = null; }
}

export function smartAgentSkills(id, fallback = []) {
  return smartAgentCatalog.agents.find(agent => agent.id === id)?.assignedWorkflowIds || fallback;
}
