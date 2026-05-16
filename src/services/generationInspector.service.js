/**
 * Generation inspector — global slide-in right-rail.
 *
 * Any Generative component (image, video, audio, music, text) can call
 * `inspector.show(generation)` to open the rail with that generation's
 * metadata. Lives at App.vue level so it works across tabs without
 * mounting per-component copies.
 *
 * Shape of `generation` is forgiving — every field is optional, and
 * the component renders only what's present:
 *
 *   {
 *     id?, kind?: "image"|"video"|"audio"|"music"|"text",
 *     mediaUrl?: string,           // primary preview source
 *     prompt?: string,
 *     outputText?: string,
 *     rawOutputText?: string,
 *     negativePrompt?: string,
 *     model?: string,              // human-readable model name
 *     modelId?: string,            // canonical id
 *     status?: string,
 *     errorMessage?: string,
 *     seed?: number|string,
 *     maxTokens?: number,
 *     temperature?: number,
 *     reasoning?: string,
 *     systemPrompt?: string,
 *     steps?: number,
 *     guidanceScale?: number,
 *     width?: number,
 *     height?: number,
 *     networkMode?: "local"|"consumer"|"private",
 *     peerId?: string,
 *     mintState?: { network, txHash, contract, tokenId },
 *     lineage?: { parentId, rootId, depth, pinned },
 *     ts?: number,
 *     extra?: Record<string, string|number>,  // anything domain-specific
 *   }
 */

import { reactive, readonly } from "vue";

const _state = reactive({
  open: false,
  generation: null,
});

export const inspector = {
  state: readonly(_state),

  show(generation) {
    _state.generation = generation || null;
    _state.open = true;
  },

  hide() {
    _state.open = false;
    // Keep `generation` cached for the slide-out animation; clear on
    // the next show or after the transition completes.
  },

  /** Internal — called by the rail after the close transition. */
  _clear() {
    _state.generation = null;
  },
};

export default inspector;
