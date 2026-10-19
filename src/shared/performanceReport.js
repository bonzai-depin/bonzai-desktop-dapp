// Explicit numeric allowlists: never collect prompts, media, paths or server errors.
export const PARAMETER_KEYS = ['width', 'height', 'steps', 'steps_base', 'steps_refiner', 'seed', 'fps', 'duration', 'num_frames', 'guidance_scale', 'cfg', 'temperature', 'maxTokens', 'max_tokens', 'batch_size', 'resolution', 'strength', 'lora_strength', 'ctxSize', 'ngl', 'specDraftNMax'];
export const METRIC_KEYS = ['elapsedMs', 'queueMs', 'executionMs', 'firstTokenMs', 'tokenCount', 'inputTokens', 'cachedTokens', 'tokensPerSecond', 'prefillMs', 'genMs', 'draftedTokens', 'acceptedDraftTokens', 'acceptanceRatio', 'width', 'height', 'fps', 'duration', 'num_frames'];
export function numbersOnly(value, keys) {
  return Object.fromEntries(keys.filter(key => typeof value?.[key] === 'number' && Number.isFinite(value[key])).map(key => [key, value[key]]));
}
export function summarizePipeline(records) {
  const successes = records.filter(r => r.status === 'completed' && r.phase !== 'warmup');
  const values = successes.map(r => r.metrics?.elapsedMs).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null;
  return { samples: records.length, completed: successes.length, failed: records.filter(r => r.status === 'failed').length,
    interrupted: records.filter(r => ['cancelled', 'interrupted'].includes(r.status)).length,
    medianMs: median, p95Ms: values.length >= 20 ? values[Math.ceil(values.length * .95) - 1] : null };
}
export function humanDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round(ms % 60000 / 1000)} s`;
}
