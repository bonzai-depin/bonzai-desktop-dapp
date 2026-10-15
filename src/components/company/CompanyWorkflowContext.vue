<template>
  <section v-if="scope" class="workflow-context company-screen" :aria-busy="saving || loading">
    <div class="workflow-context__summary">
      <span class="material-symbols-outlined" aria-hidden="true">{{ completed ? 'task_alt' : ready ? 'fact_check' : 'edit_note' }}</span>
      <div class="workflow-context__copy">
        <strong>{{ issue?.title || $ui('Current task') }}</strong>
        <p role="status">{{ $ui(saving ? 'Saving task results…' : completed ? 'Result approved. Find it in Results.' : ready ? 'Results saved. Review them to finish this task.' : 'Create the result below. Finished outputs are saved to this task automatically.') }}</p>
      </div>
      <button v-if="ready || completed" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="saving || loading" @click="openReview">{{ $ui(completed ? 'View results' : 'Review results') }}</button>
    </div>
    <p v-if="!bridgeReady && !saveError" class="workflow-context__compatibility" role="status">{{ $ui(WORKFLOW_BRIDGE_MESSAGE) }}</p>
    <div v-if="saveError || error" class="workflow-context__error" role="alert">
      <div><strong v-if="saveError">{{ $ui('Results could not be saved to the task.') }}</strong><p>{{ $ui(saveError || error) }}</p></div>
      <button v-if="!saveError || canRetrySave" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="saving || loading" @click="saveError ? $emit('retry-save') : refresh()">{{ $ui(saveError ? 'Retry save' : 'Retry') }}</button>
    </div>
    <GmaoDialog v-if="review" :title="$ui('Task results')" :eyebrow="issue?.title" :busy="approving" @close="review = null">
      <div class="workflow-context__review">
        <p>{{ $ui(completed ? 'These are the approved results of this task.' : 'Check the results before approving. If changes are needed, return to production and create a new result.') }}</p>
        <section v-for="record in review.records" :key="record.id" class="workflow-context__artifact">
          <h3>{{ $ui(record.meta?.title || record.title || record.pipeline || 'Saved result') }}</h3>
          <CompanyArtifactPreview :row="record" />
        </section>
        <p v-if="saveError" class="workflow-context__review-error" role="alert">{{ $ui('Save the latest result before approving this task.') }}</p>
        <p v-if="reviewError" class="workflow-context__review-error" role="alert">{{ $ui(reviewError) }}</p>
        <footer>
          <button class="bz-btn bz-btn--ghost" :disabled="approving" @click="review = null">{{ $ui(completed ? 'Close' : 'Back to production') }}</button>
          <button v-if="!completed" class="bz-btn bz-btn--primary" :disabled="approving || saving || !!saveError || !bridgeReady" @click="approve">{{ $ui(approving ? 'Approving…' : 'Approve result') }}</button>
        </footer>
      </div>
    </GmaoDialog>
  </section>
</template>
<script setup>
import './company-design.css';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CompanyArtifactPreview from './CompanyArtifactPreview.vue';
import GmaoDialog from './GmaoDialog.vue';
import { companyWorkflowHandoff } from '../../services/company/workflowHandoff.js';
import { workflowBridgeReady, WORKFLOW_BRIDGE_MESSAGE } from '../../services/company/workflowRecovery.js';
const bridgeReady = workflowBridgeReady();
const props = defineProps({ skillId: String, taskContext: Object, saving: Boolean, saveError: String, savedResult: Object, canRetrySave: { type: Boolean, default: true } });
const emit = defineEmits(['retry-save', 'reviewed', 'loaded']);
const scope = computed(() => {
  const context = props.taskContext || companyWorkflowHandoff.value;
  return context?.companyId && context?.issueId && context.skillId === props.skillId ? context : null;
});
const issue = ref(null), loading = ref(false), error = ref(''), review = ref(null), reviewError = ref(''), approving = ref(false);
const resultStep = computed(() => issue.value?.execution?.steps?.find(step => step.action?.workflowId === scope.value?.skillId && step.output?.contentIds?.length && ['requires_input', 'completed'].includes(step.status)));
const ready = computed(() => resultStep.value?.status === 'requires_input' && resultStep.value.output?.status === 'ready_for_review');
const completed = computed(() => resultStep.value?.status === 'completed');
let loadVersion = 0;
async function refresh() {
  const context = scope.value;
  const version = ++loadVersion;
  if (!context) return;
  loading.value = true; error.value = '';
  try {
    const saved = await window.electronAPI.db.issues.get(context.companyId, context.issueId);
    if (version !== loadVersion) return;
    if (!saved) throw new Error('This task is no longer available.');
    issue.value = saved;
    emit('loaded', saved);
  } catch (cause) { if (version === loadVersion) error.value = cause.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function openReview() {
  const context = scope.value;
  if (!context || !resultStep.value || loading.value) return;
  loading.value = true; error.value = ''; reviewError.value = '';
  const version = ++loadVersion;
  const stepId = resultStep.value.id;
  const contentIds = [...resultStep.value.output.contentIds];
  try {
    const records = await Promise.all(contentIds.map(id => window.electronAPI.db.distribution.getRecord(context.companyId, id)));
    if (version !== loadVersion) return;
    if (records.some(record => !record || record.meta?.issueId !== context.issueId || record.meta?.workflowId !== context.skillId)) throw new Error('Task results are unavailable. Refresh and try again.');
    // Keep the IDs actually shown, so a later generation cannot be approved unseen.
    review.value = { companyId: context.companyId, issueId: context.issueId, stepId, contentIds, records };
  } catch (cause) { if (version === loadVersion) error.value = cause.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function approve() {
  const snapshot = review.value;
  if (!snapshot || approving.value || props.saving || props.saveError || !bridgeReady) return;
  approving.value = true; reviewError.value = '';
  try {
    const updated = await window.electronAPI.db.issues.reviewWorkflowResult(snapshot.companyId, snapshot.issueId, snapshot.stepId, { contentIds: snapshot.contentIds });
    issue.value = updated;
    review.value = null;
    emit('reviewed', updated);
  } catch (cause) { reviewError.value = cause.message; }
  finally { approving.value = false; }
}
watch([() => scope.value?.companyId, () => scope.value?.issueId, () => scope.value?.skillId], () => { issue.value = null; review.value = null; refresh(); }, { immediate: true });
watch(() => props.savedResult, () => refresh());
const unsubscribe = window.electronAPI?.db?.issues?.onChanged?.(event => {
  if (scope.value && (!event?.companyId || event.companyId === scope.value.companyId)) refresh();
});
onBeforeUnmount(() => { loadVersion++; unsubscribe?.(); });
</script>
<style scoped>
.workflow-context { min-width: 0; padding: var(--bz-space-4) var(--bz-space-5); color: var(--bz-fg); background: var(--bz-panel); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); }
.workflow-context__summary { display: flex; align-items: center; gap: var(--bz-space-4); min-width: 0; }
.workflow-context__summary > .material-symbols-outlined { flex-shrink: 0; color: var(--bz-accent); font-size: 24px; }
.workflow-context__copy { flex: 1; min-width: 0; }
.workflow-context strong { font-size: var(--bz-size-body); font-weight: 500; overflow-wrap: anywhere; }
.workflow-context p { margin: var(--bz-space-1) 0 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.6; overflow-wrap: anywhere; }
.workflow-context button { flex-shrink: 0; max-width: 100%; }
.workflow-context__error { display: flex; align-items: center; gap: var(--bz-space-4); margin-top: var(--bz-space-4); padding-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); color: var(--bz-danger); }
.workflow-context__error > div { flex: 1; min-width: 0; }
.workflow-context__error p, .workflow-context__review-error { color: var(--bz-danger); }
.workflow-context__review { display: grid; gap: var(--bz-space-5); min-width: 0; }
.workflow-context__review > p { margin: 0; line-height: 1.6; color: var(--bz-fg-mid); }
.workflow-context__artifact { min-width: 0; border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-4); }
.workflow-context__artifact h3 { margin: 0 0 var(--bz-space-3); font: 500 var(--bz-size-body)/1.5 var(--bz-font-body); overflow-wrap: anywhere; }
.workflow-context__review footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--bz-space-3); padding-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); }
@media (max-width: 600px) {
  .workflow-context { padding: var(--bz-space-4); }
  .workflow-context__summary, .workflow-context__error { flex-wrap: wrap; gap: var(--bz-space-3); }
  .workflow-context__copy { flex-basis: calc(100% - 40px); }
  .workflow-context__summary > button { margin-inline-start: 36px; }
}
</style>
