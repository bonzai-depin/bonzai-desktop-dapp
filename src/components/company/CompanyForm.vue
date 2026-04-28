<template>
  <div class="form-shell">
    <div class="form-header">
      <h1 class="fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined is-size-1 mr-2">add_business</span>
        Form a Zero-Human Company
      </h1>
      <button class="button is-medium is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
        <span class="material-symbols-outlined is-size-3 mr-2">close</span>
        Cancel
      </button>
    </div>

    <p class="form-intro">
      Solo Mode: no crypto, no SaaS, no API meter. Runs on your machine,
      sells through links you can paste anywhere, keeps its books locally.
      Pick a CEO + at least one Producer; the rest of the org chart is
      optional.
    </p>

    <hr />

    <!-- ── Identity ─────────────────────────────────────── -->
    <section class="form-section models__activity--payouts">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">badge</span>
        Identity
      </h2>
      <div class="field">
        <label class="label fira-sans-condensed-black-italic">Company name</label>
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
          <div class="select is-fullwidth is-medium">
            <select v-model="form.currency">
              <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Per-tick spend cap</label>
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
          <label class="label fira-sans-condensed-black-italic">CEO heartbeat (min)</label>
          <input v-model.number="form.ceoMin" class="input is-medium" type="number" min="1" step="1" />
        </div>
        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Role heartbeat (min)</label>
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
      <p class="section-intro">
        Choose how concurrently the company can drive each task class.
        Parallel LLM mode spawns a separate <code>llama-server</code>
        instance per role-assigned model — bounded by the memory budget.
      </p>

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

      <div class="hint">
        <span class="material-symbols-outlined">tips_and_updates</span>
        Recommended: <strong>LLM in parallel</strong> if you have ≥ 22 GB
        free memory and want roles using different models to truly run
        simultaneously. <strong>Diffusion sequential</strong> is usually
        right — the GPU serializes diffusion anyway.
      </div>
    </section>

    <!-- ── Org chart + per-role LLM ─────────────────────────── -->
    <section class="form-section models__activity--payouts">
      <h2 class="section-title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined">schema</span>
        Org chart
      </h2>
      <p class="section-intro">
        Pick which companion fills each role and which LLM they prefer.
        Empty companion = inherit from parent role (CEO is the terminal
        fallback). Empty LLM = use whichever model is currently loaded.
      </p>

      <div class="role-table">
        <div class="role-row role-row--header">
          <div class="col-role">Role</div>
          <div class="col-companion">Companion</div>
          <div class="col-llm">Preferred LLM</div>
        </div>
        <div
          v-for="roleKey in displayedRoleKeys"
          :key="roleKey"
          class="role-row"
        >
          <div class="col-role">
            <strong>{{ roleDisplayName(roleKey) }}</strong>
            <div class="role-desc">{{ roleLibrary[roleKey].description }}</div>
          </div>
          <div class="col-companion">
            <div class="select is-fullwidth is-small">
              <select v-model="form.companions[roleKey]">
                <option :value="null">— inherit —</option>
                <option v-for="comp in companions" :key="comp.id" :value="comp.id">
                  {{ comp.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="col-llm">
            <div class="select is-fullwidth is-small">
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
        <button class="button is-small is-outlined is-info fira-sans-condensed-black-italic" @click="showAdvanced = !showAdvanced">
          <span class="material-symbols-outlined is-size-3 mr-1">
            {{ showAdvanced ? 'expand_less' : 'expand_more' }}
          </span>
          {{ showAdvanced ? "Hide" : "Show" }} advanced roles ({{ advancedRoleKeys.length }})
        </button>
      </div>
    </section>

    <!-- ── Submit ──────────────────────────────────────── -->
    <hr />
    <div v-if="errors.length" class="notification is-danger">
      <ul>
        <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
      </ul>
    </div>
    <div class="submit-row">
      <button
        class="button is-large is-success fira-sans-condensed-black-italic mr-5"
        :class="{ 'is-loading': busy }"
        :disabled="busy"
        @click="submit"
      >
        <span class="material-symbols-outlined is-size-3 mr-2">add_business</span>
        Form Company
      </button>
      <button class="button is-large is-light fira-sans-condensed-black-italic" @click="$emit('cancel')">
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
    const companions = DEFAULT_COMPANIONS.map((c) => ({ id: c.id, name: c.name }));

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
          roles[key] = { companion };
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
        CEO: "CEO", CFO: "CFO", CPO: "CPO", CMO: "CMO",
        CSO: "CSO", COO: "COO",
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
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 1), transparent);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.form-shell {
  max-width: 1100px;
  margin: 0 auto;
  color: #fff;
  padding-bottom: 4em;
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
  color: #fff;
  text-align: left !important;
  display: flex;
  align-items: center;
}
.form-header h1 .material-symbols-outlined {
  font-size: 38px !important;
}
.form-intro {
  font-size: 17px !important;
  margin: 0 0 1em !important;
  color: rgba(255, 255, 255, 0.8) !important;
  text-align: left !important;
}

/* ───────── Sections (glass cards) ───────── */
.form-section {
  margin-bottom: 1.5em;
  padding: 2em 2.5em !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px !important;
  background: rgba(0, 0, 0, 0.3);
}
.section-title {
  font-size: 24px !important;
  color: #fff !important;
  margin: 0 0 1em !important;
  text-align: left !important;
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.section-title .material-symbols-outlined {
  font-size: 32px;
  color: #48c78e;
}
.section-intro {
  font-size: 14px !important;
  color: rgba(255, 255, 255, 0.65) !important;
  margin: 0 0 1.5em !important;
  text-align: left !important;
  line-height: 1.5;
}

/* ───────── Form fields (glass inputs) ───────── */
.label {
  color: rgba(255, 255, 255, 0.85) !important;
  font-style: italic;
}
.input, .textarea, .select select {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 2px solid rgba(255, 255, 255, 0.18) !important;
  color: #fff !important;
  backdrop-filter: blur(8px);
}
.input:focus, .textarea:focus, .select select:focus {
  border-color: #48c78e !important;
  box-shadow: 0 0 0 0.125em rgba(72, 199, 142, 0.25) !important;
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
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.15s ease;
  text-transform: capitalize;
  font-style: italic;
  font-weight: 600;
}
.chip input, .mode-chip input { display: none; }
.chip:hover, .mode-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}
.chip.is-on, .mode-chip.is-on {
  background: rgba(72, 199, 142, 0.25);
  border-color: #48c78e;
  color: #fff;
  box-shadow: 0 0 8px rgba(72, 199, 142, 0.3);
}

.hint {
  margin-top: 1em;
  padding: 0.85em 1em;
  background: rgba(62, 142, 208, 0.1);
  border-left: 3px solid #3e8ed0;
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
}
.hint .material-symbols-outlined {
  color: #3e8ed0;
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
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
.role-row:hover {
  background: rgba(255, 255, 255, 0.07);
}
.role-row--header {
  background: transparent;
  border: none;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
  padding: 0.3em 1em;
}
.col-role strong {
  color: #fff;
  display: block;
  font-style: italic;
}
.role-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
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

/* ───────── Notification override ───────── */
.notification.is-danger {
  background: rgba(241, 70, 104, 0.18) !important;
  border: 1px solid #f14668 !important;
  backdrop-filter: blur(32px);
  color: #fff !important;
}
.notification.is-danger ul {
  margin: 0;
  padding-left: 1.5em;
}
</style>
