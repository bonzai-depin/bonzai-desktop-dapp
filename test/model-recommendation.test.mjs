import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendFirstRunModel } from '../src/services/modelRecommendation.js';
import { activityGeneration } from '../src/services/activity/generationDetails.js';
const models = [0.8,4,9,27].map(size=>({baseKey:`qwen3_5_${String(size).replace('.','_')}b`,filename:`qwen-${size}-q4_k_xl.gguf`,parameters:size*1e9,filesizeBytes:size*.6e9}));
test('onboarding prefers quality within the full device memory budget',()=>{
 const recommend = ram => recommendFirstRunModel(models,{platform:'darwin',gpu:'Apple M1 Max',memBudget:ram*.7e9});
 assert.equal(recommend(32).model.parameters,27e9);
 assert.equal(recommend(16).model.parameters,9e9);
 assert.equal(recommend(8).model.parameters,4e9);
 assert.equal(recommendFirstRunModel(models,{}),null);
 assert.equal(recommendFirstRunModel(models,{memBudget:1e9}),null);
});
test('activity inspector preserves prompt and normalizes generation settings',()=>{
 const output=activityGeneration({id:'video1',mode:'video',status:'queued',metadata:{prompt:'Fox in snow',guidance_scale:4,negative_prompt:'blur',duration:5,seed:42}});
 assert.equal(output.prompt,'Fox in snow');assert.equal(output.guidanceScale,4);assert.equal(output.negativePrompt,'blur');assert.equal(output.seed,42);assert.equal(output.extra.duration,5);
});
