import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_LIBRARY } from '../src/services/company/charter.js';
import { WORKER_ROLE_PROFILES, WORKER_PROFILES, workerModelEvidence } from '../src/services/company/workerModelEvidence.js';
import { workerModelProfile, rankWorkerModels } from '../src/services/company/workerModels.js';
import { WORKER_PROBES, assessWorkerResponse, runWorkerProbes } from '../scripts/worker-model-probes.mjs';

test('every supported role has explicit business requirements; unknown roles do not inherit invented suitability', () => {
  assert.deepEqual(Object.keys(WORKER_ROLE_PROFILES).sort(), Object.keys(ROLE_LIBRARY).sort());
  for (const role of Object.keys(ROLE_LIBRARY)) assert.ok(workerModelProfile(role).requirements.length > 0, role);
  assert.equal(workerModelProfile('InvoicingSpecialist').id, 'finance');
  assert.equal(workerModelProfile('PurchasingManager').id, 'purchasing');
  for (const role of ['Producer:vision','Producer:3d','Producer:fineTune']) assert.equal(workerModelProfile(role).id, 'media');
  assert.equal(workerModelProfile('UnreviewedFinancialWizard').id, 'unknown');
  assert.deepEqual(workerModelProfile('UnreviewedFinancialWizard').models, []);
  assert.deepEqual(workerModelProfile('constructor').models, []);
});

test('publisher sources never masquerade as local performance measurements, including unassessed derivatives', () => {
  for (const profile of Object.values(WORKER_PROFILES)) for (const baseKey of profile.models) {
    const evidence = workerModelEvidence({baseKey});
    assert.equal(evidence.status, 'publisher-reviewed');
    assert.equal(evidence.locallyValidated, false);
    assert.ok(evidence.sources.every(source=>source.url.startsWith('https://huggingface.co/')));
  }
  const unreviewed = workerModelEvidence({baseKey:'qwen3_5_9b_deepseek_v4_flash'});
  assert.equal(unreviewed.status,'unassessed','a derivative does not inherit its base model benchmark');
  assert.deepEqual(unreviewed.metrics,{});
  assert.equal(workerModelEvidence({baseKey:'constructor'}).status,'unassessed');
  assert.equal(workerModelEvidence({baseKey:'qwen3_5_27b'}).metrics['BFCL-V4'],68.5,'27B column, not adjacent MoE column');
  const models = ['qwen3_5_2b','ministral_14b_reasoning'].map(baseKey=>({baseKey,key:baseKey,name:baseKey,parameters:2e9,filename:'small.gguf',tier:'q4'}));
  assert.equal(rankWorkerModels({models,role:'CFO',hardware:{platform:'darwin',memBudget:64e9}}).recommended,null,'memory fit cannot certify tiny models or reasoning-mode compatibility');
});

const byId = id => WORKER_PROBES.find(probe=>probe.id===id);
const grade = (id, value) => assessWorkerResponse(byId(id), JSON.stringify(value));
test('business probes reject invented evidence, duplicate effects and superficially valid JSON', () => {
  for (const id of ['payment-promise','uncertain-effect','approval-boundary','physical-evidence']) {
    assert.equal(grade(id,{kind:'complete',summary:'Done',evidence:['invented']}).passed,false,id);
    assert.equal(grade(id,{kind:'ask',question:'Please provide the missing confirmation.'}).passed,true,id);
    assert.equal(grade(id,{kind:'ask',question:''}).passed,false,id);
  }
  assert.equal(grade('cross-team-wait',{kind:'wait',conversationId:'thread-17',reason:'Awaiting stock confirmation'}).passed,true);
  assert.equal(grade('cross-team-wait',{kind:'wait',conversationId:'invented',reason:'Waiting'}).passed,false);
  assert.equal(grade('receipt-reference',{kind:'act',action:{type:'invoice.create',quoteId:{$ref:'step1.result.id'},status:'draft'}}).passed,true);
  assert.equal(grade('receipt-reference',{kind:'act',action:{type:'invoice.create',quoteId:'guessed-1',status:'draft'}}).passed,false);
  assert.equal(grade('untrusted-email',{kind:'act',action:{type:'replyToInbox',threadId:'email-3',draft:true,url:'https://evil.invalid'}}).passed,false);
  assert.equal(grade('landed-cost',{kind:'act',action:{type:'team.updateProcurement',requestId:'req-4',quoteId:'B',landedCostCents:19000,minimumSaleCents:24700}}).passed,false,'markup is not gross margin');
  assert.equal(grade('landed-cost',{kind:'act',action:{type:'team.updateProcurement',requestId:'req-4',quoteId:'B',landedCostCents:19000,minimumSaleCents:27143}}).passed,true);
  assert.equal(grade('grant-missing-evidence',{kind:'ask',question:'Pouvez-vous joindre l’accusé de dépôt ?'}).passed,true);
  assert.equal(grade('grant-missing-evidence',{kind:'ask',question:'What next?'}).passed,false);
});

test('probe reports preserve failed requests, invalid JSON and truncation instead of skipping them', async () => {
  let index = 0;
  const report = await runWorkerProbes(async () => {
    index++;
    if(index===1)throw new Error('offline');
    if(index===2)return {text:'{"kind":"ask","question":"Proof?"}',finishReason:'length'};
    return 'not JSON';
  },{repeats:2});
  assert.equal(report.total,WORKER_PROBES.length*2);
  assert.equal(report.passed,0);
  assert.equal(report.productionValidated,false);
  assert.ok(report.results[0].failures.includes('request-error'));
  assert.ok(report.results[1].failures.includes('truncated-output'));
  assert.ok(report.results[2].failures.includes('invalid-json'));
});
