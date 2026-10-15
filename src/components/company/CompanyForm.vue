<template>
  <div class="form-shell company-screen">
    <div class="form-header">
      <h1 class="fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined is-size-1 mr-2">add_business</span>
        {{ $ui('Build a custom team') }}
      </h1>
      <button class="bz-btn is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
        <span class="material-symbols-outlined is-size-3 mr-2">close</span>
        Cancel
      </button>
    </div>

    <p class="form-intro">{{ $ui('Choose the agents and responsibilities for a custom workflow. For a ready-to-use process with its own inputs and results, start from a template.') }}</p>

    <!-- ── Identity ─────────────────────────────────────── -->
    <section class="form-section">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">badge</span>
        Identity
      </h2>
      <div class="field">
        <label for="team-name" class="label fira-sans-condensed-black-italic">Team name</label>
        <input
          id="team-name" v-model.trim="form.name"
          class="input is-medium"
          :placeholder="$ui('My creative team')"
          maxlength="64" required
        />
      </div>
      <div class="field">
        <label for="team-mission" class="label fira-sans-condensed-black-italic">{{ $ui('What should this team achieve?') }}</label>
        <textarea
          id="team-mission" v-model.trim="form.mission"
          class="textarea"
          rows="2"
          placeholder="Prepare weekly product campaigns, follow up qualified leads, and report the results for approval."
        ></textarea>
      </div>
    </section>

    <details class="form-section">
      <summary class="section-title">Advanced configuration</summary>
    <!-- ── Rules + currency ───────────────────────────────── -->
    <section class="form-section">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">rule</span>
        Rules
      </h2>
      <div class="field-row">
        <div class="field">
          <label for="team-currency" class="label fira-sans-condensed-black-italic">Currency</label>
          <div class="select skill-fullwidth is-medium">
            <select id="team-currency" v-model="form.currency">
              <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="team-spend-cap" class="label fira-sans-condensed-black-italic">Per-run spend cap</label>
          <input
            id="team-spend-cap" v-model.number="form.perHeartbeatSpendCap"
            class="input is-medium"
            type="number" min="0" step="0.5"
          />
        </div>
        <div class="field">
          <label for="team-reserve-floor" class="label fira-sans-condensed-black-italic">Reserve floor</label>
          <input
            id="team-reserve-floor" v-model.number="form.reserveFloor"
            class="input is-medium"
            type="number" min="0" step="0.5"
          />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="team-coordinator-cadence" class="label fira-sans-condensed-black-italic">Coordinator cadence (min)</label>
          <input id="team-coordinator-cadence" v-model.number="form.ceoMin" class="input is-medium" type="number" min="1" step="1" />
        </div>
        <div class="field">
          <label for="team-member-cadence" class="label fira-sans-condensed-black-italic">Teammate cadence (min)</label>
          <input id="team-member-cadence" v-model.number="form.roleMin" class="input is-medium" type="number" min="1" step="1" />
        </div>
      </div>
      <div class="field">
        <label class="label fira-sans-condensed-black-italic">Allowed pipelines</label>
        <div class="chip-row">
          <label
            v-for="p in availablePipelines"
            :key="p"
            class="chip"
            :class="{ 'is-on': form.allowedPipelines.includes(p) }"
          >
            <input type="checkbox" :value="p" v-model="form.allowedPipelines" />
            {{ p }}
          </label>
        </div>
      </div>
    </section>

    <!-- ── Execution mode (parallel/sequential per task class) ── -->
    <section class="form-section">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">stacks</span>
        Execution mode
      </h2>
      <div class="field-row">
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">LLM execution</label>
          <div class="mode-row">
            <label
              v-for="m in ['sequential', 'swap', 'parallel']"
              :key="`llm-${m}`"
              class="mode-chip"
              :class="{ 'is-on': form.execution.llm.mode === m }"
            >
              <input type="radio" :value="m" v-model="form.execution.llm.mode" />
              {{ m }}
            </label>
          </div>
        </div>
        <div class="field" v-if="form.execution.llm.mode === 'parallel'">
          <label for="team-llm-concurrency" class="label fira-sans-condensed-black-italic">Max concurrent LLM calls</label>
          <input id="team-llm-concurrency" v-model.number="form.execution.llm.maxConcurrent" class="input is-medium" type="number" min="1" max="8" />
        </div>

      </div>

      <div class="field-row">
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Diffusion execution</label>
          <div class="mode-row">
            <label
              v-for="m in ['sequential', 'parallel']"
              :key="`diff-${m}`"
              class="mode-chip"
              :class="{ 'is-on': form.execution.diffusion.mode === m }"
            >
              <input type="radio" :value="m" v-model="form.execution.diffusion.mode" />
              {{ m }}
            </label>
          </div>
        </div>
        <div class="field" v-if="form.execution.diffusion.mode === 'parallel'">
          <label for="team-diffusion-concurrency" class="label fira-sans-condensed-black-italic">Max concurrent diffusion jobs</label>
          <input id="team-diffusion-concurrency" v-model.number="form.execution.diffusion.maxConcurrent" class="input is-medium" type="number" min="1" max="4" />
        </div>
      </div>

    </section>

    </details>
    <!-- ── Team + per-teammate LLM ─────────────────────────── -->
    <section class="form-section">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">groups</span>
        Teammates
      </h2>
      <p v-if="rosterError" class="bz-notice bz-notice--danger" role="alert">{{ rosterError }}</p>
      <p v-else-if="!companions.length" class="muted">{{ $ui('Create a smart agent in Smart Agents before choosing your team.') }}</p>
      <div class="role-table">
        <div class="role-row role-row--header">
          <div class="col-role">Function</div>
          <div class="col-companion">Smart agent</div>
          <div class="col-llm">AI model</div>
        </div>
        <div
          v-for="roleKey in displayedRoleKeys"
          :key="roleKey"
          class="role-row"
        >
          <div class="col-role">
            <strong>{{ roleDisplayName(roleKey) }}</strong>
          </div>
          <div class="col-companion">
            <div class="select skill-fullwidth is-small">
              <select v-model="form.companions[roleKey]" :aria-label="`${roleDisplayName(roleKey)} · Smart agent`">
                <option :value="null">{{ $ui('Not assigned') }}</option>
                <option v-for="comp in companions" :key="comp.id" :value="comp.id">
                  {{ comp.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="col-llm">
            <CompanyWorkerModel v-model="form.llms[roleKey]" :role-key="roleKey" :role-label="roleDisplayName(roleKey)" :worker-id="form.companions[roleKey]" :disabled="!form.companions[roleKey]" />
          </div>
        </div>
      </div>

      <div class="advanced-toggle">
        <button class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic" @click="showAdvanced = !showAdvanced">
          <span class="material-symbols-outlined is-size-3 mr-1">
            {{ showAdvanced ? 'expand_less' : 'expand_more' }}
          </span>
          {{ showAdvanced ? "Hide" : "Show" }} advanced functions ({{ advancedRoleKeys.length }})
        </button>
      </div>
    </section>

    <!-- ── Submit ──────────────────────────────────────── -->
    <hr />
    <div v-if="errors.length" class="bz-notice bz-notice--danger">
      <ul>
        <li v-for="(err, i) in errors" :key="i">{{ $ui(err) }}</li>
      </ul>
    </div>
    <p v-if="!form.companions.CEO" class="form-intro">{{ $ui('Assign a coordinator to create this workflow. Other roles are optional.') }}</p>
    <div class="submit-row">
      <button
        class="bz-btn bz-btn--primary bz-btn--lg fira-sans-condensed-black-italic mr-5"
        :class="{ 'bz-btn--running': busy }"
        :disabled="busy || !form.name.trim() || !form.companions.CEO"
        @click="submit"
      >
        <span class="material-symbols-outlined is-size-3 mr-2">add_business</span>
        {{ $ui('Create a smart workflow') }}
      </button>
      <button class="bz-btn bz-btn--lg is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
        <span class="material-symbols-outlined is-size-3 mr-2">close</span>
        Cancel
      </button>
    </div>
  </div>
</template>

<script>
import "./company-design.css";
import { ref, reactive, computed, onMounted, watch } from "vue";
import { loadSmartAgents, smartAgentCatalog, SMART_AGENT_CREATE_CAPABILITIES } from "../../services/smartAgentCatalog.js";
import companyStore from "../../stores/companyStore.js";
import CompanyWorkerModel from "./CompanyWorkerModel.vue";
import { formatRoleTitle } from "../../services/company/presentation.js";

const QUICK_ROLES = ["CEO", "CFO", "CMO", "CPO", "Producer:text", "GeneralCounsel"];

export default {
  name: "CompanyForm",
  components: { CompanyWorkerModel },
  emits: ["cancel", "formed"],
  setup(_, { emit }) {
    const store = companyStore;
    const showAdvanced = ref(false);
    const busy = ref(false);
    const errors = ref([]);
    const rosterError = ref('');
    let rosterReady = false;

    const roleLibrary = store.state.roleLibrary;
    const currencies = store.state.currencies;
    onMounted(() => {
      void loadSmartAgents().then(() => { rosterReady = true; consumeHireRequest(); }).catch((error) => {
        rosterError.value = error.message || 'Unable to load saved smart agents.';
      });
    });
    const companions = computed(() => smartAgentCatalog.agents);

    const availablePipelines = [...SMART_AGENT_CREATE_CAPABILITIES];

    const form = reactive({
      name: "",
      mission: "",
      currency: "USD",
      perHeartbeatSpendCap: 5,
      reserveFloor: 0,
      ceoMin: 60,
      roleMin: 30,
      allowedPipelines: [...SMART_AGENT_CREATE_CAPABILITIES],
      // Split into two parallel maps so the form is simpler.
      companions: Object.fromEntries(Object.keys(roleLibrary).map((k) => [k, null])),
      llms: Object.fromEntries(Object.keys(roleLibrary).map((k) => [k, null])),
      execution: {
        llm: { mode: "swap", maxConcurrent: 2, memoryBudgetGB: 22 },
        diffusion: { mode: "sequential", maxConcurrent: 1 },
      },
    });

    function consumeHireRequest() {
      const id = smartAgentCatalog.pendingHireId;
      if (!rosterReady || !id || !companions.value.some((companion) => companion.id === id)) return;
      // Preserve an explicit selection made while the roster was loading.
      if (form.companions.CEO) return;
      form.companions.CEO = id;
      smartAgentCatalog.pendingHireId = null;
    }
    watch(() => [smartAgentCatalog.pendingHireId, smartAgentCatalog.loaded], consumeHireRequest, { immediate: true });

    const advancedRoleKeys = computed(() =>
      Object.keys(roleLibrary).filter((k) => !QUICK_ROLES.includes(k)),
    );

    const displayedRoleKeys = computed(() =>
      showAdvanced.value ? Object.keys(roleLibrary) : QUICK_ROLES,
    );

    async function submit() {
      errors.value = [];
      if (!form.name.trim() || !form.companions.CEO) { errors.value = ["Give the workflow a name and assign a coordinator."]; return; }
      busy.value = true;
      try {
        // Compose final roles map: drop unfilled rows; combine companion + llm.
        const roles = {};
        for (const key of Object.keys(roleLibrary)) {
          const companion = form.companions[key];
          const llm = form.llms[key];
          if (!companion && !llm) continue; // truly empty row
          if (!companion) continue;          // companion required to fill a role
          roles[key] = {
            companion,
            pipelines: [...SMART_AGENT_CREATE_CAPABILITIES],
            employment: { type: "companion-hire", companionId: companion },
          };
          if (llm) roles[key].llm = llm;
        }
        const cfg = {
          mode: "solo",
          name: form.name,
          mission: form.mission,
          currency: form.currency,
          perHeartbeatSpendCap: form.perHeartbeatSpendCap,
          reserveFloor: form.reserveFloor,
          allowedPipelines: form.allowedPipelines,
          heartbeat: { ceoMin: form.ceoMin, roleMin: form.roleMin, cfoMin: 5 },
          roles,
          execution: {
            llm: { ...form.execution.llm },
            diffusion: { ...form.execution.diffusion },
          },
        };
        await store.form(cfg);
        emit("formed");
      } catch (err) {
        errors.value = String(err.message || err).split(";").map((s) => s.trim());
      } finally {
        busy.value = false;
      }
    }

    /**
     * Pretty-print role keys for display. Internal keys ("Producer:text",
     * "GeneralCounsel", "RnDLead") stay as-is since they're persisted in
     * charters; this only affects rendering.
     */
    function roleDisplayName(roleKey) {
      return formatRoleTitle(roleKey);
    }

    return {
      form, busy, errors, rosterError, showAdvanced,
      roleLibrary, currencies, companions, availablePipelines,
      displayedRoleKeys, advancedRoleKeys,
      roleDisplayName,
      submit,
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
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.form-shell {
  max-width: 1100px;
  margin: 0 auto;
  color: var(--bz-fg);
  width: 100%;
  padding: var(--bz-space-3) 0 4em;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1em;
  margin-bottom: 0.5em;
}
.form-header h1 {
  font-size: 32px !important;
  margin: 0 !important;
  color: var(--bz-fg);
  text-align: left !important;
  display: flex;
  align-items: center;
}
.form-header h1 .material-symbols-outlined {
  font-size: 38px !important;
}
.form-intro {
  max-width: 820px;
  font-size: 15px !important;
  line-height: 1.55;
  margin: 0 0 var(--bz-space-4) !important;
  color: var(--bz-fg-mid) !important;
  text-align: left !important;
}

/* Form sections use the same spacing and surfaces as the workspace. */
.form-section {
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-6) !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg) !important;
  background: var(--bz-card);
  box-shadow: none;
}
.section-title {
  font-size: 22px !important;
  color: var(--bz-fg) !important;
  margin: 0 0 var(--bz-space-3) !important;
  text-align: left !important;
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.section-title .material-symbols-outlined {
  font-size: 26px;
  color: var(--bz-accent);
}
.section-intro {
  font-size: 14px !important;
  color: var(--bz-fg-mid) !important;
  margin: 0 0 var(--bz-space-4) !important;
  text-align: left !important;
  line-height: 1.5;
}

/* Form fields */
.label {
  display: block;
  margin-bottom: 8px;
  color: var(--bz-fg-mid) !important;
  font-style: normal;
  font: 500 14px/1.45 var(--bz-font-body);
  letter-spacing: 0;
}
.input, .textarea, .select select {
  background: var(--bz-card) !important;
  border: 1px solid var(--bz-border-strong) !important;
  border-radius: var(--bz-r);
  font: 400 15px/1.5 var(--bz-font-body);
  min-height: 44px;
  padding: 10px 12px;
  color: var(--bz-fg) !important;
}
.form-shell :is(.input, .textarea, .select) { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
.form-shell .select { display: block; }
.form-shell .select select { width: 100%; max-width: 100%; }
.input:focus, .textarea:focus, .select select:focus {
  border-color: var(--bz-border-brand) !important;
  box-shadow: none !important;
  outline: none;
}
.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}

/* ───────── Chips (pipelines + execution mode) ───────── */
.chip-row, .mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
.chip, .mode-chip {
  padding: 0.5em 1em;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  cursor: pointer;
  font-size: 14px;
  color: var(--bz-fg);
  transition: all 0.15s ease;
  text-transform: capitalize;
  font-style: normal;
  font-weight: 600;
}
.chip input, .mode-chip input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.chip:focus-within, .mode-chip:focus-within { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
.chip:hover, .mode-chip:hover {
  background: var(--bz-border);
  border-color: var(--bz-fg-mid);
}
.chip.is-on, .mode-chip.is-on {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
  box-shadow: none;
}

.hint {
  margin-top: 1em;
  padding: 0.85em 1em;
  background: var(--bz-info-soft);
  border-left: 3px solid var(--bz-info);
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  font-size: 13px;
  color: var(--bz-fg);
  line-height: 1.5;
}
.hint .material-symbols-outlined {
  color: var(--bz-info);
  flex-shrink: 0;
}

/* ───────── Org-chart table ───────── */
.role-table {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  margin-bottom: 1em;
}
.role-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1.2fr;
  gap: 1em;
  align-items: center;
  padding: 0.75em 1em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.role-row:hover {
  background: var(--bz-raised);
}
.role-row > div { min-width: 0; }
.role-row :is(.select, select) { width: 100%; max-width: 100%; min-width: 0; }
.role-row--header {
  background: transparent;
  border: none;
  font-weight: 700;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--bz-fg-mid);
  padding: 0.3em 1em;
}
.col-role strong {
  color: var(--bz-fg);
  display: block;
  font-style: normal;
}
.role-desc {
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin-top: 0.25em;
}

.advanced-toggle {
  display: flex;
  justify-content: center;
  margin-top: 1em;
}

.submit-row {
  display: flex;
  justify-content: flex-end;
  gap: 1em;
  align-items: center;
  margin-top: 2em;
}

@media (max-width: 760px) {
  .form-header,
  .submit-row {
    align-items: stretch;
    flex-direction: column;
  }
  .role-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .role-row--header {
    display: none;
  }
}

/* ───────── Notification override ───────── */
.notification.is-danger {
  background: var(--bz-danger-soft) !important;
  border: 1px solid var(--bz-danger) !important;
  color: var(--bz-fg) !important;
}
.notification.is-danger ul {
  margin: 0;
  padding-left: 1.5em;
}
.form-shell .field { margin-bottom: 24px; }
.form-shell .bz-btn { font: 500 14px/1.4 var(--bz-font-body); border-radius: var(--bz-r); min-height: 40px; }
.form-shell :is(button, summary):focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
@media(max-width:760px) { .form-section { padding: 20px !important; } }
@media(prefers-reduced-motion:reduce) { .form-shell * { transition: none !important; animation: none !important; } }
.form-shell details.form-section > .form-section { border: 0; border-radius: 0 !important; background: transparent; padding: 24px 0 !important; margin-bottom: 0; }
.form-shell details.form-section > .form-section + .form-section { border-top: 1px solid var(--bz-border); }
.form-shell details > summary { cursor: pointer; }
.form-shell :is(h1, label, p, strong) { overflow-wrap: anywhere; }
.form-shell .bz-btn { height: auto; white-space: normal; }
</style>
