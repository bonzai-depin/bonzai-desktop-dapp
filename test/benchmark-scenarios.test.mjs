import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScenarioRunner } from '../src/main/performance/scenarioRunner.js';
import { createPerformanceJournal } from '../src/main/performance/journal.js';
import { compareScenario, scenarioSummary, parseBaseline } from '../src/shared/benchmark/comparison.js';
import { selectScenarios } from '../src/shared/benchmark/scenarios.js';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'bonzai-suite-'));
  t.after(() => rmSync(directory, {recursive:true, force:true}));
  const journal = createPerformanceJournal(directory);
  let finished;
  const done = new Promise(resolve => { finished = resolve; });
  const calls = [];
  const runner = createScenarioRunner({
    journal, hardware: async () => ({cpu:{brand:'test'}}), version: () => '4',
    idle: async () => true, environment: async () => ({ready:true,files:{model:{sha256:'abc'}},implementation:'v1',packages:{}}),
    execute: async (item, payload) => { calls.push({item,payload}); return {status:'completed',metrics:{tokenCount:128}}; },
    notify: (id, suite, end) => { if (end) finished(journal.report(id)); }, ...overrides,
  });
  return { journal, runner, done, calls };
}
test('standardized suite uses fixed inputs, sequential warmup + two passes, excludes ambient work', async t => {
  const f=fixture(t);
  const session=await f.runner.start({categories:['Text']});
  assert.equal(f.journal.begin('/image/turbo'), null);
  assert.equal(f.journal.begin('llm/chat'), null);
  const report=await f.done;
  assert.equal(report.id,session.id);
  assert.equal(report.status,'stopped');
  assert.equal(report.mode,'standardized');
  assert.equal(f.calls.length,6);
  assert.equal(report.samples.length,6);
  for(const c of report.suite.cases) {
    assert.equal(c.trials.length,3);
    assert.equal(c.trials[0].phase,'warmup');
    assert.equal(scenarioSummary(c).completed,2);
    assert.equal(c.status,'completed');
    assert.match(c.comparisonKey,/^[a-f0-9]{64}$/);
  }
  assert.deepEqual(f.calls[0].item.params,f.calls[1].item.params);
  assert.equal(f.calls.some(c=>c.item.group==='Video'),false);
});
test('missing models are skipped with no inference calls, not counted as successful timing', async t => {
  const f=fixture(t,{environment:async()=>({ready:false,reason:'Missing models'})});
  await f.runner.start({categories:['Image']});
  const report=await f.done;
  assert.equal(f.calls.length,0);
  assert.equal(report.samples.length,0);
  assert.ok(report.suite.cases.every(c=>c.status==='skipped' && c.reason));
});
test('stop waits for current trial, never starts another, and retains evidence', async t => {
  let release, entered;
  const pending=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{entered=resolve;});
  const f=fixture(t,{execute:async()=>{entered();await pending;return {status:'completed'};}});
  await f.runner.start({categories:['Text']});
  await started;
  f.runner.stop();
  assert.ok(f.runner.state().stopping);
  release();
  const report=await f.done;
  assert.equal(report.samples.length,1);
  assert.equal(report.suite.phase,'Stopped');
  assert.equal(report.suite.cases[0].status,'cancelled');
  assert.equal(report.suite.cases[1].status,'cancelled');
});
test('busy device waits; stopping while waiting never invokes inference', async t => {
  let entered; const waiting=new Promise(resolve=>{entered=resolve;});
  const f=fixture(t,{idle:async()=>false,wait:async()=>{entered();f.runner.stop();}});
  await f.runner.start({categories:['Text']}); await waiting;
  const report=await f.done;
  assert.equal(f.calls.length,0); assert.equal(report.samples.length,0);
});
test('H3 is not invoked without explicit terms acceptance', async t => {
  const f=fixture(t);
  await f.runner.start({categories:['Video']}); const report=await f.done;
  assert.equal(report.suite.cases.find(c=>c.id==='video-h3').status,'skipped');
  assert.ok(f.calls.every(c=>c.item.id!=='video-h3'));
});
test('comparison never treats warmup or mismatched configurations as like-for-like', () => {
  const c={id:'a',comparisonKey:'same',status:'completed',trials:[
    {phase:'warmup',status:'completed',metrics:{elapsedMs:99999}},
    {phase:'measurement',status:'completed',metrics:{elapsedMs:100}},
    {phase:'measurement',status:'completed',metrics:{elapsedMs:200}},
  ]};
  assert.equal(scenarioSummary(c).medianMs,150);
  assert.equal(compareScenario(c,{suite:{cases:[c]}}).ratio,1);
  assert.equal(compareScenario(c,{suite:{cases:[{...c,comparisonKey:'different'}]}}).comparable,false);
  assert.equal(compareScenario({...c,status:'failed'},{suite:{cases:[c]}}).comparable,false);
  assert.throws(()=>parseBaseline('{"mode":"observed"}'),/standardized/);
});
test('restart marks an interrupted suite honestly instead of leaving running scenarios', async t => {
  const f=fixture(t);
  const session=f.journal.start({},'4',{mode:'standardized',categories:['Text']});
  f.journal.updateSuite(session.id,{cases:[{id:'a',status:'running'}],phase:'Running'});
  f.journal.recover();
  assert.equal(f.journal.report(session.id).suite.cases[0].status,'interrupted');
});
test('unknown categories cannot inject arbitrary benchmark endpoints', () => {
  assert.throws(()=>selectScenarios(['http://example.com']),/category/);
});

test('an overlapping user request invalidates the trial instead of producing a comparison', async t => {
  const f=fixture(t,{execute:async()=>{ f.journal.begin('llm/chat'); return {status:'completed'}; }});
  await f.runner.start({categories:['Text']});
  const report=await f.done;
  assert.ok(report.suite.cases.every(c=>c.status==='failed'));
  assert.ok(report.samples.every(s=>s.status==='contended'));
});
test('benchmark-owned nested requests do not contaminate their own measurements', async t => {
  const f=fixture(t,{execute:async()=>{ f.journal.begin('llm/pool',{_benchmark:true}); return {status:'completed'}; }});
  await f.runner.start({categories:['Text']});
  const report=await f.done;
  assert.ok(report.suite.cases.every(c=>c.status==='completed'));
});
test('model changes mid-scenario invalidate the result', async t => {
  let count=0;
  const f=fixture(t,{environment:async()=>({ready:true,files:{model:{sha256:String(++count)}}})});
  await f.runner.start({categories:['Text']});
  const report=await f.done;
  assert.ok(report.suite.cases.every(c=>c.status==='invalidated'));
});
test('comparison accepts platform accelerator builds but rejects different model or decoding configurations', async () => {
  const { comparisonKey }=await import('../src/main/performance/scenarioRunner.js');
  const a={files:{model:{sha256:'a'}},packages:{torch:'2.9.1'},settings:{ngl:0,threads:8,ctxSize:4096}};
  const b={...a,packages:{torch:'2.9.1+cu128'},settings:{ngl:99,threads:16,ctxSize:4096}};
  assert.equal(comparisonKey('recipe',a,'4'),comparisonKey('recipe',b,'4'));
  assert.notEqual(comparisonKey('recipe',a,'4'),comparisonKey('recipe',{...b,settings:{ctxSize:8192}},'4'));
});

test('automatic activity continues across selected tests and snapshots', async t => {
  const f = fixture(t);
  const activity = f.journal.start({cpu:{brand:'test'}}, '4');
  const suite = await f.runner.start({categories:['Text'], scenarioIds:['text-explain']});
  f.journal.begin('/image/turbo', {width:512})('completed', {elapsedMs:100});
  const result = await f.done;
  assert.equal(result.suite.cases.length, 1);
  assert.equal(f.calls.length, 3);
  assert.equal(f.journal.report(activity.id).samples.length, 1);
  assert.equal(f.journal.report(activity.id).status, 'recording');
  f.journal.begin('/video/quality')('completed', {});
  const snapshot = f.journal.snapshot(activity.id);
  assert.equal(snapshot.samples.length, 2);
  assert.equal(snapshot.status, 'stopped');
  assert.equal(f.journal.report(activity.id).status, 'recording');
  assert.notEqual(suite.id, activity.id);
});
test('scenario selection rejects unknown or category-mismatched IDs', () => {
  assert.throws(() => selectScenarios(['Text'], ['video-wan']));
  assert.throws(() => selectScenarios(['Text'], []));
  assert.deepEqual(selectScenarios(['Text'], ['text-explain']).map(s => s.id), ['text-explain']);
});
test('decoding speed excludes first pass and failed measurements', () => {
  const result = scenarioSummary({trials:[
    {phase:'warmup',status:'completed',metrics:{tokensPerSecond:999}},
    {phase:'measurement',status:'completed',metrics:{tokensPerSecond:10}},
    {phase:'measurement',status:'completed',metrics:{tokensPerSecond:20}},
    {phase:'measurement',status:'failed',metrics:{tokensPerSecond:100}}
  ]});
  assert.equal(result.tokensPerSecond, 15);
});
