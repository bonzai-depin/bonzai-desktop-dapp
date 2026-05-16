<template>
  <div class="bz-gen-actions">
    <button
      v-for="a in visibleActions"
      :key="a.id"
      type="button"
      class="bz-gen-action"
      :class="actionClass(a)"
      :disabled="a.disabled"
      :title="a.title || a.label"
      :aria-label="a.label"
      @click="$emit('action', a.id)"
    >
      <span class="material-symbols-outlined" aria-hidden="true">
        {{ a.icon }}
      </span>
      <span v-if="!isIconOnly(a)" class="bz-gen-action__label">{{ a.label }}</span>
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
  return props.iconOnly || a.iconOnly || ["copy", "restore", "delete"].includes(a.id);
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
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
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

/* Variants — lean into colour for state, never as a button */
.bz-gen-action--primary {
  background: var(--bz-gradient-brand);
  border-color: transparent;
  color: var(--bz-on-accent);
}
.bz-gen-action--primary:hover:not(:disabled) {
  filter: brightness(1.08);
  background: var(--bz-gradient-brand);
  color: var(--bz-on-accent);
}
.bz-gen-action--success {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-soft);
  background: var(--bz-emerald-soft);
}
.bz-gen-action--success:hover:not(:disabled) {
  color: var(--bz-emerald-700);
  border-color: var(--bz-emerald-500);
}
.bz-gen-action--warning {
  color: var(--bz-warning);
  border-color: var(--bz-warning-soft);
}
.bz-gen-action--warning:hover:not(:disabled) {
  background: var(--bz-warning-soft);
}
.bz-gen-action--destructive {
  color: var(--bz-fg-low);
}
.bz-gen-action--destructive:hover:not(:disabled) {
  color: var(--bz-danger);
  border-color: var(--bz-danger-soft);
  background: var(--bz-danger-soft);
}
</style>
