import test from 'node:test';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {serviceOffer,validateServiceOffer,verifyOfferPayment,serviceKnowledge} from '../src/services/agentServiceOffer.js';
import {buildSmartAgentJobTerms,verifySmartAgentQuote} from '../src/services/smartAgentJobTerms.js';
import {createAgentServiceAssets} from '../src/main/agentServiceAssets.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const address='0x1111111111111111111111111111111111111111';
const asset={chainId:4663,collection:address,tokenId:'0',title:'Refrigeration handbook',kind:'text',digest:ethers.id('content'),use:'knowledge',license:'Use for this job; cite the source.'};
const offer=()=>serviceOffer({title:'Maintenance specialist',outcome:'A cited diagnosis',price:'10',assets:[asset]});
test('public offer contains only explicit asset references and rights; any changed terms change its commitment',()=>{
 const original=offer();assert.equal(validateServiceOffer(original),original);
 const clean=serviceOffer({...original,secret:'never',assets:[{...asset,path:'/private/company',text:'secret knowledge'}]});assert.equal(clean.hash,original.hash);assert.doesNotMatch(JSON.stringify(clean),/private|secret knowledge|never/);
 assert.throws(()=>validateServiceOffer({...original,secret:'leaked'}),/Invalid public/);
 for(const updated of [{...original,price:'20'},{...original,assets:[{...asset,license:'different'}]},{...original,assets:[{...asset,digest:ethers.id('new')}]}])assert.throws(()=>validateServiceOffer(updated),/changed/);
 assert.throws(()=>serviceOffer({...original,assets:[asset,asset]}),/each asset once/);
 assert.throws(()=>validateServiceOffer(original,{chainId:4663,capabilities:['workflow']}),/compatible/);
});
test('the reviewed price and version are enforced in funded terms; quote changes require a new review',()=>{
 const service=offer(),quote={serviceOffer:service,decimals:18,tokenAddress:address,worker:address,tokenId:'1',chainId:4663,escrow:address,arbitrator:address};
 const {terms}=buildSmartAgentJobTerms(quote,{title:'Diagnosis',outcome:'Explain failure',amount:'10',execution:{capability:'text',input:{prompt:'Diagnosis'}},executionPeer:'provider'});
 assert.equal(terms.serviceOffer.hash,service.hash);assert.equal(verifyOfferPayment(service,terms),undefined);
 assert.throws(()=>buildSmartAgentJobTerms(quote,{title:'Diagnosis',outcome:'Explain failure',amount:'10'}),/inputs for this service/);
 assert.throws(()=>buildSmartAgentJobTerms(quote,{title:'Diagnosis',outcome:'Explain failure',amount:'9.9',execution:{capability:'text',input:{prompt:'Diagnosis'}},executionPeer:'provider'}),/below/);
 assert.throws(()=>verifyOfferPayment(service,{...terms,serviceOffer:{...service,assets:[{...asset,use:'delivery'}]}}),/differs/);
 assert.throws(()=>verifySmartAgentQuote(quote,{...quote,serviceOffer:serviceOffer({...service,price:'12'})}),/package changed/);
});
test('knowledge retrieval is bounded, relevant and traceable without unrelated company memory',()=>{
 const retrieved=serviceKnowledge([{asset,text:'Compressor pressure readings.\n'.repeat(300)},{asset:{...asset,tokenId:'1',title:'Other'},text:'Unrelated content.\n'.repeat(300)}],'compressor pressure',4000);
 assert.ok(retrieved.text.length<=4000);assert.match(retrieved.text,/Compressor/);assert.equal(retrieved.citations.length,2);assert.doesNotMatch(retrieved.text,/Unrelated/);
});
test('asset originals are resolved from saved mint records, pinned by hash and never disclosed by inspection',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-assets-'));
 try{
  const records=[{id:'t',contentType:'text',generationId:'source',chainId:4663,contractAddress:address,tokenId:'0'},{id:'m',contentType:'training',generationId:'model',chainId:4663,contractAddress:address,tokenId:'2'}];
  let text='Licensed private knowledge';let calls=[];
  await fs.mkdir(path.join(root,'model'));await fs.writeFile(path.join(root,'model','metadata.json'),JSON.stringify({filename:'model.gguf',base_model:'Qwen',type:'abliteration'}));await fs.writeFile(path.join(root,'model','model.gguf'),'GGUF-weights');
  const lib=createAgentServiceAssets({mints:()=>records,store:{get:()=>[{id:'source',question:'My domain',answer:{text}}]},trainedRoot:()=>root,outputRoots:()=>[root],blobs:{},chat:async(source,prompt)=>{calls.push({file:source.file,prompt});return 'Actual output';}});
  const ref=await lib.inspect('t');assert.doesNotMatch(JSON.stringify(ref),/Licensed private knowledge/);assert.equal((await lib.use({id:'t'},{...ref,use:'knowledge'})).text,text);
  text='changed';await assert.rejects(()=>lib.use({id:'t'},{...ref,use:'knowledge'}),/changed/);
  const model=await lib.inspect('m');assert.deepEqual(model.uses,['model','delivery']);assert.doesNotMatch(JSON.stringify(model),new RegExp(root));
  assert.equal((await lib.use({id:'m'},{...model,use:'model'},'Approved brief')).text,'Actual output');assert.equal(calls.length,1);assert.equal(calls[0].prompt,'Approved brief');
  await fs.writeFile(path.join(root,'model','alternate.gguf'),'GGUF-alternate');
  const multiModel=await lib.inspect('m');
  await fs.writeFile(path.join(root,'model','metadata.json'),JSON.stringify({filename:'alternate.gguf',base_model:'Qwen',type:'abliteration'}));
  await assert.rejects(()=>lib.use({id:'m'},{...multiModel,use:'model'},'brief'),/changed/);assert.equal(calls.length,1);
  await fs.writeFile(path.join(root,'model','model.gguf'),'GGUF-replaced');await assert.rejects(()=>lib.use({id:'m'},{...model,use:'model'},'brief'),/changed/);assert.equal(calls.length,1);
  await assert.rejects(()=>lib.inspect('../../private'),/unavailable/);
  records[1].generationId='../private';await assert.rejects(()=>lib.inspect('m'),/Invalid model/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('LoRAs are offered as explicitly licensed originals, not falsely advertised as standalone inference models',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-adapter-'));try{
  await fs.mkdir(path.join(root,'adapter'));await fs.writeFile(path.join(root,'adapter','metadata.json'),'{}');await fs.writeFile(path.join(root,'adapter','adapter_model.safetensors'),'weights');await fs.writeFile(path.join(root,'adapter','adapter_config.json'),'{}');
  const lib=createAgentServiceAssets({mints:()=>[{id:'a',contentType:'training',generationId:'adapter',chainId:4663,contractAddress:address,tokenId:'3'}],trainedRoot:()=>root,store:{},blobs:{}});
  const ref=await lib.inspect('a');assert.equal(ref.kind,'lora');assert.deepEqual(ref.uses,['delivery']);await assert.rejects(()=>lib.use({id:'a'},{...ref,use:'model'},'brief'),/changed/);
  assert.deepEqual(await lib.use({id:'a'},{...ref,use:'delivery'}),{pipeline:'fineTune',meta:{modelId:'adapter',licensedOriginal:true}});
  await fs.symlink('/etc/hosts',path.join(root,'adapter','linked'));await assert.rejects(()=>lib.inspect('a'),/Linked/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
