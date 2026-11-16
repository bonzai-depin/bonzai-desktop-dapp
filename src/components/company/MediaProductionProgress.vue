<template>
  <section ref="panel" class="production-progress" tabindex="-1" :aria-label="$ui('Production Progress')">
    <header><h3 class="bz-h2">{{ $ui('Production') }}</h3><select v-model="selectedId" class="bz-input" :aria-label="$ui('Task')"><option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option></select></header>
    <p v-if="!state" class="production-note">{{ $ui('Your task is queued. Review any execution request in Review to begin.') }}</p>
    <template v-else>
      <div class="production-summary"><strong>{{ state.status === 'completed' ? $ui('Ready To Review') : stages.find(stage => stage.status !== 'completed')?.label || $ui('Saving results…') }}</strong><span class="bz-metric">{{ completed }} / {{ stages.length }}</span></div>
      <progress :value="completed" :max="Math.max(1, stages.length + (state.status === 'completed' ? 0 : 1))" />
      <ol><li v-for="stage in stages" :key="stage.id"><span class="material-symbols-outlined">{{ stage.status === 'completed' ? 'check_circle' : stage.status === 'failed' ? 'error_outline' : 'hourglass_top' }}</span><span>{{ stage.label }}</span><span v-if="stage.completedAt" class="bz-metric">{{ Math.max(1, Math.round((stage.completedAt - stage.startedAt) / 1000)) }}s</span></li></ol>
      <p v-if="state.error" class="production-error" role="alert">{{ state.error }}</p>
      <div class="production-actions">
        <button v-if="canResume" class="bz-btn bz-btn--primary" :disabled="busy" @click="resume">{{ $ui(busy ? 'Resuming…' : 'Resume Saved Production') }}</button>
        <button v-if="needsReview" class="bz-btn bz-btn--ghost" @click="$emit('review-task')">{{ $ui('Review Interrupted Task') }}</button>
        <button class="bz-btn bz-btn--ghost" @click="$emit('review')">{{ $ui('Review And Download Results') }}</button>
      </div>
    </template>
    <p v-if="error" class="production-error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { productionKey } from '../../services/company/mediaProduction.js';
import { getIssue, reopenIssue, tickRoleNow } from '../../services/company.service.js';
const props = defineProps({ companyId: String, workflowId: String, tasks: { type: Array, default: () => [] } });
const emit = defineEmits(['review', 'review-task', 'refresh']);
const panel = ref(null);
const selectedId = ref(''), state = ref(null), error = ref(''), busy = ref(false);
const task = computed(() => props.tasks.find(item => item.id === selectedId.value));
const stages = computed(() => Object.entries(state.value?.stages || {}).map(([id, value]) => ({ id, ...value })));
const completed = computed(() => stages.value.filter(stage => stage.status === 'completed').length);
const canResume = computed(() => task.value?.status === 'blocked'
  && task.value?.execution?.steps?.some(step => step.action?.workflowId === props.workflowId && step.status === 'failed' && step.output?.status !== 'requires_input')
  && !task.value?.execution?.steps?.some(step => ['unknown', 'running', 'waiting_approval', 'rejected'].includes(step.status)));
const needsReview = computed(() => task.value?.execution?.steps?.some(step => ['unknown', 'requires_input', 'rejected'].includes(step.status)));
watch(() => props.tasks, tasks => { if (!tasks.some(task => task.id === selectedId.value)) selectedId.value = tasks.at(-1)?.id || ''; }, { immediate: true });
let timer, reading = false;
async function refresh() {
  if (!selectedId.value || reading) return;
  const id = selectedId.value; reading = true;
  try { const value = await window.electronAPI?.store?.get(productionKey(props.workflowId, { companyId: props.companyId, issueId: id }), null); if (id === selectedId.value) state.value = value; }
  catch { error.value = 'Could not refresh production progress.'; }
  finally { reading = false; }
}
watch(selectedId, () => { state.value = null; void refresh(); });
onMounted(() => { void refresh(); timer = setInterval(() => void refresh(), 2000); });
onUnmounted(() => clearInterval(timer));
async function selectTask(id) {
  selectedId.value = id;
  await nextTick();
  panel.value?.focus({ preventScroll: true });
  panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
defineExpose({ selectTask });
async function resume() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    const issue = await getIssue(props.companyId, selectedId.value);
    if (!issue || issue.status !== 'blocked') throw new Error('This task is already running or has finished.');
    const step = issue.execution?.steps?.find(step => step.action?.workflowId === props.workflowId && step.status === 'failed' && step.output?.status !== 'requires_input');
    if (!step) throw new Error('No interrupted production stage needs resuming.');
    // Use the owner's existing atomic reopen path. It preserves completed
    // actions and rejects uncertain outcomes, which still need explicit review.
    await reopenIssue(props.companyId, issue.id);
    void tickRoleNow(props.companyId, issue.assigneeRole).catch(() => {});
    emit('refresh');
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.production-progress{border-top:1px solid var(--bz-border);padding-top:24px;display:grid;gap:16px;min-width:0}
header,.production-summary,.production-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
h3,p{margin:0}select{max-width:100%;width:min(420px,100%)}progress{width:100%;height:5px;accent-color:var(--bz-accent)}
ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 24px;padding:0;margin:0;list-style:none;max-height:300px;overflow:auto}
li{display:flex;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--bz-border);font-size:13px}li>span:nth-child(2){flex:1}li>.material-symbols-outlined{font-size:18px;color:var(--bz-accent)}
.production-note{color:var(--bz-fg-mid)}.production-error{color:var(--bz-danger)}.production-actions{justify-content:flex-start}
</style>
