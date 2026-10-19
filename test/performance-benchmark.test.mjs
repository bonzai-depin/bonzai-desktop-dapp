import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPerformanceJournal } from '../src/main/performance/journal.js';
import { summarizePipeline, numbersOnly, PARAMETER_KEYS, humanDuration } from '../src/shared/performanceReport.js';

function fixture(t) { const dir = mkdtempSync(path.join(os.tmpdir(), 'bonzai-benchmark-')); t.after(() => rmSync(dir, { recursive:true, force:true })); return createPerformanceJournal(dir); }
test('capture is opt-in; stopping never interrupts inference already measured', t => {
  const journal = fixture(t);
  assert.equal(journal.begin('/image/turbo'), null);
  const session = journal.start({ cpu: 'test' }, '4');
  assert.throws(() => journal.start({}, '4'), /already/);
  const end = journal.begin('/image/turbo', { width:512, prompt:'SECRET', image_path:'/private/file', seed:1 }, '/private/models/model.gguf');
  journal.stop();
  assert.equal(journal.begin('/video'), null);
  end('completed', { tokenCount:10, prompt:'SECRET' });
  const report = journal.report(session.id);
  assert.equal(report.samples.length,1); assert.equal(report.samples[0].status,'completed');
  assert.equal(report.samples[0].model,'model.gguf');
  assert.deepEqual(report.samples[0].parameters, { width:512, seed:1 });
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
  assert.equal(JSON.stringify(report).includes('/private'), false);
});
test('restart preserves evidence and marks unfinished requests interrupted', t => {
  const journal = fixture(t), session = journal.start({}, '4');
  journal.begin('llm/chat');
  journal.recover();
  assert.equal(journal.report(session.id).status,'interrupted');
  assert.equal(journal.report(session.id).samples[0].status,'interrupted');
  assert.equal(journal.begin('llm/chat'),null);
});
test('failed, accepted and cancelled jobs do not improve success latency', () => {
  const rows = [ {status:'failed',metrics:{elapsedMs:1}}, {status:'cancelled',metrics:{elapsedMs:2}}, {status:'accepted',metrics:{elapsedMs:3}}, {status:'completed',metrics:{elapsedMs:1200}}, {status:'completed',metrics:{elapsedMs:1800}} ];
  const result=summarizePipeline(rows); assert.equal(result.medianMs,1500); assert.equal(result.samples,5); assert.equal(result.failed,1); assert.equal(result.p95Ms,null);
});
test('malformed reports cannot escape the journal; archive only stores validated receipt', t => {
  const journal=fixture(t),session=journal.start({},'4');
  assert.throws(() => journal.report('../../secret'), /Invalid/);
  assert.throws(() => journal.archive(session.id, {url:'https://evil.test'}), /Invalid/);
  journal.archive(session.id,{url:'ipfs://bafyExample',secret:'SECRET'});
  assert.equal(JSON.stringify(journal.report(session.id)).includes('SECRET'),false);
});
test('numeric allowlists reject non-finite values, text and booleans', () => {
  assert.deepEqual(numbersOnly({width:NaN,height:Infinity,steps:true,seed:42,prompt:'secret'},PARAMETER_KEYS),{seed:42});
  assert.equal(humanDuration(null),'—'); assert.equal(humanDuration(90000),'1 min 30 s');
});
test('all registered multimodal inference routes are represented in the catalog', () => {
  const source=readFileSync(new URL('../src/server/diffuser.py',import.meta.url),'utf8');
  const catalog=JSON.parse(readFileSync(new URL('../src/shared/performanceCatalog.json',import.meta.url),'utf8'));
  const routes=[...source.matchAll(/@app.route\("([^\"]+)", methods=\["POST"\]\)/g)].map(m=>m[1]).filter(p => /^(\/image\/|\/audio\/|\/video|\/vision\/|\/forecast$|\/workflows\/finger-frame\/)/.test(p) && !p.endsWith('/unload'));
  for(const route of routes) assert.ok(catalog.some(item=>item.id===route),route);
});

test('distributed runtime calls cannot masquerade as local-only hardware measurements', t => {
  const journal=fixture(t), session=journal.start({},'4');
  journal.begin('llm/chat',{_distributed:true},'model.gguf')('completed');
  assert.equal(journal.report(session.id).samples[0].source,'distributed');
});

test('selected categories exclude unrelated work and persist report scope', t => {
  const journal = fixture(t);
  assert.throws(() => journal.start({}, '4', {categories: []}), /category/);
  assert.throws(() => journal.start({}, '4', {categories: ['Unknown']}), /category/);
  const session = journal.start({}, '4', {categories: ['Image']});
  assert.equal(journal.begin('/video/quality'), null);
  assert.equal(journal.begin('llm/chat'), null);
  journal.begin('/image/turbo')('completed');
  const report = journal.report(session.id);
  assert.deepEqual(report.categories, ['Image']);
  assert.equal(report.samples.length, 1);
  assert.ok(report.pipelines.includes('/image/turbo'));
  assert.ok(!report.pipelines.includes('/video/quality'));
});
