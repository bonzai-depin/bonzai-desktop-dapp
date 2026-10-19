import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCompletionMetrics, completionMetrics } from '../src/services/completionMetrics.js';
import { createGenerationTrace } from '../src/components/gen3d/generationTrace.js';

test('MTP multi-token chunks do not inflate or suppress the reported token rate', () => {
  let now = 0; const collector = collectCompletionMetrics(() => now);
  now = 100; collector.observe({ choices: [{ delta: { content: 'several tokens' } }] }, 'several tokens');
  now = 300; collector.observe({ choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 12 }, timings: { prompt_ms: 80, predicted_ms: 200, draft_n: 10, draft_n_accepted: 8 } });
  const result = collector.result();
  assert.equal(result.tokenCount, 12); assert.equal(result.tokensPerSecond, 60);
  assert.equal(result.firstTokenMs, 100); assert.equal(result.prefillMs, 80);
  assert.equal(result.acceptanceRatio, .8); assert.equal(result.elapsedMs, 300);
});
test('unknown counters are not fabricated from wall time or chunk count', () => {
  const metrics = completionMetrics({ elapsedMs: 100, firstTokenMs: 30 });
  for (const key of ['tokenCount', 'prefillMs', 'genMs', 'tokensPerSecond', 'acceptanceRatio']) assert.equal(metrics[key], null);
});
test('trace includes failed calls and repairs without double-counting wall time', () => {
  let now = 0; const trace = createGenerationTrace({ id: 'trace', mode: 'object', clock: () => now });
  const stage = trace.start('construction');
  const first = trace.start('code', { kind: 'llm' });
  now = 100; first({ status: 'failed', tokenCount: 10, genMs: 50 });
  const repair = trace.start('patch', { kind: 'llm' });
  now = 200; repair({ tokenCount: 20, genMs: 50 }); stage();
  const result = trace.snapshot('completed');
  assert.equal(result.elapsedMs, 200); assert.equal(result.calls, 2); assert.equal(result.outputTokens, 30);
  assert.equal(result.tokensPerSecond, 300); assert.equal(result.spans[1].status, 'failed');
  stage({ elapsedMs: 1 }); assert.equal(trace.snapshot().spans[0].elapsedMs, 200);
});
test('incomplete telemetry prevents misleading aggregate performance claims', () => {
  const trace = createGenerationTrace({ id: 'test' });
  trace.start('legacy response', { kind: 'llm' })({ tokenCount: null, genMs: null });
  assert.equal(trace.snapshot().outputTokens, null); assert.equal(trace.snapshot().tokensPerSecond, null);
});
