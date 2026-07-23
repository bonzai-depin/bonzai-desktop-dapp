<template>
  <div class="form-shell">
    <div class="form-header">
      <h1 class="fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined is-size-1 mr-2">add_business</span>
        Create a Workflow Team
      </h1>
      <button class="bz-btn is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
        <span class="material-symbols-outlined is-size-3 mr-2">close</span>
        Cancel
      </button>
    </div>

    <hr />

    <!-- ── Identity ─────────────────────────────────────── -->
    <section class="form-section models__activity--payouts">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">badge</span>
        Identity
      </h2>
      <div class="field">
        <label class="label fira-sans-condensed-black-italic">Team name</label>
        <input
          v-model.trim="form.name"
          class="input is-medium"
          placeholder="WeeklyHaiku Co."
          maxlength="64"
        />
      </div>
      <div class="field">
        <label class="label fira-sans-condensed-black-italic">Mission (one sentence)</label>
        <textarea
          v-model.trim="form.mission"
          class="textarea"
          rows="2"
          placeholder="Mint one haiku per day. Sell at $1. Email weekly digest to subscribers."
        ></textarea>
      </div>
    </section>

    <!-- ── Rules + currency ───────────────────────────────── -->
    <section class="form-section models__activity--payouts">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">rule</span>
        Rules
      </h2>
      <div class="field-row">
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Currency</label>
          <div class="select skill-fullwidth is-medium">
            <select v-model="form.currency">
              <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Per-run spend cap</label>
          <input
            v-model.number="form.perHeartbeatSpendCap"
            class="input is-medium"
            type="number" min="0" step="0.5"
          />
        </div>
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Reserve floor</label>
          <input
            v-model.number="form.reserveFloor"
            class="input is-medium"
            type="number" min="0" step="0.5"
          />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Coordinator cadence (min)</label>
          <input v-model.number="form.ceoMin" class="input is-medium" type="number" min="1" step="1" />
        </div>
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Teammate cadence (min)</label>
          <input v-model.number="form.roleMin" class="input is-medium" type="number" min="1" step="1" />
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
    <section class="form-section models__activity--payouts">
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
          <label class="label fira-sans-condensed-black-italic">Max concurrent LLM calls</label>
          <input v-model.number="form.execution.llm.maxConcurrent" class="input is-medium" type="number" min="1" max="8" />
        </div>
        <div class="field" v-if="form.execution.llm.mode === 'parallel'">
          <label class="label fira-sans-condensed-black-italic">Memory budget (GB)</label>
          <input v-model.number="form.execution.llm.memoryBudgetGB" class="input is-medium" type="number" min="4" step="2" />
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
          <label class="label fira-sans-condensed-black-italic">Max concurrent diffusion jobs</label>
          <input v-model.number="form.execution.diffusion.maxConcurrent" class="input is-medium" type="number" min="1" max="4" />
        </div>
      </div>

    </section>

    <!-- ── Team + per-teammate LLM ─────────────────────────── -->
    <section class="form-section models__activity--payouts">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">groups</span>
        Teammates
      </h2>
      <div class="role-table">
        <div class="role-row role-row--header">
          <div class="col-role">Function</div>
          <div class="col-companion">Hire companion</div>
          <div class="col-llm">Preferred LLM</div>
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
              <select v-model="form.companions[roleKey]">
                <option :value="null">— inherit —</option>
                <option v-for="comp in companions" :key="comp.id" :value="comp.id">
                  {{ comp.name }} · {{ comp.title }}
                </option>
              </select>
            </div>
          </div>
          <div class="col-llm">
            <div class="select skill-fullwidth is-small">
              <select v-model="form.llms[roleKey]">
                <option :value="null">— current —</option>
                <option v-for="llm in llmOptions" :key="llm.key" :value="llm.key">
                  {{ llm.label }}
                </option>
              </select>
            </div>
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
        <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
      </ul>
    </div>
    <div class="submit-row">
      <button
        class="bz-btn bz-btn--primary bz-btn--lg fira-sans-condensed-black-italic mr-5"
        :class="{ 'bz-btn--running': busy }"
        :disabled="busy"
        @click="submit"
      >
        <span class="material-symbols-outlined is-size-3 mr-2">add_business</span>
        Create Team
      </button>
      <button class="bz-btn bz-btn--lg is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
        <span class="material-symbols-outlined is-size-3 mr-2">close</span>
        Cancel
      </button>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS, LLM_BASE_MODELS, listAllLLMs } from "../../skills/flagship.js";
import { getCompanionCareer, getCompanySkillsForCompanion } from "../../skills/companionSkillRoadmap.js";

const QUICK_ROLES = ["CEO", "CFO", "CMO", "CPO", "Producer:text", "GeneralCounsel"];

export default {
  name: "CompanyForm",
  emits: ["cancel", "formed"],
  setup(_, { emit }) {
    const store = companyStore;
    const showAdvanced = ref(false);
    const busy = ref(false);
    const errors = ref([]);

    const roleLibrary = store.state.roleLibrary;
    const currencies = store.state.currencies;
    const companions = DEFAULT_COMPANIONS.map((c) => ({
      id: c.id,
      name: c.name,
      title: getCompanionCareer(c.id)?.title || "Agentic specialist",
    }));

    // Build a flat list of (key,label) from LLM_BASE_MODELS for the picker.
    // Sort by parameter count for readability.
    const llmOptions = computed(() => {
      return Object.keys(LLM_BASE_MODELS)
        .map((baseKey) => {
          const m = LLM_BASE_MODELS[baseKey];
          return {
            key: `llm_${baseKey}`,
            label: `${m.name} (${m.parameters >= 1e9 ? `${(m.parameters / 1e9).toFixed(1)}B` : m.parameters})`,
            params: m.parameters || 0,
          };
        })
        .sort((a, b) => a.params - b.params);
    });

    const availablePipelines = ["text", "image", "audio", "video", "3d", "music", "vision"];

    const form = reactive({
      name: "",
      mission: "",
      currency: "USD",
      perHeartbeatSpendCap: 5,
      reserveFloor: 0,
      ceoMin: 60,
      roleMin: 30,
      allowedPipelines: ["text"],
      // Split into two parallel maps so the form is simpler.
      companions: Object.fromEntries(Object.keys(roleLibrary).map((k) => [k, null])),
      llms: Object.fromEntries(Object.keys(roleLibrary).map((k) => [k, null])),
      execution: {
        llm: { mode: "swap", maxConcurrent: 2, memoryBudgetGB: 22 },
        diffusion: { mode: "sequential", maxConcurrent: 1 },
      },
    });

    const advancedRoleKeys = computed(() =>
      Object.keys(roleLibrary).filter((k) => !QUICK_ROLES.includes(k)),
    );

    const displayedRoleKeys = computed(() =>
      showAdvanced.value ? Object.keys(roleLibrary) : QUICK_ROLES,
    );

    async function submit() {
      errors.value = [];
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
            grantedSkills: getCompanySkillsForCompanion(companion),
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
      if (!roleKey) return "";
      if (roleKey.startsWith("Producer:")) {
        const pipeline = roleKey.split(":")[1] || "";
        let label;
        if (pipeline === "3d") label = "3D";
        else if (pipeline === "fineTune") label = "Fine-Tune";
        else label = pipeline.charAt(0).toUpperCase() + pipeline.slice(1);
        return `${label} Producer`;
      }
      const TITLES = {
        CEO: "Coordinator", CFO: "Finance", CPO: "Product", CMO: "Marketing",
        CSO: "Sales", COO: "Operations",
        GeneralCounsel: "General Counsel", RnDLead: "R&D Lead",
      };
      return TITLES[roleKey] || roleKey;
    }

    return {
      form, busy, errors, showAdvanced,
      roleLibrary, currencies, companions, availablePipelines, llmOptions,
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
  background: linear-gradient(to right, transparent, var(--bz-fg), transparent);
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

/* ───────── Sections (glass cards) ───────── */
.form-section {
  margin-bottom: var(--bz-space-4);
  padding: var(--bz-space-4) !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
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

/* ───────── Form fields (glass inputs) ───────── */
.label {
  color: var(--bz-fg-mid) !important;
  font-style: normal;
  font-size: var(--bz-size-meta);
  font-weight: 700;
  letter-spacing: 0;
}
.input, .textarea, .select select {
  background: var(--bz-card) !important;
  border: 1px solid var(--bz-border) !important;
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg) !important;
}
.input:focus, .textarea:focus, .select select:focus {
  border-color: var(--bz-border-brand) !important;
  box-shadow: 0 0 0 2px var(--bz-purple-soft) !important;
}
.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1em;
  margin-bottom: 1em;
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
.chip input, .mode-chip input { display: none; }
.chip:hover, .mode-chip:hover {
  background: var(--bz-border);
  border-color: var(--bz-fg-low);
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
.role-row--header {
  background: transparent;
  border: none;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0;
  color: var(--bz-fg-low);
  padding: 0.3em 1em;
}
.col-role strong {
  color: var(--bz-fg);
  display: block;
  font-style: italic;
}
.role-desc {
  font-size: 12px;
  color: var(--bz-fg-low);
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
    grid-template-columns: 1fr;
  }
  .role-row--header {
    display: none;
  }
}

/* ───────── Notification override ───────── */
.notification.is-danger {
  background: rgba(241, 70, 104, 0.18) !important;
  border: 1px solid var(--bz-danger) !important;
  color: var(--bz-fg) !important;
}
.notification.is-danger ul {
  margin: 0;
  padding-left: 1.5em;
}
</style>
