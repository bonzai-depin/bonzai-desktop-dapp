<script setup>
import { operationText } from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
const ui = (text) => operationText(text, i18n.state.locale);
defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, default: "Overview" },
});
defineEmits(["select"]);
</script>
<template>
  <div class="company-metrics" :aria-label="ui(label)" data-i18n-skip>
    <component
      v-for="item in items"
      :key="item.id"
      :is="item.action ? 'button' : 'div'"
      :type="item.action ? 'button' : undefined"
      class="company-metric"
      :class="[
        item.tone ? `is-${item.tone}` : '',
        { 'is-selected': item.selected },
      ]"
      :aria-pressed="
        item.action && typeof item.selected === 'boolean'
          ? item.selected
          : undefined
      "
      @click="item.action && $emit('select', item)"
    >
      <span class="company-metric__label"
        >{{ ui(item.label)
        }}<span
          v-if="item.icon"
          class="material-symbols-outlined"
          aria-hidden="true"
          >{{ item.icon }}</span
        ></span
      >
      <strong class="bz-metric">{{ item.value }}</strong>
      <span v-if="item.hint" class="company-metric__hint">{{
        ui(item.hint)
      }}</span>
      <span
        v-if="item.action"
        class="company-metric__link material-symbols-outlined"
        aria-hidden="true"
        >arrow_forward</span
      >
    </component>
  </div>
</template>
<style scoped>
.company-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
  gap: var(--bz-space-3);
  margin: 0 0 var(--bz-space-6);
}
.company-metric {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--bz-space-2);
  min-width: 0;
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  background: var(--bz-panel);
  color: var(--bz-fg);
  text-align: left;
  font: inherit;
}
button.company-metric {
  cursor: pointer;
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
button.company-metric:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
}
.company-metric.is-selected {
  border-color: var(--bz-accent);
  background: var(--bz-accent-soft);
}
.company-metric__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  color: var(--bz-fg-mid);
  font: 400 13px/1.45 var(--bz-font-body);
}
.company-metric__label .material-symbols-outlined {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--bz-fg-low);
}
.company-metric strong {
  font-size: clamp(28px, 2.4vw, 38px);
  line-height: 1.15;
  overflow-wrap: anywhere;
  padding-right: var(--bz-space-5);
}
.company-metric__hint {
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.5;
  padding-right: var(--bz-space-5);
}
.company-metric__link {
  position: absolute;
  right: var(--bz-space-4);
  bottom: var(--bz-space-5);
  color: var(--bz-fg-low);
  font-size: 18px;
}
.company-metric.is-warning .company-metric__label .material-symbols-outlined {
  color: var(--bz-warning);
}
.company-metric.is-danger .company-metric__label .material-symbols-outlined {
  color: var(--bz-danger);
}
.company-metric.is-success .company-metric__label .material-symbols-outlined {
  color: var(--bz-success);
}
button.company-metric:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .company-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--bz-space-2);
  }
  .company-metric {
    padding: var(--bz-space-4);
  }
  .company-metric strong {
    font-size: 28px;
  }
  .company-metric__label {
    font-size: 12px;
  }
  .company-metric__label .material-symbols-outlined {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  button.company-metric {
    transition: none;
  }
}
</style>
