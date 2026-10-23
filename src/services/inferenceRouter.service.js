/**
 * Renderer-side inference router for Flask diffusion endpoints.
 *
 * One job: when a flagship skill calls `callFlaskEndpoint("/image/quality", ...)`
 * we want the Electron main process to decide where it actually runs based on
 * the user's networking-modal selection — local Flask, a remote provider's
 * Flask via /bonzai/v1/inference, or a sharded DiT session via
 * /bonzai/v2/pipeline. All of that policy already lives in the
 * `inference-request` IPC handler in src/main.js (which reads
 * `p2p.networkMode` + `p2p.pipeline.enabled` from the store and consults the
 * user's `p2p.selectedProviders` list). We just need every Flask call site to
 * funnel through that handler.
 *
 * This module is a thin shim: it maps Flask endpoint paths to the canonical
 * pipeline names the main handler understands, invokes the IPC, and reports
 * either a result or "fall back to local fetch" (the same signal main returns
 * when it has no remote providers ready).
 *
 * OpenRouter uses the user's funded account and explicit media selections.
 * Provider errors are surfaced; only an explicit local-route response permits
 * local fallback, so a failed paid request cannot silently start another engine.
 */

// Endpoints we know how to route. Anything not in this table is left to the
// caller's localhost fallback — image-to-image, generation websockets,
// model-management endpoints, etc. live outside the P2P surface.
//
// VIDEO_QUALITY does not yet have its own pipeline category in
// BonzaiProviderRegistry (the enum stops at VISION=10). We map it to
// `video_quality` here for the renderer, but main.js's `routeInferenceRequest`
// + provider eligibility checks treat it as part of the video pool until the
// contract is updated.
const ENDPOINT_TO_PIPELINE = Object.freeze({
  '/image/image/turbo': 'image_turbo_edit',
  '/audio/quality/design': 'audio_quality',
  '/audio/quality/clone': 'audio_quality',
  '/image/turbo':            'image_turbo',
  '/image/quality':          'image_quality',
  '/image/advanced':         'image_advanced',
  '/image/standard':         'image_standard',
  '/image/qwen-2.1':          'image_standard',
  '/image/image/standard':    'image_standard',
  '/audio/turbo':            'audio_turbo',
  '/audio/quality/persona':  'audio_quality',
  '/audio/music':            'music',
  '/video':                  'video_fast',
  '/video/sota':             'video_sota',
  '/video/quality':          'video_quality',
  '/vision/analyze':         'vision',
  '/vision/caption':         'vision_caption',
  '/vision/ocr':             'ocr',
});

/**
 * SDXL (image_standard) is a U-Net with skip connections that don't admit a
 * clean depth-pipeline split — the early downsample's output feeds the late
 * upsample directly, so a "middle" remote peer cannot be self-contained
 * without seeing both ends of the latent. In Consumer+Privacy mode we
 * therefore fall back to single-provider routing (same privacy model as
 * Consumer mode) for SDXL, and surface a renderer-side "single-provider"
 * badge so the user knows. Local mode is unaffected — SDXL remains fully
 * private when run locally, as today.
 */
const NON_SHARDABLE_PIPELINES = new Set(['image_standard']);

export function pipelineForEndpoint(endpoint) {
  return ENDPOINT_TO_PIPELINE[endpoint] ?? null;
}

export function isShardablePipeline(pipeline) {
  return pipeline != null && !NON_SHARDABLE_PIPELINES.has(pipeline);
}

/**
 * Try to route a Flask call through the main-process inference handler.
 *
 * Returns one of:
 *   { handled: true,  result }   — main returned a remote result; use it
 *   { handled: false, reason }   — caller should fall back to localhost fetch
 *
 * Never throws on routing failures — main's "useLocal: true" reply is the
 * normal "fall back" signal, and any exception talking to IPC is treated as
 * the same. Hard inference errors from a remote provider DO throw, since
 * those represent a real generation failure the caller should surface.
 */
export async function routeFlaskRequest(endpoint, payload) {
  const ipc = window.electronAPI?.inferenceRequest;
  if (typeof ipc !== 'function') {
    return { handled: false, reason: 'no-ipc' };
  }

  const pipeline = pipelineForEndpoint(endpoint);
  if (!pipeline) {
    // Unmapped endpoint — caller routes locally. This is the right default
    // for everything outside the P2P set (image-to-image, model-mgmt, etc.).
    return { handled: false, reason: 'unmapped-endpoint' };
  }

  let response;
  try {
    response = await ipc(pipeline, payload);
  } catch (err) {
    if ((await window.electronAPI?.openRouter?.status?.())?.active) throw err;
    console.warn(`[InferenceRouter] IPC failed for ${endpoint}; using local fallback:`, err?.message);
    return { handled: false, reason: 'ipc-error' };
  }

  if (!response) return { handled: false, reason: 'empty-response' };

  // Main signals "no viable remote routing for this request — caller should
  // hit localhost itself". Happens when networkMode=local/provider, or when
  // consumer mode has no eligible providers. The renderer's existing
  // localhost path handles that uniformly.
  if (response.useLocal === true || response.ok === false) {
    if (response.error && ['no_providers', 'openrouter_error'].includes(response.code)) {
      // User explicitly picked consumer mode but has nothing selected —
      // surface this so the renderer can show actionable feedback rather
      // than silently doing local inference.
      const err = new Error(response.error);
      err.code = response.code;
      throw err;
    }
    return { handled: false, reason: response.error || 'use-local' };
  }

  if (response.ok && response.result) {
    return { handled: true, result: response.result, remote: !!response.remote };
  }

  // Anything else is an unexpected shape — treat as fallback rather than
  // failing loudly, since the localhost path is always a safe retry.
  return { handled: false, reason: 'unexpected-response-shape' };
}
