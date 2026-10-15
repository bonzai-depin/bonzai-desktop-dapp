import { ethers } from 'ethers';

// A local ID, imported isNFT flag, wallet, or transaction hash is never proof of ownership.
export function hasMintReference(agent) {
  return /^(0|[1-9]\d*)$/.test(String(agent?.tokenId ?? '')) &&
    ethers.isAddress(agent?.contractAddress || '') && agent.contractAddress !== ethers.ZeroAddress &&
    Number.isSafeInteger(Number(agent?.chainId)) && Number(agent.chainId) > 0;
}

export function assertMintReference(agent, collection, chainId) {
  if (!hasMintReference(agent)) throw new Error('Mint an agent slot onchain first. A local agent is not a minted NFT.');
  if (Number(agent.chainId) !== Number(chainId) || agent.contractAddress.toLowerCase() !== String(collection).toLowerCase()) {
    throw new Error('This agent belongs to a different collection or network.');
  }
  return String(agent.tokenId);
}

export async function verifyMintedAgent(agent, { collection, chainId, provider, contract, wallet }) {
  const id = assertMintReference(agent, collection, chainId);
  if (Number((await provider.getNetwork()).chainId) !== Number(chainId)) throw new Error('Agent verification is connected to the wrong network.');
  const owner = await contract.ownerOf(id); // nonexistent/burned NFTs and RPC errors fail closed
  if (!ethers.isAddress(owner) || owner === ethers.ZeroAddress) throw new Error('The agent NFT does not exist.');
  if (wallet && owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Only the current agent NFT owner can issue its token.');
  return { id, owner };
}

export async function verifyAgentIssuance(agent, context) {
  if (agent?.needsSetup) throw new Error('Publish the attached agent identity before token issuance.');
  const minted = await verifyMintedAgent(agent, context);
  const { contract, factory, factoryAddress, collection } = context;
  const [launcher, boundCollection, token, reserve, identity] = await Promise.all([
    contract.launcher(), factory.companionContract(), contract.socialToken(minted.id),
    contract.reserveOf(minted.id), contract.getIdentity(minted.id),
  ]);
  if (launcher.toLowerCase() !== factoryAddress.toLowerCase() || boundCollection.toLowerCase() !== collection.toLowerCase()) {
    throw new Error('The agent collection and token factory are not correctly linked.');
  }
  const factoryToken = await factory.getToken(minted.id);
  if (token !== ethers.ZeroAddress || factoryToken !== ethers.ZeroAddress) throw new Error('This agent already has a social token. Refresh its onchain status.');
  if (!identity.ready) throw new Error('Finalize the minted agent’s public metadata before issuing its token.');
  if (BigInt(reserve) !== ethers.parseEther('1')) throw new Error('This agent has no available 1 ETH issuance reserve.');
  return { ...minted, identity };
}
