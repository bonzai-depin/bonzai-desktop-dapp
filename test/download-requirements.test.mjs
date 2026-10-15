import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as presentation from '../src/utils/downloadPresentation.js';
import { DEFAULT_LLM_FILENAME, DEFAULT_3D_LLM_FILENAME, MODEL_PREFERENCE_KEY, preferredModelFilename, selectPreferredModel } from '../src/config/modelDefaults.js';
import { rcDownloadMessages } from '../src/i18n/rc-downloads.js';

test('first launch selects Qwen3.5 9B q4 without overriding an existing preference', () => {
  assert.equal(preferredModelFilename(), DEFAULT_LLM_FILENAME);
  assert.match(DEFAULT_LLM_FILENAME, /qwen3\.5-9b-ud-q4_k_xl/);
  assert.equal(preferredModelFilename({ getItem: () => "qwen3.8-27b-ud-q4_k_xl.gguf" }), DEFAULT_3D_LLM_FILENAME);
  assert.equal(preferredModelFilename({ getItem: () => '' }), DEFAULT_LLM_FILENAME);
  assert.equal(preferredModelFilename({ getItem: () => { throw Error('blocked'); } }), DEFAULT_LLM_FILENAME);
  assert.equal(preferredModelFilename({ getItem: key => key === MODEL_PREFERENCE_KEY ? 'my-custom-model.gguf' : null }), 'my-custom-model.gguf');
  const preferred = { filename: 'my-custom-model.gguf' };
  const fallback = { filename: DEFAULT_LLM_FILENAME };
  assert.equal(selectPreferredModel([fallback, preferred], 'MY-CUSTOM-MODEL.GGUF'), preferred);
  assert.equal(selectPreferredModel([preferred, fallback], 'removed-model.gguf'), fallback);
});

test('selecting a default never reports a loaded runtime or starts a download', async () => {
  const previousWindow = globalThis.window;
  const calls = [];
  globalThis.window = { electronAPI: {
    getLoadedModel: async () => { calls.push('read loaded'); return null; },
    getAlwaysLoaded: async () => { calls.push('read setting'); return false; },
    loadModel: () => { throw Error('Unexpected load'); },
    downloadModel: () => { throw Error('Unexpected download'); },
  } };
  try {
    const { modelStore } = await import('../src/stores/modelStore.js');
    await modelStore.initialize();
    assert.equal(modelStore.state.current, null);
    assert.equal(modelStore.state.preferredFilename, DEFAULT_LLM_FILENAME);
    modelStore.setPreferred({ filename: 'chosen.gguf' });
    assert.equal(modelStore.state.preferredFilename, 'chosen.gguf');
    assert.equal(modelStore.state.current, null);
    assert.deepEqual(calls, ['read loaded', 'read setting']);
  } finally { globalThis.window = previousWindow; }
});

test('download presentation restores lowercase identifiers without changing source URLs', () => {
  const source = { type: 'diffusion', repo: 'Black-Forest-Labs/FLUX.2-Klein', size: '5 GB', description: 'Hidden', url: 'https://example.org/MixedCase' };
  assert.deepEqual(presentation.downloadItems([source, source, { filename: 'MODEL.GGUF', type: 'llm', size: '7 GB' }]), [
    { category: 'image', name: 'black-forest-labs/flux.2-klein', size: '5 GB' }, { category: 'language', name: 'model.gguf', size: '7 GB' },
  ]);
  assert.equal(source.repo, 'Black-Forest-Labs/FLUX.2-Klein');
  assert.deepEqual(presentation.downloadItems(['SECRET.GGUF']), [{ category: 'resources', name: 'secret.gguf', size: '' }]);
  assert.deepEqual(presentation.downloadTasks([{ filename: 'SECRET.GGUF', status: 'failed', progress: 20 }], [{ filename: 'SECRET.GGUF', type: 'llm' }]), [{ category: 'language', name: 'secret.gguf', status: 'failed', progress: 20 }]);
});

const dictionary = { ...rcDownloadMessages.en, common: { download: 'Download', cancel: 'Cancel' }, create: { downloading: 'Downloading', downloadRequired: 'Download Required' } };
const translate = key => key.split('.').reduce((value, field) => value?.[field], dictionary) || key;
const { descriptor } = parse(fs.readFileSync(new URL('../src/components/DownloadRequirement.vue', import.meta.url), 'utf8'));
const compiled = compileScript(descriptor, { id: 'download-requirement-test', inlineTemplate: true }).content
  .replace(/import \{([^}]+)\} from ['"]vue['"];?/g, (_, names) => `const {${names.replace(/\bas\b/g, ':')}} = vue;`)
  .replace(/import \{ useI18n \} from '[^']+';/, 'const useI18n = () => ({ t: translate });')
  .replace(/import \{ downloadItems, downloadTasks, downloadPercent \} from '[^']+';/, 'const { downloadItems, downloadTasks, downloadPercent } = presentation;')
  .replace('export default', 'return');
const component = new Function('vue', 'presentation', 'translate', compiled)(vue, presentation, translate);
const render = async props => {
  const app = vue.createSSRApp(component, props);
  app.config.globalProperties.$t = translate;
  return renderToString(app);
};

test('the shared requirement renders concise missing, disabled, progress and error states', async () => {
  const missing = await render({ items: [{ category: 'image', name: 'FLUX.2 Klein', description: 'Never show this model description' }] });
  assert.match(missing, /Download Required/);
  assert.match(missing, />flux.2 klein</);
  assert.match(missing, /inventory_2/);
  assert.doesNotMatch(missing, /Never show/);
  const blocked = await render({ items: [], disabled: true, error: 'Authentication needed' });
  assert.match(blocked, /disabled/);
  assert.match(blocked, /Download failed/);
  const progress = await render({ active: true, cancellable: true, progress: 135, tasks: [{ filename: 'MODEL.GGUF', status: 'DOWNLOADING', progress: 34.6 }] });
  assert.match(progress, /value="100"/);
  assert.match(progress, />model\.gguf</);

  assert.doesNotMatch(progress, />downloading</);
  assert.match(progress, /35%/);
  assert.match(progress, /Cancel/);
  assert.doesNotMatch(progress, />Download</);
});
