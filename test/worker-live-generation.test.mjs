import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { executeCreation } from '../src/services/company/createCapabilities.js';
import { createMeditation } from '../src/services/chat/meditation.js';
import { createWorkerMedia } from '../src/main/agentWorkerMedia.js';
import { mediaHash } from '../src/main/agentWorkerHost.js';

// Explicit opt-in: uses installed models, never downloads them or contacts a hosted AI.
test('real local models produce a meditation with decodable audio and cover', {skip:process.env.BONZAI_LIVE_WORKER!=='1',timeout:900000}, async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bonzai-live-worker-'));
 const json=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600000)});const value=await r.json();if(!r.ok)throw new Error(value.error||`HTTP ${r.status}`);return value;};
 const deps={acquire:()=>true,release:()=>{},
  chat:async prompt=>{const r=await json('http://127.0.0.1:3002/v1/chat/completions',{model:'bonzai-sovereign',messages:[{role:'user',content:prompt}],max_tokens:700,stream:false,chat_template_kwargs:{enable_thinking:false}});return r.choices?.[0]?.message?.content;},
  request:(endpoint,payload)=>json('http://127.0.0.1:65000'+endpoint,payload)};
 const result=await createMeditation({duration:1,intention:'A quiet breathing break',environment:'a Japanese garden at dawn'},{updateStatus:message=>console.log(message)},(action,context)=>executeCreation(action,context,deps));
 assert.equal(result.warnings.length,0,'The public demo requires both narration and artwork.');
 const blobs={blobPath:(id,ext)=>path.join(root,`${id}.${ext}`),async write(bytes,ext){const id=mediaHash(bytes);await fs.writeFile(this.blobPath(id,ext),bytes);return{id};}};
 const media=createWorkerMedia({blobs,roots:[path.join(os.homedir(),'bonzai-models/files'),os.tmpdir()]});
 const delivery=await media.prepare({text:result.meditation.script,artifacts:result.artifacts},{});
 assert.ok(delivery.text.length>100);
 assert.equal(/<\/?think>/i.test(delivery.text),false);
 assert.ok(delivery.artifacts.some(a=>a.mimeType.startsWith('audio/')&&a.size>1000));
 assert.ok(delivery.artifacts.some(a=>a.mimeType.startsWith('image/')&&a.size>1000));
 await fs.writeFile(path.join(root,'delivery.json'),JSON.stringify(delivery,null,2));
 console.log('Live acceptance artifacts:',root);
});
