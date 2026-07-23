<template>
  <div class="wiz-overlay" @click.self="confirmCancel">
    <div class="wiz models__activity--payouts">
      <!-- Header with brand-gradient title + close -->
      <div class="wiz__head">
        <div>
          <h1 class="fira-sans-condensed-black-italic wiz__title">
            <span class="wiz__title-text">Set up a team</span>
          </h1>
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

      <!-- ──── Step 1: Workflow pick ──── -->
      <div v-if="step === 0" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          Pick the first margin leak to remove.
        </h2>
        <p class="panel-lede">
          Choose a live operating scenario. BonzAI will shape the agent team around the work, the systems, and the people who touch the stay.
        </p>
        <div class="workflow-grid">
          <button
            v-for="workflow in workflows"
            :key="workflow.id"
            type="button"
            class="workflow-card"
            :class="{ 'is-selected': selectedWorkflowId === workflow.id }"
            @click="selectWorkflow(workflow.id)"
          >
            <span class="workflow-card__icon material-symbols-outlined">{{ workflow.icon }}</span>
            <span class="workflow-card__body">
              <strong class="workflow-card__title fira-sans-condensed-black-italic">{{ workflow.title }}</strong>
              <span class="workflow-card__pain">{{ workflow.pain }}</span>
              <span class="workflow-card__outcome">{{ workflow.outcome }}</span>
              <span v-if="workflow.stakeholders?.length" class="workflow-card__stakeholders">
                <span v-for="stakeholder in workflow.stakeholders" :key="stakeholder">{{ stakeholder }}</span>
              </span>
            </span>
          </button>
        </div>
        <div class="quick-value">
          <span class="material-symbols-outlined" aria-hidden="true">conversion_path</span>
          <div>
            <strong>{{ selectedWorkflow?.firstValue }}</strong>
            <p>{{ selectedWorkflow?.review }}</p>
          </div>
        </div>
      </div>

      <!-- ──── Step 2: Business basics + tools ──── -->
      <div v-else-if="step === 1" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          Setup in two minutes
        </h2>
        <div class="quick-setup-grid">
          <div class="wiz-field">
            <label class="wiz-field__label">Business name *</label>
            <input v-model.trim="answers.businessName" class="input is-medium" placeholder="Acme Studio" />
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Business type</label>
            <input v-model.trim="answers.businessType" class="input is-medium" placeholder="Agency, contractor, SaaS, consulting firm" />
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Who approves sensitive actions? *</label>
            <input v-model.trim="answers.approvalOwner" class="input is-medium" placeholder="Owner, CFO, operations manager" />
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Stakeholders involved</label>
            <input v-model.trim="answers.stakeholders" class="input is-medium" placeholder="Guest, owner, housekeeper, maintenance, finance" />
          </div>
          <div class="wiz-field">
            <label class="wiz-field__label">Current way of working</label>
            <textarea
              v-model.trim="answers.currentWorkflow"
              class="textarea"
              rows="3"
              :placeholder="selectedWorkflow?.workflowPlaceholder || 'Lead arrives, quote is approved, invoice is sent, payment is reconciled.'"
            ></textarea>
          </div>
        </div>

        <div class="connector-section">
          <div class="connector-section__head">
            <div>
              <h3 class="panel-subtitle fira-sans-condensed-black-italic">
                Existing tools
              </h3>
            </div>
          </div>
          <div class="conn-grid">
            <div
              v-for="conn in recommendedConnectors"
              :key="conn.kind"
              class="conn-tile"
              :class="{
                'is-required': selectedWorkflow?.connectors.includes(conn.kind),
                'is-selected': pickedConnectors.has(conn.kind),
              }"
              @click="toggleConnector(conn.kind)"
            >
              <div class="conn-tile__icon">
                <span class="material-symbols-outlined">{{ conn.icon }}</span>
              </div>
              <div class="conn-tile__name fira-sans-condensed-black-italic">{{ conn.name }}</div>
              <span v-if="selectedWorkflow?.connectors.includes(conn.kind)" class="conn-tile__req">suggested</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ──── Step 3: Review ──── -->
      <div v-else-if="step === 2" class="wiz-panel">
        <h2 class="panel-subtitle fira-sans-condensed-black-italic">
          Ready to open the work inbox
        </h2>
        <div class="review-grid">
          <section class="review-panel">
            <span class="review-panel__eyebrow">Workflow</span>
            <h3 class="review-panel__title fira-sans-condensed-black-italic">{{ selectedWorkflow?.title }}</h3>
          </section>
          <section class="review-panel">
            <span class="review-panel__eyebrow">Approval</span>
            <h3 class="review-panel__title fira-sans-condensed-black-italic">{{ answers.approvalOwner || 'Owner' }}</h3>
          </section>
          <section class="review-panel">
            <span class="review-panel__eyebrow">Stakeholders</span>
            <h3 class="review-panel__title fira-sans-condensed-black-italic">{{ answers.stakeholders || selectedWorkflow?.stakeholders?.join(', ') }}</h3>
          </section>
        </div>

        <div class="first-work-list">
          <div v-for="goal in initialGoals" :key="goal" class="first-work-item">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            <span>{{ goal }}</span>
          </div>
        </div>

        <div class="demo-row">
          <label class="wiz-toggle">
            <input type="checkbox" v-model="demoMode" />
            <span class="wiz-toggle__track"></span>
          </label>
          <div class="demo-row__copy">
            <div class="demo-row__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined mr-2">auto_awesome_motion</span>
              Show sample work immediately
            </div>
          </div>
        </div>
      </div>

      <hr />

      <!-- Action bar -->
      <div class="wiz__actions">
        <button
          v-if="step > 0"
          class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
          @click="step--"
        >
          <span class="material-symbols-outlined mr-1">arrow_back</span> Back
        </button>
        <span class="wiz__step-count muted">Step {{ step + 1 }} of {{ steps.length }}</span>
        <div class="wiz__actions-right">
          <button
            v-if="step < steps.length - 1"
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            :disabled="!canAdvance"
            @click="step++"
          >
            Next <span class="material-symbols-outlined ml-1">arrow_forward</span>
          </button>
          <button
            v-else
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            :class="{ 'bz-btn--running': busy }"
            :disabled="busy || !canForm"
            @click="formCompany"
          >
            <span class="material-symbols-outlined is-size-3 mr-2">workspaces</span>
            Open team
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { reactive, ref, computed } from "vue";
import companyStore from "../../stores/companyStore.js";
import { COMPANY_CONNECTOR_CATALOG } from "../../config/companyConnectors.js";
import BzCloseButton from "../BzCloseButton.vue";

/**
 * The intake wizard. Self-contained — opens, runs, returns
 * a charter id (or null if cancelled). Parent handles the cancel/done
 * routing via `done` + `cancel` events.
 */

const CONNECTOR_CATALOG = COMPANY_CONNECTOR_CATALOG;
const SUPPORTED_CONNECTORS = new Set(CONNECTOR_CATALOG.map((connector) => connector.kind));

const WORKFLOW_TEMPLATE_ID = "business_ops_team";

const WORKFLOW_PRESETS = [
  {
    id: "stay_turnover",
    icon: "cleaning_services",
    title: "Coordinate stay turnover",
    pain: "Check-out, cleaning, inspection, and check-in handoffs happen across messages and spreadsheets.",
    summary: "Turn each departure into a controlled readiness workflow before the next guest arrives.",
    outcome: "Next stay readiness tracked",
    firstValue: "BonzAI builds a readiness board for every upcoming stay, with late-risk alerts before they become guest problems.",
    review: "Turnover timeline, cleaning confirmation, damage notes, maintenance exceptions, and owner-visible readiness status.",
    stakeholders: ["Guest", "Housekeeper", "Maintenance", "Owner"],
    connectors: ["airbnb", "booking", "guesty", "hospitable", "google_calendar", "slack"],
    businessType: "short-term rental operator",
    currentWorkflow: "Guest checks out, cleaning is scheduled, damage or missing items are reported, maintenance exceptions are escalated, and the property is marked ready before the next check-in.",
    workflowPlaceholder: "Check-out -> cleaning -> inspection -> maintenance exception -> owner alert -> ready for next guest",
    goals: [
      "Build the next seven days of stay turnovers with risk flags",
      "Draft housekeeper instructions for every check-out and same-day arrival",
      "Flag maintenance, damage, and missing inventory exceptions for approval",
      "Prepare a daily owner-facing readiness report",
    ],
  },
  {
    id: "stay_guest_messaging",
    icon: "forum",
    title: "Run guest messaging",
    pain: "Guests ask the same questions while urgent requests get buried in the inbox.",
    summary: "Classify guest messages, draft replies, and escalate issues that affect ratings or refunds.",
    outcome: "Guest inbox under control",
    firstValue: "BonzAI separates routine guest questions from stay-risk issues and prepares the next response.",
    review: "Arrival instructions, late check-in replies, amenity questions, complaint triage, refund-risk escalations.",
    stakeholders: ["Guest", "Ops manager", "Owner", "Maintenance"],
    connectors: ["airbnb", "booking", "hospitable", "google_calendar", "slack"],
    businessType: "hospitality or short-term rental business",
    currentWorkflow: "Guest messages arrive from booking channels, routine questions are answered, urgent stay issues are escalated, and sensitive replies wait for owner approval.",
    workflowPlaceholder: "Guest message -> classify urgency -> draft reply -> escalate if risky -> send or approve",
    goals: [
      "Sort guest messages by urgency, reservation, and rating risk",
      "Draft replies for check-in, house rules, amenities, and local questions",
      "Escalate complaints, refund requests, and safety issues to the approval owner",
      "Prepare a guest experience summary for today's active stays",
    ],
  },
  {
    id: "stay_maintenance",
    icon: "home_repair_service",
    title: "Control maintenance exceptions",
    pain: "Small property issues turn into refunds, bad reviews, or blocked nights.",
    summary: "Detect maintenance risk, assign the right follow-up, and keep guests and owners updated.",
    outcome: "Exceptions routed before they cost revenue",
    firstValue: "BonzAI turns every defect into an owner-visible exception with guest impact, urgency, and next action.",
    review: "Issue intake, vendor follow-up, guest update drafts, blocked-night risk, and resolution evidence.",
    stakeholders: ["Guest", "Maintenance", "Vendor", "Owner"],
    connectors: ["airbnb", "booking", "guesty", "hospitable", "slack", "notion"],
    businessType: "property management business",
    currentWorkflow: "Guest or cleaner reports an issue, operations decides urgency, maintenance is contacted, the guest is updated, and the owner gets a resolution note.",
    workflowPlaceholder: "Issue reported -> classify impact -> assign vendor -> update guest -> record evidence -> owner summary",
    goals: [
      "Create an exception queue for open stay and property issues",
      "Classify each issue by guest impact, urgency, and revenue risk",
      "Draft maintenance/vendor instructions with evidence requested",
      "Prepare owner updates for unresolved or costly issues",
    ],
  },
  {
    id: "stay_owner_reporting",
    icon: "monitoring",
    title: "Prepare owner performance reports",
    pain: "Owners ask for performance, but the numbers live across channels, payouts, reviews, and expenses.",
    summary: "Produce a weekly property report with revenue, risks, reviews, and next actions.",
    outcome: "Owner report ready",
    firstValue: "BonzAI assembles the owner narrative: what earned money, what created risk, and what needs a decision.",
    review: "Revenue movement, occupancy, review risks, maintenance spend, upcoming stays, and recommended owner actions.",
    stakeholders: ["Owner", "Finance", "Ops manager", "Guest"],
    connectors: ["airbnb", "booking", "guesty", "quickbooks", "stripe", "notion"],
    businessType: "short-term rental portfolio",
    currentWorkflow: "Reservation revenue, payouts, occupancy, reviews, maintenance expenses, and upcoming risks are collected into an owner report.",
    workflowPlaceholder: "Collect revenue -> match payouts -> summarize reviews -> list expenses -> recommend owner actions",
    goals: [
      "Prepare a weekly owner report for each managed property",
      "Compare reservations, payouts, fees, and maintenance expenses",
      "Summarize review themes and guest experience risks",
      "List decisions the owner needs to make this week",
    ],
  },
  {
    id: "invoice",
    icon: "receipt_long",
    title: "Create and send invoices",
    pain: "Invoices go out late or with missing details.",
    summary: "Draft invoices from approved work, check missing details, and queue them for approval.",
    outcome: "Draft invoices ready to review",
    firstValue: "BonzAI prepares invoice drafts, lists missing PO or billing details, and creates payment-link tasks.",
    review: "Invoice drafts, missing-detail checks, approval queue, and payment links.",
    connectors: ["quickbooks", "stripe", "docusign", "sendgrid"],
    stakeholders: ["Owner", "Finance", "Customer"],
    businessType: "service business",
    currentWorkflow: "Approved work is checked against the quote, invoice lines are prepared, the owner reviews, then the invoice is sent and tracked.",
    workflowPlaceholder: "Approved job -> check quote -> draft invoice -> owner approves -> send invoice -> track payment",
    goals: [
      "Find approved work that is ready to invoice",
      "Prepare draft invoices and flag missing billing details",
      "Create payment-link tasks for approved invoices",
      "Queue invoice emails for owner approval",
    ],
  },
  {
    id: "collections",
    icon: "payments",
    title: "Chase unpaid invoices",
    pain: "Cash is stuck in awkward follow-ups.",
    summary: "Find overdue invoices, draft polite follow-ups, and prepare the next action.",
    outcome: "Follow-ups ready to send",
    firstValue: "BonzAI identifies overdue invoices, sorts them by risk, and drafts customer-specific reminders.",
    review: "A/R aging review, payment follow-up drafts, escalation notes, and reconciliation exceptions.",
    connectors: ["quickbooks", "stripe", "sendgrid", "hubspot"],
    stakeholders: ["Owner", "Finance", "Customer"],
    businessType: "service business",
    currentWorkflow: "Open invoices are reviewed weekly, overdue customers receive a polite reminder, and disputes or partial payments are escalated to the owner.",
    workflowPlaceholder: "Review A/R -> find overdue invoices -> draft reminder -> owner approves -> send -> reconcile response",
    goals: [
      "Identify overdue invoices and sort them by amount and age",
      "Draft follow-up emails for customers who need a payment reminder",
      "Flag disputes, partial payments, and missing payment links",
      "Prepare an owner approval queue for customer-facing reminders",
    ],
  },
  {
    id: "leads",
    icon: "person_search",
    title: "Follow up with leads",
    pain: "Warm leads go quiet because the next touch slips.",
    summary: "Build a daily follow-up queue from CRM, inbox, and calendar context.",
    outcome: "Lead follow-up queue ready",
    firstValue: "BonzAI finds stale opportunities, drafts next-touch emails, and suggests meetings to book.",
    review: "Prioritized leads, next best action, draft outreach, and CRM update tasks.",
    connectors: ["hubspot", "sendgrid", "google_calendar", "slack"],
    stakeholders: ["Owner", "Sales", "Prospect"],
    businessType: "sales-led business",
    currentWorkflow: "New leads are qualified, added to the CRM, followed up by email, then booked for a call or marked as not ready.",
    workflowPlaceholder: "Lead arrives -> qualify -> CRM update -> follow-up email -> book meeting -> update deal stage",
    goals: [
      "Build today's business development follow-up queue",
      "Draft personalized next-touch emails for stale opportunities",
      "Identify leads that need a meeting, quote, or owner reply",
      "Prepare CRM update tasks for each lead",
    ],
  },
  {
    id: "payments",
    icon: "sync_alt",
    title: "Reconcile payments",
    pain: "Payments, fees, refunds, and invoices do not line up cleanly.",
    summary: "Match received payments to invoices and surface exceptions for humans.",
    outcome: "Exceptions ready to resolve",
    firstValue: "BonzAI compares payments with open invoices and produces an exception list.",
    review: "Payment match list, unmatched deposits, partial payments, failed charges, and close checklist.",
    connectors: ["quickbooks", "stripe", "notion", "slack"],
    stakeholders: ["Owner", "Bookkeeper", "Finance"],
    businessType: "service business",
    currentWorkflow: "Payments are matched against invoices, exceptions are reviewed by the owner or bookkeeper, and the books are updated after approval.",
    workflowPlaceholder: "Import payments -> match invoices -> flag exceptions -> owner approves -> update books",
    goals: [
      "Match recent Stripe payments against open QuickBooks invoices",
      "List unmatched payments, failed charges, and partial payments",
      "Prepare reconciliation notes for the approval owner",
      "Draft a week-end payment reconciliation summary",
    ],
  },
  {
    id: "report",
    icon: "analytics",
    title: "Prepare weekly business report",
    pain: "The owner has to open five tools to understand the week.",
    summary: "Turn sales, invoices, payments, and customer activity into a weekly operating brief.",
    outcome: "Weekly report draft ready",
    firstValue: "BonzAI prepares a short report with wins, risks, unpaid invoices, and next actions.",
    review: "Weekly operating report, A/R summary, pipeline movement, and action list.",
    connectors: ["quickbooks", "stripe", "hubspot", "notion", "slack"],
    stakeholders: ["Owner", "Ops", "Finance", "Sales"],
    businessType: "small business",
    currentWorkflow: "Each week the owner reviews sales, invoices, payments, lead activity, customer issues, and the next priorities.",
    workflowPlaceholder: "Collect numbers -> summarize wins and risks -> list open actions -> share with the team",
    goals: [
      "Prepare this week's revenue, invoice, and payment summary",
      "Summarize pipeline movement and customer follow-up risks",
      "List the most important next actions for the owner",
      "Draft a team-ready weekly business report",
    ],
  },
];

export default {
  name: "CompanyIntakeWizard",
  components: { BzCloseButton },
  emits: ["done", "cancel"],
  setup(_props, { emit }) {
    const store = companyStore;
    const selectedWorkflowId = ref(WORKFLOW_PRESETS[0].id);
    const answers = reactive({});
    const treasury = reactive({ currency: "USD", reserveFloor: 10000, perHeartbeatSpendCap: 100 });
    const pickedConnectors = ref(new Set());
    const initialGoals = ref([]);
    const companyName = ref("");
    const step = ref(0);
    const busy = ref(false);
    const demoMode = ref(true);

    const steps = [
      { id: "workflow", label: "Workflow", icon: "task_alt" },
      { id: "setup", label: "Setup", icon: "rule" },
      { id: "review", label: "Review", icon: "preview" },
    ];

    const workflows = WORKFLOW_PRESETS;
    const selectedWorkflow = computed(() =>
      workflows.find((workflow) => workflow.id === selectedWorkflowId.value) || workflows[0],
    );

    const defaultName = computed(() => {
      const name = answers.businessName?.trim();
      return name ? `${name} Team` : "New Team";
    });

    function connectorLabel(kind) {
      return String(kind || "")
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    function seedWorkflow(workflow) {
      const connectors = workflow.connectors.filter((kind) => SUPPORTED_CONNECTORS.has(kind));
      answers.businessName = answers.businessName || "";
      answers.businessType = workflow.businessType || "small business";
      answers.currentWorkflow = workflow.currentWorkflow || "";
      answers.systemsOfRecord = connectors.map(connectorLabel).join(", ");
      answers.approvalOwner = answers.approvalOwner || "Owner";
      answers.stakeholders = (workflow.stakeholders || []).join(", ");
      answers.invoiceCadence = workflow.id === "invoice" ? "Milestone-based and monthly" : "Weekly";
      answers.operatingRule = "Draft first. Ask before sending, charging, reconciling, or changing customer records.";
      initialGoals.value = [...workflow.goals];
      pickedConnectors.value = new Set(connectors);
    }

    function selectWorkflow(id) {
      selectedWorkflowId.value = id;
      seedWorkflow(selectedWorkflow.value);
    }

    const recommendedConnectors = computed(() => {
      const recommended = new Set(selectedWorkflow.value?.connectors || []);
      const useful = new Set([
        ...recommended,
        "quickbooks",
        "sage_accounting",
        "stripe",
        "hubspot",
        "sendgrid",
        "google_calendar",
        "notion",
        "slack",
        "shopify",
        "twilio",
      ]);
      return [...CONNECTOR_CATALOG]
        .filter((conn) => useful.has(conn.kind))
        .sort((a, b) => {
          const ar = recommended.has(a.kind) ? 0 : 1;
          const br = recommended.has(b.kind) ? 0 : 1;
          if (ar !== br) return ar - br;
          return a.name.localeCompare(b.name);
        });
    });

    function toggleConnector(kind) {
      const next = new Set(pickedConnectors.value);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      pickedConnectors.value = next;
      answers.systemsOfRecord = [...next].map(connectorLabel).join(", ");
    }

    seedWorkflow(selectedWorkflow.value);

    const composedAnswers = computed(() => ({
      businessName: answers.businessName || "My Business",
      businessType: answers.businessType || selectedWorkflow.value.businessType || "small business",
      currentWorkflow: answers.currentWorkflow || selectedWorkflow.value.currentWorkflow,
      systemsOfRecord: answers.systemsOfRecord || [...pickedConnectors.value].map(connectorLabel).join(", "),
      approvalOwner: answers.approvalOwner || "Owner",
      stakeholders: answers.stakeholders || (selectedWorkflow.value.stakeholders || []).join(", "),
      invoiceCadence: answers.invoiceCadence || "Weekly",
      operatingRule: answers.operatingRule || "Draft first. Ask before sensitive actions.",
    }));

    // ─── nav guards ───
    const canAdvance = computed(() => {
      if (step.value === 0) return !!selectedWorkflow.value;
      if (step.value === 1) {
        return Boolean(answers.businessName?.trim() && answers.approvalOwner?.trim());
      }
      return true;
    });
    const canForm = computed(() => !!selectedWorkflow.value && Boolean(answers.businessName?.trim()));

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
        const c = await store.formFromTemplate(WORKFLOW_TEMPLATE_ID, composedAnswers.value, {
          name: companyName.value || defaultName.value,
          treasury: { ...treasury },
          mode: "solo",
          includeOptionalHumans: false,
          demoMode: demoMode.value,
        });
        // Best-effort: queue placeholder connectors so dashboard prompts the user.
        for (const kind of pickedConnectors.value) {
          try {
            await store.createConnector({
              kind,
              authType: "apiKey",
              label: connectorLabel(kind),
            });
          } catch {}
        }
        // Best-effort: seed initial goals as user-created goal records.
        for (const title of initialGoals.value) {
          if (!title?.trim()) continue;
          try {
            await store.createGoal({
              title: title.trim(),
              rationale: `Imported from ${selectedWorkflow.value.title} setup.`,
            });
          } catch {}
        }
        emit("done", c.id);
      } catch (err) {
        alert("Failed to set up team: " + (err.message || err));
        busy.value = false;
      }
    }

    return {
      step, steps, busy, answers, treasury, initialGoals, companyName,
      demoMode,
      workflows, selectedWorkflowId, selectedWorkflow, selectWorkflow, recommendedConnectors,
      defaultName, pickedConnectors, toggleConnector,
      canAdvance, canForm, goTo, confirmCancel, formCompany,
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
  background: var(--bz-border);
}
.muted { color: var(--bz-fg-mid); font-size: 0.92em; }
.icon-only-btn { width: 40px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.panel-subtitle {
  font-size: 1.35rem;
  color: var(--bz-fg);
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.5em;
}
.panel-lede {
  max-width: 720px;
  color: var(--bz-fg-mid);
  line-height: 1.45;
  margin: 0 0 var(--bz-space-4);
}
.panel-subtitle .material-symbols-outlined { font-size: 22px; color: var(--bz-purple-300); }

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
  width: 100%; max-width: 980px;
  max-height: calc(100vh - 4em); overflow-y: auto;
  padding: var(--bz-space-6) !important;
  background: var(--bz-panel) !important;
  border: 1px solid var(--bz-border) !important;
  border-radius: var(--bz-r) !important;
}

.wiz__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1em;
  margin-bottom: 0.5em;
}
.wiz__title {
  font-size: 2.25rem;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  transition: border-color var(--bz-dur-fast) var(--bz-ease-stand), background var(--bz-dur-fast) var(--bz-ease-stand), color var(--bz-dur-fast) var(--bz-ease-stand);
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

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
}
.workflow-card {
  appearance: none;
  width: 100%;
  min-height: 176px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  color: var(--bz-fg);
  text-align: left;
  padding: var(--bz-space-4);
  display: flex;
  gap: var(--bz-space-3);
  cursor: pointer;
  transition: border-color var(--bz-dur-fast) var(--bz-ease-stand), background var(--bz-dur-fast) var(--bz-ease-stand);
}
.workflow-card:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
}
.workflow-card.is-selected {
  border-color: var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.workflow-card__icon {
  flex: 0 0 auto;
  color: var(--bz-purple-300);
  font-size: 28px;
}
.workflow-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.workflow-card__title {
  font-size: 1.1rem;
  line-height: 1.1;
}
.workflow-card__pain {
  color: var(--bz-fg);
  font-size: 0.95rem;
  line-height: 1.25;
}
.workflow-card__summary,
.workflow-card__outcome {
  color: var(--bz-fg-mid);
  font-size: 0.88rem;
  line-height: 1.35;
}
.workflow-card__outcome {
  color: var(--bz-purple-100);
  margin-top: auto;
}
.workflow-card__stakeholders {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: var(--bz-space-2);
}
.workflow-card__stakeholders span {
  padding: 0.18rem 0.45rem;
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  color: var(--bz-fg-mid);
  background: color-mix(in srgb, var(--bz-raised) 72%, transparent);
  font-size: 0.72rem;
  line-height: 1.1;
}
.quick-value {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-emerald-soft);
}
.quick-value .material-symbols-outlined {
  color: var(--bz-emerald-500);
  font-size: 22px;
}
.quick-value strong {
  display: block;
  color: var(--bz-fg);
  margin-bottom: 0.2rem;
  font-size: 1rem;
}
.quick-value p {
  margin: 0;
  color: var(--bz-fg-mid);
  line-height: 1.4;
}

.quick-setup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--bz-space-4);
  margin-top: var(--bz-space-4);
}
.quick-setup-grid .wiz-field:last-child {
  grid-column: 1 / -1;
}
.connector-section {
  margin-top: var(--bz-space-5);
}
.connector-section__head {
  margin-bottom: var(--bz-space-2);
}
.review-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-4);
}
.review-panel {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  padding: var(--bz-space-4);
}
.review-panel__eyebrow {
  display: block;
  color: var(--bz-fg-low);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}
.review-panel__title {
  color: var(--bz-fg);
  font-size: 1.15rem;
  margin-bottom: 0.35rem;
}
.review-panel p {
  margin: 0;
  color: var(--bz-fg-mid);
  line-height: 1.4;
}
.first-work-list {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  margin: var(--bz-space-4) 0;
}
.first-work-item {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: color-mix(in srgb, var(--bz-card) 82%, transparent);
  color: var(--bz-fg-mid);
}
.first-work-item .material-symbols-outlined {
  color: var(--bz-emerald-500);
  font-size: 18px;
}

/* ───────── Step 2: context fields ───────── */
.wiz-fields { display: flex; flex-direction: column; gap: 1em; margin-top: 1em; }
.wiz-field { display: flex; flex-direction: column; gap: 0.4em; }
.wiz-field__label {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bz-fg-low);
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
  background: var(--bz-fg);
  border-radius: 50%;
  transition: transform 0.2s;
}
.wiz-toggle input:checked + .wiz-toggle__track {
  background: var(--bz-gradient-brand);
}
.wiz-toggle input:checked + .wiz-toggle__track::after { transform: translateX(18px); }

.wiz-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  margin-top: 1em;
  padding: 1em 1.2em;
  background: rgba(155, 109, 200, 0.16);
  border: 1px solid var(--bz-border-brand);
  border-radius: 4px;
  font-size: 0.92em;
  line-height: 1.5;
}
.wiz-hint .material-symbols-outlined { color: var(--bz-purple-300); font-size: 22px; }
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
  transition: border-color var(--bz-dur-fast) var(--bz-ease-stand), background var(--bz-dur-fast) var(--bz-ease-stand);
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
  background: var(--bz-purple-soft);
  color: var(--bz-purple-100);
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
  color: var(--bz-fg-mid);
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
  .wiz-grid-2,
  .quick-setup-grid,
  .review-grid {
    grid-template-columns: 1fr;
  }
  .wiz__step-count {
    margin-left: 0;
  }
}

:deep(.input), :deep(.textarea) {
  background: var(--bz-scrim) !important;
  border: 1px solid var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}
:deep(.input::placeholder), :deep(.textarea::placeholder) {
  color: var(--bz-fg-low) !important;
}
:deep(.select select) {
  background: var(--bz-scrim) !important;
  border: 1px solid var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}
:deep(.tag.is-light) {
  background: var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}
</style>
