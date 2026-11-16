import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterMedia, mediaCategory } from '../src/main/openrouterMedia.js';
const image = { id: 'images/test', architecture: { input_modalities: ['text', 'image'] } };
const speech = { id: 'speech/test' };
const video = { id: 'video/test', supported_durations: [5], supported_aspect_ratios: ['16:9'], supported_frame_images: ['first_frame'] };
function fixture(overrides = {}) {
 const entries = new Map(), calls = [], files = [];
 const state = { active: true, consent: true, maxTokens: 512, mediaModels: { image: image.id, speech: speech.id, video: video.id, vision: 'vision/test' }, speechVoice: 'voice-test' };
 const store = { get: (key, fallback) => entries.get(key) ?? fallback, set: (key, value) => entries.set(key, value) };
 const request = async (path, options) => {
  const body = options?.body ? JSON.parse(options.body) : undefined; calls.push({ path, body });
  if (overrides[path]) return overrides[path](body);
  if (path === '/images/models') return Response.json({ data: [image] });
  if (path === '/models?output_modalities=speech') return Response.json({ data: [speech] });
  if (path === '/videos/models') return Response.json({ data: [video] });
  if (path === '/images') return Response.json({ data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/png' }], usage: { cost: 0.04 } });
  if (path === '/audio/speech') return new Response('mp3-bytes', { headers: { 'content-type': 'audio/mpeg' } });
  if (path === '/videos') return Response.json({ id: 'job-test', status: 'pending' });
  if (path === '/videos/job-test') return Response.json({ status: 'completed', usage: { cost: 0.5 } });
  if (path === '/videos/job-test/content') return new Response('video-bytes', { headers: { 'content-type': 'video/mp4' } });
  if (path === '/chat/completions') return Response.json({ choices: [{ message: { content: 'Image contents' } }] });
  throw Error(`Unexpected request ${path}`);
 };
 const api = createOpenRouterMedia({ request, status: () => state, store, models: async () => [{ id: 'vision/test', input: ['image', 'text'] }], sleep: async () => {}, saveMedia: async (bytes, ext, mime) => { files.push({ bytes, ext, mime }); return { path: `/saved/test.${ext}`, url: `bonzai-blob://test.${ext}` }; } });
 return { api, state, entries, calls, files };
}
test('image references are explicit; output retains real model, format and cost', async () => {
 const f = fixture(); const result = await f.api.generate('image_turbo_edit', { prompt: 'Watercolor', image_base64: 'aW1hZ2U=', width: 1024, height: 1024 });
 assert.equal(result.model, image.id); assert.equal(result.metadata.cost, 0.04); assert.equal(result.mime_type, 'image/png');
 assert.equal(f.calls.at(-1).body.input_references[0].image_url.url, 'data:image/png;base64,aW1hZ2U=');
 assert.equal(f.calls.at(-1).body.size, '1024x1024');
 await assert.rejects(f.api.generate('image_turbo', { prompt: 'test', image_base64: 'file:///private/image.png' }), /PNG/);
});
test('speech uses TTS catalogue and stores playable MP3 bytes locally', async () => {
 const f = fixture(); const result = await f.api.generate('audio_turbo', { text: 'Hello' });
 assert.equal(result.audio_path, '/saved/test.mp3'); assert.equal(f.files[0].mime, 'audio/mpeg'); assert.equal(f.calls.at(-1).body.voice, 'voice-test');
 assert.equal(result.metadata.cost, null); // Do not invent a zero cost for binary responses.
});
test('voice references are transmitted instead of replacing them with the default voice', async () => {
 const f = fixture(); await f.api.generate('audio_quality', { text: 'Hello', ref_audio_base64: 'YWJj', ref_text: 'Reference' });
 assert.equal(f.calls.at(-1).body.voice, undefined); assert.equal(f.calls.at(-1).body.input_references.length, 2);
});
test('video validates duration before spending and persists recoverable job IDs', async () => {
 const f = fixture(); await assert.rejects(f.api.generate('video_sota', { prompt: 'test', duration: 60 }), /supports 5/);
 assert.equal(f.calls.some(c => c.path === '/videos'), false);
 const result = await f.api.generate('video_sota', { prompt: 'test', duration: 5, width: 512, height: 288, image_base64: 'YWJj' });
 assert.equal(result.video_url, 'bonzai-blob://test.mp4'); assert.equal(f.api.jobs()[0].status, 'completed');
 assert.equal(f.calls.find(c => c.path === '/videos').body.frame_images[0].frame_type, 'first_frame');
 await f.api.resume('job-test'); assert.equal(f.calls.filter(c => c.path === '/videos').length, 1);
});
test('failed video download can be resumed without resubmitting or trusting remote URLs', async () => {
 let fail = true;
 const f = fixture({ '/videos/job-test/content': () => { if (fail) throw Error('offline'); return new Response('video', { headers: { 'content-type': 'video/mp4' } }); } });
 await assert.rejects(f.api.generate('video_fast', { prompt: 'test', duration: 5 }), /offline/);
 assert.equal(f.api.jobs()[0].status, 'pending'); fail = false; await f.api.resume('job-test');
 assert.equal(f.calls.filter(c => c.path === '/videos').length, 1);
});
test('vision requires an image-capable model; music is not misrouted to speech', async () => {
 const f = fixture(); assert.equal(mediaCategory('music'), null);
 const result = await f.api.generate('ocr', { image_base64: 'YWJj' }); assert.equal(result.text, 'Image contents');
 await assert.rejects(f.api.validateSelections({ image: 'nonexistent/model' }), /available/);
 f.state.active = false; const before = f.calls.length;
 await assert.rejects(f.api.generate('image_turbo', { prompt: 'test' }), /not enabled/); assert.equal(f.calls.length, before);
});
