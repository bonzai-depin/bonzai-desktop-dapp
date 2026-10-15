import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { hasMintReference, assertMintReference, verifyAgentIssuance } from '../src/services/agentMintEligibility.js';
import { projectCompanion } from '../src/services/smartAgentCatalog.js';
const collection = '0x0000000000000000000000000000000000000001';
const wallet = '0x0000000000000000000000000000000000000002';
const factoryAddress = '0x0000000000000000000000000000000000000003';
const agent = { id: 'rose', tokenId: '1', chainId: 4663, contractAddress: collection };
function context(overrides = {}) {
 return { collection, wallet, factoryAddress, chainId: 4663,
 provider: { getNetwork: async () => ({chainId: 4663n}) },
 contract: { ownerOf: async () => wallet, launcher: async () => factoryAddress,
 socialToken: async () => ethers.ZeroAddress, reserveOf: async () => ethers.parseEther('1'),
 getIdentity: async () => ({ready: true}), ...overrides },
 factory: { companionContract: async () => collection, getToken: async () => ethers.ZeroAddress } };
}
test('local, pending, imported and malformed records cannot establish mint eligibility', () => {
 for (const record of [{}, {isNFT:true}, {tokenId:1}, {txHash:'0xabc'}, {...agent, tokenId:-1}, {...agent, tokenId:'1.1'}, {...agent, contractAddress:ethers.ZeroAddress}]) {
  assert.equal(hasMintReference(record), false);
  assert.throws(() => assertMintReference(record, collection,4663), /Mint an agent slot/);
 }
 assert.throws(() => assertMintReference({...agent, chainId:1}, collection,4663), /different collection or network/);
});
test('only a live owner of a finalized reserved slot may issue', async () => {
 assert.equal((await verifyAgentIssuance(agent,context())).id,'1');
 await assert.rejects(verifyAgentIssuance(agent,context({ownerOf: async()=>factoryAddress})), /current agent NFT owner/);
 await assert.rejects(verifyAgentIssuance(agent,context({ownerOf: async()=>{throw Error('nonexistent');}})), /nonexistent/);
 await assert.rejects(verifyAgentIssuance(agent,context({getIdentity: async()=>({ready:false})})), /Finalize/);
 await assert.rejects(verifyAgentIssuance(agent,context({reserveOf: async()=>0n})), /reserve/);
 await assert.rejects(verifyAgentIssuance(agent,context({socialToken: async()=>wallet})), /already has/);
 await assert.rejects(verifyAgentIssuance(agent,context({launcher: async()=>wallet})), /linked/);
 const wrongNetwork = context();wrongNetwork.provider.getNetwork=async()=>({chainId:1n});
 await assert.rejects(verifyAgentIssuance(agent,wrongNetwork), /wrong network/);
 const duplicate=context();duplicate.factory.getToken=async()=>wallet;
 await assert.rejects(verifyAgentIssuance(agent,duplicate), /already has/);
});
test('a fabricated social token never converts a local company worker into a paid onchain agent', () => {
 const projected = projectCompanion({id:'local',isNFT:true,tokenAddress:wallet},[]);
 assert.equal(projected.isLocal,true);assert.equal(projected.tokenAddress,null);
});

test('attaching a new agent to an already personalized slot requires identity publication again', async () => {
 await assert.rejects(verifyAgentIssuance({...agent, needsSetup:true},context()), /Publish the attached agent identity/);
 assert.equal((await verifyAgentIssuance({...agent, needsSetup:false},context())).id,'1');
});
