import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowResultCapture, workflowResultArtifacts, workflowResultInput } from '../src/services/company/workflowResults.js';

const meditationId = 'meditation-forge-v1.0.0';
const context = () => ({ companyId: 'wellness-team', issueId: 'session-task', skillId: meditationId, agentId: 'guide' });
const savedResponse = { issue: { id: 'session-task', status: 'blocked' }, contentIds: ['script', 'audio'], records: [] };

test('meditation saves the readable script and real media without duplicating media in JSON', () => {
  const image = 'data:image/png;base64,aW1hZ2U=';
  const output = workflowResultArtifacts(meditationId, {
    title: 'Quiet morning', script: 'Breathe slowly.', scenarioName: 'Forest', duration: 5,
    audioSrc: 'http://localhost:65000/media/stream?path=%2Ftmp%2Fmeditation.wav', imageSrc: image,
  });
  assert.deepEqual(output.map(row => row.pipeline), ['text', 'audio', 'image']);
  assert.match(output[0].payload, /Breathe slowly/);
  assert.ok(!output[0].payload.includes('base64'));
  assert.equal(output[1].meta.localPath, '/tmp/meditation.wav');
  assert.equal(output[1].meta.payloadEncoding, 'path');
  assert.equal(output[2].payload, image);
});

test('Windows and Unix generated video files remain local file artifacts', () => {
  for (const video_path of ['/tmp/finger-frame.mp4', 'C:\\Users\\owner\\Videos\\finger-frame.mp4']) {
    const output = workflowResultArtifacts('finger-frame-director-v1.0.0', { video_path, coverage: 0.95 });
    assert.equal(output[1].pipeline, 'video');
    assert.equal(output[1].meta.localPath, video_path);
    assert.ok(!output[0].payload.includes(video_path));
  }
});

test('unresolved media is rejected instead of claiming that the media was saved', () => {
  for (const audioSrc of ['https://example.org/media/stream?path=%2Ftmp%2Fprivate.wav', 'blob:temporary', 'file:///tmp/media.wav', 'relative.wav']) {
    assert.throws(() => workflowResultArtifacts('custom-workflow', { audioSrc }), /not available as a local file/);
  }
});

test('stream raw audio is converted to a typed data URI for durable storage', () => {
  const output = workflowResultArtifacts('live-streaming-v1.0.0', { type: 'audio', data: 'YXVkaW8=', prompt: 'Welcome' });
  assert.equal(output[1].payload, 'data:audio/wav;base64,YXVkaW8=');
  assert.ok(!output[0].payload.includes('YXVkaW8='));
});

test('caption output preserves the full transcript and playable subtitle timing', () => {
  const session = { filename: 'clip.mp4', duration: 12, captureInterval: 2, createdAt: 'first', transcript: [
    { timestamp: 0, text: 'Opening scene' }, { timestamp: 4.25, text: 'A forest' },
  ] };
  const first = workflowResultInput('video-captioning-v1.0.0', session);
  assert.equal(first.artifacts.length, 2);
  assert.match(first.artifacts[0].payload, /A forest/);
  assert.match(first.artifacts[1].payload, /00:00:04,250 --> 00:00:06,250/);
  assert.equal(first.artifacts[1].meta.format, 'srt');
  assert.equal(workflowResultInput('video-captioning-v1.0.0', { ...session, createdAt: 'saved again on reset' }).sourceId, first.sourceId);
});

test('result identity is content-based and independent of object property order', () => {
  const first = workflowResultInput('analysis', { name: 'Card', analysis: { grade: 8, condition: 'Good' } });
  const second = workflowResultInput('analysis', { analysis: { condition: 'Good', grade: 8 }, name: 'Card' });
  assert.equal(first.sourceId, second.sourceId);
  assert.notEqual(workflowResultInput('analysis', { name: 'Card', analysis: { grade: 7, condition: 'Good' } }).sourceId, first.sourceId);
});

test('generation provenance distinguishes a newly generated file at a reused path', () => {
  const result = { title: 'Session', script: 'Breathe slowly.', audioSrc: '/tmp/session.wav', id: 'generation-1' };
  assert.notEqual(workflowResultInput(meditationId, result).sourceId, workflowResultInput(meditationId, { ...result, id: 'generation-2' }).sourceId);
  assert.equal(workflowResultInput(meditationId, result).artifacts[0].meta.generationId, 'generation-1');
});

test('failed, empty and acknowledgement-only results cannot become deliverables', () => {
  for (const result of [null, {}, '', [], { success: true, status: 'completed' }, { error: 'Failed' }, { isError: true }]) {
    assert.throws(() => workflowResultArtifacts(meditationId, result), /successful result|no deliverable/);
  }
});

test('standalone generation and another workflow never write company results', async () => {
  let writes = 0;
  const save = async () => { writes++; return savedResponse; };
  await createWorkflowResultCapture({ taskContext: null, save }).capture(meditationId, { script: 'Private meditation' });
  await createWorkflowResultCapture({ taskContext: context(), save }).capture('another-workflow', { script: 'Other output' });
  assert.equal(writes, 0);
});

test('a failed save stays retryable with the original task and immutable output', async () => {
  const task = context(), writes = [], updates = [], successes = [];
  let fail = true;
  const capture = createWorkflowResultCapture({
    taskContext: task,
    save: async (...args) => { writes.push(args); if (fail) throw new Error('Database unavailable'); return savedResponse; },
    onState: value => updates.push(value), onSaved: value => successes.push(value),
  });
  const result = { title: 'Original', script: 'Breathe slowly.' };
  await capture.capture(meditationId, result);
  assert.equal(updates.at(-1).error, 'Database unavailable');
  assert.equal(successes.length, 0);
  task.companyId = 'another-team'; task.issueId = 'another-task'; result.script = 'Changed after generation';
  fail = false;
  await capture.retry();
  assert.deepEqual(writes.map(call => call.slice(0, 2)), [['wellness-team', 'session-task'], ['wellness-team', 'session-task']]);
  assert.equal(writes[0][2].sourceId, writes[1][2].sourceId);
  assert.match(writes[1][2].artifacts[0].payload, /Breathe slowly/);
  assert.deepEqual(successes, [savedResponse]);
  assert.deepEqual(updates.at(-1), { saving: false, error: '', canRetry: false });
});

test('saving only acknowledges durable receipt and never completes the task', async () => {
  const updates = [], successes = [];
  const capture = createWorkflowResultCapture({ taskContext: context(), save: async () => ({ issue: { status: 'done' } }), onState: value => updates.push(value), onSaved: value => successes.push(value) });
  await capture.capture(meditationId, { script: 'Breathe slowly.' });
  assert.match(updates.at(-1).error, /could not be saved/);
  assert.equal(successes.length, 0);
});

test('concurrent successful results are queued, deduplicated and saved in order', async () => {
  const writes = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const capture = createWorkflowResultCapture({ taskContext: context(), save: async (_company, _issue, input) => {
    writes.push(input);
    if (writes.length === 1) await blocked;
    return savedResponse;
  } });
  const first = capture.capture(meditationId, { script: 'First meditation' });
  await capture.capture(meditationId, { script: 'First meditation' });
  await capture.capture(meditationId, { script: 'Second meditation' });
  assert.equal(writes.length, 1);
  release(); await first;
  assert.equal(writes.length, 2);
  assert.match(writes[1].artifacts[0].payload, /Second meditation/);
  await capture.capture(meditationId, { script: 'First meditation' });
  assert.equal(writes.length, 2);
});

test('a valid saved result clears a later normalization error without saving a duplicate', async () => {
  let writes = 0;
  const updates = [];
  const capture = createWorkflowResultCapture({ taskContext: context(), save: async () => { writes++; return savedResponse; }, onState: value => updates.push(value) });
  const result = { script: 'Breathe slowly.' };
  await capture.capture(meditationId, result);
  await capture.capture(meditationId, { script: 'Breathe slowly.', audioSrc: 'blob:expired' });
  assert.match(updates.at(-1).error, /not available as a local file/);
  assert.equal(updates.at(-1).canRetry, false);
  await capture.capture(meditationId, result);
  assert.equal(updates.at(-1).error, '');
  assert.equal(writes, 1);
});

test('valid replacement resumes after normalization failure but never retries a failed save implicitly', async () => {
  let writes = 0, fail = true;
  const updates = [];
  const capture = createWorkflowResultCapture({ taskContext: context(), save: async () => { writes++; if (fail) throw new Error('Disk full'); return savedResponse; }, onState: value => updates.push(value) });
  await capture.capture(meditationId, { audioSrc: 'blob:expired' });
  await capture.capture(meditationId, { script: 'First meditation' });
  assert.equal(writes, 1);
  assert.equal(updates.at(-1).error, 'Disk full');
  assert.equal(updates.at(-1).canRetry, true);
  await capture.capture(meditationId, { audioSrc: 'blob:expired' });
  await capture.capture(meditationId, { script: 'First meditation' });
  await capture.capture(meditationId, { script: 'Second meditation' });
  assert.equal(writes, 1);
  assert.equal(updates.at(-1).error, 'Disk full');
  fail = false;
  await capture.retry();
  assert.equal(writes, 3);
  assert.equal(updates.at(-1).error, '');
  assert.equal(updates.at(-1).canRetry, false);
});
