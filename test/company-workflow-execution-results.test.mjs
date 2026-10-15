import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCompanyWorkflow } from '../src/services/company/workflowExecution.js';
import { createTaskExecution, executionOutcome, runTaskExecution } from '../src/services/company/taskExecution.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSAAAAAASUVORK5CYII=';
function fixture(payload, overrides = {}) {
  const calls = { saved: [], blobs: [], context: null, released: 0, executed: 0 };
  const skill = { id: 'fixture-workflow', name: 'Illustrated story', execution: { type: 'javascript', execute() {} } };
  const deps = {
    catalog: async () => [skill], agents: async () => [{ id: 'agent' }], checkModels: async () => {},
    lock: async () => () => calls.released++,
    service: async () => ({ validateSkillInputs: () => ({ valid: true, normalizedInputs: { brief: 'Create the requested story' } }), executeSkill: async (_id, _inputs, context) => {
      calls.executed++; calls.context = context; return { success: true, result: payload };
    } }),
    blobs: {
      write: async (...args) => { calls.blobs.push({ type: 'inline', args }); return { id: 'inline-blob' }; },
      writeFromPath: async (...args) => { calls.blobs.push({ type: 'path', args }); return { id: 'file-blob' }; },
    },
    save: async (companyId, value) => { const record = { id: `record-${calls.saved.length + 1}`, companyId, ...value }; calls.saved.push(record); return record; },
    ...overrides,
  };
  const run = context => executeCompanyWorkflow({ id: 'team', roles: { Author: { companion: 'agent' } } }, 'Author', 'agent', { workflowId: skill.id }, { issueId: 'task', pendingId: 'approval', ...context }, deps);
  return { calls, deps, run };
}

test('mixed model results save successful work and block subsequent execution instead of claiming completion', async () => {
  const sample = fixture({ prompt: 'Compare answers', results: [
    { filename: 'first.gguf', response: 'A finished source-backed answer.', success: true },
    { filename: 'second.gguf', response: '', success: false, error: 'Model unavailable' },
  ] });
  const output = await sample.run();
  assert.equal(output.ok, false);
  assert.equal(output.status, 'requires_input');
  assert.equal(sample.calls.saved.length, 1);
  assert.match(sample.calls.saved[0].payload, /finished source-backed answer/);
  assert.equal(sample.calls.saved[0].meta.incomplete, true);
  assert.deepEqual(output.contentIds, ['record-1']);
  assert.deepEqual(output.partialResult.contentIds, output.contentIds);
  assert.match(JSON.stringify(output.partialResult), /Model unavailable/);
  assert.match(output.error, /were saved.*incomplete/);
  const execution = await runTaskExecution({
    execution: createTaskExecution([{ type: 'runWorkflow', workflowId: 'fixture-workflow' }, { type: 'publishContent' }]),
    save: async () => {}, gate: async () => ({ pass: true }), dispatch: async action => {
      assert.equal(action.type, 'runWorkflow', 'a partial workflow cannot release later publishing actions'); return output;
    },
  });
  assert.equal(executionOutcome(execution), 'blocked');
  assert.equal(execution.steps[0].status, 'requires_input');
  assert.equal(execution.steps[1].status, 'planned');
  assert.equal(sample.calls.released, 1);
});

test('all-failed and empty model responses never invent a saved partial deliverable', async () => {
  for (const results of [[], [{ success: false, error: 'No model available' }], [{ filename: 'model.gguf', response: '', durationMs: 200, tokensPerSecond: 0, success: true }]]) {
    const sample = fixture({ results });
    const output = await sample.run();
    assert.equal(output.ok, false);
    assert.deepEqual(output.contentIds, []);
    assert.equal(sample.calls.saved.length, 0);
    assert.match(output.error, /No workflow deliverable was saved/);
  }
});

test('nested built-in image results and generated audio become durable separate media records', async () => {
  const sample = fixture({ story: { title: 'Forest', scenes: [{ narrative: 'The forest awakens.', image: png }], narration: '/tmp/story-narration.WAV' } });
  const output = await sample.run();
  assert.equal(output.ok, true);
  assert.equal(output.status, 'completed');
  assert.deepEqual(sample.calls.saved.map(record => record.pipeline), ['text', 'image', 'audio']);
  const [summary, image, audio] = sample.calls.saved;
  assert.ok(!summary.payload.includes(png), 'binary media is never stored inside JSON text');
  assert.ok(!summary.payload.includes('/tmp/story-narration.WAV'));
  assert.equal(image.blobId, 'inline-blob');
  assert.equal(image.blobExt, 'png');
  assert.equal(image.payload, null);
  assert.equal(audio.blobId, 'file-blob');
  assert.equal(audio.blobExt, 'wav');
  assert.equal(audio.meta.localPath, undefined);
  assert.equal(audio.meta.payloadEncoding, 'blob');
  assert.deepEqual(sample.calls.blobs.map(call => call.type), ['inline', 'path']);
  assert.equal(sample.calls.blobs[1].args[0], '/tmp/story-narration.WAV');
  assert.equal(sample.calls.blobs[1].args[2].sourceId, 'task');
  for (const record of sample.calls.saved) {
    assert.equal(record.companyId, 'team'); assert.equal(record.issueId, 'task');
    assert.equal(record.role, 'Author'); assert.equal(record.companion, 'agent');
    assert.equal(record.meta.companyId, 'team'); assert.equal(record.meta.issueId, 'task');
    assert.equal(record.meta.approved, true);
  }
});

test('silent missing media in a built-in workflow saves its text but keeps the task incomplete', async () => {
  const sample = fixture({ success: true, story: { title: 'Forest', scenes: [{ narrative: 'A complete scene.', image: null }], narration: null } });
  const output = await sample.run();
  assert.equal(output.ok, false);
  assert.equal(output.status, 'requires_input');
  assert.match(sample.calls.saved[0].payload, /complete scene/);
  assert.match(output.error, /requested media output is missing/);
  assert.equal(output.partialResult.failures.length, 2);
});

test('unavailable remote media cannot trigger a fetch or discard an otherwise usable script', async () => {
  const sample = fixture({ script: 'A finished local script.', audioSrc: 'https://example.invalid/audio.wav' });
  const output = await sample.run();
  assert.equal(output.ok, false);
  assert.equal(output.status, 'requires_input');
  assert.equal(sample.calls.blobs.length, 0);
  assert.equal(sample.calls.saved.length, 1);
  assert.match(sample.calls.saved[0].payload, /finished local script/);
  assert.ok(!sample.calls.saved[0].payload.includes('https://'));
  assert.match(output.error, /not available as a local file/);
});

test('storage failures retain actual saved IDs and never complete the workflow', async () => {
  const sample = fixture({ text: 'Keep this finished script.', image: `data:image/png;base64,${png}`, audio_path: '/tmp/narration.wav' });
  sample.deps.blobs.write = async () => { throw new Error('Image storage is full'); };
  const output = await sample.run();
  assert.equal(output.ok, false);
  assert.equal(output.status, 'requires_input');
  assert.deepEqual(sample.calls.saved.map(record => record.pipeline), ['text', 'audio']);
  assert.deepEqual(output.contentIds, ['record-1', 'record-2']);
  assert.match(output.error, /Image storage is full/);
  assert.equal(sample.calls.released, 1);
  const noStorage = fixture({ text: 'Completed draft' }, { save: async () => null });
  const missing = await noStorage.run();
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.contentIds, []);
  assert.match(missing.error, /No workflow deliverable was saved/);
});

test('invalid inline media cannot become a completed empty or mislabeled blob', async () => {
  for (const image of ['data:image/png;base64,a', 'data:image/unknown;base64,YWJj']) {
    const sample = fixture({ text: 'Keep the verified narrative.', image });
    const output = await sample.run();
    assert.equal(output.ok, false);
    assert.equal(output.status, 'requires_input');
    assert.equal(sample.calls.blobs.length, 0);
    assert.equal(sample.calls.saved.length, 1);
    assert.match(output.error, /invalid base64|format is unsupported/);
  }
});

test('worker output shares normalization but never writes into a company catalog', async () => {
  const sample = fixture({ text: 'Worker narrative', image: `data:image/png;base64,${png}` });
  const output = await sample.run({ workerExecution: true });
  assert.equal(output.ok, true);
  assert.match(output.text, /Worker narrative/);
  assert.equal(output.artifacts[0].pipeline, 'image');
  assert.equal(sample.calls.saved.length, 0);
  assert.equal(sample.calls.blobs.length, 0);
  const partial = fixture({ results: [{ text: 'Useful answer', success: true }, { success: false, error: 'Second worker failed' }] });
  const incomplete = await partial.run({ workerExecution: true });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.status, 'requires_input');
  assert.match(incomplete.text, /Useful answer/);
  assert.doesNotMatch(incomplete.error, /saved/i);
});
