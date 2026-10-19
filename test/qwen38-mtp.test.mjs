import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLLM, LLM_BASE_MODELS } from '../src/skills/flagship.js';
import { DEFAULT_LLM_ID, DEFAULT_LLM_TIER, DEFAULT_LLM_FILENAME, DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER, DEFAULT_3D_LLM_FILENAME, preferredModelFilename, selectPreferredModel, migrateModelPreference } from '../src/config/modelDefaults.js';
import { buildArgs } from '../src/services/llamaServer.manager.js';
import { qwen38ContextPlan } from '../src/main/modelContext.js';

test('an explicit non-speculative fallback overrides inherited MTP and external draft settings',()=>{
 const model=resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER);
 const args=buildArgs({...model,specType:'none',draftPath:'/models/draft.gguf',modelPath:'/models/model.gguf',port:8080,parallelSlots:2,mmprojPath:'/models/vision.gguf'});
 assert.equal(args[args.indexOf('--spec-type')+1],'none');
 assert.equal(args[args.indexOf('-np')+1],'2');
 assert.ok(args.includes('--mmproj'));
 assert.ok(!args.includes('--spec-draft-n-max'));assert.ok(!args.includes('-md'));
});

test('3D keeps its embedded-MTP LOW model independently of the chat default', () => {
  for (const [id, tier] of [[DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER]]) {
    const model = resolveLLM(id, tier);
    assert.equal(model.filename, DEFAULT_3D_LLM_FILENAME);
    assert.match(model.url, /DavidAU\/.*\/resolve\/main\/.*-LOW-MTP-IQ4_XS.gguf$/);
    assert.equal(model.filesizeBytes, 15.3e9);
    assert.equal(model.mtp, true);
    assert.equal(model.context, 32768);
    const args = buildArgs({ ...model, ctxSize: model.context, modelPath: '/models/' + model.filename, port: 8080, parallelSlots: 4 });
    const value = flag => args[args.indexOf(flag) + 1];
    assert.equal(value('--spec-type'), 'draft-mtp');
    assert.equal(value('--spec-draft-n-max'), '2');
    assert.equal(value('-np'), '1');
    assert.equal(value('-c'), '32768');
    assert.ok(!args.includes('-md'));
    assert.ok(!args.includes('--mmproj'));
  }
});

test('all offered tiers include MTP and legacy preferences migrate without changing unrelated selections', () => {
  for (const tier of Object.keys(LLM_BASE_MODELS.qwen3_8_27b.tiers)) {
    const model = resolveLLM('qwen3_8_27b', tier);
    assert.match(model.filename, /-mtp-/);
    assert.equal(model.filename, model.filename.toLowerCase());
    assert.equal(model.specType, 'draft-mtp');
    assert.equal(model.draftModel, null);
  }
  assert.equal(migrateModelPreference('qwen3.8-27b-ud-q4_k_xl.gguf'), DEFAULT_3D_LLM_FILENAME);
  assert.equal(migrateModelPreference('qwen3.8-27b-ud-q2_k_xl.gguf'), resolveLLM('qwen3_8_27b', 'q2').filename);
  assert.equal(migrateModelPreference('custom.gguf'), 'custom.gguf');
});

test('new Q4 weight size is accounted for on 32 GiB Apple Silicon', () => {
  const model = { ...resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER), kvCacheTypeK: 'q8_0', kvCacheTypeV: 'q8_0' };
  const plan = qwen38ContextPlan(model, { ram: 32 * 1024 ** 3 }, { platform: 'darwin', arch: 'arm64' });
  assert.equal(plan.weights, 15.3e9);
  assert.ok(plan.context === 32768);
});

test('LOW filename stays capped at 32K even for callers requesting the native context',()=>{
 const model={...resolveLLM(DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER),context:262144};
 const plan=qwen38ContextPlan(model,{ram:128*1024**3},{platform:'darwin',arch:'arm64'});
 assert.equal(plan.context,32768);
 assert.equal(migrateModelPreference(resolveLLM('qwen3_8_27b','q4').filename),DEFAULT_3D_LLM_FILENAME);
});

test('first chat uses Qwen3.5 9B MTP Q4_K_XL and preserves explicit preferences',()=>{
 const model=resolveLLM(DEFAULT_LLM_ID,DEFAULT_LLM_TIER);
 assert.equal(model.filename,DEFAULT_LLM_FILENAME);
 assert.match(model.url,/unsloth\/Qwen3.5-9B-MTP-GGUF\/resolve\/main\/Qwen3.5-9B-UD-Q4_K_XL.gguf$/);
 assert.equal(model.mtp,true);
 assert.equal(preferredModelFilename({getItem:()=>null}),model.filename);
 assert.equal(preferredModelFilename({getItem:()=>{throw new Error('denied')}}),model.filename);
 const three=resolveLLM(DEFAULT_3D_LLM_ID,DEFAULT_3D_LLM_TIER);
 const saved=preferredModelFilename({getItem:()=>three.filename});
 assert.equal(saved,three.filename);
 assert.equal(selectPreferredModel([model,three],saved),three);
 assert.equal(selectPreferredModel([three,model]),model);
 assert.equal(preferredModelFilename({getItem:()=> 'custom-local.gguf'}),'custom-local.gguf');
 const args=buildArgs({...model,modelPath:'/models/'+model.filename,port:8080,parallelSlots:1});
 assert.equal(args[args.indexOf('--spec-type')+1],'draft-mtp');
 assert.equal(args[args.indexOf('--spec-draft-n-max')+1],'2');
});
