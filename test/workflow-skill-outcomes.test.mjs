import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import * as vue from 'vue';

// Exercise the real setup functions with device and network boundaries stubbed.
// No inference, model loading, connection, download or wallet call reaches the app.
function loadSkill(name, { api = {}, fetch = async () => { throw Error('Unexpected network call'); }, internals = '', extra = {} } = {}) {
  const { descriptor, errors } = parse(fs.readFileSync(new URL(`../src/components/skills/${name}.vue`, import.meta.url), 'utf8'));
  assert.deepEqual(errors, []);
  const template = compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name });
  assert.deepEqual(template.errors, []);
  let code = descriptor.script.content.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '').replace('export default', 'return');
  if (internals) {
    const at = code.lastIndexOf('    return {');
    assert.ok(at >= 0);
    code = code.slice(0, at) + code.slice(at).replace('    return {', `    return { ${internals},`);
  }
  const timers = [];
  const bindings = {
    ...vue, onMounted: () => {}, onUnmounted: () => {}, onBeforeUnmount: () => {}, watch: () => {},
    window: { electronAPI: api }, fetch, getAuthHeaders: () => ({}), listAllLLMs: () => [],
    BonzaiPulse: {}, VueMarkdown: {}, BzCloseButton: {}, MintModal: {}, uuid: () => 'scan-id',
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval: () => {},
    canStartGeneration: () => true, startGeneration: () => true, stopGeneration: () => {},
    console: { warn() {}, error() {}, log() {} }, ...extra,
  };
  const entries = Object.entries(bindings).filter(([key]) => /^[A-Za-z_$][\w$]*$/.test(key) && key !== 'default');
  const component = new Function(...entries.map(([key]) => key), code)(...entries.map(([, value]) => value));
  const events = [];
  const state = component.setup({ skill: null, modelAvailable: true }, { emit: (event, payload) => events.push([event, payload]) });
  return { state, events, timers };
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('gesture effect saves both the generated scene and composite, never an empty success', async () => {
  const calls = []; let missing = true;
  const { state, events } = loadSkill('FingerFrameSkill', { fetch: async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    if (url.endsWith('/analyze')) return response({ duration: 5, keyframe_base64: 'aW1hZ2U=' });
    if (url.endsWith('/composite')) return response({ video_path: '/tmp/composite.mp4', coverage: 0.9 });
    return response(missing ? {} : { video_path: '/tmp/generated.mp4' });
  } });
  state.sourcePath.value = '/tmp/gesture.mp4';
  state.filename.value = 'gesture.mp4';
  await state.createEffect();
  assert.match(state.error.value, /no generated scene/);
  assert.equal(events.filter(([name]) => name === 'effect-created').length, 0);
  assert.equal(calls.some(([url]) => url.endsWith('/composite')), false);
  missing = false;
  await state.createEffect();
  const result = events.find(([name]) => name === 'effect-created')[1];
  assert.equal(result.video_path, '/tmp/composite.mp4');
  assert.equal(result.generatedScene.video_path, '/tmp/generated.mp4');
  assert.equal(result.sourceFilename, 'gesture.mp4');
  assert.equal(state.running.value, false);
});

test('caption playback saves full timed descriptions at pause/end and retains all cues locally', async () => {
  const writes = [];
  const { state, events } = loadSkill('VideoCaptioningSkill', {
    api: { store: { set: async (...args) => writes.push(args) } },
    internals: 'saveSessionHistory, formatSRT',
  });
  state.videoFilename.value = 'training.mp4';
  state.totalDuration.value = 250;
  state.captureInterval.value = 2;
  state.transcript.value = Array.from({ length: 101 }, (_, i) => ({ timestamp: i * 2, text: `Visual description ${i}` }));
  state.onVideoPause(); state.onVideoEnded();
  assert.equal(events.filter(([name]) => name === 'caption-created').length, 1, 'No duplicated save on pause then end');
  assert.equal(events.at(-1)[1].transcript.length, 101);
  assert.equal(events.at(-1)[1].captionType, 'visual-descriptions');
  await state.saveSessionHistory();
  assert.equal(writes[0][1][0].transcript.length, 101, 'No silent 50-cue history truncation');
  assert.equal(writes[0][1][0].captureInterval, 2);
  state.captureInterval.value = 9;
  state.loadSession(writes[0][1][0]);
  assert.equal(state.captureInterval.value, 2);
  assert.equal(state.totalDuration.value, 250);
  assert.equal(state.formatSRT(59.9996), '00:01:00,000', 'Millisecond rounding carries into the next minute');
});

test('comparison streams are isolated, scoped and release the device after partial failures', async () => {
  const listeners = new Set(), prompts = [], lockEvents = [];
  let model = '', state;
  const fixture = loadSkill('MassChatSkill', { api: {
    loadModel: async spec => { model = spec.filename; },
    resetChat: () => assert.fail('Comparisons must not reset personal chat'),
    onChatToken: () => assert.fail('Do not consume unscoped chat tokens'),
    onZhcChatToken: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    zhcChatStream: async ({ prompt, streamId }) => {
      prompts.push(prompt);
      if (model === 'failed.gguf') { state.prompt.value = 'Changed while running'; throw Error('Model unavailable'); }
      for (const listener of listeners) listener({ streamId: 'another-team', chunk: 'Private unrelated content' });
      if (model === 'empty.gguf') return '';
      for (const listener of listeners) listener({ streamId, chunk: 'The correct answer.' });
      return 'The correct answer.';
    },
  }, extra: { startGeneration: modality => { lockEvents.push(['start', modality]); return true; }, stopGeneration: modality => lockEvents.push(['stop', modality]) } });
  state = fixture.state;
  state.prompt.value = 'The same question';
  state.selectedModels.value = ['failed.gguf', 'working.gguf', 'empty.gguf'];
  await state.runMassChat();
  assert.deepEqual(prompts, ['The same question', 'The same question', 'The same question']);
  assert.equal(listeners.size, 0);
  assert.equal(state.results.value[0].response, '');
  assert.equal(state.results.value[1].response, 'The correct answer.');
  assert.match(state.results.value[2].error, /no answer/);
  const result = fixture.events.find(([name]) => name === 'result-created')[1];
  assert.equal(result.prompt, 'The same question');
  assert.equal(result.successfulModels, 1);
  assert.equal(result.partial, true);
  state.results.value[1].response = 'Later edit';
  assert.equal(result.results[1].response, 'The correct answer.', 'Saved output is a completed-run snapshot');
  assert.deepEqual(lockEvents, [['start', 'text'], ['stop', 'text']]);
});

test('model comparisons wait for other work and use isolated nonstreaming fallback', async () => {
  let available = false; const calls = [];
  const { state } = loadSkill('MassChatSkill', { api: {
    loadModel: async () => calls.push('load'),
    chat: async (prompt, options) => { calls.push(options); return { text: 'Answer', tokenCount: 1 }; },
  }, extra: { canStartGeneration: () => available } });
  state.prompt.value = 'Question'; state.selectedModels.value = ['model.gguf'];
  await state.runMassChat();
  assert.equal(calls.length, 0);
  assert.match(state.runError.value, /Another creation/);
  available = true; await state.runMassChat();
  assert.equal(calls[1].isolated, true);
  assert.equal(state.results.value[0].response, 'Answer');
});

test('stream generation uses the actual speech/video contracts and never treats a download as finished media', async () => {
  const calls = []; let status = 200;
  const { state } = loadSkill('LiveStreamerSkill', {
    internals: 'generateAudio, generateVideo, generateImage',
    fetch: async (url, options) => { calls.push([url, JSON.parse(options.body)]); return response(url.endsWith('/video') ? { video_path: '/tmp/clip.mp4' } : { audio_path: '/tmp/voice.wav' }, status); },
  });
  assert.equal(await state.generateAudio('Welcome to the stream'), '/tmp/voice.wav');
  assert.equal(calls[0][1].prompt, 'Welcome to the stream');
  assert.equal(calls[0][1].text, undefined);
  assert.equal(await state.generateVideo('A moving landscape'), '/tmp/clip.mp4');
  assert.equal(calls[1][1].mode, 't2v');
  assert.equal(calls[1][1].frames, 97);
  assert.equal(calls[1][1].frame_rate, 24);
  status = 202;
  await assert.rejects(state.generateImage('Landscape'), /not ready/);
});

test('stream moderation rejects viewer admin commands, unsupported media, blocked and empty prompts', async () => {
  const { state } = loadSkill('LiveStreamerSkill', { internals: 'handleChatMessage' });
  await state.handleChatMessage('viewer', '!bl pause', 'twitch');
  assert.equal(state.isPaused.value, false);
  await state.handleChatMessage('moderator', '!bl pause', 'twitch', true);
  assert.equal(state.isPaused.value, true);
  state.cooldownSeconds.value = 0;
  await state.handleChatMessage('viewer', '!bonzai 3d something', 'twitch');
  await state.handleChatMessage('viewer', '!bonzai draw    ', 'twitch');
  state.blocklist.value = 'badword';
  await state.handleChatMessage('viewer', '!bonzai draw BADWORD', 'twitch');
  assert.equal(state.queue.value.length, 0);
  await state.handleChatMessage('viewer', '!bonzai draw a forest', 'twitch');
  assert.equal(state.queue.value.length, 1);
});

test('skipping a stream item discards its output without starting overlapping inference', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { state, events } = loadSkill('LiveStreamerSkill', {
    internals: 'processQueue', fetch: async () => { await wait; return response({ image_path: '/tmp/discarded.png' }); },
  });
  state.isLive.value = true;
  state.queue.value = [{ id: 1, type: 'image', prompt: 'Scene', user: 'viewer', platform: 'twitch' }];
  const running = state.processQueue();
  state.skipCurrent();
  assert.equal(state.currentGeneration.value.id, 1, 'The inference lock stays owned until the request settles');
  release(); await running;
  assert.equal(events.some(([name]) => name === 'result-created'), false);
  assert.equal(state.stats.totalGenerations, 0);
  assert.equal(state.currentGeneration.value, null);
});

test('OBS receives a saved file path rather than inline bytes', async () => {
  const calls = [], writes = [];
  const { state } = loadSkill('LiveStreamerSkill', {
    internals: 'pushToOBS, setOBS: value => { obsWs = value; }',
    api: { db: { blobs: { write: async (...args) => { writes.push(args); return { path: '/tmp/stream.png' }; } } } },
  });
  state.sourceMappings.find(mapping => mapping.type === 'image').sourceName = 'Scene';
  state.setOBS({ call: async (...args) => calls.push(args) });
  await state.pushToOBS('image', 'data:image/png;base64,aW1hZ2U=');
  assert.equal(writes[0][0], 'aW1hZ2U=');
  assert.equal(calls[0][1].inputSettings.file, '/tmp/stream.png');
});

test('prediction-market output is an unpublished proposal with an actual verification source', async () => {
  const { state, events } = loadSkill('DSLASkill');
  state.selectUseCase(state.useCases[0]);
  state.slaForm.startDate = '2026-11-01'; state.slaForm.endDate = '2026-12-01';
  state.slaForm.dataSources = [{ name: 'Source', endpoint: '' }];
  assert.equal(state.canCreate.value, false);
  state.slaForm.dataSources[0].endpoint = 'https://example.org/verification';
  assert.equal(state.canCreate.value, true);
  await state.createPredictionMarket();
  assert.equal(events[0][1].published, false);
  assert.equal(events[0][1].status, 'draft');
});

test('an incomplete forecast does not become a completed deliverable', async () => {
  const { state, events } = loadSkill('ChartForecasterSkill', { fetch: async url => response(url.endsWith('/history')
    ? { series: Array.from({ length: 40 }, (_, i) => ({ t: i, v: 100 + i })) }
    : { forecast: [] }) });
  await state.runForecast();
  assert.match(state.error.value, /incomplete forecast/);
  assert.equal(events.some(([name]) => name === 'result-created'), false);
  assert.equal(state.isForecasting.value, false);
});

test('card price evidence never silently substitutes the first of several different editions', async () => {
  const { state } = loadSkill('TCGScannerSkill', {
    internals: 'fetchPricing',
    fetch: async () => response({ totalCount: 2, data: [
      { id: 'edition-1', name: 'Example Card', set: { name: 'Set One' }, tcgplayer: { prices: { holofoil: { market: 1000 } } } },
      { id: 'edition-2', name: 'Example Card', set: { name: 'Set Two' }, tcgplayer: { prices: { normal: { market: 1 } } } },
    ] }),
  });
  const result = await state.fetchPricing('Example Card', 'Pokémon');
  assert.match(result.error, /Several card editions/);
  assert.equal(result.variants, undefined);
  assert.equal(result.candidates.length, 2);
});
