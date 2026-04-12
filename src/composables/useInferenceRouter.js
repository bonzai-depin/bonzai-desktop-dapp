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
    return window.electronAPI.inferenceRequest(pipeline, params);
  }

  return { inferenceRequest };
}
