<template>
  <CompanyWorkspaceAccess @choose-template="openWizard">
  <div class="bz-tab-shell company-tab company-screen">
    <div class="models__deployment-install company-shell">
      <p v-if="rosterLoadError" class="bz-notice bz-notice--danger" role="alert">{{ rosterLoadError }}</p>
      <div v-if="store.state.runtimeError" class="bz-notice bz-notice--danger" role="alert">
        <strong>{{ $ui('Execution unavailable') }}</strong> · {{ store.state.runtimeError }}
        <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="store.retryRuntime()">{{ $ui('Retry') }}</button>
      </div>
      <!-- ════════════ Form mode ════════════ -->
      <CompanyForm
        v-if="showForm"
        @cancel="showForm = false"
        @formed="onFormed"
      />

      <!-- ════════════ Welcome (zero companies) ════════════ -->
      <template v-else-if="!store.state.companies.length && !active?.demoRun">
        <CompanyConversationOnboarding
          @done="onConversationDone"
          @advanced="showForm = true"
          @templates="openWizard"
          @import="triggerImport"
        />
        <input
          ref="importInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="onImportFile"
        />
      </template>

      <!-- ════════════ Active company view ════════════ -->
      <template v-else>
        <div v-if="active?.demoRun && teamView === 'team'" class="bz-notice" data-i18n-skip>
          <strong>{{ $ui('Demo workspace') }}</strong> · {{ $ui('Sample records only. This team stays outside your operating teams.') }}
          <button class="bz-btn bz-btn--sm" @click="openTeam(active.id, 'getting-started')">{{ $ui('Guided walkthrough') }}</button>
          <button class="bz-btn bz-btn--sm" @click="showAllTeams">{{ $ui('Back to my teams') }}</button>
        </div>
        <div class="company-toolbar" :aria-label="$ui('Smart Workflows')">
          <div class="company-toolbar__left">
            <div class="company-team-nav" aria-label="Team navigation">
              <button
                class="company-switcher__chip company-switcher__chip--all"
                :class="{ 'is-active': teamView === 'all' }"
                @click="showAllTeams"
              >
                <span class="material-symbols-outlined" aria-hidden="true">dashboard</span>
                <span class="company-switcher__name">{{ $ui("My workflows") }}</span>
              </button>
              <button
                v-for="c in store.state.companies"
                :key="c.id"
                class="company-switcher__chip"
                :class="{ 'is-active': teamView === 'team' && c.id === store.state.activeId }"
                @click="selectTeam(c.id)"
              >
                <span class="status-dot" :class="`status-${c.status}`"></span>
                <span class="company-switcher__name fira-sans-condensed-black-italic">{{ companyName(c) }}</span>
              </button>
              <span
                class="company-team-nav__state"
                title="While BonzAI is open, each active team follows its own schedule. Model and GPU work may queue when the device reaches capacity."
              >
                <span class="status-dot" :class="activeTeamCount ? 'status-active' : 'status-paused'"></span>
                {{ activeTeamCount ? `${activeTeamCount} active` : 'Paused' }}
              </span>
            </div>
          </div>
          <div class="company-toolbar__actions">
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="triggerImport">
              <span class="material-symbols-outlined" aria-hidden="true">upload</span>
              Import
            </button>
            <button
              class="bz-iconbtn bz-iconbtn--danger company-toolbar__delete"
              :disabled="!active"
              @click="requestDeleteCompany(active)"
              title="Delete team"
              aria-label="Delete team"
            >
              <span class="material-symbols-outlined" aria-hidden="true">delete</span>
            </button>
            <button
              class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
              @click="openNewTeam"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add</span>{{ $ui("New workflow") }}</button>
            <input
              ref="importInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="onImportFile"
            />
          </div>
        </div>

        <!-- Main dashboard for the active company -->
        <p v-if="teamView === 'all' && allTeamsError" class="bz-notice bz-notice--danger" role="alert">{{ allTeamsError }}</p>
        <CompanyAllTeamsRoom
          v-if="teamView === 'all'"
          :bundles="allTeamBundles"
          :loading="allTeamsLoading"
          @refresh="loadAllTeams"
          @browse="openWizard"
          @open-team="openTeam"
        />
        <CompanyDashboard
          v-if="active && teamView === 'team'"
          :key="active.id"
          :charter="active"
          :state="store.state"
          :initial-view="teamTargetView"
          :initial-result-id="teamTargetResultId"
          @edit="onEdit"
          @new-company="openNewTeam"
          @delete-company="requestDeleteCompany(active)"
          @reload="store.refreshActive()"
        />
      </template>
    </div>
  </div>

  <!-- Template intake wizard (overlay) -->
  <CompanyIntakeWizard
    v-if="showWizard"
    :initial-workflow-id="wizardWorkflowId"
    :initial-template-id="wizardTemplateId"
    @done="onWizardDone"
    @cancel="onWizardCancel"
  />

  <Transition name="bz-image-toast">
    <div
      v-if="pendingDeleteCompany"
      class="bz-image-delete-toast company-delete-toast"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      <span class="bz-image-delete-toast__body">
        Delete {{ companyName(pendingDeleteCompany) }}?
      </span>
      <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteCompany">
        Cancel
      </button>
      <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteCompany">
        Delete
      </button>
    </div>
  </Transition>
  </CompanyWorkspaceAccess>
</template>

<script>
import { pendingCompanyWorkflow } from "../services/company/workflowHandoff.js";
import { findWorkflowTeam } from "../services/company/workflowTeams.js";
import "./company/company-design.css";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { loadSmartAgents } from "../services/smartAgentCatalog.js";
import companyStore from "../stores/companyStore.js";
import CompanyWorkspaceAccess from "./company/CompanyWorkspaceAccess.vue";
import CompanyForm from "./company/CompanyForm.vue";
import CompanyDashboard from "./company/CompanyDashboard.vue";
import CompanyIntakeWizard from "./company/CompanyIntakeWizard.vue";
import CompanyAllTeamsRoom from "./company/CompanyAllTeamsRoom.vue";
import CompanyConversationOnboarding from "./company/CompanyConversationOnboarding.vue";

export default {
  name: "Company",
  components: { CompanyWorkspaceAccess, CompanyForm, CompanyDashboard, CompanyIntakeWizard, CompanyAllTeamsRoom, CompanyConversationOnboarding },
  props: { activityTarget: { type: Object, default: null } },
  setup(props) {
    const store = companyStore;
    const rosterLoadError = ref('');
    const showForm = ref(false);
    const showWizard = ref(false);
    const wizardWorkflowId = ref("");
    const wizardTemplateId = ref("");
    const initialized = ref(false);
    async function consumeWorkflowTarget() {
      const target = pendingCompanyWorkflow.value;
      if (!initialized.value || !target) return;
      pendingCompanyWorkflow.value = null;
      const team = findWorkflowTeam(store.state.companies, target);
      if (team) {
        showWizard.value = false;
        await openTeam(team.id, "studio");
      } else if (!target.companyId) {
        wizardWorkflowId.value = target.skillId;
        wizardTemplateId.value = '';
        showWizard.value = true;
      } else { rosterLoadError.value = "This team is no longer available."; }
    }
    watch(pendingCompanyWorkflow, () => { void consumeWorkflowTarget(); });
    const importInput = ref(null);
    const pendingDeleteCompany = ref(null);
    const teamView = ref("team");
    const allTeamBundles = ref([]);
    const allTeamsLoading = ref(false);
    const allTeamsError = ref("");
    const teamTargetView = ref("");
    const teamTargetResultId = ref("");
    const allTeamStatus = ref("open");

    const active = computed(() => store.activeCompany.value);
    const activeTeamCount = computed(() =>
      store.state.companies.filter((company) => company.status === "active").length,
    );
    const allTeamFilters = [
      { id: "open", label: "Open" },
      { id: "in_progress", label: "In Progress" },
      { id: "blocked", label: "Blocked" },
      { id: "done", label: "Done" },
      { id: "cancelled", label: "Cancelled" },
      { id: "all", label: "All" },
    ];
    const allTeamRows = computed(() => {
      const rows = allTeamBundles.value.flatMap((bundle) =>
        (bundle.issues || []).map((issue) => ({ team: bundle.company, issue })),
      );
      if (allTeamStatus.value === "all") return rows;
      return rows.filter((row) => row.issue.status === allTeamStatus.value);
    });
    const allTeamStats = computed(() => {
      const rows = allTeamBundles.value.flatMap((bundle) => bundle.issues || []);
      return {
        teams: allTeamBundles.value.length,
        open: rows.filter((issue) => issue.status === "open").length,
        blocked: rows.filter((issue) => issue.status === "blocked").length,
        approvals: allTeamBundles.value.reduce((sum, bundle) => sum + (bundle.approvals?.length || 0), 0),
      };
    });

    const openDemo = async event => {
      try {
        await window.electronAPI.workspace.demoOpen(event.detail.id);
        await openTeam(event.detail.id, event.detail.view);
      } catch (error) { rosterLoadError.value = error.message; }
    };
    onMounted(async () => {
      window.addEventListener("bonzai:open-demo-team", openDemo);
      void loadSmartAgents().catch((error) => {
        rosterLoadError.value = error.message || 'Unable to load saved smart agents.';
      });
      await store.init();
      initialized.value = true;
      await consumeWorkflowTarget();
      if (!store.state.activeId && store.state.companies.length) {
        await store.setActive(store.state.companies[0].id);
      }
    });
    let teamRefresh;
    watch(()=>store.state.audit,()=>{if(teamView.value==='all'){clearTimeout(teamRefresh);teamRefresh=setTimeout(loadAllTeams,150)}});
    onUnmounted(() => {clearTimeout(teamRefresh);window.removeEventListener("bonzai:open-demo-team",openDemo);});

    function openForm() { showForm.value = true; }
    function openWizard(templateId = '') { wizardWorkflowId.value = ""; wizardTemplateId.value = typeof templateId === 'string' ? templateId : ''; showWizard.value = true; }
    async function openNewTeam() {
      openWizard();
    }
    function onFormed() { showForm.value = false; }
    function onEdit() { showForm.value = true; }
    async function onWizardDone(/* charterId */) {
      showWizard.value = false;
      teamView.value = "team";
      teamTargetView.value = store.activeCompany.value?.workspace?.executionWorkflowId ? "studio" : "";
      teamTargetResultId.value = "";
      // setActive already happened inside formFromTemplate.
    }
    async function onConversationDone(charterId) {
      teamView.value = "team";
      teamTargetView.value = "";
      teamTargetResultId.value = "";
      if (charterId && store.state.activeId !== charterId) await store.setActive(charterId);
    }
    function onWizardCancel() { showWizard.value = false; }
    function companyName(company) {
      return (company?.name || "Untitled workflow").replace(/\s+\(Draft\)$/i, "");
    }
    async function selectTeam(id) {
      teamTargetView.value = "";
      teamTargetResultId.value = "";
      teamView.value = "team";
      await store.setActive(id);
    }
    watch(() => props.activityTarget, target => {
      if (target?.id) {
        showForm.value = false;
        showWizard.value = false;
        void openTeam(target.id, "activity");
      }
    }, { immediate: true });
    async function openTeam(id, view = "", resultId = "") {
      teamTargetView.value = view;
      teamTargetResultId.value = resultId;
      teamView.value = "team";
      await store.setActive(id);
    }
    async function loadAllTeams() {
      allTeamsLoading.value = true;
      allTeamsError.value = "";
      try {
        allTeamBundles.value = await store.loadAllTeamWork();
      } catch (error) {
        allTeamsError.value = error.message;
      } finally {
        allTeamsLoading.value = false;
      }
    }
    async function showAllTeams() {
      teamView.value = "all";
      await loadAllTeams();
    }
    function statusChip(status) {
      return ({
        open: "company-pill--info",
        in_progress: "company-pill--warning",
        blocked: "company-pill--danger",
        done: "company-pill--success",
        cancelled: "company-pill--neutral",
      })[status] || "company-pill--neutral";
    }
    function requestDeleteCompany(company) {
      if (!company) return;
      pendingDeleteCompany.value = company;
    }
    function dismissDeleteCompany() {
      pendingDeleteCompany.value = null;
    }
    async function confirmDeleteCompany() {
      const company = pendingDeleteCompany.value;
      if (!company?.id) return;
      pendingDeleteCompany.value = null;
      await store.dissolve(company.id);
      if (!store.state.activeId && store.state.companies.length) {
        await store.setActive(store.state.companies[0].id);
      }
    }

    function triggerImport() { importInput.value?.click(); }
    async function onImportFile(ev) {
      const file = ev.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const bundle = JSON.parse(text);
        await store.importBundle(bundle);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      ev.target.value = "";
    }

    return {
      store, rosterLoadError, active, showForm, showWizard,
      wizardWorkflowId, wizardTemplateId, openForm, openWizard, openNewTeam, onFormed, onEdit, onWizardDone, onConversationDone, onWizardCancel,
      triggerImport, onImportFile, importInput, companyName,
      pendingDeleteCompany, requestDeleteCompany, dismissDeleteCompany, confirmDeleteCompany,
      teamView, selectTeam, openTeam, showAllTeams, loadAllTeams, allTeamBundles, allTeamsLoading, allTeamsError, activeTeamCount,
      teamTargetView, teamTargetResultId,
      allTeamFilters, allTeamStatus, allTeamRows, allTeamStats, statusChip,
    };
  },
};
</script>

<style scoped>
hr {
  margin: 24px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: var(--bz-border);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 250, "GRAD" 0, "opsz" 24;
  border-radius: 100%;
}

/* ───────── Layout — single-column, no sidebar ───────── */
.company-tab {
  position: relative;
  background: var(--bz-canvas);
  padding: 0 !important;
  margin: 0 !important;
  height: 100%;
  min-height: 0;
  overflow: auto;
}
.company-shell {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5) clamp(20px, 2.4vw, 40px) var(--bz-space-6) !important;
  min-height: 100%;
  overflow: visible;
}

.company-toolbar {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  flex-shrink: 0;
  padding: 0 0 var(--bz-space-4);
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  background: transparent;
}
.company-toolbar__left {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-width: 0;
  flex: 1;
}
.company-toolbar__meta {
  min-width: 184px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.company-toolbar__eyebrow {
  color: var(--bz-fg);
  font-family: var(--bz-font-ui);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}
.company-toolbar__hint {
  color: var(--bz-fg-low);
  font-size: 12px;
  line-height: 1.2;
}
.company-toolbar__current {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
}
.company-toolbar__name {
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1;
}
.company-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  flex-shrink: 0;
}
.company-toolbar__delete {
  flex: 0 0 auto;
}
.company-team-nav {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.company-team-nav__state {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 32px;
  padding: 0 var(--bz-space-2);
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.2;
  cursor: help;
}
.company-toolbar__actions .bz-btn { min-height: 40px; font: 500 13px/1.3 var(--bz-font-body); border-radius: var(--bz-r); }
.company-toolbar :is(button):focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
.company-switcher__chip--all .material-symbols-outlined {
  font-size: 17px !important;
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.all-teams-view {
  flex: 1;
  min-height: 0;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  overflow: auto;
}
.all-teams-view__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.all-teams-view__head h2 {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 30px !important;
  line-height: 1;
  text-align: left !important;
}
.all-teams-view__head p {
  margin: var(--bz-space-1) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.45;
  text-align: left !important;
}
.all-teams-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin: var(--bz-space-3) 0;
}
.all-teams-kpis article {
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.all-teams-kpis strong,
.all-teams-kpis span {
  display: block;
}
.all-teams-kpis strong {
  color: var(--bz-fg);
  font-size: 24px;
  line-height: 1;
}
.all-teams-kpis span {
  margin-top: 4px;
  color: var(--bz-fg-low);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.all-teams-filters,
.work-status-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-3);
}
.issue-filter__chip {
  min-height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.issue-filter__chip:hover,
.issue-filter__chip.is-active {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
  color: var(--bz-fg);
}
.all-team-todos {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.all-team-todo {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--bz-space-3);
  align-items: center;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.all-team-todo strong,
.all-team-todo small {
  display: block;
}
.all-team-todo strong {
  color: var(--bz-fg);
  font-size: 17px;
  line-height: 1;
}
.all-team-todo small {
  margin-top: 4px;
  color: var(--bz-fg-low);
  font-size: 12px;
}
.company-shell :deep(.dash) {
  flex: 1 0 auto;
  min-height: 0;
}

/* Let the conversation use the remaining workspace height so its composer
   stays visible beneath the real team switcher and command bar. */
@media (min-width: 1000px) and (min-height: 800px) {
  .company-shell:has(.company-command) { height: 100%; box-sizing: border-box; }
  .company-shell :deep(.company-dashboard-shell:has(.company-command)) { display: flex; min-height: 400px; }
  .company-shell :deep(.dash-body:has(> .company-command)) { display: flex; flex: 1; min-height: 0; }
  .company-shell :deep(.company-command) { flex: 1; min-height: 0; min-width: 0; }
  .company-shell :deep(.company-command .goal-room) { flex: 1; height: auto; min-height: 0; }
}

.bz-image-delete-toast {
  position: fixed;
  right: max(var(--bz-space-5), env(safe-area-inset-right));
  bottom: max(var(--bz-space-5), env(safe-area-inset-bottom));
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  max-width: min(460px, calc(100vw - 32px));
  padding: var(--bz-space-3);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}
.bz-image-delete-toast .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-danger);
}
.bz-image-delete-toast__body {
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-image-delete-toast__ghost,
.bz-image-delete-toast__danger {
  height: 30px;
  border-radius: var(--bz-r-sm);
  padding: 0 var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
}
.bz-image-delete-toast__ghost {
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
}
.bz-image-delete-toast__ghost:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.bz-image-delete-toast__danger {
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger-soft);
  color: var(--bz-danger);
  font-weight: 700;
}
.bz-image-delete-toast__danger:hover {
  filter: brightness(1.08);
}
.bz-image-toast-enter-active,
.bz-image-toast-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}
.bz-image-toast-enter-from,
.bz-image-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ───────── Top bar (title + mission stack on left, actions on right) ───────── */
.company-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1em;
  margin-bottom: 0.5em;
}
.company-topbar__title {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.company-topbar__identity {
  display: flex;
  align-items: center;
  gap: 0.9em;
  min-width: 0;
}
.company-topbar__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 4px;
  border: 1px solid var(--bz-border);
  background: var(--bz-card);
  color: var(--bz-fg);
  flex-shrink: 0;
}
.company-topbar__mark .material-symbols-outlined {
  font-size: 28px !important;
}
.company-topbar__copy {
  min-width: 0;
}
.company-topbar__eyebrow {
  margin: 0 0 0.2em !important;
  color: var(--bz-fg-low) !important;
  font-size: 11px !important;
  line-height: 1 !important;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left !important;
  font-family: "Fira Sans", sans-serif;
  font-weight: 700;
}
.company-topbar h1 {
  font-size: 36px !important;
  margin: 0 !important;
  color: var(--bz-fg) !important;
  text-align: left !important;
  line-height: 0.95;
  overflow-wrap: anywhere;
}
.company-topbar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: var(--bz-space-3);
}

/* Icon-only buttons: square footprint, centered glyph */
.icon-only-btn {
  width: 48px;
  padding-left: 0 !important;
  padding-right: 0 !important;
  justify-content: center;
}
.icon-only-btn .material-symbols-outlined {
  margin: 0 !important;
}

/* ───────── Welcome header (zero-companies state) ───────── */
.welcome-header {
  margin-bottom: 1.5em;
}
.welcome-header h1 {
  font-size: 36px !important;
  margin: 0 !important;
  color: var(--bz-fg) !important;
  text-align: left !important;
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
}
.welcome-header h1 .material-symbols-outlined {
  font-size: 44px !important;
}

/* ───────── Company switcher — matches the agentic marketplace
   `.category-selector` pattern: white border on dark, transparent →
   purple BonzAI tint when active, blur-heavy. ───────── */
.company-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin: 0;
  overflow-x: auto;
  padding: 2px 0;
}
.company-switcher__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  min-height: 42px;
  padding: 10px 14px;
  border-radius: var(--bz-r);
  border: 1px solid transparent;
  background: transparent;
  color: var(--bz-fg-mid);
  cursor: pointer;
  transition: background var(--bz-dur-fast) var(--bz-ease), border-color var(--bz-dur-fast) var(--bz-ease), color var(--bz-dur-fast) var(--bz-ease);
  font-family: var(--bz-font-body);
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
}
.company-switcher__chip:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border);
  color: var(--bz-fg);
}
.company-switcher__chip.is-active {
  color: var(--bz-fg);
  border-color: var(--bz-border-brand);
  background: var(--bz-accent-soft);
}
.company-switcher__name {
  font: 500 14px/1.35 var(--bz-font-body);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.company-switcher__mode {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  font-family: var(--bz-font-ui);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.company-switcher__mode.is-dao {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
}
.company-switcher__mode.is-solo {
  border-color: var(--bz-emerald-500);
  background: var(--bz-success-soft);
  color: var(--bz-emerald-500);
}

.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
}
.status-active { background: var(--bz-emerald-500); }
.status-paused { background: var(--bz-warning); }
.status-dissolved { background: var(--bz-danger); }

.company-mission {
  color: var(--bz-fg-mid) !important;
  margin: 0.7em 0 0 !important;
  max-width: 70ch;
  font-size: 15px !important;
  text-align: left !important;
  line-height: 1.4;
}
.company-opsbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 0.8em;
}
.company-opsbar__item {
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  height: 28px;
  padding: 0 0.8em;
  color: var(--bz-fg-mid);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* ───────── Demo / Local-LLM pill in topbar ───────── */
.company-demo-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  height: 28px;
  padding: 0 0.8em;
  border-radius: 4px;
  border: 1px solid var(--bz-fg-faint);
  background: var(--bz-card);
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 11px !important;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--bz-fg-mid) !important;
  -webkit-text-fill-color: currentColor !important;
  background-clip: border-box !important;
  vertical-align: middle;
}
.company-demo-pill:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  -webkit-text-fill-color: var(--bz-fg) !important;
}
.company-demo-pill .material-symbols-outlined {
  font-size: 14px !important;
  color: currentColor !important;
  -webkit-text-fill-color: currentColor !important;
  background: none !important;
}
.company-demo-pill:hover .material-symbols-outlined { -webkit-text-fill-color: var(--bz-fg) !important; }
.company-demo-pill.is-on {
  background: var(--bz-purple-soft) !important;
  border-color: var(--bz-border-brand) !important;
  -webkit-text-fill-color: var(--bz-fg) !important;
  background-clip: border-box !important;
}
.company-demo-pill.is-on .material-symbols-outlined {
  -webkit-text-fill-color: var(--bz-purple-300) !important;
}
.company-demo-pill.is-on:hover {
  -webkit-text-fill-color: var(--bz-fg) !important;
  filter: brightness(1.05);
}
.company-demo-pill__label { letter-spacing: 0.05em; }

/* ───────── Welcome panel ───────── */
.company-welcome {
  width: min(1180px, 100%);
  margin: var(--bz-space-6) auto 0;
  color: var(--bz-fg);
}
.welcome-hero {
  max-width: 760px;
  padding: var(--bz-space-4) 0 var(--bz-space-5);
}
.welcome-eyebrow {
  margin: 0 0 var(--bz-space-2) !important;
  color: var(--bz-purple-100) !important;
  font-family: var(--bz-font-ui);
  font-size: 11px !important;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
  text-align: left !important;
  text-transform: uppercase;
}
.welcome-hero h1 {
  max-width: 100%;
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left !important;
}
.welcome-lede {
  max-width: 720px;
  margin: var(--bz-space-2) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: var(--bz-size-body) !important;
  line-height: 1.45;
  text-align: left !important;
}
.welcome-workflows {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  margin-top: var(--bz-space-4);
  border-block: 1px solid var(--bz-border);
}
.welcome-workflow {
  min-width: 0;
  min-height: 88px;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  justify-content: center;
  padding: var(--bz-space-3);
  border-right: 1px solid var(--bz-border);
  background: transparent;
}
.welcome-workflow:last-child { border-right: 0; }
.welcome-workflow__label {
  width: fit-content;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--bz-space-2);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--bz-fg-low);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.welcome-workflow strong {
  color: var(--bz-fg);
  font-size: 14px;
  line-height: 1.2;
}
.welcome-workflow p {
  margin: 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.42;
  text-align: left !important;
}
.welcome-trust {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-3);
}
.welcome-trust__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: color-mix(in srgb, var(--bz-card) 72%, transparent);
  color: var(--bz-fg-mid);
  font-size: 14px;
  line-height: 1.35;
}
.welcome-trust__item .material-symbols-outlined {
  color: var(--bz-emerald-500);
  font-size: 20px;
}
.welcome-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-5);
}

@media (max-width: 1180px) {
  .welcome-workflows {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .company-toolbar { flex-wrap: wrap; gap: 16px; }
  .company-toolbar__left { flex-basis: 100%; }
  .company-toolbar__actions { width: 100%; }
  .company-shell {
    padding: var(--bz-space-3) !important;
  }
  .welcome-hero h1 {
    max-width: 100%;
    font-size: 42px !important;
  }
  .welcome-workflows,
  .welcome-trust {
    grid-template-columns: 1fr;
  }
  .welcome-actions {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .company-tab *, .company-tab *::before, .company-tab *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

.bz-iconbtn--warning {
  color: var(--bz-warning);
  border-color: var(--bz-warning-soft);
}
.bz-iconbtn--warning:hover {
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}
.bz-iconbtn--success {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-soft);
}
.bz-iconbtn--success:hover {
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-500);
}
.bz-iconbtn--danger {
  color: var(--bz-danger);
  border-color: var(--bz-danger-soft);
}
.bz-iconbtn--danger:hover {
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}

/* ───────── Glass card (shared) ───────── */
:deep(.models__activity--payouts) {
  padding: 4em;
  border: 1px solid var(--bz-border);
  border-radius: 4px !important;
  background: var(--bz-card);
}
</style>
