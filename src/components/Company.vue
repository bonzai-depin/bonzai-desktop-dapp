<template>
  <div class="background"></div>
  <div class="shade"></div>

  <div class="bz-tab-shell company-tab">
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
            <span class="material-symbols-outlined" aria-hidden="true">storefront</span>
            Companies
          </h1>
        </div>

        <div class="company-welcome">
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
            <button class="bz-btn bz-btn--primary bz-btn--lg fira-sans-condensed-black-italic" @click="openWizard">
              <span class="material-symbols-outlined" aria-hidden="true">auto_awesome_motion</span>
              Form from a template
            </button>
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="openForm">
              <span class="material-symbols-outlined" aria-hidden="true">edit</span>
              Advanced form
            </button>
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="triggerImport">
              <span class="material-symbols-outlined" aria-hidden="true">upload</span>
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
        <div class="company-toolbar" aria-label="Company controls">
          <div class="company-toolbar__left">
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
                <span class="company-switcher__mode" :class="c.mode === 'dao' ? 'is-dao' : 'is-solo'">
                  {{ c.mode === 'dao' ? 'DAO' : 'Solo' }}
                </span>
              </button>
            </div>
            <div v-else-if="active" class="company-toolbar__current">
              <span class="status-dot" :class="`status-${active.status}`"></span>
              <span class="company-toolbar__name fira-sans-condensed-black-italic">{{ active.name }}</span>
            </div>
          </div>
        </div>

        <!-- Main dashboard for the active company -->
        <CompanyDashboard
          v-if="active"
          :charter="active"
          :state="store.state"
          @edit="onEdit"
          @new-company="openWizard"
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
  background: linear-gradient(to right, transparent, var(--bz-fg), transparent);
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
  height: calc(100vh - 32px);
  min-height: calc(100vh - 32px);
  overflow: hidden;
}
.company-shell {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4) var(--bz-space-5) var(--bz-space-3) !important;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.company-toolbar {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  flex-shrink: 0;
}
.company-toolbar__left {
  min-width: 0;
  flex: 1;
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
.company-shell :deep(.dash) {
  flex: 1;
  min-height: 0;
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
}
.company-switcher__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--bz-fg-faint);
  background: transparent;
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
  color: var(--bz-fg) !important;
  border: 1px solid var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
}
.company-switcher__name {
  font-style: italic;
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
  text-align: center;
  padding: var(--bz-space-8) var(--bz-space-7) !important;
  margin-top: 2em;
  color: var(--bz-fg);
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
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
  gap: var(--bz-space-3);
  margin-top: 1em;
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
