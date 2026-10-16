<template>
  <div class="bz-gen-actions">
    <button
      v-for="a in visibleActions"
      :key="a.id"
      type="button"
      class="bz-gen-action"
      :class="actionClass(a)"
      :disabled="a.disabled"
      :title="$ui(a.title || a.label)"
      :aria-label="$ui(a.label || a.title || a.id)"
      @click="$emit('action', a.id)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">
        {{ a.icon }}
      </span>
      <span v-if="!isIconOnly(a)" class="bz-gen-action__label">{{ $ui(a.label) }}</span>
    </button>
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /**
   * Array of action descriptors. Common shape:
   *   { id, icon, label, title?, disabled?, hidden?, variant? }
   * `variant` values: "default" · "primary" · "success" · "warning" ·
   * "destructive". Visual treatment maps via `.bz-gen-action--*`.
   */
  actions: { type: Array, required: true },
  /** When true, render icons only (no labels). Use in tight rows. */
  iconOnly: { type: Boolean, default: false },
});

defineEmits(["action"]);

const visibleActions = computed(() => props.actions.filter((a) => !a.hidden));

function actionClass(a) {
  return [
    `bz-gen-action--${a.variant || "default"}`,
    { "bz-gen-action--icon-only": isIconOnly(a) },
  ];
}

function isIconOnly(a) {
  return props.iconOnly || a.iconOnly || ["download", "save", "copy", "restore", "delete", "inspect"].includes(a.id);
}
</script>

<style scoped>
/* Single canonical action cluster. Replaces the assorted
   `is-medium is-success / is-warning / is-danger / is-info` button
   patterns in GenerativeImage / Video / Audio history items.
   Variants describe MEANING (success/destructive) so the brand
   accent and danger colour are reserved for what they signal. */

.bz-gen-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.bz-gen-actions::-webkit-scrollbar {
  display: none;
}

.bz-gen-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: max-content;
  height: 32px;
  padding: 0 10px;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-gen-action:hover:not(:disabled) {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-gen-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bz-gen-action .material-symbols-outlined {
  font-size: 16px !important;
  flex-shrink: 0;
}

.bz-gen-action--icon-only {
  width: 32px;
  height: 32px;
  padding: 0;
  justify-content: center;
}
.bz-gen-action--icon-only .bz-gen-action__label { display: none; }

/* Paired opaque colors stay readable over any generated media. */
.bz-gen-action--primary,
.bz-gen-action--primary:hover:not(:disabled) {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}
.bz-gen-action--success { border-color: var(--bz-emerald-500); }
.bz-gen-action--warning { border-color: var(--bz-warning); }
.bz-gen-action--destructive:hover:not(:disabled) {
  background: var(--bz-danger);
  border-color: var(--bz-danger);
  color: var(--bz-on-danger);
}
.bz-gen-action:disabled {
  opacity: 1;
  background: var(--bz-raised);
  color: var(--bz-fg-mid);
  border-color: var(--bz-border-strong);
}
.bz-gen-action:focus-visible {
  outline: 2px solid var(--bz-fg);
  outline-offset: -3px;
}
</style>
