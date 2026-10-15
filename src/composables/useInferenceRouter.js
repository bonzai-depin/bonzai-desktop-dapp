/**
 * Inference Router Composable
 *
 * Thin wrapper around the unified `inference-request` IPC handler.
 * All routing logic (local vs consumer vs pipeline) lives in main.js.
 * Components call `inferenceRequest(pipeline, params)` for everything.
 *
 * Returns null if the IPC channel isn't available (shouldn't happen).
 */

export function useInferenceRouter() {
  /**
   * Route an inference request through the unified handler.
   * Main process decides local vs remote vs pipeline based on network config.
   *
   * @param {string} pipeline - Pipeline key (e.g. 'image_turbo', 'audio_turbo', 'llm')
   * @param {Object} params - Request parameters
   * @returns {Promise<{ok: boolean, result?: Object, remote?: boolean, pipeline?: boolean, error?: string} | null>}
   */
  async function inferenceRequest(pipeline, params) {
    if (!window.electronAPI?.inferenceRequest) return null;
    const started = performance.now();
    const response = await window.electronAPI.inferenceRequest(pipeline, params);
    if (!response) return response;
    const elapsedMs = Math.round(performance.now() - started);
    // Include remote execution/transport, retaining the provider's own timing
    // when supplied. A useLocal response is only routing, not a generation.
    if (response.useLocal) return response;
    const result = response.result;
    return {
      ...response,
      elapsedMs,
      ...(result && typeof result === 'object' && !Array.isArray(result)
        ? { result: { ...result, elapsed_ms: result.elapsed_ms ?? elapsedMs } } : {}),
    };
  }

  return { inferenceRequest };
}
