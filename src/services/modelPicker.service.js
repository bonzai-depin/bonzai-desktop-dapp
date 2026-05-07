/**
 * Tiny global service for the LLM model picker modal.
 *
 * Any component (or plain JS in main/preload-side handlers) can call
 * `modelPicker.show()` to open the picker without leaving the current
 * screen. The modal lives at App.vue level so it doesn't depend on
 * GenerativeText or the Chat tab being mounted.
 *
 * The reactive `state` is read by `LlmModelPickerModal.vue`.
 */

import { reactive, readonly } from "vue";

const _state = reactive({
  open: false,
  // Optional callback fired when the user picks a model. Lets a caller
  // (e.g. a roleplay component asking "pick a model first") react to
  // selection without polling modelStore. Cleared after the modal closes.
  onPick: null,
});

export const modelPicker = {
  state: readonly(_state),

  show(opts = {}) {
    _state.open = true;
    _state.onPick = typeof opts.onPick === "function" ? opts.onPick : null;
  },

  hide() {
    _state.open = false;
    _state.onPick = null;
  },

  /** Called from inside the modal once a user picks; fires onPick + closes. */
  _resolve(model) {
    const cb = _state.onPick;
    _state.onPick = null;
    _state.open = false;
    if (cb) {
      try { cb(model); } catch (e) { console.warn("[modelPicker] onPick threw:", e); }
    }
  },
};

export default modelPicker;
