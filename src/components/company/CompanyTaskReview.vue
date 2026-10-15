<template>
  <Teleport to="body"><div class="task-review-overlay company-screen" @click.self="$emit('close')"><section ref="dialog" class="task-review" role="dialog" aria-modal="true" aria-labelledby="task-review-title"><header><h2 id="task-review-title" class="bz-h2">Review task outcome</h2><button class="bz-iconbtn" aria-label="Close task review" @click="$emit('close')"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header><p>{{ issue.title }}</p><p class="task-review__error">{{ issue.lastError || 'Inspect the saved evidence before continuing.' }}</p><template v-if="step"><label>Step<select v-model="stepId"><option v-for="item in reviewable" :key="item.id" :value="item.id">{{ item.id }} · {{ actionDisplayName(item.action, i18n.state.locale) }} · {{ item.status }}</option></select></label><details><summary>Saved inputs and result</summary><pre>{{ JSON.stringify({ action: step.resolvedAction || step.action, output: step.output, error: step.error }, null, 2) }}</pre></details><button v-if="approvalTarget" class="bz-btn bz-btn--ghost" @click="openRecord">{{ approvalRecordLabel(approvalTarget, i18n.state.locale) }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button><button v-if="step.action.type === 'runWorkflow'" class="bz-btn bz-btn--ghost" @click="openWorkflow">Open workflow<span class="material-symbols-outlined" aria-hidden="true">north_east</span></button><label>What did you verify?<select v-model="decision"><option value="completed">The work completed — save my evidence</option><option value="not_performed">No action occurred — allow a fresh attempt</option></select></label><label>{{ decision === 'completed' ? 'Deliverable or verification evidence' : 'How you confirmed that no action occurred' }}<textarea v-model="evidence" rows="6" :placeholder="decision === 'completed' ? 'Paste the finished output or a verified receipt, with enough detail to review it later.' : 'Record what you checked at the destination.'" /></label><p class="task-review__hint">{{ decision === 'completed' ? 'This is recorded as an owner-verified result.' : 'Completed steps remain saved. Any external action needs a fresh approval.' }}</p><button class="bz-btn bz-btn--primary" :disabled="busy || evidence.trim().length < 10" @click="save">{{ busy ? 'Saving…' : 'Save review' }}</button></template><p v-else>No uncertain step is recorded. Retry planning from the task list.</p><p v-if="error" role="alert">{{ error }}</p></section></div></Teleport>
</template>
<script setup>
import "./company-design.css";
import { actionDisplayName } from "../../services/company/actionLabels.js";
import { computed, ref, watch } from 'vue'
import { approvalRecordTarget, approvalRecordLabel } from '../../services/company/approvalRecord.js'
import { i18n } from '../../i18n/index.js' 
import { useModalAccessibility } from '../../composables/useModalAccessibility.js'
const props = defineProps({ companyId: String, issue: Object })
const emit = defineEmits(['close', 'saved', 'open-operational-record'])
const dialog = ref(null), stepId = ref(''), decision = ref('completed'), evidence = ref(''), error = ref(''), busy = ref(false)
const reviewable = computed(() => (props.issue.execution?.steps || []).filter(step => ['unknown', 'failed', 'unsupported', 'rejected', 'requires_input', 'simulated'].includes(step.status)))
const step = computed(() => reviewable.value.find(item => item.id === stepId.value) || reviewable.value[0])
const approvalTarget = computed(() => approvalRecordTarget(step.value?.resolvedAction || step.value?.action))
function openRecord() { emit('open-operational-record', approvalTarget.value); emit('close') }
watch(reviewable, items => { if (!items.some(item => item.id === stepId.value)) stepId.value = items[0]?.id || '' }, { immediate: true })
watch(stepId, () => { evidence.value = ''; error.value = '' })
useModalAccessibility(dialog, { onClose: () => emit('close') })
function openWorkflow() { window.dispatchEvent(new CustomEvent('bonzai:run-agent-workflow', { detail: { companyId: props.companyId, issueId: props.issue.id, skillId: step.value.action.workflowId, agentId: props.issue.assigneeCompanion } })); emit('close') }
async function save() {
  busy.value = true; error.value = ''
  try {
    const api = window.electronAPI?.db?.issues;
    if (!api?.reconcileExecution) throw new Error('Restart BonzAI to enable outcome review.');
    await api.reconcileExecution(props.companyId, props.issue.id, step.value.id, { decision: decision.value, evidence: evidence.value.trim() });
    emit('saved'); emit('close')
  } catch (cause) { error.value = cause.message } finally { busy.value = false }
}
</script>
<style scoped>
.task-review, .task-review * { box-sizing: border-box; }
.task-review-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--bz-overlay); backdrop-filter: blur(8px); display: grid; place-items: center; padding: var(--bz-space-5); }
.task-review { width: min(720px, 100%); max-height: calc(100dvh - 48px); overflow: auto; padding: var(--bz-space-6); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); background: var(--bz-panel); color: var(--bz-fg); scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; animation: bz-fade-in var(--bz-dur-base) var(--bz-ease-out); }
.task-review header { display: flex; justify-content: space-between; align-items: start; gap: var(--bz-space-4); padding-bottom: var(--bz-space-5); margin-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.task-review h2 { margin: 0; font-size: var(--bz-size-h1); line-height: 1.3; }
.task-review > p { overflow-wrap: anywhere; line-height: 1.65; }
.task-review header + p { font-size: var(--bz-size-h3); color: var(--bz-fg); margin: 0 0 var(--bz-space-2); }
.task-review label { display: grid; gap: var(--bz-space-3); margin: var(--bz-space-5) 0; font-size: var(--bz-size-body); line-height: 1.5; }
.task-review :is(select, textarea) { background: var(--bz-canvas); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r); padding: var(--bz-space-3) var(--bz-space-4); font: 400 var(--bz-size-body)/1.65 var(--bz-font-body); min-width: 0; width: 100%; }
.task-review textarea { resize: vertical; min-height: 160px; }
.task-review textarea::placeholder { color: var(--bz-fg-low); }
.task-review details { margin: var(--bz-space-5) 0; padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); border-bottom: 1px solid var(--bz-border); }
.task-review summary { cursor: pointer; min-height: 32px; align-content: center; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.task-review pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 280px; overflow: auto; padding: var(--bz-space-4); margin: var(--bz-space-3) 0 0; border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: var(--bz-canvas); color: var(--bz-fg-mid); font: 400 13px/1.7 var(--bz-font-mono); }
.task-review__error, .task-review__hint { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); margin: var(--bz-space-3) 0 var(--bz-space-5); }
.task-review > [role="alert"] { background: var(--bz-danger-soft); color: var(--bz-danger); padding: var(--bz-space-3) var(--bz-space-4); border-radius: var(--bz-r); }
.task-review :is(button, select, textarea, summary):focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 3px; }
@media (max-width: 600px) { .task-review-overlay { padding: var(--bz-space-3); } .task-review { padding: var(--bz-space-5); max-height: calc(100dvh - 24px); } }
@media (prefers-reduced-motion: reduce) { .task-review { animation: none; } }
</style>
