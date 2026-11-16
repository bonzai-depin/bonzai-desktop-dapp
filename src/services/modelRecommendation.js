import { computeMemoryRequirements } from './modelFit.service.js';

/** Quality-oriented first-run shortlist. Not a benchmark ranking: compare sizes
 * within the same general-purpose family, at Q4 or better, with full weights
 * and context included. memBudget already reserves memory for the OS.
 *
 * `pooledBudget` is this device's budget plus what linked devices can lend.
 * When that unlocks a larger model the result is marked `pooled` and carries
 * the best model for this device alone as `local`, so the user can still
 * start without the other devices. */
export function recommendFirstRunModel(models, hardware, { pooledBudget = 0 } = {}) {
  if (!hardware?.memBudget) return null;
  const unified = hardware.platform === 'darwin' && /apple|m[1-9]/i.test(hardware.gpu || hardware.cpu || '');
  const budget = Math.min(hardware.memBudget, unified ? hardware.memBudget : hardware.vram > 0 ? hardware.vram * 0.9 : hardware.memBudget * 0.8);
  const candidates = models.filter(m => /^qwen3_5_(?:0_8|2|4|9|27)b$/.test(m.baseKey || '') && /q4_/i.test(m.filename || ''))
    .map(model => {
      const memory = computeMemoryRequirements(model, { contextSize: 8192 });
      const weights = Math.max(Number(model.filesizeBytes) || 0, memory.modelWeightsBytes);
      const required = (weights + memory.kvCacheGB * 1e9) * 1.1 + 0.5e9;
      return { model, required, budget, context: 8192 };
    }).filter(item => Number.isFinite(item.required))
    .sort((a, b) => b.model.parameters - a.model.parameters);
  const local = candidates.find(item => item.required <= budget) || null;
  // Linked devices add memory on top of what this device can use by itself.
  const poolTotal = budget + Math.max(0, Number(pooledBudget) - hardware.memBudget);
  const pooled = poolTotal > budget ? candidates.find(item => item.required <= poolTotal) : null;
  if (pooled && (!local || pooled.model.parameters > local.model.parameters)) {
    return { ...pooled, budget: poolTotal, pooled: true, local };
  }
  return local ? { ...local, pooled: false } : null;
}
