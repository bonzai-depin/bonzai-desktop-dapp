<template>
  <div class="wiz-overlay" @click.self="confirmCancel">
    <div class="wiz models__activity--payouts">
      <!-- Header with brand-gradient title + close -->
      <div class="wiz__head">
        <div>
          <h1 class="fira-sans-condensed-black-italic wiz__title">
            <span class="material-symbols-outlined is-size-1 mr-2">auto_awesome_motion</span>
            <span class="wiz__title-text">Form a Zero-Human Company</span>
          </h1>
          <p class="wiz__subtitle muted">
            A short setup that creates a real charter, staffed roles, first goals, and the
            tools your company needs.
          </p>
        </div>
        <BzCloseButton size="md" aria-label="Close" @click="confirmCancel" />
      </div>

      <!-- Step rail -->
      <div class="wiz__rail">
        <div
          v-for="(s, idx) in steps"
          :key="s.id"
          class="wiz-step"
          :class="{
            'is-active': step === idx,
            'is-done': step > idx,
          }"
          @click="step > idx && goTo(idx)"
        >
          <div class="wiz-step__icon">
            <span class="material-symbols-outlined">
              {{ step > idx ? 'check' : s.icon }}
            </span>
          </div>
          <div class="wiz-step__label fira-sans-condensed-black-italic">{{ s.label }}</div>
        </div>
      </div>

      <hr />

      <!-- ──── Step 1: Vertical pick ──── -->
      <div v-if="step === 0" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">category</span>
          What does your business do?
        </h2>
        <p class="muted">
          Pick the closest starting point. You can edit the charter and agentic team after setup.
        </p>
        <div class="tpl-grid">
          <div
            v-for="t in templates"
            :key="t.id"
            class="tpl-card"
            :class="{ 'is-selected': draft.templateId === t.id }"
            @click="selectTemplate(t.id)"
          >
            <div class="tpl-card__icon">
              <span class="material-symbols-outlined">{{ t.badgeIcon }}</span>
            </div>
            <div class="tpl-card__title fira-sans-condensed-black-italic">{{ t.name }}</div>
            <div class="tpl-card__summary">{{ t.summary }}</div>
            <div class="tpl-card__packs">
              <span v-for="tag in templateTags(t)" :key="tag" class="skill-chip is-small">{{ tag }}</span>
            </div>
          </div>
          <div class="tpl-card tpl-card--coming">
            <div class="tpl-card__icon"><span class="material-symbols-outlined">add_circle</span></div>
            <div class="tpl-card__title fira-sans-condensed-black-italic">More verticals soon</div>
            <div class="tpl-card__summary">
              Law firms, marketing agencies, e-commerce, restaurants, real estate, coaching practices…
            </div>
          </div>
        </div>
      </div>

      <!-- ──── Step 2: Vertical-specific intake ──── -->
      <div v-else-if="step === 1" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">edit_note</span>
          Tell us about your {{ selectedTemplate.name }}
        </h2>
        <p class="muted">
          Quick context so the CEO companion can write a real mission statement.
        </p>
        <div class="wiz-fields">
          <div v-for="q in selectedTemplate.intakeQuestions" :key="q.id" class="wiz-field">
            <label class="wiz-field__label">{{ q.label }}{{ q.required ? ' *' : '' }}</label>
            <input
              v-if="q.type === 'text' || q.type === undefined"
              v-model="answers[q.id]"
              :placeholder="q.placeholder || ''"
              class="input is-medium"
            />
            <input
              v-else-if="q.type === 'number'"
              v-model.number="answers[q.id]"
              type="number"
              class="input is-medium"
            />
            <div v-else-if="q.type === 'select'" class="select is-medium skill-fullwidth">
              <select v-model="answers[q.id]">
                <option v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
            <label v-else-if="q.type === 'toggle'" class="wiz-toggle">
              <input type="checkbox" v-model="answers[q.id]" />
              <span class="wiz-toggle__track"></span>
              <span class="wiz-toggle__text">{{ answers[q.id] ? 'Yes' : 'No' }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- ──── Step 3: Humans on the team ──── -->
      <div v-else-if="step === 2" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">groups</span>
          Who works there today?
        </h2>
        <p class="muted">
          Add people who should stay visible in the operating plan. Mark hands-on roles so
          tasks route through a coordinator instead of pretending software can do physical work.
        </p>
        <div class="roster">
          <div v-for="(h, idx) in roster" :key="idx" class="roster-row">
            <input v-model.trim="h.name" placeholder="Name" class="input" />
            <input v-model.trim="h.title" placeholder="Job title" class="input" />
            <div class="select">
              <select v-model="h.contractorStatus">
                <option value="W2">W-2</option>
                <option value="1099">1099</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <label class="roster-row__hybrid">
              <input type="checkbox" v-model="h.isPhysical" />
              <span>Physical role</span>
            </label>
            <button class="bz-btn bz-btn--ghost icon-only-btn" @click="removeRoster(idx)" aria-label="Remove">
              <span class="material-symbols-outlined">remove</span>
            </button>
          </div>
        </div>
        <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="addRoster">
          <span class="material-symbols-outlined mr-1">add</span> Add person
        </button>
        <div v-if="hybridRoleHint" class="wiz-hint">
          <span class="material-symbols-outlined">tips_and_updates</span>
          Detected {{ physicalCount }} physical role{{ physicalCount === 1 ? '' : 's' }} —
          we'll map them under <strong>{{ hybridRoleHint }}</strong>.
          The companion in that role coordinates them; it doesn't claim to do the work itself.
        </div>
      </div>

      <!-- ──── Step 4: Tools / connectors ──── -->
      <div v-else-if="step === 3" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">extension</span>
          What tools are you on?
        </h2>
        <p class="muted">
          Tap the services your company uses. We'll request access via OAuth or API key after
          formation; nothing gets touched without your explicit approval.
        </p>
        <div class="conn-grid">
          <div
            v-for="conn in availableConnectors"
            :key="conn.kind"
            class="conn-tile"
            :class="{
              'is-required': requiredConnectorSet.has(conn.kind),
              'is-selected': pickedConnectors.has(conn.kind),
            }"
            @click="toggleConnector(conn.kind)"
          >
            <div class="conn-tile__icon">
              <span class="material-symbols-outlined">{{ conn.icon }}</span>
            </div>
            <div class="conn-tile__name fira-sans-condensed-black-italic">{{ conn.name }}</div>
            <div class="conn-tile__kind muted">{{ conn.kind }}</div>
            <span v-if="requiredConnectorSet.has(conn.kind)" class="conn-tile__req">required</span>
          </div>
        </div>
        <p class="muted wiz-hint__inline">
          {{ pickedConnectors.size }} selected · {{ requiredConnectorSet.size }} required by your template
        </p>
      </div>

      <!-- ──── Step 5: Money + repetitive work ──── -->
      <div v-else-if="step === 4" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">tune</span>
          Money picture &amp; first goals
        </h2>
        <p class="muted">
          Set the money guardrails and first goals. The company plans inside these limits and
          asks before sensitive work runs.
        </p>
        <div class="wiz-grid-2">
          <div class="wiz-field">
            <label class="wiz-field__label">Currency</label>
            <div class="select is-medium skill-fullwidth">
              <select v-model="treasury.currency">
                <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Working-capital floor</label>
            <input v-model.number="treasury.reserveFloor" type="number" class="input is-medium" />
            <p class="muted wiz-field__hint">Keep this amount untouched.</p>
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Per-tick spend cap</label>
            <input v-model.number="treasury.perHeartbeatSpendCap" type="number" class="input is-medium" />
            <p class="muted wiz-field__hint">Spending above this waits for approval.</p>
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Company name</label>
            <input v-model.trim="companyName" class="input is-medium" :placeholder="defaultName" />
          </div>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">flag</span>
          Initial goals (you can edit later)
        </h3>
        <p class="muted">
          These become the first visible goals after the company is formed.
        </p>
        <div class="initial-goals">
          <div v-for="(g, idx) in initialGoals" :key="idx" class="initial-goal">
            <input v-model="initialGoals[idx]" class="input" />
            <button class="bz-btn bz-btn--ghost icon-only-btn" @click="initialGoals.splice(idx, 1)" aria-label="Remove">
              <span class="material-symbols-outlined">remove</span>
            </button>
          </div>
          <button class="bz-btn bz-btn--ghost is-small fira-sans-condensed-black-italic" @click="initialGoals.push('')">
            <span class="material-symbols-outlined mr-1">add</span> Add goal
          </button>
        </div>

        <hr />

        <!-- Demo mode toggle — front-and-center because it unblocks
             the entire experience without requiring a loaded model. -->
        <div class="demo-row">
          <label class="wiz-toggle">
            <input type="checkbox" v-model="demoMode" />
            <span class="wiz-toggle__track"></span>
          </label>
          <div class="demo-row__copy">
            <div class="demo-row__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined mr-2">auto_awesome_motion</span>
              Start with sample activity
            </div>
            <p class="demo-row__hint">
              Populate the workspace quickly so you can see goals, tasks, approvals, and
              deliverables before connecting every tool.
            </p>
          </div>
        </div>

        <hr />

        <!-- Mission preview -->
        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">north_star</span>
          Mission preview
        </h3>
        <div class="mission-preview">{{ missionPreview }}</div>
      </div>

      <hr />

      <!-- Action bar -->
      <div class="wiz__actions">
        <button
          v-if="step > 0"
          class="bz-btn is-light fira-sans-condensed-black-italic"
          @click="step--"
        >
          <span class="material-symbols-outlined mr-1">arrow_back</span> Back
        </button>
        <span class="wiz__step-count muted">Step {{ step + 1 }} of {{ steps.length }}</span>
        <div class="wiz__actions-right">
          <button
            v-if="step < steps.length - 1"
            class="bz-btn is-success fira-sans-condensed-black-italic"
            :disabled="!canAdvance"
            @click="step++"
          >
            Next <span class="material-symbols-outlined ml-1">arrow_forward</span>
          </button>
          <button
            v-else
            class="bz-btn is-warning fira-sans-condensed-black-italic"
            :class="{ 'bz-btn--running': busy }"
            :disabled="busy || !canForm"
            @click="formCompany"
          >
            <span class="material-symbols-outlined is-size-3 mr-2">rocket_launch</span>
            Form company
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { reactive, ref, computed } from "vue";
import companyStore from "../../stores/companyStore.js";
import { listTemplates as listCompanyTemplates } from "../../services/company/templates.js";
import BzCloseButton from "../BzCloseButton.vue";

/**
 * The five-step intake wizard. Self-contained — opens, runs, returns
 * a charter id (or null if cancelled). Parent handles the cancel/done
 * routing via `done` + `cancel` events.
 */

// Connector catalog — keep it modest; the full list comes from
// skillManifests.js requiredConnectors but we want pretty icons + names.
const CONNECTOR_CATALOG = [
  { kind: "twilio",          name: "Twilio",            icon: "call" },
  { kind: "quickbooks",      name: "QuickBooks",        icon: "receipt_long" },
  { kind: "stripe",          name: "Stripe",            icon: "credit_card" },
  { kind: "google_calendar", name: "Google Calendar",   icon: "event" },
  { kind: "hubspot",         name: "HubSpot",           icon: "hub" },
  { kind: "sendgrid",        name: "SendGrid",          icon: "mail" },
  { kind: "shopify",         name: "Shopify",           icon: "storefront" },
  { kind: "printful",        name: "Printful",          icon: "local_shipping" },
  { kind: "printify",        name: "Printify",          icon: "inventory" },
  { kind: "optimoroute",     name: "OptimoRoute",       icon: "alt_route" },
  { kind: "google_business", name: "Google Business",   icon: "storefront" },
  { kind: "docusign",        name: "DocuSign",          icon: "draw" },
  { kind: "clio",            name: "Clio",              icon: "gavel" },
  { kind: "meta_ads",        name: "Meta Ads",          icon: "ads_click" },
  { kind: "google_ads",      name: "Google Ads",        icon: "campaign" },
  { kind: "notion",          name: "Notion",            icon: "menu_book" },
  { kind: "convertkit",      name: "ConvertKit",        icon: "newspaper" },
  { kind: "teachable",       name: "Teachable",         icon: "school" },
  { kind: "calendly",        name: "Calendly",          icon: "event_available" },
  { kind: "slack",           name: "Slack",             icon: "tag" },
  { kind: "linear",          name: "Linear",            icon: "list_alt" },
];

export default {
  name: "CompanyIntakeWizard",
  components: { BzCloseButton },
  emits: ["done", "cancel"],
  setup(_props, { emit }) {
    const store = companyStore;
    const templates = ref(listCompanyTemplates());
    const initialTemplate = templates.value[0] || null;
    const draft = reactive({ templateId: initialTemplate?.id || null });
    const answers = reactive({});
    const roster = ref([{ name: "", title: "Owner", contractorStatus: "owner", isPhysical: false }]);
    const treasury = reactive({ currency: "USD", reserveFloor: 0, perHeartbeatSpendCap: 0 });
    const pickedConnectors = ref(new Set());
    const initialGoals = ref([]);
    const companyName = ref("");
    const step = ref(0);
    const busy = ref(false);
    // Default ON — the user's frustration is "nothing works without a
    // loaded model." Demo Mode resolves that by default; serious users
    // toggle off after they've loaded a model.
    const demoMode = ref(true);
    const currencies = ["USD", "EUR", "GBP", "JPY"];

    const steps = [
      { id: "vertical", label: "Vertical",   icon: "category" },
      { id: "context",  label: "Context",    icon: "edit_note" },
      { id: "team",     label: "Team",       icon: "groups" },
      { id: "tools",    label: "Tools",      icon: "extension" },
      { id: "money",    label: "Charter",    icon: "tune" },
    ];

    const selectedTemplate = computed(() =>
      templates.value.find((t) => t.id === draft.templateId) || null,
    );

    const defaultName = computed(() =>
      selectedTemplate.value ? selectedTemplate.value.name : "Untitled Company",
    );

    function selectTemplate(id) {
      draft.templateId = id;
      const t = templates.value.find((x) => x.id === id);
      if (!t) return;
      // Seed defaults from the template
      Object.assign(treasury, t.treasuryDefaults || {});
      initialGoals.value = [...(t.initialGoals || [])];
      // Reset answers per template
      Object.keys(answers).forEach((k) => delete answers[k]);
      for (const q of t.intakeQuestions || []) {
        if (q.default !== undefined) answers[q.id] = q.default;
        else answers[q.id] = "";
      }
      // Pre-select all required connectors (user can deselect to skip)
      pickedConnectors.value = new Set(requiredConnectorSet.value);
    }

    // ─── derived: required connectors based on chosen template's packs ───
    const requiredConnectorSet = computed(() => {
      if (!selectedTemplate.value) return new Set();
      const t = selectedTemplate.value;
      // Resolve via service layer — store gave us listSkillPacks indirectly
      const packs = (t.skillPacks || []).map((pid) => ({
        skills: (function () {
          // Read from a tiny client-side mirror — defer to the service if needed
          // We import the manifest dictionary lazily.
          return [];
        })(),
      }));
      // We'll resolve via window-side service — set it from intakePreview below.
      return new Set(intakePreview.value?.requiredConnectors || []);
    });

    const intakePreview = computed(() => {
      if (!draft.templateId) return null;
      try {
        return store.previewTemplate(draft.templateId, answers, {
          name: companyName.value || defaultName.value,
          humanRoster: humanRosterPlain.value,
          treasury: { ...treasury },
          mode: "solo",
          includeOptionalHumans: hasPhysicalHumans.value,
        });
      } catch { return null; }
    });

    const availableConnectors = computed(() => {
      // Prioritize required ones at the top; show the rest below.
      const req = requiredConnectorSet.value;
      const sorted = [...CONNECTOR_CATALOG].sort((a, b) => {
        const ar = req.has(a.kind) ? 0 : 1;
        const br = req.has(b.kind) ? 0 : 1;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
      });
      return sorted;
    });

    function toggleConnector(kind) {
      const next = new Set(pickedConnectors.value);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      pickedConnectors.value = next;
    }

    function templateTags(template) {
      const tags = [];
      if ((template.defaultRoles || {})["Producer:image"]) tags.push("Design");
      if ((template.defaultRoles || {})["Producer:video"]) tags.push("Video");
      if ((template.defaultRoles || {})["Producer:text"]) tags.push("Writing");
      if ((template.hybridRoles || []).length) tags.push("Human handoff");
      if ((template.skillPacks || []).some((p) => /store|shop|affiliate/.test(p))) tags.push("Commerce");
      if ((template.skillPacks || []).some((p) => /law|bookkeeping/.test(p))) tags.push("Client ops");
      return [...new Set(tags)].slice(0, 4);
    }

    // ─── roster + hybrid hint ───
    function addRoster() {
      roster.value.push({ name: "", title: "", contractorStatus: "1099", isPhysical: false });
    }
    function removeRoster(idx) {
      roster.value.splice(idx, 1);
    }
    const physicalCount = computed(() =>
      roster.value.filter((h) => h.isPhysical && h.name.trim()).length,
    );
    const hasPhysicalHumans = computed(() => physicalCount.value > 0);
    const hybridRoleHint = computed(() => {
      if (!selectedTemplate.value || !hasPhysicalHumans.value) return null;
      const hr = selectedTemplate.value.hybridRoles?.[0];
      return hr?.key || null;
    });
    const humanRosterPlain = computed(() =>
      roster.value
        .filter((h) => h.name.trim())
        .map((h) => ({
          name: h.name,
          title: h.title,
          contractorStatus: h.contractorStatus,
          isPhysical: !!h.isPhysical,
        })),
    );

    if (initialTemplate) selectTemplate(initialTemplate.id);

    // ─── mission preview ───
    const missionPreview = computed(() => {
      if (!intakePreview.value) return "(pick a template + answer the context questions)";
      return intakePreview.value.draft?.mission || "";
    });

    // ─── nav guards ───
    const canAdvance = computed(() => {
      if (step.value === 0) return !!draft.templateId;
      if (step.value === 1) {
        return (selectedTemplate.value?.intakeQuestions || [])
          .filter((q) => q.required)
          .every((q) => String(answers[q.id] || "").trim().length > 0);
      }
      return true;
    });
    const canForm = computed(() => !!draft.templateId);

    function goTo(i) {
      if (i < step.value) step.value = i;
    }

    function confirmCancel() {
      if (step.value > 0 && !confirm("Discard the wizard? You'll lose your answers.")) return;
      emit("cancel");
    }

    async function formCompany() {
      if (!canForm.value) return;
      busy.value = true;
      try {
        const c = await store.formFromTemplate(draft.templateId, answers, {
          name: companyName.value || defaultName.value,
          humanRoster: humanRosterPlain.value,
          treasury: { ...treasury },
          mode: "solo",
          includeOptionalHumans: hasPhysicalHumans.value,
          demoMode: demoMode.value,
        });
        // Best-effort: queue placeholder connectors so dashboard prompts the user.
        for (const kind of pickedConnectors.value) {
          try {
            await store.createConnector({
              kind,
              authType: "apiKey",
              label: kind,
            });
          } catch {}
        }
        // Best-effort: seed initial goals as user-created goal records.
        for (const title of initialGoals.value) {
          if (!title?.trim()) continue;
          try { await store.createGoal({ title: title.trim(), rationale: "Imported from intake wizard." }); } catch {}
        }
        emit("done", c.id);
      } catch (err) {
        alert("Failed to form company: " + (err.message || err));
        busy.value = false;
      }
    }

    return {
      step, steps, busy, draft, answers, treasury, initialGoals, companyName, currencies,
      demoMode,
      templates, selectedTemplate, defaultName,
      roster, addRoster, removeRoster, physicalCount, hybridRoleHint,
      pickedConnectors, requiredConnectorSet, availableConnectors, toggleConnector,
      missionPreview, canAdvance, canForm, goTo, confirmCancel, formCompany,
      selectTemplate, templateTags,
    };
  },
};
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}
hr {
  margin: 20px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--bz-fg), transparent);
}
.muted { color: rgba(255, 255, 255, 0.65); font-size: 0.92em; }
.icon-only-btn { width: 40px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.panel-subtitle {
  font-size: 1.15rem;
  color: var(--bz-fg);
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.5em;
}
.panel-subtitle .material-symbols-outlined { font-size: 22px; color: rgb(255, 153, 51); }

/* ───────── Overlay shell ───────── */
.wiz-overlay {
  position: fixed; inset: 0;
  background: var(--bz-scrim-strong);
  z-index: 9998;
  display: flex; align-items: center; justify-content: center;
  padding: var(--bz-space-4);
  color: var(--bz-fg);
}
.wiz {
  width: 100%; max-width: 900px;
  max-height: calc(100vh - 4em); overflow-y: auto;
  padding: var(--bz-space-5) !important;
  background: var(--bz-panel) !important;
  border: 1px solid var(--bz-border) !important;
  border-radius: var(--bz-r) !important;
}

.wiz__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1em;
  margin-bottom: 0.5em;
}
.wiz__title {
  font-size: 1.85rem;
  display: flex; align-items: center;
  margin-bottom: 0.25em;
}
.wiz__title-text {
  color: var(--bz-fg);
}
.wiz__subtitle { max-width: 620px; }

/* ───────── Step rail ───────── */
.wiz__rail {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--bz-space-2);
  margin-top: 1em;
}
.wiz-step {
  flex: 1 1 0;
  padding: 8px 10px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  display: flex; align-items: center; gap: 0.5em;
  font-size: 0.85em;
  cursor: default;
  transition: all 0.2s ease;
}
.wiz-step.is-active {
  border-color: var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.wiz-step.is-done {
  cursor: pointer;
  border-color: var(--bz-border-brand);
  background: var(--bz-raised);
}
.wiz-step__icon .material-symbols-outlined { font-size: 18px; }
.wiz-step__label {
  letter-spacing: 0;
  text-transform: uppercase;
  font-size: 0.7rem;
}

/* ───────── Step panels ───────── */
.wiz-panel {
  min-height: 320px;
  padding: 0.5em 0;
}

/* ───────── Step 1: vertical tile grid ───────── */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1em;
  margin-top: 1em;
}
.tpl-card {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: 1.25em;
  cursor: pointer;
  transition: all 0.18s ease;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  min-height: 180px;
}
.tpl-card:hover { border-color: rgba(255, 255, 255, 0.32); transform: translateY(-2px); }
.tpl-card.is-selected {
  border-color: var(--bz-control-selected-border) !important;
  background: var(--bz-control-selected-bg) !important;
  box-shadow: none;
}
.tpl-card--coming { cursor: default; opacity: 0.55; }
.tpl-card__icon .material-symbols-outlined {
  font-size: 36px;
  color: var(--bz-accent);
}
.tpl-card__title {
  font-size: 1.15rem;
  color: var(--bz-fg);
}
.tpl-card__summary {
  font-size: 0.88em;
  color: var(--bz-fg-mid);
  line-height: 1.45;
}
.tpl-card__packs { display: flex; gap: 0.3em; flex-wrap: wrap; margin-top: 0.4em; }

/* ───────── Step 2: context fields ───────── */
.wiz-fields { display: flex; flex-direction: column; gap: 1em; margin-top: 1em; }
.wiz-field { display: flex; flex-direction: column; gap: 0.4em; }
.wiz-field__label {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
}
.wiz-field__hint { font-size: 0.78em !important; }

/* Toggle (yes/no) */
.wiz-toggle { display: flex; align-items: center; gap: 0.7em; cursor: pointer; }
.wiz-toggle input { display: none; }
.wiz-toggle__track {
  display: inline-block;
  width: 40px; height: 22px;
  background: var(--bz-border-strong);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
}
.wiz-toggle__track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 16px; height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.wiz-toggle input:checked + .wiz-toggle__track {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
}
.wiz-toggle input:checked + .wiz-toggle__track::after { transform: translateX(18px); }

/* ───────── Step 3: roster ───────── */
.roster { display: flex; flex-direction: column; gap: 0.5em; margin: 1em 0; }
.roster-row {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 130px auto auto;
  gap: 0.5em;
  align-items: center;
}
.roster-row .input { background: var(--bz-scrim); }
.roster-row__hybrid {
  display: flex; align-items: center; gap: 0.4em;
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
}
.wiz-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  margin-top: 1em;
  padding: 1em 1.2em;
  background: rgba(155, 109, 200, 0.16);
  border: 1px solid rgba(155, 109, 200, 0.4);
  border-radius: 4px;
  font-size: 0.92em;
  line-height: 1.5;
}
.wiz-hint .material-symbols-outlined { color: rgb(255, 153, 51); font-size: 22px; }
.wiz-hint__inline { margin-top: 1em; font-size: 0.85em !important; }

/* ───────── Step 4: connector tile grid ───────── */
.conn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75em;
  margin-top: 1em;
}
.conn-tile {
  position: relative;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: 1em 0.75em;
  cursor: pointer;
  transition: all 0.18s ease;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35em;
}
.conn-tile:hover { border-color: var(--bz-fg-faint); }
.conn-tile.is-required {
  border-color: var(--bz-border-brand);
  background: var(--bz-raised);
}
.conn-tile.is-selected {
  border-color: var(--bz-control-selected-border) !important;
  background: var(--bz-control-selected-bg) !important;
}
.conn-tile__icon .material-symbols-outlined {
  font-size: 30px;
  color: var(--bz-accent);
}
.conn-tile__name { font-size: 0.95em; }
.conn-tile__kind { font-size: 0.72em; }
.conn-tile__req {
  position: absolute;
  top: 6px; right: 6px;
  font-size: 0.62em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 153, 51, 0.85);
  color: #000;
  font-weight: 700;
}

/* ───────── Step 5: money + goals ───────── */
.wiz-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1em;
  margin-top: 1em;
}
.initial-goals { display: flex; flex-direction: column; gap: 0.5em; margin: 0.75em 0; }
.initial-goal { display: grid; grid-template-columns: 1fr auto; gap: 0.5em; align-items: center; }

.mission-preview {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-left: 3px solid var(--bz-accent);
  padding: 1em 1.25em;
  border-radius: 0 4px 4px 0;
  font-style: italic;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--bz-fg);
}

/* ───────── Demo Mode toggle row ───────── */
.demo-row {
  display: flex;
  align-items: flex-start;
  gap: 1em;
  padding: 1em 1.25em;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.demo-row__copy { flex: 1; }
.demo-row__title {
  display: flex;
  align-items: center;
  font-size: 1.05rem;
  margin-bottom: 0.3em;
  color: var(--bz-fg);
}
.demo-row__title .material-symbols-outlined {
  color: var(--bz-accent) !important;
  font-size: 22px;
}
.demo-row__hint {
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.88em !important;
  line-height: 1.55;
  margin: 0 !important;
}

/* ───────── Action bar ───────── */
.wiz__actions {
  display: flex;
  align-items: center;
  gap: 1em;
}
.wiz__step-count { margin-left: auto; }
.wiz__actions-right { display: flex; gap: 0.5em; }

@media (max-width: 760px) {
  .wiz-overlay {
    align-items: stretch;
    padding: var(--bz-space-2);
  }
  .wiz {
    max-height: none;
    padding: var(--bz-space-4) !important;
  }
  .wiz__head,
  .wiz__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .wiz__rail,
  .wiz-grid-2 {
    grid-template-columns: 1fr;
  }
  .roster-row {
    grid-template-columns: 1fr;
  }
  .wiz__step-count {
    margin-left: 0;
  }
}

:deep(.input), :deep(.textarea) {
  background: var(--bz-scrim) !important;
  border: 1px solid rgba(255, 255, 255, 0.22) !important;
  color: var(--bz-fg) !important;
}
:deep(.input::placeholder), :deep(.textarea::placeholder) {
  color: var(--bz-fg-low) !important;
}
:deep(.select select) {
  background: var(--bz-scrim) !important;
  border: 1px solid rgba(255, 255, 255, 0.22) !important;
  color: var(--bz-fg) !important;
}
:deep(.tag.is-light) {
  background: var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}
</style>
