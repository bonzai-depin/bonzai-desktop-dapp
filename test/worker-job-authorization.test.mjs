import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { verifyAcceptedWorkerJob } from '../src/services/workerJobAuthorization.js';
import { jobPacketMessage } from '../src/services/smartAgentHandoff.js';

test('a funded brief delegates only its exact execution to a named requesting agent', async () => {
 const employer=ethers.Wallet.createRandom(), requesting=ethers.Wallet.createRandom(), worker=ethers.Wallet.createRandom();
 const escrow=ethers.Wallet.createRandom().address, currency=ethers.Wallet.createRandom().address;
 const call={capability:'workflow',input:{workflowId:'meditation-forge-v1.0.0',inputs:{duration:3}}};
 const terms={executionPeer:'worker-peer',title:'Meditation',outcome:'Playable narration',chainId:4663,escrow,worker:worker.address,currency,amount:'100',companionTokenId:'1',routeAssetId:ethers.ZeroHash,arbitrator:escrow,executionCaller:requesting.address,executionHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(call)))};
 const packet={version:1,kind:'bonzai-agent-job',jobId:ethers.id('meditation'),terms};packet.signature=await employer.signMessage(jobPacketMessage(packet));
 const live={...terms,employer:employer.address,status:2,termsHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms))),deliverBy:Math.floor(Date.now()/1000)+300};
 const context={caller:requesting.address,grant:{chainId:4663,tokenId:'1',peerId:'worker-peer'},identity:{owner:worker.address,wallet:worker.address,token:currency},call,escrow};
 assert.throws(()=>verifyAcceptedWorkerJob(packet,live,{...context,grant:{...context.grant,peerId:'other-peer'}}),/does not authorize/);
 assert.equal(verifyAcceptedWorkerJob(packet,live,context),true);
 assert.throws(()=>verifyAcceptedWorkerJob(packet,live,{...context,caller:worker.address}),/does not authorize/);
 assert.throws(()=>verifyAcceptedWorkerJob(packet,live,{...context,call:{...call,input:{workflowId:'different'}}}),/inputs do not match/);
 assert.throws(()=>verifyAcceptedWorkerJob(packet,{...live,status:4},context),/does not authorize/);
 assert.throws(()=>verifyAcceptedWorkerJob(packet,{...live,deliverBy:1},context),/does not authorize/);
 assert.throws(()=>verifyAcceptedWorkerJob(packet,live,{...context,identity:{...context.identity,token:escrow}}),/does not authorize/);
});
