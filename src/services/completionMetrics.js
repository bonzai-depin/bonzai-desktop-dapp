// Runtime counters are authoritative. A transport chunk is not a token (MTP
// may emit several tokens at once); missing counters stay explicitly unknown.
const count = value => Number.isFinite(value) && value >= 0 ? value : null;
export function completionMetrics({ usage, timings, elapsedMs, firstTokenMs, finishReason } = {}) {
  const outputTokens = count(usage?.completion_tokens) ?? count(timings?.predicted_n);
  const inputTokens = count(usage?.prompt_tokens) ?? count(timings?.prompt_n);
  const decodeMs = count(timings?.predicted_ms);
  const drafted = count(timings?.draft_n), accepted = count(timings?.draft_n_accepted);
  return {
    tokenCount: outputTokens, inputTokens,
    cachedTokens: count(usage?.prompt_tokens_details?.cached_tokens) ?? count(timings?.cache_n),
    elapsedMs: count(elapsedMs), firstTokenMs: count(firstTokenMs),
    prefillMs: count(timings?.prompt_ms), genMs: decodeMs,
    tokensPerSecond: outputTokens !== null && decodeMs > 0 ? outputTokens * 1000 / decodeMs : null,
    draftedTokens: drafted, acceptedDraftTokens: accepted,
    acceptanceRatio: drafted > 0 && accepted !== null ? accepted / drafted : null,
    finishReason: finishReason || null,
  };
}

export function collectCompletionMetrics(clock = () => performance.now()) {
  const started = clock();
  let usage, timings, firstTokenMs = null, finishReason = null;
  return {
    observe(payload, delta = '') {
      if (delta && firstTokenMs === null) firstTokenMs = clock() - started;
      if (payload.usage) usage = { ...usage, ...payload.usage };
      if (payload.timings) timings = { ...timings, ...payload.timings };
      finishReason = payload.choices?.[0]?.finish_reason || finishReason;
    },
    result() { return { ...completionMetrics({ usage, timings, firstTokenMs, finishReason, elapsedMs: clock() - started }), usage: usage || null, timings: timings || null }; },
  };
}
