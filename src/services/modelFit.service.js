/**
 * Single source of truth for LLM memory + hardware-fit calculations.
 *
 * Two pure functions, no Vue / no DOM. Used by:
 *   - GenerativeText.vue (inline picker, fit-tier sort, breakdown UI)
 *   - LlmModelPickerModal.vue (global picker)
 *
 * Memory math is approximate — model architecture details (exact layer
 * count, head dim, GQA grouping) are estimated from parameter count
 * unless the model registry exposes them explicitly. Good enough for
 * fit-tier ranking; not authoritative for VRAM allocation decisions.
 */

// ─────────────────────────────────────────────────────────────────────────
// HARDWARE-FIT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────

// Apple Silicon shares its memory pool between CPU and GPU. The whole
// memBudget is technically usable for compute, but Metal won't let a
// single allocation eat all of it without paging. ~65% is the working
// fraction we've seen empirically on M-series machines.
export const AS_GPU_SHARE = 0.65;

// "Comfortable" tier requires need <= effective × DGPU_HEADROOM. 80%
// leaves room for KV-cache growth past the modeled context, OS buffer
// cache, and any runtime fragmentation overhead.
export const DGPU_HEADROOM = 0.8;

// ─────────────────────────────────────────────────────────────────────────
// QUANT → BYTES PER PARAM
// ─────────────────────────────────────────────────────────────────────────

function getQuantBytesPerParam(fname) {
  const f = (fname || "").toLowerCase();
  if (f.includes("tq1_0") || f.includes("q1_0")) return 0.2;     // ~1.6 bits
  if (f.includes("iq2_")) return 0.28;                            // ~2.25 bits
  if (f.includes("q2_k")) return 0.3125;                          // ~2.5 bits
  if (f.includes("iq3_")) return 0.375;                           // ~3 bits
  if (f.includes("q3_k")) return 0.4375;                          // ~3.5 bits
  if (f.includes("iq4_")) return 0.5;                             // ~4 bits
  if (f.includes("q4_k") || f.includes("q4_0") || f.includes("q4_1")) return 0.5625; // ~4.5 bits
  if (f.includes("q5_k") || f.includes("q5_0") || f.includes("q5_1")) return 0.6875; // ~5.5 bits
  if (f.includes("q6_k")) return 0.8125;                          // ~6.5 bits
  if (f.includes("q8_k") || f.includes("q8_0")) return 1.0;       // 8 bits
  if (f.includes("f16") || f.includes("fp16")) return 2.0;        // 16 bits
  if (f.includes("f32") || f.includes("fp32")) return 4.0;        // 32 bits
  return 0.5625; // Default to Q4_K
}

// ─────────────────────────────────────────────────────────────────────────
// ARCHITECTURE ESTIMATES
// ─────────────────────────────────────────────────────────────────────────

function estimateLayers(params) {
  const p = params / 1e9;
  if (p <= 1.5) return 12;
  if (p <= 3)   return 24;
  if (p <= 8)   return 32;
  if (p <= 14)  return 40;
  if (p <= 20)  return 48;
  if (p <= 34)  return 60;
  if (p <= 70)  return 80;
  return 96;
}

function estimateHeadDim(params) {
  const p = params / 1e9;
  if (p <= 3) return 64;
  return 128; // most modern LLMs land here regardless of size
}

// GQA — most architectures use 8 KV heads independent of total head count.
const ESTIMATED_KV_HEADS = 8;

// ─────────────────────────────────────────────────────────────────────────
// MEMORY REQUIREMENTS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute disk / VRAM / RAM needs for a model in a given quantization
 * + context configuration.
 *
 * @param {object} model
 * @param {number} model.parameters       total params
 * @param {number} [model.activeParameters] for MoE; per-token compute params
 * @param {boolean} [model.isMoE]
 * @param {number} [model.context]        max context, capped at 8K for KV estimation
 * @param {string} [model.filename]       used for quant detection
 * @param {number} [model.layers]         override estimate
 * @param {number} [model.headDim]        override estimate
 * @param {number} [model.kvHeads]        override estimate (GQA)
 * @param {object} [options]
 * @param {string} [options.quantization]
 * @param {number} [options.contextSize]
 * @returns {{
 *   vram: number, vramGB: number,
 *   ram: number, ramGB: number,
 *   diskSpace: number, diskSpaceGB: number,
 *   kvCacheGB: number,
 *   modelWeightsBytes: number,
 *   canOffload: boolean, isMoE: boolean,
 *   description: string,
 *   breakdown: object,
 * }}
 */
export function computeMemoryRequirements(model, options = {}) {
  const {
    parameters,
    activeParameters,
    isMoE = false,
    context: defaultContext,
    filename = "",
  } = model;

  const contextSize = options.contextSize || defaultContext || 4096;
  // KV cache grows dynamically up to context; engines default to ~8K
  // for this allocation and grow on demand. Estimating against 8K
  // matches what node-llama-cpp / llama.cpp actually allocate at load.
  const kvContextSize = Math.min(contextSize, 8192);
  const bytesPerParam = getQuantBytesPerParam(options.quantization || filename);

  // For MoE, architecture estimates use ACTIVE params (the dense
  // sub-model that actually computes per token). Total-param-based
  // estimates over-count layers because MoE inflates via expert FFNs,
  // not depth.
  const estimateFrom = isMoE && activeParameters ? activeParameters : parameters;
  const layers  = model.layers  || estimateLayers(estimateFrom);
  const headDim = model.headDim || estimateHeadDim(estimateFrom);
  const kvHeads = model.kvHeads || ESTIMATED_KV_HEADS;

  // KV cache: 2 (K+V) × layers × kvHeads × headDim × context × 2 bytes (fp16)
  const kvCacheBytes = 2 * layers * kvHeads * headDim * kvContextSize * 2;
  const modelWeightsBytes = parameters * bytesPerParam;

  // ~10% overhead for activations + scratch space.
  const overheadFactor = 1.1;

  let vramBytes, ramBytes, canOffload, description;

  if (isMoE && activeParameters) {
    // MoE: only active experts compute per token, but ALL experts must
    // be loadable from somewhere. llama.cpp keeps the full model in
    // RAM and pulls active expert weights to GPU per token.
    const activeWeightsBytes = activeParameters * bytesPerParam;
    vramBytes = (activeWeightsBytes + kvCacheBytes) * overheadFactor;
    ramBytes  = modelWeightsBytes * overheadFactor;
    canOffload = true;
    description =
      `MoE model with ${(parameters / 1e9).toFixed(1)}B total / ${(activeParameters / 1e9).toFixed(1)}B active params. ` +
      `VRAM needed: ${(vramBytes / 1e9).toFixed(1)}GB (active params + KV cache). ` +
      `RAM needed: ${(ramBytes / 1e9).toFixed(1)}GB (full model). ` +
      `Experts offload to RAM when not in use.`;
  } else {
    // Dense: all weights need to be in (V)RAM at once.
    vramBytes = (modelWeightsBytes + kvCacheBytes) * overheadFactor;
    ramBytes  = modelWeightsBytes * 0.5; // backup/swap headroom
    canOffload = false;
    description =
      `Dense model with ${(parameters / 1e9).toFixed(1)}B params. ` +
      `VRAM needed: ${(vramBytes / 1e9).toFixed(1)}GB (weights + KV cache). ` +
      `Can offload layers to RAM if VRAM is insufficient.`;
  }

  return {
    vram: vramBytes,
    vramGB: +(vramBytes / 1e9).toFixed(2),
    ram: ramBytes,
    ramGB: +(ramBytes / 1e9).toFixed(2),
    diskSpace: modelWeightsBytes,
    diskSpaceGB: +(modelWeightsBytes / 1e9).toFixed(2),
    kvCacheGB: +(kvCacheBytes / 1e9).toFixed(2),
    modelWeightsBytes,
    canOffload,
    isMoE,
    description,
    breakdown: {
      parameters,
      activeParameters: activeParameters || parameters,
      bytesPerParam,
      layers,
      headDim,
      kvHeads,
      contextSize,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// FIT TIER
// ─────────────────────────────────────────────────────────────────────────

/**
 * Score how well a model fits the user's hardware. Returns a small object
 * that picker UIs use to sort and label entries.
 *
 *   tier 0  COMFORTABLE  vram fits with ≥20% headroom AND (for MoE) RAM has headroom too
 *   tier 1  TIGHT        loads but no headroom (will OOM under context growth or pressure)
 *   tier 2  OFFLOAD      doesn't fit VRAM; runs via CPU/RAM offload (slower)
 *   tier 3  WONT_FIT     not enough RAM+VRAM to load even with offload
 *
 * Apple Silicon's unified-memory architecture means "VRAM" and "RAM" are
 * the same pool — `memBudget` (computed in main.js as ~70% of total) is
 * the right ceiling. Discrete-GPU systems gate on `vram` first, fall
 * back to `memBudget` for offload.
 *
 * MoE models trigger an additional check: even if compute VRAM fits,
 * the FULL weight set must fit in RAM (experts swap in/out from RAM).
 * Without this, a 397B A17B model would be ranked Comfortable on a
 * 32 GB box that can't actually load its 149 GB of weights.
 *
 * @param {object} memoryReq sysInfo shape from computeMemoryRequirements
 * @param {object|null} sysInfo `{ ram, vram, memBudget, gpu, platform? }`
 * @returns {{ tier: 0|1|2|3, label: string, reason: string }}
 */
export function computeFitTier(memoryReq, sysInfo) {
  if (!sysInfo) {
    return { tier: 1, label: "Unknown", reason: "Hardware not detected" };
  }
  const isAppleSilicon =
    sysInfo.platform === "darwin" || /apple|m[1-9]/i.test(sysInfo.gpu || "");
  const effectiveVramBytes = isAppleSilicon
    ? Math.floor((sysInfo.memBudget || 0) * AS_GPU_SHARE)
    : sysInfo.vram > 0
      ? sysInfo.vram
      : Math.floor((sysInfo.memBudget || 0) * 0.5);
  const memBudget = sysInfo.memBudget || 0;
  const offloadCeilingBytes = Math.max(memBudget, effectiveVramBytes);

  const fmt = (b) => `${(b / 1e9).toFixed(1)}GB`;

  // MoE RAM-resident check runs first — a 149 GB model on a 32 GB box
  // can't load no matter how cheap its active compute looks.
  const moeFullModelBytes = memoryReq.isMoE ? memoryReq.modelWeightsBytes : 0;
  if (moeFullModelBytes && moeFullModelBytes > memBudget) {
    return {
      tier: 3,
      label: "Won't fit",
      reason: `MoE needs ${fmt(moeFullModelBytes)} of RAM for the full weight set; system budget is ${fmt(memBudget)}`,
    };
  }

  const need = memoryReq.vram;
  if (need <= effectiveVramBytes * DGPU_HEADROOM) {
    if (moeFullModelBytes && moeFullModelBytes > memBudget * DGPU_HEADROOM) {
      return {
        tier: 1,
        label: "Tight",
        reason: `MoE compute fits VRAM but full ${fmt(moeFullModelBytes)} weight set is close to RAM budget ${fmt(memBudget)}`,
      };
    }
    return {
      tier: 0,
      label: "Comfortable",
      reason: `Fits in ${fmt(effectiveVramBytes)} effective VRAM with headroom`,
    };
  }
  if (need <= effectiveVramBytes) {
    return {
      tier: 1,
      label: "Tight",
      reason: `Loads in VRAM but no headroom — may OOM under heavy context`,
    };
  }
  if (memoryReq.modelWeightsBytes <= offloadCeilingBytes * 0.9) {
    return {
      tier: 2,
      label: memoryReq.canOffload ? "Offload (MoE)" : "Offload (slow)",
      reason: `Doesn't fit in VRAM; runs with CPU/RAM offload`,
    };
  }
  return {
    tier: 3,
    label: "Won't fit",
    reason: `Needs ${fmt(memoryReq.vram)}; you have ${fmt(effectiveVramBytes)} effective VRAM and ${fmt(memBudget)} RAM budget`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// CONVENIENCE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute the effective-VRAM byte count for `sysInfo` using the same
 * rules as computeFitTier. Exported separately so picker UIs can show
 * the user "your effective VRAM is X" without re-implementing the
 * platform-detection logic.
 */
export function effectiveVramBytes(sysInfo) {
  if (!sysInfo) return 0;
  const isAppleSilicon =
    sysInfo.platform === "darwin" || /apple|m[1-9]/i.test(sysInfo.gpu || "");
  return isAppleSilicon
    ? Math.floor((sysInfo.memBudget || 0) * AS_GPU_SHARE)
    : sysInfo.vram > 0
      ? sysInfo.vram
      : Math.floor((sysInfo.memBudget || 0) * 0.5);
}
