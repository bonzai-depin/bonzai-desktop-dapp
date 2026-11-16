// Local records enrich verified holdings; they can never add an owned NFT.
export function ownedAgentRows(holdings, localAgents) {
  return holdings.map(holding => {
    const local = localAgents.find(agent => Number(agent.chainId) === Number(holding.chainId)
      && String(agent.contractAddress).toLowerCase() === String(holding.contractAddress).toLowerCase()
      && String(agent.tokenId) === String(holding.tokenId));
    return { ...holding, name: holding.name || local?.name || `Agent #${holding.tokenId}`,
      local: local ? { ...local, ...holding, id: local.id, name: holding.name || local.name } : null };
  });
}
export function agentMarketCap(pair) {
  const value = pair?.marketCap;
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

// Local profiles remain usable independently of wallet availability. Only verified
// holdings receive NFT badges; an unverified mint reference never creates ownership.
export function agentCollectionRows(holdings, localAgents) {
  const owned = ownedAgentRows(holdings, localAgents).map(agent => ({ ...agent, key: `${agent.chainId}:${agent.contractAddress}:${agent.tokenId}` }));
  const linked = new Set(owned.map(agent => agent.local?.id).filter(Boolean));
  return [...localAgents.filter(agent => !linked.has(agent.id)).map(agent => ({
    key: `local:${agent.id}`, name: agent.name, image: agent.image || agent.picture,
    ready: true, localOnly: true, local: agent,
  })), ...owned];
}
