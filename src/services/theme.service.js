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
    name: "BonzAI Noir",
    blurb: "BonzAI brand · dark canvas + purple + emerald",
    swatch: ["#0a0a0f", "#8b5cf6", "#10b981"],
  },
  {
    id: "light",
    name: "Studio Light",
    blurb: "Professional light · Stripe-inspired clarity",
    swatch: ["#f9fafb", "#6d28d9", "#059669"],
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "OLED-friendly · deeper canvas + cooler purples",
    swatch: ["#050608", "#6b46c1", "#a78bfa"],
  },
  {
    id: "terminal",
    name: "Operator",
    blurb: "Void-black · emerald command surface",
    swatch: ["#000000", "#10b981", "#34d399"],
  },
  {
    id: "mistral",
    name: "Provence",
    blurb: "French minimalism · cream canvas + violet accents",
    swatch: ["#faf7f2", "#553c9a", "#805ad5"],
  },
  {
    id: "warm",
    name: "Terracotta",
    blurb: "Cream + terracotta · editorial warmth",
    swatch: ["#fbf8f4", "#b3603e", "#e8b89e"],
  },
  {
    id: "nocturne",
    name: "Nocturne",
    blurb: "Pure dark · monochrome with single accent",
    swatch: ["#0c0c10", "#8a8aa0", "#d8d8e2"],
  },
  { id: "waveform", name: "Waveform", blurb: "Cinematic audio UI · black + blue + cyan", swatch: ["#05070c", "#2563eb", "#22d3ee"] },
  { id: "blueprint", name: "Blueprint", blurb: "Infrastructure console · navy + amber signal", swatch: ["#07111f", "#38bdf8", "#facc15"] },
  { id: "papergrid", name: "Papergrid", blurb: "Documentation calm · paper + ink + green", swatch: ["#fbfaf7", "#111827", "#16a34a"] },
  { id: "popcanvas", name: "Pop Canvas", blurb: "Creative tooling · white canvas + precise color", swatch: ["#ffffff", "#0ea5e9", "#ef4444"] },
  { id: "carbon", name: "Carbon Ledger", blurb: "Dense fintech · graphite + blue trust", swatch: ["#09090b", "#3b82f6", "#22c55e"] },
  { id: "trackline", name: "Trackline", blurb: "Performance launch · black + redline + gold", swatch: ["#050505", "#ef4444", "#f59e0b"] },
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
