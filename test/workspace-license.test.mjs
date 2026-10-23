import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createWorkspaceLicense,signLicense,verifyLicense,PRODUCT,needsWorkspaceLicense} from '../src/main/workspace/license.js';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
test('workspace activation survives offline restart, rejects tampering and wrong workspace',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-license-'));
 try{const service=createWorkspaceLicense({directory,publicKey});assert.equal(service.status().unlocked,true);assert.doesNotThrow(()=>service.assert());
 const payload={product:PRODUCT,workspaceId:service.status().workspaceId,purchaseId:'paid-1',issuedAt:Date.now(),perpetual:true};const receipt=signLicense(payload,privateKey);
 assert.equal(verifyLicense(receipt,publicKey,'other'),null);assert.equal(verifyLicense({...receipt,body:receipt.body+'a'},publicKey,payload.workspaceId),null);
 service.activate(receipt);assert.equal(createWorkspaceLicense({directory,publicKey}).status().unlocked,true);
 assert.equal(verifyLicense(signLicense({...payload,test:true},privateKey),publicKey,payload.workspaceId),null);
 assert.equal(verifyLicense(signLicense({...payload,product:'protocol-unlock'},privateKey),publicKey,payload.workspaceId),null);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('workspace writes and reads are free without a license',()=>{
 for(const c of ['db:companies:save','db:companyBilling:recordPayment','db:companyGrants:advanceDossier','db:companyBrowser:fillForm','db:automation:begin','db:issues:create','db:companyPortability:import'])assert.equal(needsWorkspaceLicense(c),false,c);
 for(const c of ['db:companies:list','db:companyBilling:snapshot','db:companyPortability:export','db:generations:create','db:companions:save'])assert.equal(needsWorkspaceLicense(c),false,c);
});
test('old payment flags cannot reinstate the removed workspace paywall',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-bypass-'));
 try{
  const service=createWorkspaceLicense({directory,publicKey,paymentRequired:false});
  assert.equal(service.status().unlocked,true);
  assert.equal(service.status().bypassed,false);
  assert.equal(service.status().licensed,false);
  assert.doesNotThrow(()=>service.assert());
  assert.equal(service.backup().receipt,undefined);
  const locked=createWorkspaceLicense({directory,publicKey,paymentRequired:true});
  assert.equal(locked.status().unlocked,true);
  assert.doesNotThrow(()=>locked.assert());
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
