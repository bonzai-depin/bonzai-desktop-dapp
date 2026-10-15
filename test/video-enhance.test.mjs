import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceVideo, videoEnhanceSource } from '../src/services/videoEnhance.js';

const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('existing legacy enhancements can try SeedVR2 using their original clip', () => {
  assert.equal(videoEnhanceSource({ enhanced: true, enhanced_from: '/original.mp4', video_path: '/esrgan.mp4' }), '/original.mp4');
  assert.equal(videoEnhanceSource({ video_path: '/original.mp4' }), '/original.mp4');
  assert.equal(videoEnhanceSource({ enhancement_backend: 'seedvr2', video_path: '/restored.mp4' }), null);
});

test('a multi-minute checkpoint download completes without repeatedly submitting inference', async () => {
  const calls = [], progress = [];
  let clock = 0, polls = 0;
  const result = await enhanceVideo({ baseUrl: 'http://local', videoPath: '/clip.mp4', headers: { Authorization: 'test' },
    now: () => clock, wait: async () => { clock += 30_000; },
    onProgress: item => progress.push(item),
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      if (url.includes('/downloads/status/')) return reply({ status: ++polls < 8 ? 'downloading' : 'completed' });
      if (!polls) return reply({ pipeline_id: 'seedvr2' }, 202);
      return reply({ video_path: '/enhanced.mp4', backend: 'seedvr2' });
    } });
  assert.equal(result.backend, 'seedvr2');
  assert.equal(calls.filter(call => call.request.method === 'POST').length, 2);
  assert.equal(clock, 240_000);
  assert.ok(progress.some(item => item.stage === 'downloading'));
  assert.equal(JSON.parse(calls[0].request.body).interp_factor, 1);
  assert.equal(calls[1].request.headers.Authorization, 'test');
});

test('failed or cancelled downloads never start restoration', async () => {
  for (const status of ['failed', 'cancelled']) {
    let posts = 0;
    await assert.rejects(enhanceVideo({ baseUrl: 'http://local', videoPath: '/clip.mp4', wait: async () => {},
      fetchImpl: async (_url, request) => request.method === 'POST'
        ? (++posts, reply({ pipeline_id: 'seedvr2' }, 202)) : reply({ status }) }), new RegExp(status));
    assert.equal(posts, 1);
  }
});

test('missing output and runtime errors are surfaced, not marked enhanced', async () => {
  for (const response of [reply({}), reply({ error: 'seedvr2_runtime_missing', message: 'Install updated dependencies.' }, 503)]) {
    await assert.rejects(enhanceVideo({ baseUrl: 'http://local', videoPath: '/clip.mp4', fetchImpl: async () => response }));
  }
});

test('expired download wait does not cancel the download or resubmit generation', async () => {
  let clock = 0;
  const calls = [];
  await assert.rejects(enhanceVideo({ baseUrl: 'http://local', videoPath: '/clip.mp4', downloadTimeoutMs: 1,
    now: () => clock, wait: async () => { clock = 2; }, fetchImpl: async (url, request) => {
      calls.push(url);
      return request.method === 'POST' ? reply({ pipeline_id: 'seedvr2' }, 202) : reply({ status: 'downloading' });
    } }), /still in progress/);
  assert.equal(calls.length, 2);
  assert.ok(!calls.some(url => url.includes('cancel')));
});
