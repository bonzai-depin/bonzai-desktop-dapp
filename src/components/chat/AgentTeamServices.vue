<template>
  <section class="agent-team-services">
    <header><div><p class="bz-eyebrow">{{ agent.name }}</p><h2 class="bz-h2">{{ $ui('Smart Workflows') }}</h2></div><div class="agent-team-services__actions"><button class="bz-btn bz-btn--secondary" @click="staffing = !staffing">{{ $ui('Add to team') }}</button><button class="bz-iconbtn" aria-label="Refresh teams" @click="refresh"><span class="material-symbols-outlined">refresh</span></button></div></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ $ui('Loading teams…') }}</p>
    <section v-if="staffing" class="agent-team-services__staff" aria-label="Choose a team">
      <h3>{{ $ui('Choose a team') }}</h3>
      <p>{{ $ui('Choose the role in its workspace before adding your agent.') }}</p>
      <button v-for="charter in availableTeams" :key="charter.id" class="bz-btn bz-btn--secondary" @click="staff(charter.id)"><span class="material-symbols-outlined">group_add</span>{{ charter.name }}</button>
      <p v-if="!availableTeams.length">{{ $ui('Create a team in Smart Workflows to get started.') }}</p>
    </section>
    <div v-if="!loading" class="agent-team-services__list">
      <article v-for="item in teams" :key="item.charter.id">
        <div class="agent-team-services__identity"><span class="material-symbols-outlined">{{ workflowIcon(item.skill) }}</span><div><span class="bz-meta">{{ item.charter.name }} · {{ item.roleKey }}</span><h3>{{ item.skill?.name || $ui('Team workspace') }}</h3></div></div>
        <p>{{ item.skill?.description || $ui('Work with colleagues on tasks in this team.') }}</p>
        <div class="agent-team-services__media"><span v-for="capability in item.skill?.requirements?.requiredApis || []" :key="capability">{{ capabilityLabels[capability] || capability }}</span></div>
        <footer><button v-if="item.skill" class="bz-btn bz-btn--primary" @click="selected = item">{{ $ui('New customer task') }}</button><button class="bz-btn bz-btn--ghost" @click="openTeam(item.charter.id)">{{ $ui('Open team') }}<span class="material-symbols-outlined">arrow_forward</span></button></footer>
      </article>
      <div v-if="!teams.length" class="agent-team-services__empty"><span class="material-symbols-outlined">account_tree</span><h3>{{ $ui('Give your agent a team') }}</h3><p>{{ $ui('Add colleagues to create podcasts, videos, reports and other deliverables together.') }}</p><button class="bz-btn bz-btn--primary" @click="staffing = true">{{ $ui('Add to team') }}</button></div>
    </div>
    <CompanyWorkflowTask v-if="selected" :charter="selected.charter" :role-key="selected.roleKey" :skill="selected.skill" @close="selected = null" @queued="queued" />
  </section>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import { smartAgentCatalog, loadSmartAgents } from '../../services/smartAgentCatalog.js';
import * as company from '../../services/company.service.js';
import CompanyWorkflowTask from '../company/CompanyWorkflowTask.vue';
import { userFacingError } from '../../services/userFacingError.js';
const props = defineProps({ agent: { type: Object, required: true }, catalog: { type: Array, default: () => [] } });
const teams = ref([]), selected = ref(null), loading = ref(false), error = ref('');
const staffing = ref(false), allTeams = ref([]);
const availableTeams = computed(() => allTeams.value.filter(team => !teams.value.some(item => item.charter.id === team.id)));
const capabilityLabels = { llm: 'Writing', image: 'Illustration', audio: 'Narration', music: 'Music', video: 'Animation', vision: 'Visual analysis' };
const workflowIcon = skill => skill?.id?.includes('podcast') ? 'podcasts' : skill?.requirements?.requiredApis?.includes('video') ? 'movie' : 'account_tree';
async function staff(companyId) {
  try {
    await loadSmartAgents();
    smartAgentCatalog.pendingHireId = props.agent.id;
    openTeam(companyId);
  } catch { error.value = 'Your saved agents could not be loaded. Please try again.'; }
}
let revision = 0;
async function refresh() {
  const current = ++revision; loading.value = true; error.value = '';
  try {
    const records = await company.listCompanies();
    const charters = await Promise.all(records.map(item => company.getCompany(item.id)));
    if (current !== revision) return;
    allTeams.value = charters.filter(Boolean);
    teams.value = charters.flatMap(charter => {
      const roleKey = Object.keys(charter?.roles || {}).find(key => charter.roles[key].companion === props.agent.id);
      if (!roleKey) return [];
      return [{ charter, roleKey, skill: props.catalog.find(skill => skill.id === charter.workspace?.executionWorkflowId) }];
    });
  } catch (cause) { if (current === revision) error.value = userFacingError(cause.message); }
  finally { if (current === revision) loading.value = false; }
}
function openTeam(id) { window.dispatchEvent(new CustomEvent('bonzai:open-company', { detail: { companyId: id } })); }
function queued() { const id = selected.value.charter.id; selected.value = null; openTeam(id); }
watch(() => props.agent.id, () => { selected.value = null; refresh(); }, { immediate: true });
</script>
<style scoped>
.agent-team-services{padding:24px 0;color:var(--bz-fg)}
.agent-team-services header,.agent-team-services__actions,.agent-team-services__identity,.agent-team-services footer{display:flex;align-items:center;gap:12px}.agent-team-services header{justify-content:space-between;margin-bottom:24px}.agent-team-services h2,.agent-team-services h3,.agent-team-services p{margin:0}.agent-team-services p{color:var(--bz-fg-mid);line-height:1.6}
.agent-team-services__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}.agent-team-services__list article{display:flex;flex-direction:column;gap:18px;padding:24px;border:1px solid var(--bz-border);border-radius:var(--bz-r-md);background:var(--bz-panel)}.agent-team-services__identity>.material-symbols-outlined{font-size:32px;color:var(--bz-accent)}.agent-team-services h3{font:900 italic 24px/1.2 var(--bz-font-metric);margin-top:6px}.agent-team-services footer{margin-top:auto;flex-wrap:wrap;justify-content:space-between;padding-top:16px;border-top:1px solid var(--bz-border)}.agent-team-services__media{display:flex;gap:8px;flex-wrap:wrap}.agent-team-services__media span{font-size:12px;border:1px solid var(--bz-border);border-radius:var(--bz-r-pill);padding:4px 10px;color:var(--bz-fg-mid)}.agent-team-services__staff{display:flex;gap:16px;flex-wrap:wrap;padding:20px;margin-bottom:24px;background:var(--bz-panel);border:1px solid var(--bz-border);border-radius:var(--bz-r-md)}.agent-team-services__staff h3,.agent-team-services__staff p{width:100%}.agent-team-services__empty{display:grid;justify-items:start;gap:16px;padding:24px 0}.agent-team-services__empty>.material-symbols-outlined{font-size:36px;color:var(--bz-accent)}
@media(max-width:600px){.agent-team-services header{align-items:flex-start;flex-direction:column}}
</style>
