// Per-generation, local telemetry. No prompts, code, images or credentials.
// Child spans may overlap; wall time is measured independently, never summed.
export function createGenerationTrace({ id = globalThis.crypto.randomUUID(), mode, model, clock = () => performance.now() } = {}) {
  const start = clock(), spans = [];
  return {
    start(stage, metadata = {}) {
      const began = clock();
      const span = { id: `${id}:${spans.length + 1}`, stage, startMs: began - start, ...metadata, status: 'running' };
      spans.push(span);
      let finished = false;
      return (details = {}) => {
        if (finished) return;
        finished = true;
        Object.assign(span, { elapsedMs: clock() - began, status: 'completed' }, details);
      };
    },
    snapshot(status = 'running') {
      const calls = spans.filter(s => s.kind === 'llm');
      const known = calls.length > 0 && calls.every(s => Number.isFinite(s.tokenCount));
      const decodeKnown = known && calls.every(s => Number.isFinite(s.genMs));
      const outputTokens = known ? calls.reduce((n, s) => n + s.tokenCount, 0) : null;
      const decodeMs = decodeKnown ? calls.reduce((n, s) => n + s.genMs, 0) : null;
      return { version: 1, id, mode, model, status, elapsedMs: clock() - start,
        calls: calls.length, outputTokens, decodeMs,
        tokensPerSecond: decodeMs > 0 ? outputTokens * 1000 / decodeMs : null,
        spans: spans.map(s => ({ ...s })) };
    },
  };
}
