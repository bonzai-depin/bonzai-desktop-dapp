import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactKind, artifactFilename, artifactSource, artifactPlainText, artifactReviewState, resultLibrarySections } from '../src/services/company/artifactMedia.js';

test('results expose creations first and keep operational records out of creative workflow teams', () => {
  assert.deepEqual(resultLibrarySections({ workspace: { profile: 'finance', executionWorkflowId: 'meditation' } }).map(row => row.key), ['assets', 'work']);
  assert.deepEqual(resultLibrarySections({ workspace: { profile: 'hvac' } }).map(row => row.key), ['assets', 'work', 'documents']);
  assert.deepEqual(resultLibrarySections().map(row => row.key), ['assets', 'work']);
});

test('saved media is downloaded as actual bytes and keeps the correct extension', async () => {
  const bytes = Uint8Array.from([82, 73, 70, 70, 4, 0, 0, 0]);
  const row = { id: 'narration', pipeline: 'audio', blobId: 'local-blob', blobExt: 'wav', meta: { title: 'Morning meditation — narration' } };
  const calls = [];
  const source = await artifactSource(row, { db: { blobs: { read: async (...args) => { calls.push(args); return bytes; } } } });
  try {
    assert.deepEqual(new Uint8Array(await (await fetch(source.url)).arrayBuffer()), bytes, 'Never a metadata JSON file named .wav');
    assert.equal((await fetch(source.url)).headers.get('content-type'), 'audio/wav');
    assert.equal(artifactFilename(row), 'Morning meditation — narration.wav');
    assert.deepEqual(calls, [['local-blob', 'wav']]);
  } finally { source.release(); }
  const png = { pipeline: 'image', payload: 'data:image/png;base64,aW1hZ2U=', meta: { title: 'cover' } };
  assert.equal(artifactFilename(png), 'cover.png');
  assert.equal((await artifactSource(png)).url, png.payload);
});

test('file errors are visible instead of producing empty or remote previews', async () => {
  await assert.rejects(artifactSource({ pipeline: 'video', blobId: 'missing', blobExt: 'mp4' }, { db: { blobs: { read: async () => { throw Error('File not found'); } } } }), /File not found/);
  await assert.rejects(artifactSource({ pipeline: 'audio' }), /empty or unavailable/);
  await assert.rejects(artifactSource({ pipeline: 'image', payload: 'https://tracking.example/remote.png' }), /empty or unavailable/);
  assert.equal(artifactKind({ pipeline: 'code' }), 'code');
  assert.equal(artifactKind({ pipeline: 'music' }), 'audio');
});

test('review badges reflect the exact version approved rather than all outputs in a finished task', () => {
  const row = { id: 'audio-v2', meta: { issueId: 'meditation' } };
  const task = { id: 'meditation', status: 'blocked', execution: { steps: [{ reviews: [{ decision: 'completed', contentIds: ['audio-v1'] }], output: { status: 'ready_for_review', contentIds: ['audio-v2'] } }] } };
  assert.equal(artifactReviewState(row, [task]).label, 'Awaiting review');
  assert.equal(artifactReviewState({ ...row, id: 'audio-v1' }, [task]).label, 'Approved');
  assert.equal(artifactReviewState({ ...row, id: 'discarded-draft' }, [{ ...task, status: 'done' }]).label, 'Saved');
  assert.equal(artifactReviewState(row, [{ ...task, id: 'another-workspace-task' }]).issue, null);
});


test('text saved as a blob can be previewed and copied without exposing private reasoning', async () => {
  const row = { id: 'script', pipeline: 'text', blobId: 'text-blob', blobExt: 'md' };
  const value = await artifactPlainText(row, { db: { blobs: { read: async () => new TextEncoder().encode('<think>private</think>\n# Evening calm\n\nBreathe slowly.') } } });
  assert.equal(value, '# Evening calm\n\nBreathe slowly.');
});
