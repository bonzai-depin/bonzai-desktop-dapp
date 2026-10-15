<template>
  <main class="workflow-start company-screen" aria-labelledby="workflow-start-title" data-i18n-skip>
    <header class="workflow-start__header">
      <div>
        <p class="bz-eyebrow">{{ $ui('Smart Workflows') }}</p>
        <h1 id="workflow-start-title">{{ $ui('What would you like to make happen?') }}</h1>
        <p>{{ $ui('Create for yourself, research an idea or keep your work moving. Choose a workflow, add your inputs and keep the results in one place.') }}</p>
      </div>
      <button type="button" class="bz-btn bz-btn--primary" @click="$emit('templates')"><span class="material-symbols-outlined" aria-hidden="true">apps</span>{{ $ui('Explore all workflows') }}</button>
    </header>

    <p v-if="loading" class="workflow-start__status" role="status">{{ $ui('Loading available workflows…') }}</p>
    <div v-else-if="error" class="workflow-start__error" role="alert"><p>{{ $ui(error) }}</p><button class="bz-btn" @click="load">{{ $ui('Retry') }}</button></div>
    <div v-else class="workflow-start__examples">
      <button v-for="workflow in featured" :key="workflow.id" type="button" @click="$emit('templates', workflow.id)">
        <span class="workflow-start__icon material-symbols-outlined" aria-hidden="true">{{ workflow.icon }}</span>
        <span class="workflow-start__copy"><span class="workflow-start__category">{{ $ui(workflow.catalogCategory) }}</span><strong>{{ $ui(workflow.catalogTitle) }}</strong><span>{{ $ui(workflow.catalogOutcome) }}</span><small>{{ workflow.catalogDeliverables.map(item => $ui(item)).join(' · ') }}</small></span>
        <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
      </button>
    </div>

    <section class="workflow-start__how" :aria-label="$ui('How it works')">
      <article><span class="bz-metric">1</span><div><h2>{{ $ui('Choose a workflow') }}</h2><p>{{ $ui('See the required inputs and the result before you start.') }}</p></div></article>
      <article><span class="bz-metric">2</span><div><h2>{{ $ui('Start a task') }}</h2><p>{{ $ui('Give it your source material and preferences. Your agent helps carry out the work.') }}</p></div></article>
      <article><span class="bz-metric">3</span><div><h2>{{ $ui('Use your results') }}</h2><p>{{ $ui('Inspect, keep and export the files you create. Run the workflow again whenever you need it.') }}</p></div></article>
    </section>

    <footer class="workflow-start__footer">
      <p><span class="material-symbols-outlined" aria-hidden="true">shield_lock</span>{{ $ui('Local by default. You decide when to connect a service, share or publish.') }}</p>
      <div><button type="button" class="bz-btn bz-btn--ghost" @click="$emit('import')"><span class="material-symbols-outlined" aria-hidden="true">upload</span>{{ $ui('Import workspace') }}</button><button type="button" class="bz-btn bz-btn--ghost" @click="$emit('advanced')"><span class="material-symbols-outlined" aria-hidden="true">tune</span>{{ $ui('Build a custom team') }}</button></div>
    </footer>
  </main>
</template>
<script setup>
import './company-design.css';
import { computed, onMounted, ref } from 'vue';
import { getAvailableAgentWorkflows } from '../../services/agentWorkflows.js';
import { workflowTeamPresets } from '../../services/company/workflowTeams.js';
import { WORKFLOW_PRESETS } from '../../services/company/workspacePresets.js';
import { templatePresentation } from '../../services/company/templateCatalog.js';
import { useI18n } from '../../i18n/index.js';
defineEmits(['done', 'advanced', 'import', 'templates']);
const { locale } = useI18n();
const installed = ref([]), loading = ref(true), error = ref('');
const featured = computed(() => {
  const personal = ['meditation-forge', 'video-captioning', 'tcg-analysis', 'mass-chat']
    .map(prefix => installed.value.find(workflow => workflow.id.startsWith(prefix))).filter(Boolean);
  // Only show installed creative workflows; the operational presets are built in.
  const unique = [...new Map([...personal, ...installed.value].map(item => [item.id, item])).values()].slice(0, 4);
  return [...unique, ...WORKFLOW_PRESETS.filter(workflow => ['hvac_gmao', 'purchasing_team'].includes(workflow.id))]
    .map(workflow => templatePresentation(workflow, locale.value));
});
async function load() {
  loading.value = true; error.value = '';
  try { installed.value = workflowTeamPresets(await getAvailableAgentWorkflows()); }
  catch (cause) { error.value = cause?.message || 'Unable to load team templates.'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>
<style scoped>
.workflow-start { width: 100%; min-width: 0; color: var(--bz-fg); display: grid; gap: var(--bz-space-7); }
.workflow-start__header { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: var(--bz-space-5); }
.workflow-start__header > div { max-width: 760px; min-width: 0; }
.workflow-start__header h1 { margin: 0 0 var(--bz-space-4); font: 900 italic clamp(28px, 3vw, 40px)/1.2 var(--bz-font-metric); }
.workflow-start__header p:not(.bz-eyebrow) { color: var(--bz-fg-mid); font-size: 16px; line-height: 1.7; margin: 0; }
.workflow-start .bz-eyebrow { margin: 0 0 var(--bz-space-3); color: var(--bz-fg-mid); }
.workflow-start__examples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bz-space-3); }
.workflow-start__examples button { display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: start; gap: var(--bz-space-4); padding: var(--bz-space-5); min-width: 0; border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); background: var(--bz-panel); color: var(--bz-fg); text-align: left; font: inherit; cursor: pointer; transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast); }
.workflow-start__examples button:hover { border-color: var(--bz-border-brand); background: var(--bz-raised); }
.workflow-start__examples button:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.workflow-start__icon { display: grid; place-items: center; width: 44px; height: 44px; background: var(--bz-accent-soft); color: var(--bz-accent); border-radius: var(--bz-r); font-size: 24px; }
.workflow-start__examples button > .material-symbols-outlined:last-child { font-size: 20px; color: var(--bz-fg-mid); margin-top: 12px; }
.workflow-start__copy { display: grid; gap: var(--bz-space-2); min-width: 0; }
.workflow-start__copy strong { font: 500 18px/1.4 var(--bz-font-body); }
.workflow-start__copy > span:not(.workflow-start__category) { color: var(--bz-fg-mid); font-size: 14px; line-height: 1.6; }
.workflow-start__category, .workflow-start__copy small { color: var(--bz-fg-mid); font-size: 12px; line-height: 1.6; }
.workflow-start__copy small { padding-top: var(--bz-space-3); border-top: 1px solid var(--bz-border); margin-top: var(--bz-space-2); }
.workflow-start__how { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--bz-space-6); padding-block: var(--bz-space-6); border-block: 1px solid var(--bz-border); }
.workflow-start__how article { display: flex; align-items: start; gap: var(--bz-space-4); }
.workflow-start__how .bz-metric { font-size: 32px; color: var(--bz-fg-mid); }
.workflow-start__how h2 { margin: 0 0 var(--bz-space-2); font: 500 16px/1.4 var(--bz-font-body); }
.workflow-start__how p { margin: 0; color: var(--bz-fg-mid); font-size: 14px; line-height: 1.6; }
.workflow-start__footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--bz-space-5); }
.workflow-start__footer p, .workflow-start__footer > div { display: flex; align-items: center; gap: var(--bz-space-3); flex-wrap: wrap; }
.workflow-start__footer p { color: var(--bz-fg-mid); font-size: 13px; margin: 0; max-width: 70ch; flex-wrap: nowrap; }
.workflow-start__footer p > span { font-size: 20px; flex-shrink: 0; }
.workflow-start__error { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bz-space-4); color: var(--bz-danger); }
.workflow-start :is(h1,p,strong,small,span) { overflow-wrap: anywhere; }
.workflow-start .bz-btn { height: auto; min-height: 44px; white-space: normal; line-height: 1.4; text-align: center; }
@media(max-width:800px) { .workflow-start__examples, .workflow-start__how { grid-template-columns: 1fr; } }
@media(max-width:480px) { .workflow-start__examples button { grid-template-columns: 32px minmax(0,1fr) 16px; padding: var(--bz-space-4); gap: var(--bz-space-3); }.workflow-start__icon { width: 32px; height: 32px; font-size: 21px; } }
@media(prefers-reduced-motion:reduce) { .workflow-start__examples button { transition: none; } }
</style>
