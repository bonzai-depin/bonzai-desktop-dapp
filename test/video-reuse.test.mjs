import test from 'node:test';
import assert from 'node:assert/strict';
import { videoReuseSettings } from '../src/services/videoReuse.js';

test('reuse retains the reference and original parameters after video enhancement', () => {
  const result = videoReuseSettings({
    question: 'Original scene', width: 1280, height: 720, fps: 32,
    generationSettings: {
      engine: 'quality', mode: 'i2v', quality: '512x320', duration: 15,
      autoEnhance: true, imageName: 'reference.jpg',
      request: { prompt: 'Original scene', image_base64: 'data:image/jpeg;base64,aGVsbG8=',
        fps: 16, width: 512, height: 320, num_inference_steps: 4, guidance_scale: 1, seed: 0 },
    }, answer: { data: { enhanced: true, width: 1280, height: 720, fps: 32 } },
  });
  assert.equal(result.image, 'aGVsbG8=');
  assert.equal(result.imageName, 'reference.jpg');
  assert.equal(result.quality, '512x320');
  assert.equal(result.duration, 15);
  assert.equal(result.fps, 16);
  assert.equal(result.autoEnhance, true);
  assert.deepEqual(result.sampling, { seed: 0, num_inference_steps: 4, guidance_scale: 1 });
});

test('old records restore available settings and explicitly clear an unrelated image', () => {
  const result = videoReuseSettings({ question: 'Landscape', model: 'ltx-2', mode: 't2v', quality: '720p', duration: 10, fps: 24 });
  assert.equal(result.prompt, 'Landscape');
  assert.equal(result.image, '');
  assert.equal(result.mode, 't2v');
  assert.equal(result.engine, 'fast');
  assert.equal(result.quality, '720p');
  assert.equal(result.fps, 24);
});

test('reuse of imported history cannot restore license consent or transport options', () => {
  const result = videoReuseSettings({ generationSettings: { engine: 'sota', request: {
    license_accepted: true, auto_download: true, seed: 42, guidance_scale: 'invalid',
  } } });
  assert.deepEqual(result.sampling, { seed: 42 });
});
