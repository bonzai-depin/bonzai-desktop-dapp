/**
 * Theme switcher.
 *
 * Reads a stored theme on app boot, applies it to the document root
 * via `data-theme` so the CSS in `src/assets/themes.css` takes effect.
 * The whole app re-renders against the new tokens — same components,
 * same layouts, different look.
 *
 * Usage:
 *   import { themeService } from "@/services/theme.service.js";
 *   themeService.init();         // call once at app startup
 *   themeService.set("midnight"); // user picks from settings
 *   themeService.list();          // for the picker UI
 */

import { reactive, readonly } from "vue";

/* Each theme entry drives the picker UI. The `id` is what gets
   written to `data-theme`; the file `themes.css` defines the
   matching selector. */
const THEMES = [
  {
    id: "default",
    name: "BonzAI",
    blurb: "Brand · purple + emerald on dark canvas",
    swatch: ["#0a0a0f", "#61378e", "#10b981"],
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "OLED-friendly · deeper canvas + cooler purples",
    swatch: ["#050608", "#6b46c1", "#a78bfa"],
  },
  {
    id: "terminal",
    name: "Terminal",
    blurb: "Void-black · emerald-only · monospace headings",
    swatch: ["#000000", "#10b981", "#34d399"],
  },
  {
    id: "mistral",
    name: "Mistral",
    blurb: "Purple minimalism · light cream canvas",
    swatch: ["#faf7f2", "#553c9a", "#805ad5"],
  },
  {
    id: "warm",
    name: "Warm",
    blurb: "Cream + terracotta · Claude-shaped warmth",
    swatch: ["#fbf8f4", "#b3603e", "#e8b89e"],
  },
  {
    id: "nocturne",
    name: "Nocturne",
    blurb: "Pure dark · monochrome with single accent",
    swatch: ["#0c0c10", "#8a8aa0", "#d8d8e2"],
  },
];

const STORAGE_KEY = "bonzai.theme";
const DEFAULT_ID = "default";

const _state = reactive({
  current: DEFAULT_ID,
});

function _apply(id) {
  if (id === DEFAULT_ID) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
  _state.current = id;
}

function _persist(id) {
  try { window.localStorage?.setItem(STORAGE_KEY, id); } catch {}
}

function _read() {
  try {
    const v = window.localStorage?.getItem(STORAGE_KEY);
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch {}
  return DEFAULT_ID;
}

export const themeService = {
  state: readonly(_state),

  /** Read storage + apply. Idempotent. Call once on app boot. */
  init() {
    const id = _read();
    _apply(id);
  },

  /** Pick a theme by id. Persists to localStorage and applies. */
  set(id) {
    if (!THEMES.some((t) => t.id === id)) return;
    _apply(id);
    _persist(id);
  },

  /** All available themes — used to render the picker UI. */
  list() {
    return THEMES;
  },

  /** Currently active theme entry (with swatch + blurb). */
  active() {
    return THEMES.find((t) => t.id === _state.current) || THEMES[0];
  },
};

export default themeService;
