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
  // ─── Create ──────────────────────────────────────────────────────
  { id: "tab.chat",      label: "Create: Chat",        group: "Create",  keywords: "llm text generate",         action: () => _setMode("chat") },
  { id: "tab.image",     label: "Create: Image",       group: "Create",  keywords: "flux sdxl z-image picture", action: () => _setMode("image") },
  { id: "tab.audio",     label: "Create: Audio",       group: "Create",  keywords: "music tts kokoro qwen acestep", action: () => _setMode("music") },
  { id: "tab.video",     label: "Create: Video",       group: "Create",  keywords: "ltx wan generation",        action: () => _setMode("video") },
  { id: "tab.game",      label: "Create: Game",        group: "Create",  keywords: "three dimensional 3d game",  action: () => _setMode("game") },

  // ─── Earn ────────────────────────────────────────────────────────
  { id: "modal.rewards",      label: "Earn: Rewards",       group: "Earn",   keywords: "mintpool epoch claim bonzai", action: () => _dispatch("bonzai:open-rewards") },

  // ─── Automate ────────────────────────────────────────────────────
  { id: "tab.agent",     label: "Automate: Agents",    group: "Automate", keywords: "skill smart companion",     action: () => _setMode("agent") },
  { id: "tab.company",   label: "Automate: Company",   group: "Automate", keywords: "zero human dao company",    action: () => _setMode("company") },

  // ─── Train ───────────────────────────────────────────────────────
  { id: "tab.train-chat",  label: "Train: Chat",   group: "Train",   keywords: "llm training text",       action: () => _setMode("robot-train-chat") },
  { id: "tab.train-image", label: "Train: Image",  group: "Train",   keywords: "sdxl training image",     action: () => _setMode("robot-train-image") },
  { id: "tab.train-audio", label: "Train: Audio",  group: "Train",   keywords: "audio training tts",     action: () => _setMode("robot-train-audio") },

  // ─── Help ────────────────────────────────────────────────────────
  { id: "tab.faq",          label: "Help: FAQ",          group: "Help",   keywords: "faq questions help",        action: () => _setMode("faq") },
  { id: "help.harness",     label: "Help: Harness",      group: "Help",   keywords: "openclaw hermes orchestration", action: () => _dispatch("bonzai:open-network") },

  // ─── Tools ───────────────────────────────────────────────────────
  { id: "modal.models",  label: "Choose a model…",   group: "Tools",    keywords: "llm picker engine swap",    shortcut: "⌥⏎",       action: () => modelPicker.show() },
  { id: "modal.specs",   label: "Hardware & stats",  group: "Tools",    keywords: "vram ram gpu performance",  action: () => _dispatch("bonzai:open-specs") },
  { id: "modal.network", label: "Network settings",  group: "Tools",    keywords: "p2p providers mode privacy peers", action: () => _dispatch("bonzai:open-network") },
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
