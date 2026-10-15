import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWorkerModels, prepareWorkerModel, workerModelFiles, canonicalWorkerModelKey } from '../src/services/company/workerModels.js';
const model = (baseKey, parameters, size, rest={}) => ({key:`llm_${baseKey}`, baseKey, name:baseKey, parameters:parameters*1e9, filesizeBytes:size*1e9, tier:'q4', filename:`${baseKey}-q4_k_m.gguf`, url:`https://huggingface.co/test/${baseKey}.gguf`, ...rest});
const models = [model('qwen3_5_2b',2,1.5),model('qwen3_5_4b',4,2.8),model('qwen3_5_9b',9,5.97),model('ministral_14b_reasoning',14,8.5),model('qwen3_5_27b',27,17.5),model('devstral_small_2_24b',24,14.5),model('qwen3_1_7b_draft',1.7,1),model('nemomix_12b_heretic',12,7.5)];
const apple = {platform:'darwin',gpu:'Apple M1 Max',ram:32e9,memBudget:22e9};
test('role suitability and safe device headroom lead recommendations, not download availability or size alone', () => {
  const rank = role => rankWorkerModels({models, role, hardware:apple,availability:{'nemomix_12b_heretic-q4_k_m.gguf':true}});
  assert.equal(rank('DispatchCoordinator').recommended.baseKey,'qwen3_5_9b');
  assert.equal(rank('CFO').recommended.baseKey,'qwen3_5_9b');
  assert.equal(rank('GeneralCounsel').recommended.baseKey,'qwen3_5_9b');
  assert.equal(rank('ClientSuccess').recommended.baseKey,'qwen3_5_9b');
  assert.ok(!rank('CFO').models.some(m=>m.baseKey.includes('_draft')));
  assert.equal(rankWorkerModels({models,role:'Producer:skill',hardware:{platform:'linux',vram:48e9,memBudget:64e9}}).recommended.baseKey,'devstral_small_2_24b');
  assert.equal(rankWorkerModels({models,role:'CFO',hardware:{platform:'win32',vram:8e9,memBudget:16e9}}).recommended.baseKey,'qwen3_5_4b');
  assert.ok(rankWorkerModels({models,role:'CFO',hardware:{platform:'linux',vram:0,memBudget:16e9}}).recommended.cpuOnly);
  const largeMoe=model('huge_moe',400,200,{isMoE:true,activeParameters:3e9});
  for(const hardware of [apple,{platform:'linux',vram:0,memBudget:16e9}]) {
    assert.equal(rankWorkerModels({models:[largeMoe],role:'CFO',hardware}).models[0].fit.tier,3,'CPU/unified memory must hold all experts, not just active weights');
  }
});
test('unknown or insufficient hardware gets no invented recommendation and legacy Q4 bindings resolve', () => {
  assert.equal(rankWorkerModels({models,role:'CFO'}).recommended,null);
  const rank=rankWorkerModels({models,role:'CFO',hardware:{platform:'darwin',memBudget:1e9}});
  assert.equal(rank.recommended,null);
  assert.ok(rank.models.every(m=>m.fit.tier===3));
  assert.equal(canonicalWorkerModelKey('llm_qwen3_5_4b_q4'),'llm_qwen3_5_4b');
  assert.equal(canonicalWorkerModelKey('llm_qwen3_5_4b_q8'),'llm_qwen3_5_4b_q8');
  assert.equal(rankWorkerModels({models,role:'CFO',hardware:{platform:'win32',memBudget:16e9,gpu:'Unknown'}}).recommended,null,'unfinished GPU detection does not pretend to be a CPU-only machine');
  assert.equal(rankWorkerModels({models,role:'CFO',hardware:{platform:'win32',vram:8192,memBudget:16e9}}).recommended.baseKey,'qwen3_5_4b','dedicated GPU MiB from systeminformation are normalized');
});
test('an assignment is returned only when every shard and auxiliary file exists; no runtime is loaded', async () => {
  const spec=model('split',10,6,{filename:'Split-00001-of-00002.gguf',url:'https://example.invalid/Split-00001-of-00002.gguf',shards:2,mmproj:'Projector.gguf',mmprojUrl:'https://example.invalid/Projector.gguf',draftModel:'Draft.gguf',draftUrl:'https://example.invalid/Draft.gguf'});
  const files=workerModelFiles(spec);assert.equal(files.length,4);assert.equal(files[1].filename,'split-00002-of-00002.gguf');
  assert.equal(files[0].downloadId,'split.gguf','multipart progress and cancellation use the main process download ID');
  const local=new Set(),downloads=[];const api={checkModel:async name=>local.has(name),downloadModel:async(url,name)=>{downloads.push(name);local.add(name);return {savedPath:name};},loadModel:()=>assert.fail('model choice must not interrupt inference')};
  assert.equal(await prepareWorkerModel(spec,api),'llm_split');assert.equal(downloads.length,4);
  await prepareWorkerModel(spec,api);assert.equal(downloads.length,4,'installed files reused');
});
test('failed or cancelled downloads cannot produce a new worker binding', async () => {
  await assert.rejects(prepareWorkerModel({}, {checkModel:async()=>true}),/not available/);
  await assert.rejects(prepareWorkerModel(models[0],{checkModel:async()=>false,downloadModel:async()=>({error:'offline'})}),/previous model is unchanged/);
  await assert.rejects(prepareWorkerModel(models[0],{checkModel:async()=>false,downloadModel:async()=>({canceled:true})}),/previous model is unchanged/);
  const controller=new AbortController();
  await assert.rejects(prepareWorkerModel(models[0],{checkModel:async()=>false,downloadModel:async()=>{controller.abort();return {savedPath:'late'};}},{signal:controller.signal}),/abort/i);
});
