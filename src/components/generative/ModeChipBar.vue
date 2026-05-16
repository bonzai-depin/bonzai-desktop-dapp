<template>
  <div class="bz-modebar">
    <button
      v-for="m in items"
      :key="m.value"
      type="button"
      class="bz-mode-chip"
      :class="{
        'bz-mode-chip--on': modelValue === m.value,
        'bz-mode-chip--compact': compact,
      }"
      :disabled="m.disabled || disabled"
      :title="m.title"
      @click="$emit('update:modelValue', m.value)"
    >
      <span v-if="m.icon" class="material-symbols-outlined" :style="iconStyle" aria-hidden="true">{{ m.icon }}</span>
      <span v-if="!iconOnly" class="bz-mode-chip__label">{{ m.label }}</span>
      <span v-if="m.badge && !iconOnly" class="bz-mode-chip__badge bz-mono bz-meta">{{ m.badge }}</span>
    </button>
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";
/**
 * ModeChipBar
 * ──────────
 * Replaces Bulma radio-button mode selectors with compact design-system
 * chips. Drop-in replacement for `<input type="radio">` + `<label>`
 * patterns used in Image, Video, Audio, and 3D tabs.
 *
 * Props:
 *   `items`      — Array<{value, label, icon?, badge?, title?, disabled?}>
 *   `modelValue` — Currently selected value (v-model)
 *   `disabled`   — Global disabled state
 *   `compact`    — Smaller chips for dense rows (FPS, resolution, etc.)
 *   `iconOnly`   — Show icons only, no labels (quality toggles SD/HD/2K/4K)
 *   `iconSize`   — Override default icon size (default: 18px)
 */
const props = defineProps({
  items:      { type: Array,  default: () => [] },
  modelValue: { type: [String, Number], default: "" },
  disabled:   { type: Boolean, default: false },
  compact:    { type: Boolean, default: false },
  iconOnly:   { type: Boolean, default: false },
  iconSize:   { type: Number,  default: 18 },
});

defineEmits(["update:modelValue"]);

const iconStyle = computed(() => ({
  fontSize: `${props.iconSize}px !important`,
}));
</script>

<style scoped>
.bz-modebar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
}

.bz-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  height: 36px;
  padding: 0 var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-mode-chip:hover:not(:disabled) {
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-mode-chip--on {
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
}
.bz-mode-chip--compact {
  height: 28px;
  padding: 0 var(--bz-space-3);
  font-size: var(--bz-size-meta);
}
.bz-mode-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.bz-mode-chip .material-symbols-outlined { font-size: 18px !important; }

.bz-mode-chip__badge {
  margin-left: var(--bz-space-1);
  padding: 1px 6px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  font-size: 10px;
}
</style>
