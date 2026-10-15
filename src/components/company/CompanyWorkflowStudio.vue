<template>
  <section class="workflow-studio" :aria-busy="loading">
      <header class="workflow-studio__brief">
        <div class="workflow-studio__identity">
          <span class="workflow-studio__mark material-symbols-outlined" aria-hidden="true">{{ presentation.icon || 'auto_awesome' }}</span>
          <div>
            <h1 class="bz-h1 fira-sans-condensed-black-italic">{{ presentation.catalogTitle || skill?.name || charter.businessContext?.businessType || charter.name }}</h1>
            <p v-if="outcomeDescription">{{ outcomeDescription }}</p>
          </div>
        </div>
        <div class="workflow-studio__actions">
          <slot name="controls" />
          <button class="bz-btn bz-btn--primary" :disabled="loading || !!error || !skill || !roleKey" @click="showTask = true">
            <span class="material-symbols-outlined" aria-hidden="true">add</span>{{ $ui('New task') }}
          </button>
        </div>
      </header>
      <slot name="requirements" />


    <div v-if="error" class="workflow-studio__notice" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error_outline</span>
      <p>{{ $ui(error) }}</p>
      <button class="bz-btn bz-btn--ghost" @click="load">{{ $ui('Retry') }}</button>
    </div>
    <div v-else-if="loading" class="workflow-studio__loading" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>{{ $ui('Loading workflow') }}…
    </div>
    <template v-else-if="skill">
      <div v-if="!activeHandoff" class="workflow-studio__overview">
        <ol class="workflow-studio__journey" :aria-label="$ui('Workflow stages')">
          <li v-for="(step, index) in journey" :key="step.label">
            <span class="workflow-studio__step-number bz-metric">{{ index + 1 }}</span>
            <div><strong>{{ $ui(step.label) }}</strong><span>{{ $ui(step.detail) }}</span></div>
            <span v-if="index < journey.length - 1" class="workflow-studio__step-arrow material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </li>
        </ol>
        <dl class="workflow-studio__counts">
          <div><dt>{{ $ui('In progress') }}</dt><dd class="bz-metric">{{ inProgressCount }}</dd></div>
          <div><dt>{{ $ui('Needs your input') }}</dt><dd class="bz-metric" :class="{ 'has-attention': attentionCount }">{{ attentionCount }}</dd></div>
          <div><dt>{{ $ui('Completed') }}</dt><dd class="bz-metric">{{ completedTasks.length }}</dd></div>
        </dl>
      </div>

      <button v-if="activeHandoff" type="button" class="workflow-studio__switcher" :aria-expanded="showWorkspace" aria-controls="workflow-task-list" @click="showWorkspace = !showWorkspace"><span class="material-symbols-outlined" aria-hidden="true">{{ showWorkspace ? 'expand_less' : 'expand_more' }}</span>{{ $ui('Task list and worker') }}<span class="bz-metric">{{ openTasks.length }}</span></button>
      <div v-show="!activeHandoff || showWorkspace" id="workflow-task-list" class="workflow-studio__workspace" :class="{ 'has-runtime': activeHandoff }">
        <section class="workflow-studio__work" :aria-label="$ui('Work in progress')">
          <div class="workflow-studio__section-head">
            <h3>{{ activeHandoff ? $ui('Current task') : $ui('Work in progress') }}</h3>
            <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="$emit('open-view', 'issues')">{{ $ui('All tasks') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </div>
          <div v-if="openTasks.length" class="workflow-studio__tasks">
            <button v-for="task in openTasks.slice(0, activeHandoff ? 3 : 6)" :key="task.id" type="button" class="workflow-studio__task" :class="{ 'is-selected': task.id === activeHandoff?.issueId }" @click="openTask(task)">
              <span class="workflow-studio__task-icon material-symbols-outlined" aria-hidden="true">{{ taskStatus(task).icon }}</span>
              <span class="workflow-studio__task-copy"><strong>{{ task.title || skill.name }}</strong><span>{{ $ui(formatRoleTitle(task.assigneeRole)) || $ui('Unassigned') }}</span></span>
              <span class="workflow-studio__status" :class="{ 'needs-input': needsAttention(task) }">{{ $ui(taskStatus(task).label) }}</span>
              <span class="material-symbols-outlined workflow-studio__task-arrow" aria-hidden="true">{{ needsInteractiveInput(task) ? 'play_arrow' : 'chevron_right' }}</span>
            </button>
          </div>
          <div v-else class="workflow-studio__empty">
            <span class="workflow-studio__empty-icon material-symbols-outlined" aria-hidden="true">{{ completedTasks.length ? 'task_alt' : 'note_add' }}</span>
            <h4 class="bz-h2 fira-sans-condensed-black-italic">{{ $ui(completedTasks.length ? 'Ready for the next task' : 'Start with your first brief') }}</h4>
            <p>{{ $ui('Choose New task, add your inputs, and create your result. Everything stays saved in this workflow.') }}</p>
            <ul v-if="presentation.catalogDeliverables?.length" class="workflow-studio__deliverable-types" :aria-label="$ui('Expected deliverables')"><li v-for="output in presentation.catalogDeliverables" :key="output"><span class="material-symbols-outlined" aria-hidden="true">check</span>{{ $ui(output) }}</li></ul>
          </div>
        </section>

        <aside class="workflow-studio__aside">
          <section class="workflow-studio__worker">
            <h3>{{ $ui('Assigned worker') }}</h3>
            <div v-if="selectedWorker" class="workflow-studio__person">
              <img v-if="selectedWorker.avatar" :src="selectedWorker.avatar" alt="" />
              <span v-else class="workflow-studio__avatar material-symbols-outlined" aria-hidden="true">person</span>
              <div><strong>{{ selectedWorker.name }}</strong><span>{{ $ui(formatRoleTitle(selectedWorker.key)) }}</span></div>
            </div>
            <label v-if="workers.length" class="workflow-studio__worker-select"><span>{{ $ui('Worker for new tasks') }}</span><select v-model="roleKey" class="bz-input"><option v-for="role in workers" :key="role.key" :value="role.key">{{ role.name }} · {{ $ui(formatRoleTitle(role.key)) }}</option></select></label>
            <p v-else>{{ $ui('Assign a smart agent to the team before creating a task.') }}</p>
            <button v-if="!workers.length" class="bz-btn bz-btn--ghost bz-btn--sm" @click="$emit('open-view', 'org')">{{ $ui('Assign a worker') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </section>
          <section class="workflow-studio__results">
            <div class="workflow-studio__section-head"><h3>{{ $ui('Saved results') }}</h3><span class="bz-metric">{{ deliverables.length }}</span></div>
            <ul v-if="deliverables.length"><li v-for="item in deliverables.slice(0, 3)" :key="item.id"><span class="material-symbols-outlined" aria-hidden="true">{{ resultIcon(item) }}</span><span>{{ item.title || item.prompt || $ui('Saved result') }}</span></li></ul>
            <p v-else>{{ $ui('Your generated files will appear in Results, ready to preview, download and review.') }}</p>
            <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="$emit('open-view', 'deliverables')">{{ $ui('Results') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </section>
        </aside>
      </div>

      <section v-if="activeHandoff" ref="runtimeSection" class="workflow-studio__runtime" :aria-label="$ui('Task workspace')" tabindex="-1">
        <SmartAgent :key="`${activeHandoff.issueId}:${skill.id}`" :company-workflow-id="skill.id" :company-task="activeHandoff" @task-result-saved="$emit('refresh')" />
      </section>
      <CompanyWorkflowTask v-if="showTask" :charter="charter" :role-key="roleKey" :skill="skill" @close="showTask = false" @queued="queued" />
    </template>
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import { useI18n } from '../../i18n/index.js';
import { getAvailableAgentWorkflows } from '../../services/agentWorkflows.js';
import { smartAgentCatalog } from '../../services/smartAgentCatalog.js';
import { companyWorkflowHandoff, setCompanyWorkflowHandoff } from '../../services/company/workflowHandoff.js';
import { workflowTeamPresets } from '../../services/company/workflowTeams.js';
import { templatePresentation } from '../../services/company/templateCatalog.js';
import { isAutonomousWorkflowTask } from '../../shared/companyAutomation.js';
import { companionAvatar, formatRoleTitle } from '../../services/company/presentation.js';
import CompanyWorkflowTask from './CompanyWorkflowTask.vue';
const SmartAgent = defineAsyncComponent(() => import('../SmartAgent.vue'));
const props = defineProps({ charter: { type: Object, required: true }, state: { type: Object, default: () => ({}) } });
const emit = defineEmits(['open-view', 'refresh']);
const { locale } = useI18n();
const catalog = ref([]), loading = ref(true), error = ref(''), showTask = ref(false), roleKey = ref('');
const runtimeSection = ref(null);
const showWorkspace = ref(false);
const teamHandoff = computed(() => companyWorkflowHandoff.value?.companyId === props.charter.id ? companyWorkflowHandoff.value : null);
const workflowId = computed(() => teamHandoff.value?.skillId || props.charter.workspace?.executionWorkflowId);
const skill = computed(() => catalog.value.find(item => item.id === workflowId.value && !item.disabled));
const presentation = computed(() => {
  const preset = skill.value && workflowTeamPresets([skill.value])[0];
  return preset ? templatePresentation(preset, locale.value) : {};
});
const outcomeDescription = computed(() => presentation.value.catalogOutcome && presentation.value.catalogOutcome !== (presentation.value.catalogTitle || skill.value?.name) ? presentation.value.catalogOutcome : presentation.value.catalogDescription || skill.value?.description);
const activeHandoff = computed(() => {
  if (teamHandoff.value?.skillId !== skill.value?.id) return null;
  const issue = (props.state.issues || []).find(item => item.id === teamHandoff.value?.issueId);
  if (!issue || (issue.companyId && issue.companyId !== props.charter.id) || !issue.execution?.steps?.some(step => step.action?.type === 'runWorkflow' && step.action.workflowId === skill.value?.id)) return null;
  const goal = (props.state.goals || []).find(item => item.id === issue?.goalId);
  if (isAutonomousWorkflowTask(props.charter, issue, goal)) return null;
  const role = props.charter.roles?.[issue?.assigneeRole];
  return { ...teamHandoff.value, llm: role?.llm || null };
});
const workers = computed(() => Object.entries(props.charter.roles || {}).filter(([, role]) => role.companion).map(([key, role]) => {
  const agent = typeof role.companion === 'object' ? role.companion : smartAgentCatalog.agents.find(item => item.id === role.companion);
  return { key, name: agent?.name || [agent?.firstName, agent?.familyName || agent?.lastName].filter(Boolean).join(' ') || formatRoleTitle(key), avatar: companionAvatar(agent || role.companion) };
}));
const selectedWorker = computed(() => workers.value.find(row => row.key === roleKey.value));
watch(workers, rows => { if (!rows.some(row => row.key === roleKey.value)) roleKey.value = rows[0]?.key || ''; }, { immediate: true });
const tasks = computed(() => (props.state.issues || []).filter(issue => (!issue.companyId || issue.companyId === props.charter.id) && !isAutonomousWorkflowTask(props.charter, issue, (props.state.goals || []).find(goal => goal.id === issue.goalId)) && issue.execution?.steps?.some(step => step.action?.workflowId === workflowId.value)));
const openTasks = computed(() => tasks.value.filter(issue => !['done', 'cancelled'].includes(issue.status)).sort((a, b) => Number(b.id === activeHandoff.value?.issueId) - Number(a.id === activeHandoff.value?.issueId) || Number(needsAttention(b)) - Number(needsAttention(a))));
const completedTasks = computed(() => tasks.value.filter(issue => issue.status === 'done'));
const attentionCount = computed(() => openTasks.value.filter(needsAttention).length);
const inProgressCount = computed(() => openTasks.value.length - attentionCount.value);
const deliverables = computed(() => {
  const taskIds = new Set(tasks.value.map(task => task.id));
  return (props.state.catalog || []).filter(item => item.meta?.workflowId === workflowId.value || taskIds.has(item.meta?.issueId || item.issueId)).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
});
const journey = [
  { label: 'Brief', detail: 'Source material and desired result' },
  { label: 'Production', detail: 'Create the task’s results' },
  { label: 'Review', detail: 'Check and approve saved results' },
];
function needsInteractiveInput(task) { return task.execution?.steps?.some(step => step.action?.workflowId === workflowId.value && (step.status === 'requires_input' || (step.status === 'failed' && step.output?.status === 'requires_input'))); }
function needsAttention(task) { return needsInteractiveInput(task) || ['blocked', 'waiting'].includes(task.status) || task.execution?.steps?.some(step => ['waiting_approval', 'failed', 'unknown', 'rejected', 'unsupported'].includes(step.status)); }
function taskStatus(task) {
  if (task.execution?.steps?.some(step => step.action?.workflowId === workflowId.value && step.status === 'requires_input' && step.output?.status === 'ready_for_review')) return { label: 'Review results', icon: 'fact_check' };
  if (needsInteractiveInput(task)) return { label: 'Continue', icon: 'edit_note' };
  if (task.execution?.steps?.some(step => step.status === 'waiting_approval')) return { label: 'Awaiting approval', icon: 'fact_check' };
  if (needsAttention(task)) return { label: 'Needs review', icon: 'error_outline' };
  if (task.execution?.steps?.some(step => step.status === 'running')) return { label: 'In progress', icon: 'pending' };
  return { label: 'Queued', icon: 'schedule' };
}
function resultIcon(item) { return ({ image: 'image', video: 'movie', audio: 'headphones', music: 'music_note', text: 'description', code: 'code' })[item.pipeline] || 'draft'; }
let loadVersion = 0;
async function load() {
  const version = ++loadVersion;
  loading.value = true; error.value = '';
  try {
    const available = await getAvailableAgentWorkflows();
    if (version !== loadVersion) return;
    catalog.value = available;
    if (!skill.value) throw new Error('This workflow is unavailable. Restore it from your saved skills to continue.');
  } catch (cause) { if (version === loadVersion) error.value = cause.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function openTask(task) {
  if (needsInteractiveInput(task)) {
    setCompanyWorkflowHandoff({ companyId: props.charter.id, issueId: task.id, skillId: workflowId.value, agentId: task.assigneeCompanion });
    await focusTask();
  }
  else emit('open-view', taskStatus(task).label === 'Awaiting approval' ? 'approvals' : 'issues');
}
function queued() { showTask.value = false; emit('refresh'); }
watch(workflowId, load, { immediate: true });
const pendingNewTask = ref(false);
const pendingTaskFocus = ref(false);
watch([skill, selectedWorker], () => { if (pendingNewTask.value && skill.value && selectedWorker.value) { showTask.value = true; pendingNewTask.value = false; } });
watch(runtimeSection, element => { if (element && pendingTaskFocus.value) void focusTask(); });
async function focusTask() {
  pendingTaskFocus.value = true;
  await nextTick();
  if (!runtimeSection.value) return;
  runtimeSection.value.focus({ preventScroll: true });
  runtimeSection.value.scrollIntoView({ behavior: 'auto', block: 'start' });
  pendingTaskFocus.value = false;
}
defineExpose({ focusTask, newTask() { if (skill.value && roleKey.value) showTask.value = true; else pendingNewTask.value = true; } });
</script>
<style scoped>
.workflow-studio, .workflow-studio * { box-sizing: border-box; }
.workflow-studio { min-width: 0; display: grid; gap: var(--bz-space-6); color: var(--bz-fg); }
.workflow-studio h1, .workflow-studio h3, .workflow-studio h4, .workflow-studio p { margin: 0; }
.workflow-studio button { max-width: 100%; }
.workflow-studio__brief { display: flex; align-items: start; justify-content: space-between; gap: var(--bz-space-5); }
.workflow-studio__identity { display: flex; align-items: start; gap: var(--bz-space-4); min-width: 0; }
.workflow-studio__identity > div { min-width: 0; }
.workflow-studio__mark { display: grid; place-items: center; flex: 0 0 48px; width: 48px; height: 48px; border-radius: var(--bz-r); background: var(--bz-accent-soft); color: var(--bz-accent); font-size: 26px; }
.workflow-studio h1 { font-size: var(--bz-size-h1); line-height: 1.2; overflow-wrap: anywhere; }
.workflow-studio__identity p { margin-top: var(--bz-space-2); max-width: 70ch; color: var(--bz-fg-mid); line-height: 1.6; }
.workflow-studio__actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: var(--bz-space-4); }
.workflow-studio__actions > button { flex-shrink: 0; }
.workflow-studio__overview { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--bz-space-5); padding-block: var(--bz-space-5); border-block: 1px solid var(--bz-border); }
.workflow-studio__journey { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--bz-space-3); padding: 0; margin: 0; list-style: none; }
.workflow-studio__journey li { display: flex; align-items: center; gap: var(--bz-space-3); min-width: 0; }
.workflow-studio__step-number { font-size: var(--bz-size-h2); color: var(--bz-fg-low); }
.workflow-studio__journey li > div { min-width: 0; flex: 1; }
.workflow-studio__journey strong, .workflow-studio__journey li > div > span { display: block; }
.workflow-studio__journey strong { font-size: var(--bz-size-body); font-weight: 500; }
.workflow-studio__journey li > div > span { margin-top: var(--bz-space-1); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.workflow-studio__step-arrow { color: var(--bz-fg-low); font-size: 18px; }
.workflow-studio__counts { display: flex; align-items: center; gap: var(--bz-space-5); margin: 0; padding-inline-start: var(--bz-space-5); border-inline-start: 1px solid var(--bz-border); }
.workflow-studio__counts dt { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.workflow-studio__counts dd { font-size: var(--bz-size-h1); margin: var(--bz-space-1) 0 0; line-height: 1.2; }
.workflow-studio__counts .has-attention { color: var(--bz-warning); }
.workflow-studio__workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: var(--bz-space-6); }
.workflow-studio__work, .workflow-studio__aside { min-width: 0; }
.workflow-studio__section-head { display: flex; justify-content: space-between; align-items: center; gap: var(--bz-space-3); min-width: 0; margin-bottom: var(--bz-space-3); }
.workflow-studio h3 { font-family: var(--bz-font-body); font-size: var(--bz-size-body); font-weight: 500; line-height: 1.5; }
.workflow-studio__section-head > .bz-metric { font-size: var(--bz-size-h2); }
.workflow-studio__tasks { border-top: 1px solid var(--bz-border); }
.workflow-studio__task { width: 100%; display: flex; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-4); text-align: start; border: 1px solid transparent; border-bottom-color: var(--bz-border); border-radius: var(--bz-r-sm); background: transparent; color: var(--bz-fg); cursor: pointer; transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast); }
.workflow-studio__task:hover { background: var(--bz-panel); }
.workflow-studio__task.is-selected { background: var(--bz-accent-soft); border-color: var(--bz-border-brand); }
.workflow-studio__task:focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 2px; }
.workflow-studio__task-icon { flex-shrink: 0; font-size: 22px; color: var(--bz-fg-mid); }
.workflow-studio__task-copy { min-width: 0; flex: 1; display: grid; gap: var(--bz-space-1); }
.workflow-studio__task-copy strong { font-weight: 500; overflow-wrap: anywhere; line-height: 1.5; }
.workflow-studio__task-copy > span { font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.workflow-studio__status { font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.workflow-studio__status.needs-input { color: var(--bz-warning); }
.workflow-studio__task-arrow { color: var(--bz-fg-mid); flex-shrink: 0; }
.workflow-studio__empty { padding: clamp(24px, 4vw, 48px); background: var(--bz-panel); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); }
.workflow-studio__empty-icon { display: block; color: var(--bz-fg-mid); font-size: 30px; margin-bottom: var(--bz-space-4); }
.workflow-studio__empty h4 { font-size: var(--bz-size-h2); line-height: 1.3; }
.workflow-studio__empty p { margin-top: var(--bz-space-3); color: var(--bz-fg-mid); max-width: 58ch; line-height: 1.7; }
.workflow-studio__deliverable-types { padding: 0; margin: var(--bz-space-5) 0 0; list-style: none; display: flex; flex-wrap: wrap; gap: var(--bz-space-3) var(--bz-space-5); }
.workflow-studio__deliverable-types li { display: flex; align-items: center; gap: var(--bz-space-2); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.workflow-studio__deliverable-types .material-symbols-outlined { font-size: 16px; color: var(--bz-accent); }
.workflow-studio__aside { display: grid; align-content: start; gap: var(--bz-space-5); border-inline-start: 1px solid var(--bz-border); padding-inline-start: var(--bz-space-6); }
.workflow-studio__person { display: flex; align-items: center; gap: var(--bz-space-3); margin-block: var(--bz-space-4); }
.workflow-studio__person img, .workflow-studio__avatar { width: 42px; height: 42px; flex-shrink: 0; object-fit: cover; border-radius: 50%; }
.workflow-studio__avatar { display: grid; place-items: center; background: var(--bz-panel); border: 1px solid var(--bz-border); color: var(--bz-fg-mid); }
.workflow-studio__person > div { min-width: 0; }
.workflow-studio__person strong { font-weight: 500; display: block; overflow-wrap: anywhere; }
.workflow-studio__person > div > span { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.workflow-studio__worker-select { display: grid; gap: var(--bz-space-2); font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.workflow-studio__worker-select select { width: 100%; min-width: 0; color: var(--bz-fg); }
.workflow-studio__worker > p, .workflow-studio__results > p { margin-block: var(--bz-space-3); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.6; }
.workflow-studio__results { border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-4); }
.workflow-studio__results ul { list-style: none; margin: 0 0 var(--bz-space-3); padding: 0; display: grid; gap: var(--bz-space-3); }
.workflow-studio__results li { display: flex; align-items: start; gap: var(--bz-space-2); font-size: var(--bz-size-meta); }
.workflow-studio__results li > span:last-child { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.workflow-studio__results li > .material-symbols-outlined { font-size: 18px; color: var(--bz-fg-mid); }
.workflow-studio__runtime { min-width: 0; border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-6); }
.workflow-studio__switcher{display:flex;align-items:center;gap:10px;padding:12px 0;background:transparent;border:0;border-block:1px solid var(--bz-border);color:var(--bz-fg-mid);cursor:pointer;font:500 14px/1.5 var(--bz-font-body);text-align:start;width:100%}.workflow-studio__switcher .bz-metric{margin-inline-start:auto;font-size:20px}.workflow-studio__switcher+.workflow-studio__workspace{margin-top:16px}.workflow-studio__switcher~.workflow-studio__runtime{border-top:0;padding-top:0}
.workflow-studio__loading, .workflow-studio__notice { display: flex; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-5); color: var(--bz-fg-mid); }
.workflow-studio__notice { border: 1px solid var(--bz-border); border-radius: var(--bz-r); }
.workflow-studio__notice p { flex: 1; overflow-wrap: anywhere; }
.workflow-studio__notice > .material-symbols-outlined { color: var(--bz-danger); }
@media (max-width: 1200px) {
  .workflow-studio__overview { grid-template-columns: minmax(0, 1fr); }
  .workflow-studio__counts { border-inline-start: 0; padding: var(--bz-space-4) 0 0; border-top: 1px solid var(--bz-border); }
}
@media (max-width: 760px) {
  .workflow-studio__workspace { grid-template-columns: minmax(0, 1fr); }
  .workflow-studio__aside { border-inline-start: 0; padding-inline-start: 0; border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-5); grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workflow-studio__results { border-top: 0; padding-top: 0; }
  .workflow-studio__brief { flex-wrap: wrap; }
  .workflow-studio__actions { width: 100%; justify-content: space-between; gap: var(--bz-space-3); }
  .workflow-studio__journey li { align-items: start; }
  .workflow-studio__step-arrow, .workflow-studio__journey li > div > span { display: none; }
  .workflow-studio__status { max-width: 90px; }
}
@media (max-width: 440px) {
  .workflow-studio__aside { grid-template-columns: minmax(0, 1fr); }
  .workflow-studio__results { border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-4); }
  .workflow-studio__journey { gap: var(--bz-space-2); }
  .workflow-studio__journey li { gap: var(--bz-space-2); }
  .workflow-studio__journey strong { font-size: var(--bz-size-meta); }
  .workflow-studio__task { padding-inline: var(--bz-space-2); }
  .workflow-studio__task-arrow { display: none; }
}
@media (prefers-reduced-motion: reduce) { .workflow-studio__task { transition: none; } }
</style>
