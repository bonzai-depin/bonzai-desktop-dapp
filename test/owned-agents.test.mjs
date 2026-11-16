import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedAgentRows,agentMarketCap} from '../src/services/ownedAgents.js';
test('local files cannot invent ownership or match a different chain or collection',()=>{
 const owned={chainId:4663,contractAddress:'0xABC',tokenId:'1',name:'Onchain name',tokenAddress:'live'};
 const agents=[{...owned,id:'local',name:'Old name',tokenAddress:'stale'},{...owned,id:'sold',tokenId:'2'}];
 const rows=ownedAgentRows([owned],agents);
 assert.equal(rows.length,1);assert.equal(rows[0].local.id,'local');assert.equal(rows[0].local.tokenAddress,'live');
 assert.equal(ownedAgentRows([owned],[{...agents[0],chainId:1}])[0].local,null);
 assert.equal(ownedAgentRows([owned],[{...agents[0],contractAddress:'other'}])[0].local,null);
 assert.deepEqual(ownedAgentRows([],agents),[]);
});
test('market cap never falls back to FDV or zero when missing',()=>{
 for(const pair of [null,{}, {fdv:1000},{marketCap:''},{marketCap:'NaN'},{marketCap:-1}])assert.equal(agentMarketCap(pair),null);
 assert.equal(agentMarketCap({marketCap:'1200'}),1200);assert.equal(agentMarketCap({marketCap:0}),0);
});

test('local agents remain visible without a collection or wallet and verified holdings are not duplicated', async () => {
  const { agentCollectionRows } = await import('../src/services/ownedAgents.js');
  const local = { id: 'local', name: 'Elin', isCustom: true };
  const minted = { id: 'minted', name: 'Mai', chainId: 4663, contractAddress: '0xabc', tokenId: '7' };
  assert.equal(agentCollectionRows([], [local, minted]).length, 2);
  const rows = agentCollectionRows([{ ...minted, ready: false }], [local, minted]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].localOnly, true);
  assert.equal(rows[0].tokenId, undefined);
  assert.equal(rows[1].local.id, 'minted');
  assert.equal(rows[1].ready, false);
});
