import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowRecovery, workflowBridgeReady, WORKFLOW_RECOVERED_MESSAGE } from '../src/services/company/workflowRecovery.js';
import { createWorkflowResultCapture } from '../src/services/company/workflowResults.js';

const skillId = 'meditation-forge-v1.0.0';
const task = { companyId: 'wellness', issueId: 'evening-session', skillId };
const clone = value => structuredClone(value);
function fixture() {
  const disk = new Map(), writes = [];
  const api = {
    store: { get: async (key, fallback) => clone(disk.get(key) ?? fallback), set: async (key, data) => { disk.set(key, clone(data)); return true; } },
    db: { blobs: {
      write: async (data, ext) => { writes.push({ data, ext }); return { path: `/durable/blob-${writes.length}.${ext}` }; },
      writeFromPath: async (path, ext) => { writes.push({ path, ext }); return { path: `/durable/blob-${writes.length}.${ext}` }; },
    }, issues: {} },
  };
  return { api, disk, writes, recovery: scope => createWorkflowRecovery(scope, () => api) };
}
const response = { contentIds: ['script', 'audio'], issue: { id: task.issueId, status: 'blocked' } };

test('stale desktop bridge backs up bytes and reopens the exact task without regenerating or approving', async () => {
  const f = fixture(), states = [];
  assert.equal(workflowBridgeReady(f.api), false);
  const first = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: () => { throw Error(WORKFLOW_RECOVERED_MESSAGE); }, onState: state => states.push(state) });
  await first.capture(skillId, { id: 'generation-A', script: 'Breathe slowly. Finish this sentence.', audioSrc: 'data:audio/wav;base64,YXVkaW8=', imageSrc: '/temporary/cover.png' });
  assert.equal(states.at(-1).error, WORKFLOW_RECOVERED_MESSAGE);
  assert.equal(states.at(-1).canRetry, true);
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.writes[0], { data: 'data:audio/wav;base64,YXVkaW8=', ext: 'wav' });
  const manifest = [...f.disk.values()][0];
  assert.ok(!JSON.stringify(manifest).includes('YXVkaW8='));
  assert.ok(!JSON.stringify(manifest).includes('/temporary/'));
  assert.deepEqual(await f.recovery({ ...task, issueId: 'different-task' }).load(), []);
  assert.deepEqual(await f.recovery({ ...task, companyId: 'different-team' }).load(), []);
  const saved = [];
  f.api.db.issues = { saveWorkflowResult: async (...args) => { saved.push(args); return response; }, reviewWorkflowResult: () => { throw Error('Must not approve'); } };
  assert.equal(workflowBridgeReady(f.api), true);
  const reopened = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: f.api.db.issues.saveWorkflowResult });
  await reopened.restore();
  assert.deepEqual(saved[0].slice(0, 2), [task.companyId, task.issueId]);
  assert.equal(saved[0][2].sourceId, manifest.pending[0].sourceId);
  assert.equal(saved[0][2].artifacts[1].payload, '/durable/blob-1.wav');
  assert.deepEqual(await f.recovery(task).load(), []);
  assert.equal(f.writes.length, 2, 'A replay does not regenerate or recopy media');
});

test('all later outputs remain recoverable while the first save is blocked', async () => {
  const f = fixture();
  const capture = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: () => { throw Error('Disk is busy'); } });
  await capture.capture(skillId, { script: 'First result.' });
  await capture.capture(skillId, { script: 'Second result.' });
  await capture.capture(skillId, { script: 'Second result.' });
  assert.equal((await f.recovery(task).load()).length, 2);
  const saved = [];
  await createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: async (company, issue, input) => { saved.push(input); return response; } }).restore();
  assert.match(saved[0].artifacts[0].payload, /First result/);
  assert.match(saved[1].artifacts[0].payload, /Second result/);
  assert.deepEqual(await f.recovery(task).load(), []);
});

test('a missing database acknowledgement keeps the journal until a successful retry', async () => {
  const f = fixture(); let ack = false;
  const states = [];
  const capture = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: async () => ack ? response : {}, onState: value => states.push(value) });
  await capture.capture(skillId, { script: 'Keep this result.' });
  assert.equal((await f.recovery(task).load()).length, 1);
  assert.match(states.at(-1).error, /could not be saved/);
  ack = true; await capture.retry();
  assert.deepEqual(await f.recovery(task).load(), []);
  assert.equal(states.at(-1).error, '');
});

test('media backup failure never claims restart recovery and retains a retryable in-memory result', async () => {
  const f = fixture(), states = []; let saved = 0;
  const write = f.api.db.blobs.write; f.api.db.blobs.write = async () => null;
  const capture = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: async () => { saved++; return response; }, onState: value => states.push(value) });
  await capture.capture(skillId, { script: 'Keep the task open.', audioSrc: 'data:audio/wav;base64,YXVkaW8=' });
  assert.equal(saved, 0); assert.equal(states.at(-1).canRetry, true);
  assert.match(states.at(-1).error, /could not be backed up/);
  assert.deepEqual(await f.recovery(task).load(), []);
  f.api.db.blobs.write = write; await capture.retry();
  assert.equal(saved, 1); assert.equal(states.at(-1).error, '');
});

test('overlapping outputs cannot overwrite each other in the local recovery journal', async () => {
  const f = fixture(), a = f.recovery(task), b = f.recovery(task);
  await Promise.all([a.stage({ sourceId: 'a', artifacts: [{ pipeline: 'text', payload: 'A', meta: { payloadEncoding: 'text' } }] }), b.stage({ sourceId: 'b', artifacts: [{ pipeline: 'text', payload: 'B', meta: { payloadEncoding: 'text' } }] })]);
  assert.deepEqual((await a.load()).map(item => item.sourceId), ['a', 'b']);
  await a.remove('a'); assert.deepEqual((await b.load()).map(item => item.sourceId), ['b']);
});

test('new output disables review synchronously while media is still being backed up', async () => {
  const f = fixture(), states = [];
  let finish;
  f.api.db.blobs.write = async () => new Promise(resolve => { finish = () => resolve({ path: '/durable/new-audio.wav' }); });
  const capture = createWorkflowResultCapture({ taskContext: task, recovery: f.recovery(task), save: async () => response, onState: state => states.push(state) });
  const saving = capture.capture(skillId, { script: 'A revised ending.', audioSrc: 'data:audio/wav;base64,YXVkaW8=' });
  assert.equal(states.at(-1).saving, true, 'The older result cannot be approved while the new bytes are still in flight');
  for (let attempt = 0; !finish && attempt < 20; attempt++) await Promise.resolve();
  assert.ok(finish); finish(); await saving;
  assert.equal(states.at(-1).saving, false);
  assert.equal(states.at(-1).error, '');
});
