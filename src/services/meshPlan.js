/**
 * Pure planning for linked-device memory pooling. Shared by the main process
 * (which devices to borrow from when loading a model) and the renderer (what
 * the linked devices make possible). Estimates only: llama.cpp makes the
 * actual placement from the memory each device reports at load time.
 */

// Leave room on a lending device for its own OS, apps and loaded models.
export const LENDABLE_SHARE = 0.85;
// Each extra device adds a network hop per layer boundary.
export const MAX_POOL_DEVICES = 3;

const number = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

/** Memory a model needs beyond its weights file: KV cache, graph, scratch. */
export function modelMemoryNeed(filesizeBytes) {
  const size = number(filesizeBytes);
  return size ? size * 1.15 + 1e9 : 0;
}

export function lendableMemory(device) {
  return device?.online && device.sharing !== false ? number(device.memBudget) * LENDABLE_SHARE : 0;
}

/** Local budget plus what the largest reachable linked devices can lend. */
export function pooledBudget(localBudget, devices = []) {
  const lent = devices.map(lendableMemory).filter(Boolean).sort((a, b) => b - a).slice(0, MAX_POOL_DEVICES);
  return number(localBudget) + lent.reduce((sum, value) => sum + value, 0);
}

/**
 * Choose which linked devices to borrow from for one model load.
 * Returns [] when the model fits locally (local is faster), pooling is off,
 * or the pool is still too small — never a partial pool that cannot fit.
 */
export function planPool({ requiredBytes, localBudget, pooling = 'auto', devices = [] }) {
  const need = number(requiredBytes);
  const local = number(localBudget);
  if (pooling !== 'auto' || !need || need <= local) return [];
  const candidates = devices
    .map(device => ({ device, lend: lendableMemory(device) }))
    .filter(item => item.lend > 0)
    .sort((a, b) => b.lend - a.lend)
    .slice(0, MAX_POOL_DEVICES);
  const chosen = [];
  let total = local;
  for (const item of candidates) {
    chosen.push(item.device);
    total += item.lend;
    if (total >= need) return chosen;
  }
  return [];
}
