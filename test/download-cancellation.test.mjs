import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelLocalDownloads } from '../src/services/downloadCancellation.js';

test('cancel stops each tracked native transfer and pipeline once, without global discovery', async () => {
  const calls = [];
  await cancelLocalDownloads({ filenames: ['a.gguf', 'a.gguf'], pipelineIds: ['image-1', 'audio-2', 'image-1'], apiBase: 'http://local',
    electronAPI: { cancelModelDownload: async name => { calls.push(name); return true; } },
    request: async (url, options) => { calls.push(url); assert.equal(options.method, 'POST'); return { ok: true }; },
  });
  assert.deepEqual(calls.sort(), ['a.gguf', 'http://local/downloads/cancel/audio-2', 'http://local/downloads/cancel/image-1']);
});
test('one failed cancellation still attempts the remaining transfers and reports failure', async () => {
  const calls = [];
  await assert.rejects(cancelLocalDownloads({ filenames: ['a.gguf'], pipelineIds: ['image-1'], apiBase: 'http://local',
    electronAPI: { cancelModelDownload: async () => { throw Error('Cannot stop'); } },
    request: async url => { calls.push(url); return { ok: true }; },
  }), /Cannot stop/);
  assert.equal(calls.length, 1);
});
test('a native refusal cannot report cancellation while that transfer remains active', async () => {
  await assert.rejects(cancelLocalDownloads({ filenames: ['a.gguf'], electronAPI: {
    cancelModelDownload: async () => false, getActiveDownloads: async () => [{ filename: 'a.gguf', status: 'downloading' }],
  } }), /could not be stopped/);
  await cancelLocalDownloads({ filenames: ['a.gguf'], electronAPI: {
    cancelModelDownload: async () => false, getActiveDownloads: async () => [],
  } });
});
