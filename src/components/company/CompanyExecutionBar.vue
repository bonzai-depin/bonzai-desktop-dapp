<template>
  <section v-if="teams.length || store.state.runtimeError" class="execution-bar" :aria-label="$ui('Team activity')">
    <span class="execution-bar__heading"><span class="material-symbols-outlined" aria-hidden="true">groups</span>{{ $ui('Teams') }}</span>
    <div class="execution-bar__teams">
      <button v-for="team in teams" :key="team.id" class="execution-bar__team" :title="team.name" @click="$emit('open', team.id)">
        <span class="execution-bar__dot" :class="{ running: isRunning(team), warning: hasWarning(team) }" aria-hidden="true"></span>
        <strong>{{ team.name }}</strong>
        <span>{{ $ui(label(team)) }}</span>
        <span v-if="currentAction(team)" class="execution-bar__action">{{ $ui(currentAction(team)) }}</span>
        <span v-if="status[team.id]?.approvals">{{ status[team.id].approvals }} {{ $ui('Awaiting review') }}</span>
        <span class="material-symbols-outlined execution-bar__arrow" aria-hidden="true">arrow_forward</span>
      </button>
    </div>
    <span v-if="error || store.state.runtimeError" class="execution-bar__error" role="status">{{ $ui('Execution status unavailable') }}</span>
  </section>
</template>
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { actionDisplayName } from '../../services/company/actionLabels.js';
import store from '../../stores/companyStore.js';
import * as company from '../../services/company.service.js';
defineEmits(['open']);
const teams = ref([]), status = ref({}), error = ref('');
const streams = computed(() => Object.values(store.state.activeStreams));
const isRunning = team => !error.value && !store.state.runtimeError && (streams.value.some(s => s.companyId === team.id) || status.value[team.id]?.health?.level === 'running');
const currentAction = team => {
  if (!isRunning(team)) return '';
  const stream = streams.value.find(s => s.companyId === team.id);
  return stream?.action ? actionDisplayName(stream.action) : '';
};
const hasWarning = team => !!(error.value || store.state.runtimeError || ['error', 'warning'].includes(status.value[team.id]?.health?.level));
function label(team) {
  if (hasWarning(team)) return 'Needs attention';
  if (team.status !== 'active') return 'Paused';
  if (isRunning(team)) return 'Working';
  return status.value[team.id] ? 'Play mode · waiting for work' : 'Checking status';
}
let timer, disposed = false;
async function refresh() {
  try {
    const rows = await company.listCompanies();
    const snapshots = await Promise.all(rows.map(async team => {
      try {
        const [automation, approvals] = await Promise.all([company.getAutomationStatus(team.id), company.pendingApprovals(team.id)]);
        return [team.id, { ...automation, approvals: approvals.length }];
      } catch { return [team.id, { health: { level: 'warning' } }]; }
    }));
    if (!disposed) { teams.value = rows; status.value = Object.fromEntries(snapshots); error.value = ''; }
  } catch (e) { if (!disposed) error.value = e.message; }
  finally { if (!disposed) timer = setTimeout(refresh, 5000); }
}
onMounted(refresh);
onUnmounted(() => { disposed = true; clearTimeout(timer); });
</script>
<style scoped>
.execution-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 8px 18px; border-bottom: 1px solid var(--bz-border); background: var(--bz-surface); color: var(--bz-text); min-width: 0; }
.execution-bar__heading { white-space: nowrap; display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--bz-text-muted); }
.execution-bar__teams { display: flex; gap: 8px; overflow-x: auto; min-width: 0; }
.execution-bar__team { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; white-space: nowrap; flex-wrap: nowrap; padding: 8px 12px; border: 1px solid var(--bz-border); border-radius: 10px; color: var(--bz-text); background: var(--bz-canvas); font: inherit; font-size: 12px; cursor: pointer; }
.execution-bar__team:hover, .execution-bar__team:focus-visible { border-color: var(--bz-accent); outline: none; }
.execution-bar__team strong { max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.execution-bar__team > span:not(.execution-bar__dot) { color: var(--bz-text-muted); }
.execution-bar__action { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.execution-bar__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bz-text-muted); flex: 0 0 auto; }
.execution-bar__dot.running { background: var(--bz-success, #28b78d); }
.execution-bar__dot.warning { background: var(--bz-warning, #e7b548); }
.execution-bar__arrow { font-size: 16px; }
.execution-bar__error { white-space: nowrap; font-size: 12px; }
@media (max-width: 700px) { .execution-bar { padding: 8px; gap: 6px; } .execution-bar__heading { font-size: 0; }  .execution-bar__team strong { max-width: 95px; } }
</style>
