import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouter, OPENROUTER_HEADERS } from '../src/main/openrouter.js';
import { assertPublicStoreKey } from '../src/main/security/walletCredentials.js';
const model = { id:'example/model', name:'Example', context_length:32768, architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:'0.000001',completion:'0.000002'} };
function fixture(completion, limit=5) {
 const data = new Map(); const calls=[];
 const store={get:(key,fallback)=>data.has(key)?data.get(key):fallback,set:(k,v)=>data.set(k,v),delete:k=>data.delete(k)};
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from('encrypted:'+v),decryptString:b=>b.toString().slice(10)};
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/key'))return Response.json({data:{limit,limit_remaining:4,usage:1}});if(url.endsWith('/models'))return Response.json({data:[model]});return typeof completion==='function'?completion(opts):Response.json(completion || {choices:[{message:{content:'Answer'},finish_reason:'stop'}],usage:{completion_tokens:2,cost:0.01}});};
 const api=createOpenRouter({store,safeStorage,fetchImpl});
 const enable=async()=>{await api.connect('test-key');await api.configure({source:'openrouter',model:model.id,maxTokens:512,consent:true});store.set('p2p.networkMode','consumer');};
 return {api,data,calls,store,safeStorage,enable};
}
test('credentials stay encrypted and private; local mode never sends a completion',async()=>{
 const f=fixture();await f.enable();assert.equal(f.api.status().active,true);assert.ok(!JSON.stringify(f.api.status()).includes('test-key'));assert.notEqual(f.data.get('openrouter-secret'),'test-key');
 for(const key of ['openrouter-secret','openrouter.settings','openrouter'])assert.throws(()=>assertPublicStoreKey(key));
 f.store.set('p2p.networkMode','local');await assert.rejects(f.api.complete({messages:[]}),/not enabled/);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
});
test('explicit consent and capped keys are required; insecure keychain has no plaintext fallback',async()=>{
 const f=fixture(null,null);await assert.rejects(f.api.connect('key'),/spending limit/);assert.equal(f.data.has('openrouter-secret'),false);
 await assert.rejects(f.api.configure({source:'openrouter',model:model.id,maxTokens:512,consent:false}),/Confirm/);
 f.safeStorage.getSelectedStorageBackend=()=> 'basic_text';await assert.rejects(f.api.connect('key'),/keychain/);
});
test('completion attributes BonzAI, enforces output cap, and labels remote usage',async()=>{
 const f=fixture();await f.enable();const result=await f.api.complete({messages:[{role:'user',content:'Hello'}],maxTokens:8192});
 assert.equal(result.text,'Answer');assert.equal(result.source,'openrouter');assert.equal(result.usage.cost,0.01);
 const call=f.calls.at(-1);assert.equal(JSON.parse(call.opts.body).max_tokens,512);assert.equal(call.opts.headers.Authorization,'Bearer test-key');for(const[k,v]of Object.entries(OPENROUTER_HEADERS))assert.equal(call.opts.headers[k],v);
});
test('stream handles split UTF-8, comments and usage; incomplete streams fail instead of silently succeeding',async()=>{
 const bytes=new TextEncoder().encode(': keepalive\ndata: {"choices":[{"delta":{"content":"Héllo"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"completion_tokens":2}}\n\ndata: [DONE]\n\n');
 const f=fixture(()=>new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}})));await f.enable();let streamed='';const result=await f.api.complete({messages:[],onToken:c=>streamed+=c});assert.equal(streamed,'Héllo');assert.equal(result.usage.completion_tokens,2);
 const broken=fixture(()=>new Response('data: {"choices":[{"delta":{"content":"Half"}}]}\n'));await broken.enable();await assert.rejects(broken.api.complete({messages:[],onToken:()=>{}}),/disconnected/);
});
test('upstream errors never retry on local or expose raw service errors; disconnect disables routing',async()=>{
 const f=fixture(()=>new Response('secret error',{status:402}));await f.enable();await assert.rejects(f.api.complete({messages:[]}),/spending limit/);assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,1);f.api.disconnect();assert.equal(f.api.active(),false);assert.equal(f.data.has('openrouter-secret'),false);
});
test('cancelling a remote request propagates to the network without a retry',async()=>{
 const f=fixture(opts=>new Promise((resolve,reject)=>{if(opts.signal.aborted)reject(opts.signal.reason);else opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true});}));await f.enable();const ctrl=new AbortController();const pending=f.api.complete({messages:[],signal:ctrl.signal});ctrl.abort();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(f.calls.filter(c=>c.url.endsWith('/chat/completions')).length,1);
});
test('roleplay story generation uses the selected remote LLM without loading local weights',async()=>{
 const previous=globalThis.window;let loads=0;let received;
 globalThis.window={electronAPI:{openRouter:{status:async()=>({active:true})},loadModel:async()=>{loads++;},chat:async(message,options)=>{received={message,options};return 'A shared adventure.';}}};
 try { const {generateRoleplayStory}=await import('../src/skills/flagship.js');assert.equal(await generateRoleplayStory('Plan a scene'),'A shared adventure.');assert.equal(loads,0);assert.equal(received.options.isolated,true);assert.equal(received.message,'Plan a scene'); }
 finally { if(previous===undefined)delete globalThis.window;else globalThis.window=previous; }
});
