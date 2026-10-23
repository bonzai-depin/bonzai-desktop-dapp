import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { MODEL_REQUIREMENTS, SKILL_MODEL_REQUIREMENTS } from '../src/skills/flagship.js';

test('roleplay advertises Qwen Image 2.1 images and MiniMax H3 video instead of legacy image pipelines', () => {
  const keys = SKILL_MODEL_REQUIREMENTS['roleplay-companion-v1.0.0'];
  assert.ok(keys.includes('image_turbo'));
  assert.ok(keys.includes('video_sota'));
  assert.ok(!keys.includes('image_quality'));
  assert.ok(!keys.includes('image_standard'));
  assert.ok(!keys.includes('video_fast'));
  assert.match(MODEL_REQUIREMENTS.image_turbo.name, /Qwen Image 2.1/);
  assert.equal(MODEL_REQUIREMENTS.image_turbo.endpoint, '/image/turbo');
  assert.match(MODEL_REQUIREMENTS.video_sota.name, /MiniMax H3/);
  assert.equal(MODEL_REQUIREMENTS.video_sota.endpoint, '/video/sota');
});

const source = fs.readFileSync(new URL('../src/skills/flagship.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const regeneration = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'regenerateMessageMedia');

test('regenerating roleplay media uses Qwen Image 2.1 then passes its image to MiniMax H3', async () => {
  const calls = [];
  const context = vm.createContext({
    console: { log() {}, warn(message) { throw Error(message); } },
    IMAGE_NEG_BASE: 'low quality', IMAGE_NEG_LAYOUT: 'split view',
    generateEnhancedImagePrompt: async () => 'A companion in a garden',
    generateImage: async (prompt, options) => { calls.push({ kind: 'image', options }); return { image_base64: 'new-image' }; },
    generateImageSDXL: () => { throw Error('Unexpected SDXL download'); },
    generateVideo: async (image, prompt, options) => { calls.push({ kind: 'video', image, options }); return { video_path: 'clip.mp4' }; },
    clearGenerationMemory: async () => {},
  });
  vm.runInContext(source.slice(regeneration.start, regeneration.end), context);
  const result = await context.regenerateMessageMedia({
    message: { content: 'A quiet afternoon' }, companion: { name: 'Rose' },
    contentLevel: 'pg', sceneState: {},
  }, { regenerateImage: true, regenerateVideo: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].kind, 'image');
  assert.ok(!calls[0].options.quality && !calls[0].options.advanced);
  assert.equal(calls[1].image, 'new-image');
  assert.equal(calls[1].options.pipeline, 'sota');
  assert.equal(result.video, 'clip.mp4');
});

test('video generation cannot implicitly enable voice in a roleplay turn', () => {
  const roleplay = ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.declarations?.some(d => d.id.name === 'roleplayCompanion')).declaration.declarations[0].init;
  const execution = roleplay.arguments[0].properties.find(p => p.key.name === 'execution').value;
  const turn = execution.properties.find(p => p.key.name === 'executeMessage').value;
  let narrations = 0;
  function walk(node, guards = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.name === 'generateNarration') {
      narrations++;
      assert.ok(guards.some(g => source.slice(g.start, g.end).includes('includeAudio')), 'Voice requires the audio setting, including inside video preparation');
    }
    if (node.type === 'IfStatement') {
      walk(node.consequent, [...guards, node.test]);
      walk(node.alternate, guards);
      return;
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => walk(item, guards));
      else if (child && typeof child === 'object') walk(child, guards);
    }
  }
  walk(turn);
  assert.equal(narrations, 1);
});

test('identity-conditioned generation sends the portrait to Qwen Image 2.1 editing', async () => {
  const fn = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'generateImage');
  const calls = [];
  const context = vm.createContext({
    IMAGE_NEG_BASE: 'low quality',
    resolvePortraitReference: async value => { assert.equal(value, 'saved-avatar'); return 'avatar-base64'; },
    callFlaskEndpoint: async (endpoint, payload) => { calls.push({ endpoint, payload }); return { image: 'output' }; },
  });
  vm.runInContext(source.slice(fn.start, fn.end), context);
  await context.generateImage('Walking in the garden wearing a green coat', { referenceImage: 'saved-avatar' });
  assert.equal(calls[0].endpoint, '/image/image/turbo');
  assert.equal(calls[0].payload.image_base64, 'avatar-base64');
  assert.match(calls[0].payload.prompt, /Preserve the same face/);
  assert.match(calls[0].payload.prompt, /Clothing, pose and setting may change/);
});

test('roleplay streaming isolates tokens from other agents and releases its subscription', async () => {
  const fn = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'generateTextWithModel');
  const tokens = [];
  let listener, cleaned = false;
  const context = vm.createContext({
    DEFAULT_LLM: {}, crypto: { randomUUID: () => 'roleplay-test' },
    ensureLLMLoaded: async () => {},
    window: { electronAPI: {
      chat: async () => { throw Error('Non-streaming chat should not run'); },
      onZhcChatToken: callback => { listener = callback; return () => { cleaned = true; }; },
      zhcChatStream: async ({ streamId }) => {
        listener({ streamId: 'another-agent', chunk: 'private work' });
        listener({ streamId, chunk: 'Hello' });
        return 'Hello';
      },
    } },
  });
  vm.runInContext(source.slice(fn.start, fn.end), context);
  assert.equal(await context.generateTextWithModel('Hi', '', {}, { onToken: chunk => tokens.push(chunk) }), 'Hello');
  assert.deepEqual(tokens, ['Hello']);
  assert.equal(cleaned, true);
});

test('H3 roleplay requests require consent and use the supported frame and sampling parameters', async () => {
  const generation = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'generateVideo');
  const calls=[];
  let accepted=false;
  const context=vm.createContext({
    localStorage:{getItem:()=>accepted?'accepted':null},
    resolveImageBase64:async()=> 'resolved-frame',
    callFlaskEndpoint:async(endpoint,payload)=>{calls.push({endpoint,payload});return {video_path:'h3.mp4'};},
  });
  vm.runInContext(source.slice(generation.start,generation.end),context);
  await assert.rejects(()=>context.generateVideo('blob','Scene',{pipeline:'sota'}),/license/);
  assert.equal(calls.length,0);
  accepted=true;
  await context.generateVideo('blob','Scene',{pipeline:'sota'});
  assert.equal(calls[0].endpoint,'/video/sota');
  assert.equal(calls[0].payload.image_base64,'resolved-frame');
  assert.equal(calls[0].payload.num_frames,124);
  assert.equal(calls[0].payload.num_inference_steps,8);
  assert.equal(calls[0].payload.license_accepted,true);
  assert.equal(calls[0].payload.audio_base64,undefined);
});

test('failed roleplay video keeps existing media and exposes the server failure', async () => {
  let videoTry;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TryStatement' && node.block.body.some(child =>
      child.type === 'IfStatement' && source.slice(child.test.start, child.test.end) === 'videoResponse.ok')) videoTry = node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  assert.ok(videoTry);
  const check = videoTry.block.body.find(child => child.type === 'IfStatement' && source.slice(child.test.start, child.test.end) === 'videoResponse.ok');
  const response = { image: 'portrait', audio: 'voice', response: 'dialogue' };
  const context = vm.createContext({
    response, console: { warn() {} },
    videoResponse: { ok: false, status: 500, text: async () => JSON.stringify({
      error: 'MiniMax H3 numerical failure in denoising step 6',
      generation_id: 'failed-run', generation_settings: { seed: 123 },
    }) },
  });
  await vm.runInContext(`(async () => { try { ${source.slice(check.start, check.end)} } ${source.slice(videoTry.handler.start, videoTry.handler.end)} })()`, context);
  assert.match(response.mediaErrors[0], /denoising step 6/);
  assert.equal(response.videoFailure.settings.seed, 123);
  assert.equal(response.video, null);
  assert.equal(response.image, 'portrait');
  assert.equal(response.audio, 'voice');
  assert.equal(response.response, 'dialogue');
});

test('Standard and Turbo advertise distinct checkpoints with the shared R2 adapter', () => {
  const standard = MODEL_REQUIREMENTS.image_standard;
  const turbo = MODEL_REQUIREMENTS.image_turbo;
  assert.equal(standard.repo, 'Qwen/Qwen-Image-2.1');
  assert.equal(turbo.repo, 'Qwen/Qwen-Image-2.1-Turbo');
  assert.match(standard.description, /25 steps.*CFG 4/);
  assert.match(turbo.description, /8 steps.*CFG 1/);
  assert.notEqual(standard.additionalFiles[0].url, turbo.additionalFiles[0].url);
  assert.deepEqual(standard.additionalFiles[1], turbo.additionalFiles[1]);
  for (const preset of [standard, turbo]) {
    for (const file of preset.additionalFiles) assert.equal(file.name, file.name.toLowerCase());
    assert.equal(preset.license, 'qwen-research');
  }
});
