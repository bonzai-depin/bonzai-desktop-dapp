import {buildMintGLBViewer} from '../src/services/mintGLBViewer.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ethers as realEthers } from 'ethers';
import {mintLicenseStatus,mintMediaBytes,validateMintFormat} from '../src/services/mintValidation.js';
import { uploadGLBArtifact } from '../src/components/gen3d/glbExport.js';
let confirmationFails=false, stopAtMetadata=true;
let exportFails=false, uploadFails=false, requests=[], metadata=null, switches=0;
const bytes=new Uint8Array(20), header=new DataView(bytes.buffer);
header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,20,true);
const mocks={
 buildMintGLBViewer,
 mintLicenseStatus,mintMediaBytes,validateMintFormat,
 getSigner:async()=>({getAddress:async()=> '0x0000000000000000000000000000000000000001'}),
 markAsMinted:async()=>{throw new Error('Local disk unavailable');},
 ethers:{...realEthers,Contract:class {
   async getCollection(){return '0x0000000000000000000000000000000000000002';}
   async mintFees(){return 1n;}
   async mint(){return {hash:'0xsubmitted',wait:async()=>{if(confirmationFails)throw new Error('RPC timeout');return {hash:'0xconfirmed',status:1,logs:[{}]};}};}
   interface={parseLog:()=>({name:'ContentMinted',args:{tokenId:7n}})};
 },BrowserProvider:class{async getSigner(){return {address:'0x0000000000000000000000000000000000000001'};}}},
 exportCodeGLB:async code=>{assert.equal(code,'selected-history-source');if(exportFails)throw new Error('Export failed');return bytes;},uploadGLBArtifact,
 storageService:{disconnect(){},async initStorage(){},async uploadContent(args){requests.push(args);if(uploadFails)throw new Error('GLB upload failed');return {url:`ipfs://file-${requests.length}`,gatewayUrl:`https://gateway/file-${requests.length}`,transactionId:`file-${requests.length}`};},async uploadMetadata(value){metadata=value;if(stopAtMetadata)throw new Error('Stop before transaction');return {url:'ipfs://metadata',gatewayUrl:'https://gateway/metadata'};}},
 checkAllLevels:async()=>{},canMintContentType:()=>({canMint:true}),switchNetwork:async()=>{switches++;},getEip1193Provider:()=>({}),
 mintStore:{state:{network:'test'},activeMintNetwork:{value:{label:'test'}}},CONFIG:{networks:{configured:{explorer:'https://explorer.test'}},treasury:{address:'test'},contentNFT:{economy:{factoryAddress:'test'}}},ECONOMY_NETWORK_KEY:'configured',
 buildBonzaiUtilitySnapshot:()=>({}),buildContributionManifest:()=>({}),CONTENT_TYPE_MAP:{object:4,image:1,audio:2,video:3,text:0,training:5},COLLECTIBLES_CLONE_ABI:[],
};
globalThis.__glbMintMocks=mocks;
let source=await readFile(new URL('../src/services/contentNFT.service.js',import.meta.url),'utf8');
source=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*$/gm,'');
source=source.replace("const { MODEL_REQUIREMENTS } = await import('../skills/flagship.js');",'const MODEL_REQUIREMENTS = {};');
source=source.replaceAll('console.warn(', 'silentLog(').replaceAll('console.error(', 'silentLog(');
source=`const silentLog=()=>{};const {${Object.keys(mocks).join(',')}}=globalThis.__glbMintMocks;\nconst brandTextUrl='',brandImageUrl='',brandAudioUrl='',brandVideoUrl='',brand3DUrl='',logoUrl='';\n`+source;
const {mintContent}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const args={content:'selected-history-source',contentType:'application/javascript',inferenceType:'object',generation:{threeCode:'selected-history-source',type:'bonzai-object',model:'test',license:'MIT'},title:'3D test'};
test('3D mint uploads GLB, source and viewer and attaches their immutable URIs before the transaction',async()=>{
 const result=await mintContent(args);
 assert.equal(result.success,false);assert.match(result.error,/Stop before transaction/);
 assert.equal(requests[0].contentType,'model/gltf-binary');
 assert.equal(requests[1].contentType,'application/javascript');
 assert.equal(requests[2].contentType,'text/html');
 assert.equal(metadata.animation_url,'ipfs://file-1');
 assert.deepEqual(metadata.properties.files.map(f=>f.type),['model/gltf-binary','application/javascript','text/html']);
 assert.equal(metadata.properties.interactive_viewer,'ipfs://file-3');
 assert.equal(metadata.properties.provenance.threeCode,'selected-history-source');
});
test('failed GLB preparation or upload cannot reach collectible metadata or minting',async()=>{
 requests=[];metadata=null;switches=0;exportFails=true;
 const local=await mintContent(args);assert.match(local.error,/Export failed/);assert.equal(switches,0);assert.equal(requests.length,0);
 exportFails=false;uploadFails=true;
 const remote=await mintContent(args);assert.match(remote.error,/GLB upload failed/);assert.equal(requests.length,1);assert.equal(metadata,null);
});
test('license restrictions stop all uploads and wallet requests',async()=>{
 requests=[];switches=0;exportFails=false;uploadFails=false;
 for(const generation of [{license:'CC-BY-NC-4.0'},{model:'flux-klein'},{}]) {
  const result=await mintContent({...args,generation});assert.equal(result.success,false);
 }
 assert.equal(requests.length,0);assert.equal(switches,0);
});
test('text is never silently decoded as base64 and metadata retains original settings',async()=>{
 requests=[];metadata=null;
 await mintContent({...args,inferenceType:'text',contentType:'text/plain',content:'YWJj',generation:{model:'original',license:'MIT',parameters:{seed:0,width:512},metadata:{subject:'original'}}});
 assert.equal(new TextDecoder().decode(requests[0].data),'YWJj');
 assert.equal(metadata.properties.provenance.inspector.seed,0);
 assert.equal(metadata.properties.provenance.inspector.outputText,'YWJj');
 assert.equal(metadata.properties.generationMetadata.subject,'original');
 assert.equal(metadata.properties.files[0].type,'text/plain');
});
test('image, audio, video and model manifests attach the selected original file',async()=>{
 for(const [inferenceType,contentType] of [['image','image/png'],['audio','audio/wav'],['video','video/mp4'],['training','application/json']]) {
  requests=[];metadata=null;
  const content=inferenceType==='training'?'{}':new Uint8Array([1,2,3,4]);
  await mintContent({...args,inferenceType,contentType,content,generation:{license:'MIT',model:'recorded',parameters:{seed:0}}});
  assert.equal(requests[0].contentType,contentType);
  assert.deepEqual(requests[0].data,inferenceType==='training'?new TextEncoder().encode('{}'):content);
  assert.equal(metadata.properties.files[0].type,contentType);
  assert.equal(metadata.properties.provenance.inspector.model,'recorded');
 }
});

test('confirmed mint survives local persistence failure and uncertain confirmation forbids blind retry',async()=>{
 stopAtMetadata=false;requests=[];
 const result=await mintContent({...args,inferenceId:'saved-record'});
 assert.equal(result.success,true);assert.equal(result.inferenceId,'saved-record');assert.equal(result.tokenId,'7');
 assert.match(result.localRecordWarning,/confirmed onchain/);
 confirmationFails=true;
 const uncertain=await mintContent(args);
 assert.equal(uncertain.success,false);assert.equal(uncertain.confirmationPending,true);assert.equal(uncertain.transactionHash,'0xsubmitted');
});
