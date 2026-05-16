<template>
  <kbd
    class="bzkbd"
    :class="[
      `bzkbd--${size}`,
      `bzkbd--${variant}`,
      { 'bzkbd--combo': keys.length > 1 },
    ]"
    :aria-label="label"
  >
    <span
      v-for="(key, idx) in keys"
      :key="idx"
      class="bzkbd__key"
    >
      <span v-if="idx > 0" class="bzkbd__sep">+</span>
      <span class="bzkbd__glyph">{{ glyphFor(key) }}</span>
    </span>
  </kbd>
</template>

<script setup>
/**
 * BonzaiKbd
 * ─────────
 * Keyboard shortcut visualization — Linear / Superhuman / Raycast grade.
 *
 * Never show raw key names in body text. Wrap every shortcut in this
 * component so the UI reads as "keyboard-first" rather than "bare text".
 *
 * Usage:
 *   <BonzaiKbd keys="mod,enter" />     → ⌘↩ (mac) or Ctrl+Enter (win)
 *   <BonzaiKbd keys="shift,k" />       → ⇧K
 *   <BonzaiKbd keys="esc" />           → Esc
 *   <BonzaiKbd keys="cmd,k" size="sm" />
 *
 * Props:
 *   `keys`    — comma-separated key names or pre-split array
 *   `size`    — "sm" (20px) | "md" (24px, default) | "lg" (28px)
 *   `variant` — "default" (pill shape) | "flat" (rect, denser)
 *   `label`   — aria-label (auto-generated if omitted)
 *
 * Supported key names:
 *   mod, cmd, ctrl, shift, alt, option, enter, return, esc, tab,
 *   space, up, down, left, right, backspace, delete, plus
 *   plus any single letter/number/fn key passed through as-is.
 */
import { computed } from "vue";

const props = defineProps({
  keys: {
    type: [String, Array],
    required: true,
  },
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg"].includes(v),
  },
  variant: {
    type: String,
    default: "default",
    validator: (v) => ["default", "flat"].includes(v),
  },
  label: { type: String, default: "" },
});

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const keys = computed(() => {
  if (Array.isArray(props.keys)) return props.keys.map((k) => String(k).trim());
  return String(props.keys)
    .split(/[+, ]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
});

const glyphMap = {
  mod:    isMac ? "⌘" : "Ctrl",
  cmd:    "⌘",
  ctrl:   "Ctrl",
  control:"Ctrl",
  shift:  "⇧",
  alt:    isMac ? "⌥" : "Alt",
  option: "⌥",
  enter:  "↩",
  return: "↩",
  esc:    "Esc",
  tab:    "⇥",
  space:  "␣",
  up:     "↑",
  down:   "↓",
  left:   "←",
  right:  "→",
  backspace: "⌫",
  delete: "Del",
  plus:   "+",
};

function glyphFor(key) {
  return glyphMap[key] ?? key.toUpperCase();
}

const defaultLabel = computed(() => {
  if (props.label) return props.label;
  return keys.value.map(glyphFor).join(" plus ");
});
</script>

<style scoped>
.bzkbd {
  display: inline-flex;
  align-items: center;
  font-family: var(--bz-font-mono);
  font-feature-settings: "tnum" 1;
  line-height: 1;
  color: var(--bz-fg-mid);
  background: var(--bz-surface-1);
  border: 1px solid var(--bz-border);
  vertical-align: middle;
  white-space: nowrap;
  user-select: none;
}

/* Size */
.bzkbd--sm { height: 20px; padding: 0 6px; font-size: 10px; border-radius: 5px; gap: 3px; }
.bzkbd--md { height: 24px; padding: 0 8px; font-size: 11px; border-radius: 6px; gap: 4px; }
.bzkbd--lg { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 7px; gap: 5px; }

/* Variant: flat — no pill radius, denser */
.bzkbd--flat { border-radius: var(--bz-r-sm); border-color: var(--bz-border-strong); }

/* Key cluster */
.bzkbd__key { display: inline-flex; align-items: center; }
.bzkbd__sep {
  margin: 0 3px;
  color: var(--bz-fg-faint);
  font-weight: 400;
}
.bzkbd__glyph {
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* Combo spacing */
.bzkbd--combo .bzkbd__sep { margin: 0 4px; }

/* Slight press visual */
.bzkbd:active {
  background: var(--bz-surface-3);
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
}
</style>
