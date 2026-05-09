/**
 * Global command palette service.
 *
 * Cmd-K (mac) / Ctrl-K (win/linux) opens a fuzzy-searchable list of
 * actions: jump to a tab, open a modal, run a skill. Mirrors the
 * `modelPicker.service.js` shape — show/hide + reactive state — so
 * the modal at App.vue level stays simple.
 *
 * Commands are registered statically here for the v1 set; dynamic
 * sources (companions, models) can register at runtime via
 * `register({ id, label, … })` once their data sources are ready.
 */

import { reactive, readonly, computed } from "vue";
import { modelPicker } from "./modelPicker.service.js";

const _state = reactive({
  open: false,
  query: "",
});

/**
 * Static command set. Each entry:
 *   id        unique slug, used as Vue key
 *   label     primary text rendered in the row
 *   group     header the row falls under in the rail-style list
 *   keywords  extra terms the search matches against
 *   shortcut  optional kbd hint shown right-aligned
 *   action    function executed on activation
 */
const _commands = reactive([
  // ─── Tab navigation ──────────────────────────────────────────────
  { id: "tab.chat",      label: "Open Chat",         group: "Navigate", keywords: "llm text generate",         action: () => _setMode("chat") },
  { id: "tab.image",     label: "Open Image",        group: "Navigate", keywords: "flux sdxl z-image picture", action: () => _setMode("image") },
  { id: "tab.video",     label: "Open Video",        group: "Navigate", keywords: "ltx wan generation",        action: () => _setMode("video") },
  { id: "tab.audio",     label: "Open Audio",        group: "Navigate", keywords: "music tts kokoro qwen acestep", action: () => _setMode("music") },
  { id: "tab.3d",        label: "Open 3D",           group: "Navigate", keywords: "three dimensional",         action: () => _setMode("3D") },
  { id: "tab.agent",     label: "Open Agents",       group: "Navigate", keywords: "skill smart",               action: () => _setMode("agent") },
  { id: "tab.robot",     label: "Open Training",     group: "Navigate", keywords: "lerobot training",          action: () => _setMode("robot") },
  { id: "tab.company",   label: "Open Companies",    group: "Navigate", keywords: "zero human dao company",    action: () => _setMode("company") },

  // ─── Modals ──────────────────────────────────────────────────────
  { id: "modal.models",  label: "Choose a model…",   group: "Tools",    keywords: "llm picker engine swap",    shortcut: "⌥⏎",       action: () => modelPicker.show() },
  { id: "modal.network", label: "Network settings",  group: "Tools",    keywords: "p2p providers mode privacy peers", action: () => _dispatch("bonzai:open-network") },
  { id: "modal.specs",   label: "Hardware & stats",  group: "Tools",    keywords: "vram ram gpu performance",  action: () => _dispatch("bonzai:open-specs") },
  { id: "modal.rewards", label: "Rewards",           group: "Tools",    keywords: "mintpool epoch claim bonzai", action: () => _dispatch("bonzai:open-rewards") },
]);

function _setMode(mode) {
  _dispatch("bonzai:set-mode", mode);
}

function _dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// ─── Public API ───────────────────────────────────────────────────

export const commandPalette = {
  state: readonly(_state),
  commands: computed(() => _commands),

  show() { _state.open = true; _state.query = ""; },
  hide() { _state.open = false; _state.query = ""; },
  toggle() { _state.open ? this.hide() : this.show(); },

  setQuery(q) { _state.query = q; },

  /** Register a runtime command (companion shortcuts, model jump). */
  register(cmd) {
    if (!cmd?.id || typeof cmd.action !== "function") return;
    const existing = _commands.findIndex((c) => c.id === cmd.id);
    if (existing >= 0) _commands.splice(existing, 1, cmd);
    else _commands.push(cmd);
  },

  unregister(id) {
    const i = _commands.findIndex((c) => c.id === id);
    if (i >= 0) _commands.splice(i, 1);
  },

  /** Execute by id. Used by the modal on Enter / click. */
  run(id) {
    const cmd = _commands.find((c) => c.id === id);
    if (!cmd) return;
    this.hide();
    try { cmd.action(); }
    catch (e) { console.warn(`[command-palette] ${id} threw:`, e); }
  },
};

export default commandPalette;
