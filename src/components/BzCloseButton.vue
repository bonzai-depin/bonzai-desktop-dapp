<template>
  <button
    type="button"
    class="bz-close"
    :class="[
      `bz-close--${size}`,
      `bz-close--${variant}`,
    ]"
    :aria-label="ariaLabel"
    :title="title || ariaLabel"
    @click="$emit('click', $event)"
  >
    <span class="material-symbols-outlined" aria-hidden="true">close</span>
  </button>
</template>

<script setup>
defineProps({
  /** "sm" 28×28 · "md" 36×36 (default) · "lg" 44×44 */
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg"].includes(v),
  },
  /** "ghost" (default — transparent + hairline) · "subtle" (no border) */
  variant: {
    type: String,
    default: "ghost",
    validator: (v) => ["ghost", "subtle"].includes(v),
  },
  ariaLabel: { type: String, default: "Close" },
  title: { type: String, default: "" },
});
defineEmits(["click"]);
</script>

<style scoped>
/* Single canonical close button — replaces the assorted
   `is-danger is-large/small/medium`, `material-symbols-outlined close`-
   in-a-button-tag, and bare `<span>close</span>` patterns scattered
   across the app. Uses tokens; the brand colour is reserved for
   actual brand moments, not for "go away". */

.bz-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
  border-radius: var(--bz-r);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}

.bz-close:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}

/* Size variants — keep the icon glyph proportional. */
.bz-close--sm  { width: 28px; height: 28px; }
.bz-close--md  { width: 36px; height: 36px; }
.bz-close--lg  { width: 44px; height: 44px; }
.bz-close--sm .material-symbols-outlined { font-size: 16px !important; }
.bz-close--md .material-symbols-outlined { font-size: 18px !important; }
.bz-close--lg .material-symbols-outlined { font-size: 22px !important; }

/* Subtle variant — drops the border, used inside flush headers. */
.bz-close--subtle {
  border-color: transparent;
}
.bz-close--subtle:hover {
  border-color: transparent;
  background: var(--bz-raised);
}
</style>
