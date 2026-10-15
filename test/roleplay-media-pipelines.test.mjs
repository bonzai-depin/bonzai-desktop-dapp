import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { MODEL_REQUIREMENTS, SKILL_MODEL_REQUIREMENTS } from '../src/skills/flagship.js';

test('roleplay advertises Klein images and Wan video instead of legacy image pipelines', () => {
  const keys = SKILL_MODEL_REQUIREMENTS['roleplay-companion-v1.0.0'];
  assert.ok(keys.includes('image_turbo'));
  assert.ok(keys.includes('video_quality'));
  assert.ok(!keys.includes('image_quality'));
  assert.ok(!keys.includes('image_standard'));
  assert.ok(!keys.includes('video_fast'));
  assert.match(MODEL_REQUIREMENTS.image_turbo.name, /Klein/);
  assert.equal(MODEL_REQUIREMENTS.image_turbo.endpoint, '/image/turbo');
  assert.match(MODEL_REQUIREMENTS.video_quality.name, /Wan/);
  assert.equal(MODEL_REQUIREMENTS.video_quality.endpoint, '/video/quality');
});

const source = fs.readFileSync(new URL('../src/skills/flagship.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const regeneration = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'regenerateMessageMedia');

test('regenerating roleplay media uses Klein then passes its image to Wan', async () => {
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
  assert.equal(calls[1].options.quality, true);
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

test('identity-conditioned generation sends the portrait to Klein editing', async () => {
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
