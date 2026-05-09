<template>
  <div class="background"></div>
  <div class="shade"></div>

  <div class="models__deployment column is-8 is-paddingless company-tab">
    <div class="models__deployment-install company-shell">
      <!-- ════════════ Form mode ════════════ -->
      <CompanyForm
        v-if="showForm"
        @cancel="showForm = false"
        @formed="onFormed"
      />

      <!-- ════════════ Welcome (zero companies) ════════════ -->
      <template v-else-if="!store.state.companies.length">
        <div class="welcome-header">
          <h1 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined is-size-1 mr-2">storefront</span>
            Companies
          </h1>
        </div>

        <div class="company-welcome models__activity--payouts">
          <span class="material-symbols-outlined welcome-icon">storefront</span>
          <h2 class="fira-sans-condensed-black-italic">
            Zero-Human Companies
          </h2>
          <p>
            A workforce of AI companions that runs your business while you
            sleep. Form one in 90 seconds — no crypto, no SaaS, no API meter.
          </p>

          <hr />

          <div class="welcome-features">
            <div class="welcome-feature">
              <span class="material-symbols-outlined">memory</span>
              <span>Local LLM. No API meter.</span>
            </div>
            <div class="welcome-feature">
              <span class="material-symbols-outlined">schema</span>
              <span>17 predefined roles. Hire/fire per role.</span>
            </div>
            <div class="welcome-feature">
              <span class="material-symbols-outlined">rule</span>
              <span>Owner-veto governance. Three modes per action class.</span>
            </div>
            <div class="welcome-feature">
              <span class="material-symbols-outlined">account_balance</span>
              <span>Local treasury. Audit-logged. Portable.</span>
            </div>
          </div>

          <hr />

          <div class="welcome-actions">
            <button class="button is-success is-large fira-sans-condensed-black-italic" @click="openWizard">
              <span class="material-symbols-outlined is-size-3 mr-2">auto_awesome_motion</span>
              Form from a template
            </button>
            <button class="button is-medium is-outlined is-light fira-sans-condensed-black-italic ml-5" @click="openForm">
              <span class="material-symbols-outlined is-size-3 mr-2">edit</span>
              Advanced form
            </button>
            <button class="button is-medium is-outlined is-info fira-sans-condensed-black-italic ml-5" @click="triggerImport">
              <span class="material-symbols-outlined is-size-3 mr-2">upload</span>
              Import bundle
            </button>
            <input
              ref="importInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="onImportFile"
            />
          </div>
        </div>
      </template>

      <!-- ════════════ Active company view ════════════ -->
      <template v-else>
        <!-- Top header: title (with mission directly underneath) + global actions -->
        <div class="company-topbar">
          <div class="company-topbar__title">
            <h1 class="fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined is-size-1 mr-2">storefront</span>
              {{ active ? active.name : 'Companies' }}
              <button
                v-if="active"
                class="company-demo-pill"
                :class="{ 'is-on': active.demoMode }"
                @click="toggleDemoMode"
                :title="active.demoMode
                  ? 'Demo Mode is ON — scripted ticks, no LLM. Click to switch to real local-LLM inference.'
                  : 'Demo Mode is OFF — real local-LLM inference. Click to enable scripted ticks.'"
              >
                <span class="material-symbols-outlined">{{ active.demoMode ? 'auto_awesome_motion' : 'memory' }}</span>
                <span class="company-demo-pill__label">{{ active.demoMode ? 'Demo Mode' : 'Local LLM' }}</span>
              </button>
            </h1>
            <p v-if="active" class="company-mission">{{ active.mission }}</p>
          </div>
          <div class="company-topbar__actions">
            <!-- Pause / Resume — icon only -->
            <button
              v-if="active"
              class="button is-medium fira-sans-condensed-black-italic icon-only-btn"
              :class="active.status === 'active' ? 'is-warning' : 'is-success'"
              @click="togglePause"
              :title="active.status === 'active' ? 'Pause the company heartbeat' : 'Resume the company heartbeat'"
              :aria-label="active.status === 'active' ? 'Pause' : 'Resume'"
            >
              <span class="material-symbols-outlined is-size-3">
                {{ active.status === 'active' ? 'pause' : 'play_arrow' }}
              </span>
            </button>
            <!-- Run now — fires one CEO heartbeat immediately -->
            <button
              v-if="active"
              class="button is-medium is-warning fira-sans-condensed-black-italic ml-5"
              @click="onTickNow"
              title="Run one CEO cycle now: reads state, generates goals, queues them to roles."
            >
              <span class="material-symbols-outlined is-size-3 mr-2">room_service</span>
              Run now
            </button>
            <!-- New company — opens the template wizard (primary path) -->
            <button
              class="button is-medium is-success fira-sans-condensed-black-italic ml-5"
              @click="openWizard"
              title="Form a new company from a vertical template"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">auto_awesome_motion</span>
              New
            </button>
            <!-- Export — icon only, warning, between New and Dissolve -->
            <button
              v-if="active"
              class="button is-medium is-warning fira-sans-condensed-black-italic ml-5 icon-only-btn"
              @click="exportCompany"
              title="Download a JSON bundle of this company"
              aria-label="Export company"
            >
              <span class="material-symbols-outlined is-size-3">download</span>
            </button>
            <!-- Dissolve — icon only, danger, rightmost -->
            <button
              v-if="active"
              class="button is-medium is-danger fira-sans-condensed-black-italic ml-5 icon-only-btn"
              @click="confirmDissolve"
              title="Permanently delete this company"
              aria-label="Dissolve company"
            >
              <span class="material-symbols-outlined is-size-3">delete</span>
            </button>
          </div>
        </div>

        <!-- Company switcher — only when there's more than one -->
        <div v-if="store.state.companies.length > 1" class="company-switcher">
          <button
            v-for="c in store.state.companies"
            :key="c.id"
            class="company-switcher__chip"
            :class="{ 'is-active': c.id === store.state.activeId }"
            @click="store.setActive(c.id)"
          >
            <span class="status-dot" :class="`status-${c.status}`"></span>
            <span class="company-switcher__name fira-sans-condensed-black-italic">{{ c.name }}</span>
            <span class="tag" :class="c.mode === 'dao' ? 'is-info' : 'is-success'">
              {{ c.mode === 'dao' ? 'DAO' : 'Solo' }}
            </span>
          </button>
        </div>

        <hr />

        <!-- Main dashboard for the active company -->
        <CompanyDashboard
          v-if="active"
          :charter="active"
          :state="store.state"
          @edit="onEdit"
          @reload="store.refreshActive()"
        />
      </template>
    </div>
  </div>

  <!-- Template intake wizard (overlay) -->
  <CompanyIntakeWizard
    v-if="showWizard"
    @done="onWizardDone"
    @cancel="onWizardCancel"
  />
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from "vue";
import companyStore from "../stores/companyStore.js";
import CompanyForm from "./company/CompanyForm.vue";
import CompanyDashboard from "./company/CompanyDashboard.vue";
import CompanyIntakeWizard from "./company/CompanyIntakeWizard.vue";

export default {
  name: "Company",
  components: { CompanyForm, CompanyDashboard, CompanyIntakeWizard },
  setup() {
    const store = companyStore;
    const showForm = ref(false);
    const showWizard = ref(false);
    const importInput = ref(null);

    const active = computed(() => store.activeCompany.value);

    onMounted(async () => {
      await store.init();
      if (!store.state.activeId && store.state.companies.length) {
        await store.setActive(store.state.companies[0].id);
      }
    });
    onUnmounted(() => {});

    function openForm() { showForm.value = true; }
    function openWizard() { showWizard.value = true; }
    function onFormed() { showForm.value = false; }
    function onEdit() { showForm.value = true; }
    async function onWizardDone(/* charterId */) {
      showWizard.value = false;
      // setActive already happened inside formFromTemplate.
    }
    function onWizardCancel() { showWizard.value = false; }

    async function togglePause() {
      if (!active.value) return;
      if (active.value.status === "active") await store.pause(active.value.id);
      else await store.resume(active.value.id);
    }

    /**
     * Flip the active company's demoMode. Restarts the heartbeat under
     * the new (fast/scripted or normal/real-LLM) cadence. Surfaces a
     * friendly error if validation fails.
     */
    async function toggleDemoMode() {
      if (!active.value) return;
      const next = JSON.parse(JSON.stringify(active.value));
      next.demoMode = !next.demoMode;
      try { await store.update(next); }
      catch (err) { alert("Could not toggle demo mode: " + (err.message || err)); }
    }
    async function onTickNow() { await store.tickNow(); }
    async function exportCompany() {
      if (!active.value) return;
      const bundle = await store.exportActive({ includePayloads: true });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${active.value.name.replace(/\s+/g, '_')}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    async function confirmDissolve() {
      if (!active.value) return;
      if (!confirm(`Permanently dissolve "${active.value.name}"?\n\nThis wipes ALL data: charter, treasury, catalog, audit log. Cannot be undone.`)) return;
      await store.dissolve(active.value.id);
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
      store, active, showForm, showWizard,
      openForm, openWizard, onFormed, onEdit, onWizardDone, onWizardCancel,
      togglePause, toggleDemoMode, onTickNow, exportCompany, confirmDissolve,
      triggerImport, onImportFile, importInput,
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
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 1), transparent);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

/* ───────── Backdrop image + shade (mirrors GenerativeText pattern) ───────── */
.background {
  position: absolute;
  z-index: -2;
  height: 100%;
  width: 100%;
  background: url("../assets/bonzai_company.webp") no-repeat;
  background-size: cover;
  background-position: center 30%;
  overflow: hidden;
}
.shade {
  position: absolute;
  width: 100% !important;
  height: 100% !important;
  background: var(--bz-scrim-strong);
  z-index: -1;
  pointer-events: none;
}

/* ───────── Layout — single-column, no sidebar ───────── */
.company-tab {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
  height: calc(100vh - 80px);
  overflow: hidden;
}
.company-shell {
  padding: 2em 3em !important;
  height: 100%;
  overflow-y: auto;
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
.company-topbar h1 {
  font-size: 36px !important;
  margin: 0 !important;
  color: var(--bz-fg) !important;
  text-align: left !important;
  display: flex;
  align-items: center;
}
.company-topbar h1 .material-symbols-outlined {
  font-size: 44px !important;
  /* keep the icon white — gradient applies only to the name text */
  -webkit-text-fill-color: initial;
  background: none;
  color: var(--bz-fg);
}
/* Apply the brand gradient to the company name (the text node only,
   not the icon — the wrapping <h1> would otherwise gradient-fill the
   storefront glyph too). */
.company-topbar h1 {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.company-topbar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
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
  margin: 1em 0 0.5em;
  overflow-x: auto;
}
.company-switcher__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--bz-fg-faint);
  background: transparent;
  backdrop-filter: blur(32px);
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 14px;
  white-space: nowrap;
}
.company-switcher__chip:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}
.company-switcher__chip.is-active {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: var(--bz-purple-soft) !important;
  backdrop-filter: blur(64px) !important;
}
.company-switcher__name {
  font-style: italic;
}

.status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
}
.status-active { background: var(--bz-emerald-500); box-shadow: 0 0 6px var(--bz-emerald-500); }
.status-paused { background: var(--bz-warning); box-shadow: 0 0 6px var(--bz-warning); }
.status-dissolved { background: var(--bz-danger); box-shadow: 0 0 6px var(--bz-danger); }

.company-mission {
  color: rgba(255, 255, 255, 0.75) !important;
  margin: 0.4em 0 0 !important;
  margin-left: 56px !important; /* align with text after the title icon */
  max-width: 70ch;
  font-size: 15px !important;
  text-align: left !important;
  font-style: italic;
  line-height: 1.4;
}

/* ───────── Demo / Local-LLM pill in topbar ───────── */
.company-demo-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  margin-left: 0.7em;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--bz-fg-faint);
  background: transparent;
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 11px !important;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  -webkit-text-fill-color: rgba(255, 255, 255, 0.65) !important;
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
  -webkit-text-fill-color: rgba(255, 255, 255, 0.65) !important;
  background: none !important;
}
.company-demo-pill:hover .material-symbols-outlined { -webkit-text-fill-color: var(--bz-fg) !important; }
.company-demo-pill.is-on {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) !important;
  border-color: transparent !important;
  -webkit-text-fill-color: #000 !important;
  background-clip: border-box !important;
}
.company-demo-pill.is-on .material-symbols-outlined {
  -webkit-text-fill-color: #000 !important;
}
.company-demo-pill.is-on:hover {
  -webkit-text-fill-color: #000 !important;
  filter: brightness(1.05);
}
.company-demo-pill__label { letter-spacing: 0.05em; }

/* ───────── Welcome panel ───────── */
.company-welcome {
  text-align: center;
  padding: 4em 3em !important;
  margin-top: 2em;
  color: var(--bz-fg);
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}
.welcome-icon {
  font-size: 96px !important;
  opacity: 0.5;
  margin-bottom: 0.5em;
}
.company-welcome h2 {
  font-size: 42px !important;
  margin-bottom: 0.5em !important;
  color: var(--bz-fg) !important;
  text-align: center !important;
}
.company-welcome p {
  font-size: 18px !important;
  margin-bottom: 1em !important;
  text-align: center !important;
  color: var(--bz-fg) !important;
}
.welcome-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85em 1.5em;
  text-align: left;
  margin: 0 auto;
  max-width: 540px;
}
.welcome-feature {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font-size: 16px;
  color: var(--bz-fg);
}
.welcome-feature .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-emerald-500);
  flex-shrink: 0;
}
.welcome-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 1em;
}

/* ───────── Glass card (shared) ───────── */
:deep(.models__activity--payouts) {
  padding: 4em;
  border: 1px solid var(--bz-border);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px !important;
  background: var(--bz-scrim);
}
</style>
