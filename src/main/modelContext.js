export const LOW_MTP_CONTEXT = 32768;
export function isQwen38LowMtp(filename) {
  return /^qwen3\.8-27b-turbofcfusion-735-882-here-uncen-neo-coder-max-low-mtp-(iq4_xs|q6_k)\.gguf$/i.test(filename || '');
}

const GiB = 1024 ** 3;
// Qwen3.8-27B: 64 layers, one full-attention layer per four blocks,
// 4 KV heads × 256 dimensions. The recurrent state belongs in the scratch reserve.
// Source: Qwen/Qwen3.8-27B config.json and the publisher's architecture table.
export function qwen38ContextPlan(model, system, { platform = process.platform, arch = process.arch } = {}) {
  if (!/^qwen3\.8-27b-/i.test(model.filename || '')) return null;
  const unified = platform === 'darwin' && arch === 'arm64';
  const total = Number(system.ram) || 0;
  const available = Number(system.ramAvailable) || total;
  const vram = (Number(system.vram) || 0) * 1024 ** 2;
  const budget = unified ? total * .7 : vram ? Math.min(vram * .8, available * .8) : available * .8;
  const weights = Number(model.filesizeBytes) || 27e9 * .65;
  const cacheType = model.kvCacheTypeK === 'q8_0' && model.kvCacheTypeV === 'q8_0' ? 'q8_0' : 'f16';
  const bytesPerElement = cacheType === 'q8_0' ? 34 / 32 : 2;
  const kvBytesPerToken = 2 * 16 * 4 * 256 * bytesPerElement;
  const cacheBudget = Math.max(0, budget - weights - 2 * GiB) * .85;
  const capacity = Math.floor(cacheBudget / kvBytesPerToken);
  const requested = Math.min(Number(model.context) || 65536, isQwen38LowMtp(model.filename) ? LOW_MTP_CONTEXT : 262144);
  const context = [131072, 65536, 32768, 16384, 8192, 4096, 2048, 1024, 512].find(size => size <= capacity && size <= requested) || 512;
  return { context, capacity, kvBytesPerToken, cacheType, weights, unified };
}

export function completionBudget(context, promptTokens, requested, reserve = 256) {
  const available = Math.floor(context - promptTokens - reserve);
  if (available < 512) throw new Error(`This prompt needs ${promptTokens.toLocaleString()} tokens but the loaded model has ${context.toLocaleString()} context tokens. Shorten the prompt or load a smaller model with more context.`);
  return { context, promptTokens, maxTokens: Math.min(Math.max(1, requested), available), available };
}
