import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const { descriptor } = parse(fs.readFileSync(new URL('../src/components/GenerativeTraining.vue', import.meta.url), 'utf8'));
let compiled = compileScript(descriptor, { id: 'training-test' }).content;
const bindings = [];
compiled = compiled.replace(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/g, (_, names) => {
  bindings.push(...names.replace(/[{}]/g, '').split(',').map(name => name.trim()).filter(Boolean));
  return '';
}).replace('import.meta.env.VITE_API_BASE', "'http://127.0.0.1:65000'").replace('export default', 'return');
const setup = (axios = {}, overrides = {}) => {
  const values = Object.fromEntries(bindings.map(name => [name, () => {}]));
  Object.assign(values, vue, {
    onMounted: () => {}, onBeforeUnmount: () => {},
    axios,
    useBonzaiWeb3: () => ({ walletAddress: vue.ref('') }),
    fineTuneTokenService: { isConfigured: vue.ref(false) },
    bonzaiRevenueRouterService: {}, i18n: { t: key => key }, ...overrides,
  });
  const factory = new Function(...bindings, compiled);
  return factory(...bindings.map(name => values[name])).setup({ mode: 'tune' }, { expose() {} });
};
const info = { supported_llm_models: [{ key: 'model', repo: 'org/model' }], abliteration_models: [{ key: 'model', repo: 'org/model' }], capabilities: { '4bit_quantization': false }, abliteration_convert_available: true, abliteration_quantize_available: false };

test('training template compiles after moving capability selection before import', () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'GenerativeTraining.vue', id: 'training-test' }).errors, []);
  assert(descriptor.template.content.indexOf('rcTraining.chooseTarget') < descriptor.template.content.indexOf('rcTraining.importDataset'));
});

test('unavailable and placeholder modalities never enable import or create datasets', async () => {
  const posts = [];
  const state = setup({ get: async () => ({ data: info }), post: async (...args) => { posts.push(args); } });
  assert.equal(state.canImportDataset.value, false);
  await state.loadTrainingInfo();
  for (const target of ['image', 'audio', 'video']) {
    state.selectedTarget.value = target;
    assert.equal(state.canImportDataset.value, false);
    state.jsonlRows.value = [{ text: 'example' }];
    await state.startTuneTraining();
  }
  assert.equal(posts.length, 0);
  state.selectedTarget.value = 'text';
  assert.equal(state.canImportDataset.value, true);
  assert.equal(state.tuneConfig.use_4bit, false);
});

test('text import rejects mixed modalities, unsupported row shapes, and forbidden records', () => {
  const state = setup();
  assert.equal(state.supportedTextRows([{ text: 'valid' }, { prompt: 'q', completion: 'a' }]), true);
  for (const rows of [[], [{ text: '' }], [{ messages: [{ content: 'not supported by backend' }] }], [{ text: 'valid' }, { image_url: 'https://example.org/a.png' }], [{ text: 'private', training_allowed: false }]]) {
    assert.equal(state.supportedTextRows(rows), false);
  }
});

test('Uncensor offers F16 recovery when quantizer is missing, and fails closed on service error', async () => {
  const state = setup({ get: async () => ({ data: info }) });
  await state.loadTrainingInfo();
  state.ablitConfig.base_model = 'model';
  assert.equal(state.canStartAbliteration.value, false);
  assert.equal(state.abliterationBlocker.value, 'rcTraining.quantizerMissing');
  state.ablitConfig.quantization = 'F16';
  assert.equal(state.canStartAbliteration.value, true);
  state.trainingInfo.value.abliteration_convert_available = false;
  assert.equal(state.canStartAbliteration.value, false);
  const failed = setup({ get: async () => { throw new Error('offline'); } });
  await failed.loadTrainingInfo();
  assert.equal(failed.trainingInfoError.value, 'rcTraining.serverUnavailable');
  assert.equal(failed.canImportDataset.value, false);
  assert.equal(failed.canStartAbliteration.value, false);
});

test('old size-only checks must be refreshed before token publication', () => {
  const state = setup();
  const model = { id: 'local-model', validation: { status: 'passed', hash: `0x${'a'.repeat(64)}` } };
  assert.equal(state.localValidationPassed(model), false);
  state.prepareTokenLaunch(model);
  assert.equal(state.tokenLaunch.activeModelId, '');
  model.validation.scheme = 'bonzai-local-artifact-sha256-v1';
  assert.equal(state.localValidationPassed(model), true);
});

test('route failure preserves the issued token and offers route recovery without relaunch', async () => {
  let launches = 0;
  const state = setup({ post: async () => ({ data: {} }) }, {
    fineTuneTokenService: {
      isConfigured: vue.ref(true),
      launchFineTuneToken: async () => { launches++; return { success: true, tokenAddress: 'issued-token', poolId: 'pool', txHash: 'confirmed-transaction' }; },
    },
    bonzaiRevenueRouterService: {
      isConfigured: () => true, isModelFeeConfigured: () => true,
      registerModelRevenueRoute: async (model) => { assert.equal(model.fineTuneToken.tokenAddress, 'issued-token'); throw new Error('Route signature declined'); },
    },
  });
  const model = { id: 'model', nft: { tokenId: '1', contractAddress: 'collection' }, model_provenance: {}, validation: { status: 'passed', hash: `0x${'a'.repeat(64)}`, scheme: 'bonzai-local-artifact-sha256-v1' } };
  state.trainedModels.value = [model];
  state.prepareTokenLaunch(model);
  await state.launchModelToken(model);
  assert.equal(launches, 1);
  assert.equal(state.trainedModels.value[0].fineTuneToken.tokenAddress, 'issued-token');
  assert.equal(state.tokenLaunch.activeModelId, '');
  assert.equal(state.tokenLaunch.error, '');
  assert.equal(state.revenueRoutePublish.activeModelId, 'model');
  assert.match(state.revenueRoutePublish.error, /rcTraining.routePending.*Route signature declined/);
});
