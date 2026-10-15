<template>
  <section
    class="workflow-progress company-screen"
    :class="{ 'is-compact': compact }"
    data-i18n-skip
    :aria-label="$ui('Workflow progress')"
  >
    <ol class="workflow-progress__steps">
      <li
        v-for="(stage, index) in stages"
        :key="stage.id"
        :class="'is-' + stage.status"
        :aria-current="
          ['active', 'waiting', 'blocked'].includes(stage.status)
            ? 'step'
            : undefined
        "
      >
        <span class="workflow-progress__marker" aria-hidden="true"
          ><span
            v-if="stage.status === 'done'"
            class="material-symbols-outlined"
            >check</span
          ><span v-else class="bz-metric">{{ index + 1 }}</span></span
        >
        <div>
          <strong>{{ $ui(stage.label) }}</strong
          ><small>{{ $ui(progressStatusLabel(stage.status)) }}</small
          ><span
            v-if="stage.owner && !compact"
            class="workflow-progress__owner"
            >{{ $ui(stage.owner) }}</span
          >
        </div>
      </li>
    </ol>
    <p
      v-for="stage in stages.filter((item) => item.detail)"
      :key="stage.id"
      class="workflow-progress__reason"
      :class="'is-' + stage.status"
    >
      {{ $ui(stage.detail) }}
    </p>
    <details
      v-if="issue?.execution?.steps?.length && !compact"
      class="workflow-progress__receipts"
    >
      <summary>
        {{ $ui("Recorded actions") }}
        <span class="bz-metric">{{ issue.execution.steps.length }}</span>
      </summary>
      <ol>
        <li v-for="step in issue.execution.steps" :key="step.id">
          <strong>{{ executionStepLabel(step) }}</strong
          ><span>{{ $ui(step.status) }}</span>
          <p v-if="step.error">{{ step.error }}</p>
        </li>
      </ol>
    </details>
  </section>
</template>
<script setup>
import "./company-design.css";
import {
  progressStatusLabel,
  executionStepLabel,
} from "../../services/company/workflowProgress.js";
defineProps({
  stages: { type: Array, default: () => [] },
  issue: Object,
  compact: Boolean,
});
</script>
<style scoped>
.workflow-progress { min-width: 0; padding: var(--bz-space-5) 0; color: var(--bz-fg); container-type: inline-size; }
.workflow-progress__steps { display: flex; list-style: none; margin: 0; padding: 0 0 var(--bz-space-2); gap: 0; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.workflow-progress__steps > li { position: relative; flex: 1 0 92px; min-width: 0; padding-right: var(--bz-space-4); display: flex; flex-direction: column; gap: var(--bz-space-3); font-size: var(--bz-size-meta); }
.workflow-progress__steps > li:last-child { padding-right: 0; }
.workflow-progress__steps > li:not(:last-child)::after { content: ''; height: 1px; background: var(--bz-border-strong); position: absolute; top: 17px; left: 42px; right: 8px; }
.workflow-progress__steps > li.is-done::after { background: var(--bz-success); }
.workflow-progress__marker { box-sizing: border-box; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--bz-border-strong); border-radius: 50%; background: var(--bz-panel); color: var(--bz-fg-mid); }
.workflow-progress__marker .material-symbols-outlined { font-size: 20px; }
.workflow-progress__marker .bz-metric { font-size: 18px; }
.is-done > .workflow-progress__marker { color: var(--bz-success); border-color: currentColor; background: var(--bz-success-soft); }
.is-active > .workflow-progress__marker { color: var(--bz-control-selected-fg); border: 1px solid var(--bz-control-selected-border); background: var(--bz-control-selected-bg); }
.is-waiting > .workflow-progress__marker, .is-blocked > .workflow-progress__marker { color: var(--bz-warning); border-color: currentColor; background: var(--bz-warning-soft); }
.workflow-progress strong { font-weight: 500; display: block; line-height: 1.5; overflow-wrap: anywhere; }
.workflow-progress small, .workflow-progress__owner { display: block; color: var(--bz-fg-mid); margin-top: var(--bz-space-1); font-size: var(--bz-size-meta); line-height: 1.5; overflow-wrap: anywhere; }
.workflow-progress__owner { color: var(--bz-fg-low); }
.workflow-progress__reason { font-size: var(--bz-size-meta); line-height: 1.6; margin: var(--bz-space-3) 0 0; padding: var(--bz-space-2) var(--bz-space-3); border-left: 2px solid var(--bz-border-strong); overflow-wrap: anywhere; color: var(--bz-fg-mid); }
.workflow-progress__reason:is(.is-blocked, .is-waiting) { border-left-color: var(--bz-warning); background: var(--bz-warning-soft); }
.workflow-progress__receipts { margin-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.workflow-progress__receipts summary { cursor: pointer; padding: var(--bz-space-3) 0; min-height: 36px; box-sizing: border-box; }
.workflow-progress__receipts summary .bz-metric { margin-left: var(--bz-space-2); font-size: var(--bz-size-h3); color: var(--bz-fg); }
.workflow-progress__receipts ol { padding-left: var(--bz-space-5); margin: var(--bz-space-2) 0 0; }
.workflow-progress__receipts li { padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); line-height: 1.6; }
.workflow-progress__receipts li::marker { color: var(--bz-fg-low); }
.workflow-progress__receipts p { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--bz-danger); }
.is-compact { padding: var(--bz-space-4) 0; }
.is-compact .workflow-progress__steps > li { flex-basis: 108px; gap: var(--bz-space-2); padding-right: var(--bz-space-3); }
.is-compact .workflow-progress__marker { width: 28px; height: 28px; }
.is-compact .workflow-progress__marker .bz-metric { font-size: 16px; }
.is-compact .workflow-progress__marker .material-symbols-outlined { font-size: 17px; }
.is-compact .workflow-progress__steps > li::after { top: 13px; left: 34px; right: 6px; }
@container (max-width: 480px) {
  .workflow-progress__steps { display: grid; overflow: visible; padding-bottom: 0; }
  .workflow-progress__steps > li, .is-compact .workflow-progress__steps > li { display: grid; grid-template-columns: 28px minmax(0,1fr); align-items: start; gap: 12px; padding: 0 0 16px; }
  .workflow-progress__steps > li:last-child { padding-bottom: 0; }
  .workflow-progress__marker { width: 28px; height: 28px; }
  .workflow-progress__steps > li:not(:last-child)::after, .is-compact .workflow-progress__steps > li:not(:last-child)::after { width: 1px; height: auto; top: 32px; bottom: 4px; left: 13px; right: auto; }
  .workflow-progress__steps > li > div { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 10px; padding-top: 3px; }
  .workflow-progress__steps small { margin-top: 0; }
  .workflow-progress__owner { flex-basis: 100%; }
}
</style>
