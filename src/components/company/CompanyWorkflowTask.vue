<template>
  <Teleport to="body">
    <div class="company-workflow-overlay company-screen" @click.self="!busy && $emit('close')" @keydown.esc="!busy && $emit('close')">
      <section ref="dialog" class="company-workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="company-workflow-title" tabindex="-1">
        <header>
          <div><p class="bz-eyebrow">{{ charter.name }} · {{ $ui('New task') }}</p><h2 id="company-workflow-title" class="bz-h2 fira-sans-condensed-black-italic">{{ skill.name }}</h2></div>
          <button class="bz-iconbtn" :disabled="busy" :aria-label="$ui('Close')" @click="$emit('close')"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
        </header>
        <ul v-if="skill.execution?.managesGeneration" class="production-outputs"><li v-for="output in presentation.deliverables" :key="output"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>{{ $ui(output) }}</li></ul>
        <p v-else class="company-workflow-note">{{ $ui(mode === 'interactive' ? 'Choose your inputs in the next screen. The resulting files are saved with this task, ready to review and use.' : 'Describe the result you want. The team will run this task after you approve its execution.') }}</p>
        <div v-if="!skill.execution?.managesGeneration" class="workflow-task-summary">
          <section><h3>{{ $ui('What you provide') }}</h3><p>{{ $ui(presentation.firstValue) }}</p><div v-if="inputLabels.length" class="workflow-input-labels"><span v-for="label in inputLabels" :key="label">{{ $ui(label) }}</span></div></section>
          <section><h3>{{ $ui('What you get') }}</h3><ul><li v-for="output in presentation.deliverables" :key="output"><span class="material-symbols-outlined" aria-hidden="true">check</span>{{ $ui(output) }}</li></ul></section>
        </div>
        <label class="workflow-task-name"><span>{{ $ui('Task name (optional)') }}</span><input v-model.trim="taskName" :placeholder="skill.name" maxlength="160" class="input" /></label>
        <p v-if="!assignedWorker" class="company-workflow-note" role="status">{{ $ui('Choose a worker before starting a task.') }}</p>
        <p v-if="mode === 'network'" class="company-workflow-note">{{ $ui('This task retrieves external market data. Review its inputs before approving the network request.') }}</p>
        <p v-if="mode === 'interactive' && !canSaveResults" class="company-workflow-note" role="status">{{ $ui(WORKFLOW_BRIDGE_MESSAGE) }}</p>
        <button v-if="mode === 'interactive'" class="bz-btn bz-btn--primary" :disabled="busy || !canSaveResults || !assignedWorker" @click="openInteractive">{{ $ui(busy ? 'Creating task…' : 'Start task') }}</button>
        <SkillRunner v-else ref="runner" :skill="skill" :initial-inputs="initialInputs" :action-label="$ui('Queue task')" @execute="queue" />
        <p v-if="skill.execution?.managesGeneration" class="production-approval-note">{{ $ui('Review the execution request to start. Finished files are saved in this team’s Results.') }}</p>
        <p v-if="error" role="alert">{{ $ui(error) }}</p>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import "./company-design.css";
import { workflowTeamPresets } from "../../services/company/workflowTeams.js";
import { ref, computed, onMounted } from 'vue'
import SkillRunner from '../skills/SkillRunner.vue'
import { createIssue, tickRoleNow } from '../../services/company.service.js'
import { validateProduction } from '../../services/company/mediaProduction.js'
import { createTaskExecution } from '../../services/company/taskExecution.js'
import { companyWorkflowMode } from '../../services/company/workflowExecution.js'
import { workflowBridgeReady, WORKFLOW_BRIDGE_MESSAGE } from '../../services/company/workflowRecovery.js'
import { useModalAccessibility } from '../../composables/useModalAccessibility.js'
const props = defineProps({ charter: Object, roleKey: String, skill: Object, initialInputs: { type: Object, default: () => ({}) } })
const emit = defineEmits(['close', 'queued'])
const runner = ref(null), dialog = ref(null), busy = ref(false), error = ref(''), taskName = ref('')
const assignedWorker = computed(() => props.charter?.roles?.[props.roleKey]?.companion)
const presentation = computed(() => workflowTeamPresets([props.skill])[0] || { firstValue: 'Provide the inputs for this task.', deliverables: ['Saved workflow result'] })
const inputLabels = computed(() => Object.values(props.skill.inputs || {}).map(field => field.label).filter(Boolean))
const mode = computed(() => companyWorkflowMode(props.skill))
const canSaveResults = computed(() => workflowBridgeReady())
useModalAccessibility(dialog, { onClose: () => { if (!busy.value) emit('close') } })
async function queue({ inputs }) {
  if (busy.value) return
  if (!assignedWorker.value) { error.value = 'Choose a worker before starting a task.'; return }
  busy.value = true; error.value = ''
  try {
    if (props.skill.execution?.managesGeneration) {
      validateProduction(props.skill.id, inputs);
      const prepare = window.electronAPI?.mediaProduction?.prepare;
      if (!prepare) throw new Error('Restart BonzAI to enable media production.');
      // Store large attachments as local files once, not in every task journal update.
      if (inputs.soundtrack) inputs.soundtrack = (await prepare({ source: inputs.soundtrack, kind: 'audio' })).path;
      if (inputs.panels) {
        const paths = [];
        for (const source of inputs.panels) paths.push((await prepare({ source, kind: 'image' })).path);
        inputs.panels = paths;
      }
    }
    const issue = await createIssue(props.charter.id, { title: taskName.value || props.skill.name, description: `Run ${props.skill.name} and review the saved deliverable.`, assigneeRole: props.roleKey, assigneeCompanion: assignedWorker.value,
      execution: createTaskExecution([{ type: 'runWorkflow', workflowId: props.skill.id, inputs }]) })
    runner.value?.setExecutionResult({ queued: true, taskId: issue.id, message: 'Task queued. Review its execution request in the workspace.' })
    void tickRoleNow(props.charter.id, props.roleKey).catch(() => {});
    emit('queued')
  } catch (cause) { error.value = cause.message; runner.value?.setExecutionResult({ success: false, error: cause.message }) }
  finally { busy.value = false }
}
async function openInteractive() {
  if (busy.value) return
  if (!assignedWorker.value) { error.value = 'Choose a worker before starting a task.'; return }
  if (!canSaveResults.value) { error.value = WORKFLOW_BRIDGE_MESSAGE; return }
  busy.value = true; error.value = ''
  try {
    const execution = createTaskExecution([{ type: 'runWorkflow', workflowId: props.skill.id, inputs: {} }]); execution.steps[0].status = 'requires_input';
    const issue = await createIssue(props.charter.id, { title: taskName.value || props.skill.name, description: `Create ${props.skill.name}. Generate the task results, then review and approve them.`, assigneeRole: props.roleKey, assigneeCompanion: assignedWorker.value, labels: ['interactive-workflow'], execution })
    window.dispatchEvent(new CustomEvent('bonzai:run-agent-workflow', { detail: { skillId: props.skill.id, companyId: props.charter.id, issueId: issue.id, agentId: props.charter.roles[props.roleKey].companion } }))
    emit('queued'); emit('close')
  } catch (cause) { error.value = cause.message } finally { busy.value = false }
}
onMounted(() => dialog.value?.focus())
</script>
<style scoped>
.company-workflow-dialog, .company-workflow-dialog * { box-sizing: border-box; }
.company-workflow-overlay { position: fixed; inset: 0; z-index: 1200; background: var(--bz-overlay); backdrop-filter: blur(8px); display: grid; place-items: center; padding: var(--bz-space-5); }
.company-workflow-dialog { width: min(800px, 100%); max-height: calc(100dvh - 48px); overflow: auto; background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); padding: var(--bz-space-6); scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; animation: bz-fade-in var(--bz-dur-base) var(--bz-ease-out); }
.company-workflow-dialog header { display: flex; justify-content: space-between; gap: var(--bz-space-5); align-items: start; margin-bottom: var(--bz-space-5); padding-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.company-workflow-dialog header > div { min-width: 0; }
.company-workflow-dialog header .bz-eyebrow { margin: 0 0 var(--bz-space-2); color: var(--bz-fg-mid); text-transform: none; letter-spacing: normal; font-size: var(--bz-size-meta); line-height: 1.5; overflow-wrap: anywhere; }
.company-workflow-dialog h2 { margin: 0; font-size: var(--bz-size-h1); line-height: 1.3; overflow-wrap: anywhere; }
.company-workflow-dialog p { font-size: var(--bz-size-body); line-height: 1.7; overflow-wrap: anywhere; }
.company-workflow-note { color: var(--bz-fg-mid); margin: 0 0 var(--bz-space-5); }
.company-workflow-dialog > [role="alert"] { padding: var(--bz-space-3) var(--bz-space-4); border-radius: var(--bz-r); background: var(--bz-danger-soft); color: var(--bz-danger); }
.company-workflow-dialog button:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
.workflow-task-summary { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bz-space-5); padding: var(--bz-space-5) 0; border-block: 1px solid var(--bz-border); margin-bottom: var(--bz-space-5); }
.workflow-task-summary h3 { font: 500 14px/1.4 var(--bz-font-body); margin: 0 0 var(--bz-space-3); }
.workflow-task-summary p { margin: 0; color: var(--bz-fg-mid); font-size: 14px; }
.workflow-task-summary ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--bz-space-2); color: var(--bz-fg-mid); }
.workflow-task-summary li { display: flex; align-items: start; gap: var(--bz-space-2); }
.workflow-task-summary li .material-symbols-outlined { font-size: 18px; color: var(--bz-accent); flex-shrink: 0; margin-top: 3px; }
.workflow-input-labels { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); margin-top: var(--bz-space-3); }
.workflow-input-labels span { color: var(--bz-fg-mid); font-size: 12px; border-bottom: 1px solid var(--bz-border); padding-bottom: 3px; }
.workflow-task-name { display: grid; gap: var(--bz-space-2); margin-bottom: var(--bz-space-5); font-size: 14px; }
.workflow-task-name input { width: 100%; min-width: 0; }
.production-outputs{display:flex;gap:12px 24px;flex-wrap:wrap;list-style:none;padding:0;margin:0 0 24px}
.production-outputs li{display:flex;gap:8px;align-items:center;color:var(--bz-fg-mid);font-size:13px}
.production-outputs .material-symbols-outlined{color:var(--bz-accent);font-size:18px}
.production-approval-note{text-align:center;color:var(--bz-fg-mid);margin:16px 0 0;font-size:13px!important}
@media (max-width: 600px) { .workflow-task-summary { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .company-workflow-overlay { padding: var(--bz-space-3); } .company-workflow-dialog { padding: var(--bz-space-5); max-height: calc(100dvh - 24px); } }
@media (prefers-reduced-motion: reduce) { .company-workflow-dialog { animation: none; } }
</style>
