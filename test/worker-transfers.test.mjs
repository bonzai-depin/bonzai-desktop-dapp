import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkerTransfers} from '../src/main/workerTransfers.js';
import {mediaHash} from '../src/main/agentWorkerHost.js';
import {collectWorkerOutputs} from '../src/services/workerOutputs.js';

test('streamed deliveries reject cross-window reads, offsets, truncation and mismatched hashes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-transfer-'));const bytes=Buffer.alloc(500000,123),id=mediaHash(bytes);
 const transfers=createWorkerTransfers({directory:()=>root,save:async(file,ext,meta)=>{const output=await fs.readFile(file);assert.equal(mediaHash(output),meta.sha256);return{id:mediaHash(output)};}});
 try {
  const key=await transfers.start(1,{id,sha256:id,size:bytes.length,ext:'safetensors'});
  await assert.rejects(transfers.chunk(2,key,0,'YWJj'),/Unknown/);
  await assert.rejects(transfers.chunk(1,key,1,'YWJj'),/offset/);
  await assert.rejects(transfers.finish(1,key),/incomplete/);
  for(let offset=0;offset<bytes.length;offset+=192*1024)await transfers.chunk(1,key,offset,bytes.subarray(offset,offset+192*1024).toString('base64'));
  assert.equal((await transfers.finish(1,key)).id,id);
  assert.deepEqual(await fs.readdir(root),[]);
  const bad=await transfers.start(1,{id,sha256:id,size:3,ext:'bin'});await transfers.chunk(1,bad,0,'YWJj');await assert.rejects(transfers.finish(1,bad));assert.deepEqual(await fs.readdir(root),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('workflow media becomes attachments rather than private paths inside JSON',()=>{
 const output=collectWorkerOutputs({story:{scenes:[{narrative:'Hello',image:'YWJj'}],narration:'/tmp/generated.wav'}});
 assert.equal(output.artifacts.length,2);assert.equal(output.text.includes('/tmp'),false);assert.equal(output.artifacts[1].meta.payloadEncoding,'path');
});
