import test from 'node:test';
import assert from 'node:assert/strict';
import { qwen38ContextPlan, completionBudget } from '../src/main/modelContext.js';
const model = { filename: 'qwen3.8-27b-ud-q4_k_xl.gguf', filesizeBytes: 17.6e9, context: 65536, kvCacheTypeK: 'q8_0', kvCacheTypeV: 'q8_0' };
test('Qwen 3.8 Q4 fits 64K with Q8 KV on a 32 GiB Apple Silicon Mac, even when free memory is low', () => {
  for (const vram of [0, 32768]) {
    const plan = qwen38ContextPlan(model, { ram: 32 * 1024 ** 3, ramAvailable: 200 * 1024 ** 2, vram }, { platform: 'darwin', arch: 'arm64' });
    assert.equal(plan.context, 65536);
    assert.equal(plan.kvBytesPerToken, 34816);
    assert.equal(plan.unified, true);
  }
});
test('larger quantizations do not inherit the Q4 capacity and non-Qwen models retain their estimator', () => {
  assert.ok(qwen38ContextPlan({ ...model, filesizeBytes: 31.5e9 }, { ram: 32 * 1024 ** 3 }, { platform: 'darwin', arch: 'arm64' }).context < 8192);
  assert.equal(qwen38ContextPlan({ filename: 'llama.gguf' }, {}), null);
});
test('full precision KV is budgeted honestly and context never exceeds a lower user cap', () => {
  const system = { ram: 32 * 1024 ** 3 };
  const options = { platform: 'darwin', arch: 'arm64' };
  assert.equal(qwen38ContextPlan({ ...model, kvCacheTypeV: 'f16' }, system, options).context, 32768);
  assert.equal(qwen38ContextPlan({ ...model, context: 8192 }, system, options).context, 8192);
});
test('completion preflight reserves output against loaded context, not advertised model maximum', () => {
  assert.equal(completionBudget(65536, 20000, 16384).maxTokens, 16384);
  assert.equal(completionBudget(16384, 10000, 16384).maxTokens, 6128);
  assert.throws(() => completionBudget(8192, 8000, 16384), /loaded model has 8,192/);
});
