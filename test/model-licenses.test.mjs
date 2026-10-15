import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { rcLicenseMessages } from '../src/i18n/rc-licenses.js';

const source = fs.readFileSync(new URL('../src/components/ModelLicenses.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'license-test' }).content;
const runSetup = new Function('vue', 'models', 'requirements', 'translate', compiled
  .replace(/import \{ computed, onMounted, onUnmounted, ref, watch \} from 'vue';/, 'const { computed, ref, watch } = vue; const onMounted = () => {}; const onUnmounted = () => {};')
  .replace(/import \{ listAllLLMs, MODEL_REQUIREMENTS \} from '[^']+';/, 'const listAllLLMs = () => models; const MODEL_REQUIREMENTS = requirements;')
  .replace(/import \{ useI18n \} from '[^']+';/, 'const useI18n = () => ({ t: translate });')
  .replace('export default', 'return'));
const translate = key => key.split('.').reduce((value, field) => value?.[field], rcLicenseMessages.en) || key;
const llms = [
  { baseKey: 'sample', filename: 'sample-q4.gguf', name: 'Sample Q4', type: 'llm', repo: 'org/sample', license: 'MIT' },
  { baseKey: 'sample', filename: 'sample-q8.gguf', name: 'Sample Q8', type: 'llm', repo: 'org/sample', license: 'MIT' },
  { baseKey: 'pending', filename: 'pending.gguf', name: 'Pending', type: 'llm', repo: 'org/pending', license: 'License metadata pending' },
];
const requirements = {
  music: { name: 'Music', type: 'audio', pipeline: 'music', repo: 'org/music', license: 'MIT' },
  music_fast: { name: 'Music fast', type: 'audio', pipeline: 'music', repo: 'org/music', license: 'MIT' },
  vision: { name: 'Vision', type: 'vision', pipeline: 'vision', repo: 'org/vision', license: 'Apache-2.0' },
  ocr: { name: 'OCR', type: 'ocr', pipeline: 'ocr', repo: 'org/vision', license: 'Apache-2.0' },
  auto: { name: 'Auto download', type: 'audio', pipeline: 'auto', repo: 'org/auto', license: 'MIT' },
};
const setup = () => runSetup(vue, llms, requirements, translate).setup({}, { expose() {} });

test('license view template compiles', () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'ModelLicenses.vue', id: 'license-test' }).errors, []);
});

test('catalog aliases collapse while filters combine and pending metadata stays stable', () => {
  const state = setup();
  assert.equal(state.rows.value.length, 5);
  assert.equal(state.rows.value.find(row => row.name === 'Vision').models.length, 2);
  assert.equal(state.rows.value.find(row => row.name === 'Sample').models.length, 2);
  assert(state.licenseFilters.value.includes('unverified'));
  assert(!state.licenseFilters.value.includes('Fetching'));
  state.search.value = 'org/music';
  state.activeModality.value = 'audio';
  state.activeLicense.value = 'MIT';
  assert.deepEqual(state.filteredRows.value.map(row => row.name), ['Music']);
  state.activeModality.value = 'image';
  assert.equal(state.filteredRows.value.length, 0);
  state.clearFilters();
  assert.equal(state.filteredRows.value.length, 5);
});

test('installation checks cover all LLM variants without calling external repositories', async () => {
  const oldWindow = global.window;
  const oldFetch = global.fetch;
  const calls = [];
  global.window = { electronAPI: {
    checkModel: async filename => filename === 'sample-q8.gguf',
    listCustomModels: async () => [{ filename: 'SAMPLE-Q4.GGUF', available: true }, { filename: 'own.gguf', available: false }, { filename: 'own.gguf', available: false }],
  } };
  global.fetch = async (url, options) => {
    calls.push(url);
    const { pipeline } = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: pipeline === 'music' || pipeline === 'auto', plan: { repos_to_fetch: pipeline === 'auto' ? [] : ['org/' + pipeline] } }) };
  };
  try {
    const state = setup();
    await state.checkInstalled();
    assert(calls.every(url => url.startsWith('http://127.0.0.1:')));
    assert.equal(state.rows.value.find(row => row.name === 'Sample').installed, true);
    assert.equal(state.rows.value.find(row => row.name === 'Auto download').installed, null);
    assert.equal(state.rows.value.filter(row => row.imported).length, 1);
    state.activeInstallation.value = 'installed';
    assert.deepEqual(state.filteredRows.value.map(row => row.name), ['Music', 'Sample']);
    state.activeInstallation.value = 'unknown';
    assert.deepEqual(state.filteredRows.value.map(row => row.name), ['Auto download']);
  } finally { global.window = oldWindow; global.fetch = oldFetch; }
});

test('custom terms remain exact and unsafe publisher links are rejected', () => {
  const state = setup();
  assert.equal(state.normalizeLicense('CreativeML Open RAIL++-M'), 'CreativeML Open RAIL++-M');
  assert.equal(state.normalizeLicense('MiniMax H3 Community License'), 'MiniMax H3 Community License');
  assert.equal(state.normalizeLicense({ malicious: true }), 'unverified');
  assert.equal(state.safeUrl('javascript:alert(1)'), '');
  assert.equal(state.safeUrl('https://example.org/LICENSE'), 'https://example.org/LICENSE');
});
