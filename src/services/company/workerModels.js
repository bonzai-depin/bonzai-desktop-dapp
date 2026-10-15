import { computeMemoryRequirements, computeFitTier } from '../modelFit.service.js';
import { WORKER_ROLE_PROFILES, WORKER_PROFILES, workerModelEvidence } from './workerModelEvidence.js';

// Provisional starting points, not measured winners. See the dated publisher
// evidence and per-role business requirements in workerModelEvidence.js.
export function workerModelProfile(role = '') {
  const id = Object.hasOwn(WORKER_ROLE_PROFILES, role) ? WORKER_ROLE_PROFILES[role] : 'unknown';
  return { id, ...WORKER_PROFILES[id] };
}

export const canonicalWorkerModelKey = key => typeof key === 'string' ? key.replace(/_q4$/, '') : null;
// systeminformation reports dedicated VRAM in MiB; other callers already use
// bytes. Normalize at this boundary without changing the shared IPC contract.
export function workerModelHardware(info) {
  if (!info) return null;
  const vram = Number(info.vram) || 0;
  return { ...info, vram: vram > 0 && vram < 1048576 ? vram * 1024 ** 2 : vram };
}
export function workerModelFiles(model) {
  if (!model?.filename) return [];
  const files = [];
  const count = Number(model.shards) || 1;
  for (let n = 1; n <= count; n++) {
    const shard = value => value?.replace(/-00001-of-\d{5}/, `-${String(n).padStart(5, '0')}-of-${String(count).padStart(5, '0')}`);
    const filename = shard(model.filename).toLowerCase();
    files.push({ filename, url: shard(model.url), downloadId: filename.replace(/-\d{5}-of-\d{5}(?=\.gguf$)/, '') });
  }
  if (model.mmproj) files.push({ filename: model.mmproj.toLowerCase(), url: model.mmprojUrl });
  if (model.draftModel) files.push({ filename: model.draftModel.toLowerCase(), url: model.draftUrl });
  return files;
}

export function rankWorkerModels({ models = [], role, hardware, availability = {} }) {
  hardware = workerModelHardware(hardware);
  const profile = workerModelProfile(role);
  const knownHardware = Number(hardware?.memBudget) > 0 && (hardware.platform === 'darwin' || hardware.vram > 0 || hardware.gpu !== 'Unknown');
  const entries = models.filter(model => !model.draft && !/_draft(?:_|$)/.test(model.baseKey || model.key || '')).map(model => {
    const estimated = computeMemoryRequirements(model);
    // Prefer real download size as a floor: XL quants can be larger than the
    // generic parameter estimate. Reserve KV + scratch for the working context.
    const weights = Math.max(estimated.modelWeightsBytes || 0, model.filesizeBytes || 0);
    const sharedMemory = !hardware?.vram || hardware.platform === 'darwin' || /apple|m[1-9]/i.test(hardware.gpu || '');
    const memory = { ...estimated, modelWeightsBytes: weights,
      vram: Math.max(estimated.vram || 0, model.isMoE && !sharedMemory ? estimated.vram : (weights + estimated.kvCacheGB * 1e9) * 1.1) };
    const fit = computeFitTier(memory, knownHardware ? hardware : null);
    const cpuOnly = knownHardware && !hardware.vram && hardware.platform !== 'darwin' && !/apple|m[1-9]/i.test(hardware.gpu || '');
    if (cpuOnly && memory.vram <= hardware.memBudget * .65 && weights <= hardware.memBudget * .65) fit.tier = 0;
    // CPU-only and unified-memory devices must fit weights AND runtime memory.
    if (knownHardware && memory.vram > hardware.memBudget && (!hardware.vram || hardware.platform === 'darwin')) fit.tier = 3;
    const files = workerModelFiles(model);
    const ready = files.length > 0 && files.every(file => availability[file.filename] === true);
    const checked = files.every(file => typeof availability[file.filename] === 'boolean');
    const suitability = model.tier === 'q4' ? profile.models.indexOf(model.baseKey) : -1;
    return { ...model, key: canonicalWorkerModelKey(model.key), fit, memory, ready, checked, suitability, files, cpuOnly, evidence: workerModelEvidence(model) };
  });
  // Never trade device headroom for a larger model. Installed status breaks ties
  // only; it must not make an unsuitable model the recommendation.
  const candidates = entries.filter(model => knownHardware && model.fit.tier === 0 && model.suitability >= 0)
    .sort((a, b) => a.suitability - b.suitability || Number(b.ready) - Number(a.ready));
  return { profile, knownHardware, recommended: candidates[0] || null,
    models: entries.sort((a,b) => a.fit.tier-b.fit.tier || Number(b.ready)-Number(a.ready) || a.name.localeCompare(b.name)) };
}

/** Verify all files before saving an assignment. A cancelled/partial download
 * never changes the worker, and choosing a model never loads/swaps the engine. */
export async function prepareWorkerModel(model, api, { signal, onFile = () => {} } = {}) {
  if (!api?.checkModel) throw new Error('Model availability could not be checked.');
  const files = workerModelFiles(model);
  if (!model?.key || !files.length) throw new Error('This model is not available on this device.');
  for (const file of files) {
    signal?.throwIfAborted();
    if (await api.checkModel(file.filename)) continue;
    if (!file.url || !api.downloadModel) throw new Error('This model is not available on this device.');
    onFile(file);
    const result = await api.downloadModel(file.url, file.filename);
    signal?.throwIfAborted();
    if (result?.canceled || result?.cancelled) throw new Error('Download cancelled. Your previous model is unchanged.');
    if (result?.error || !(await api.checkModel(file.filename))) throw new Error('Download failed. Your previous model is unchanged.');
  }
  signal?.throwIfAborted();
  return canonicalWorkerModelKey(model.key);
}
