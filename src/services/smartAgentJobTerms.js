import { ethers } from 'ethers';

export function buildSmartAgentJobTerms(agent, input) {
  const title = String(input.title || '').trim();
  const outcome = String(input.outcome || '').trim();
  if (!title || !outcome) throw new Error('Describe the business outcome and acceptance criteria.');
  const amount = ethers.parseUnits(String(input.amount || '').trim(), agent.decimals);
  if (amount <= 0n) throw new Error('Enter a positive amount of the smart agent’s token.');
  if (!ethers.isAddress(agent.tokenAddress) || agent.tokenAddress === ethers.ZeroAddress) throw new Error('A verified social token is required.');
  if (!ethers.isAddress(agent.worker) || agent.worker === ethers.ZeroAddress) throw new Error('The smart agent has no payment wallet.');
  if (input.execution && (typeof input.executionPeer !== 'string' || !input.executionPeer || input.executionPeer.length > 160)) throw new Error('Choose the provider peer for this execution.');
  if (input.executionCaller && !ethers.isAddress(input.executionCaller)) throw new Error('Invalid requesting agent wallet.');
  const terms = {
    version: 1, title, outcome, ...(input.executionCaller ? { executionCaller: input.executionCaller } : {}), ...(input.execution ? { executionPeer: input.executionPeer, executionHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(input.execution))) } : {}), companionTokenId: String(agent.tokenId), worker: agent.worker,
    currency: agent.tokenAddress, amount: amount.toString(), decimals: agent.decimals,
    chainId: agent.chainId, escrow: agent.escrow, arbitrator: agent.arbitrator,
    routeAssetId: agent.routeAssetId || ethers.ZeroHash,
    platformBps: agent.platformBps, contributionBps: agent.routeAssetId && agent.routeAssetId !== ethers.ZeroHash ? agent.contributionBps : 0,
    acceptWindow: agent.acceptWindow, deliveryWindow: agent.deliveryWindow, reviewWindow: agent.reviewWindow, disputeWindow: agent.disputeWindow,
  };
  return { terms, amount, termsHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms))) };
}

export function verifySmartAgentQuote(reviewed, current) {
  for (const key of ['owner', 'tokenAddress', 'worker', 'arbitrator', 'escrow', 'tokenId', 'decimals', 'platformBps', 'contributionBps', 'chainId', 'routeAssetId', 'acceptWindow', 'deliveryWindow', 'reviewWindow', 'disputeWindow']) {
    if (String(reviewed[key] ?? '').toLowerCase() !== String(current[key] ?? '').toLowerCase()) throw new Error('The smart agent’s terms changed. Review the updated job before funding.');
  }
}
