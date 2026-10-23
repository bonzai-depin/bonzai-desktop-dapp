<template>
  <div class="wiz-overlay company-screen" @click.self="confirmCancel">
    <div ref="dialogRef" class="wiz" :class="{ 'wiz--catalog': step === 0 }" role="dialog" aria-modal="true" aria-labelledby="company-intake-title" tabindex="-1">
      <header class="wiz__head">
        <div><p class="wiz__eyebrow">{{ $ui('Smart Workflows') }}</p><h1 id="company-intake-title" class="wiz__title">{{ $ui('Create a smart workflow') }}</h1></div>
        <nav class="wiz__rail" :aria-label="$ui('Team setup')">
          <button v-for="(item, index) in steps" :key="item.id" class="wiz-step" :class="{ 'is-active': step === index, 'is-done': step > index }" :aria-current="step === index ? 'step' : undefined" :disabled="step <= index || busy" @click="goTo(index)">
            <span class="wiz-step__number"><span v-if="step > index" class="material-symbols-outlined" aria-hidden="true">check</span><span v-else>{{ index + 1 }}</span></span><span>{{ $ui(item.label) }}</span>
          </button>
        </nav>
        <BzCloseButton size="md" :aria-label="$ui('Close')" @click="confirmCancel" />
      </header>
      <div ref="contentRef" class="wiz__content" tabindex="0" :aria-label="$ui('Team setup')">
        <div v-if="step === 0" class="wiz-panel catalog-panel">
          <div class="catalog-heading"><div><h2>{{ $ui('What do you want to accomplish?') }}</h2><p>{{ $ui('Explore what each workflow needs and what it creates, before you start.') }}</p></div>
            <label class="template-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="templateQuery" :placeholder="$ui('Search templates')" :aria-label="$ui('Search templates')" /><button v-if="templateQuery" class="bz-iconbtn" :aria-label="$ui('Clear search')" @click="templateQuery = ''"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></label>
          </div>
          <div class="template-layout">
            <nav class="template-categories" :aria-label="$ui('Template categories')">
              <button v-for="category in templateGroups" :key="category.id" type="button" :aria-pressed="templateCategory === category.id" @click="templateCategory = category.id">
                <span class="material-symbols-outlined" aria-hidden="true">{{ category.icon || 'apps' }}</span><span>{{ locale === 'fr' && category.frLabel ? category.frLabel : $ui(category.label) }}</span><small>{{ categoryCounts[category.id] || 0 }}</small>
              </button>
            </nav>
            <div class="template-results">
              <p v-if="catalogLoading" class="catalog-loading" role="status">{{ $ui('Loading available workflows…') }}</p>
              <section v-for="group in groupedWorkflows" :key="group.id" class="template-group">
                <header><h3>{{ locale === 'fr' && group.frLabel ? group.frLabel : $ui(group.label) }}</h3><span>{{ group.workflows.length }}</span></header>
                <div class="workflow-grid">
                  <button v-for="workflow in group.workflows" :key="workflow.id" type="button" class="workflow-card" :class="{ 'is-selected': selectedWorkflowId === workflow.id }" :aria-pressed="selectedWorkflowId === workflow.id" @click="selectWorkflow(workflow.id)">
                    <span class="workflow-card__icon material-symbols-outlined" aria-hidden="true">{{ workflow.icon || group.icon || 'workspaces' }}</span>
                    <span class="workflow-card__copy">
                      <strong>{{ $ui(workflow.catalogTitle) }}</strong><span class="workflow-card__description">{{ $ui(workflow.catalogDescription) }}</span>
                      <span v-if="workflow.catalogOutcome" class="workflow-card__outcome">{{ $ui(workflow.catalogOutcome) }}</span>
                    </span>
                    <span class="workflow-card__check material-symbols-outlined" aria-hidden="true">{{ selectedWorkflowId === workflow.id ? 'check_circle' : 'arrow_outward' }}</span>
                  </button>
                </div>
              </section>
              <div v-if="!visibleWorkflows.length && !catalogLoading" class="template-empty" role="status"><span class="material-symbols-outlined" aria-hidden="true">search_off</span><h3>{{ $ui('No templates match your search.') }}</h3><button type="button" class="bz-btn bz-btn--ghost" @click="templateQuery = ''; templateCategory = 'all'">{{ $ui('Clear filters') }}</button></div>
            </div>
            <aside class="template-selection" :aria-label="$ui('Selected template')">
              <template v-if="selectedCatalogTemplate">
                <span class="template-selection__icon material-symbols-outlined" aria-hidden="true">{{ selectedCatalogTemplate.icon || 'workspaces' }}</span>
                <p class="wiz__eyebrow">{{ $ui('Selected workflow') }}</p><h3>{{ $ui(selectedCatalogTemplate.catalogTitle) }}</h3><p>{{ $ui(selectedCatalogTemplate.catalogOutcome || selectedCatalogTemplate.catalogDescription) }}</p>
                <h4>{{ $ui('What you get') }}</h4><ul class="template-outcomes"><li v-for="outcome in previewOutcomes" :key="outcome"><span class="material-symbols-outlined" aria-hidden="true">check</span><span>{{ $ui(outcome) }}</span></li></ul>
                <template v-if="selectedWorkflow.firstValue"><h4>{{ $ui('What you provide') }}</h4><p>{{ $ui(selectedWorkflow.firstValue) }}</p></template><h4>{{ $ui('Who does the work') }}</h4><div class="role-preview"><span v-for="role in workspacePreview.recommendedRoles" :key="role">{{ $ui(roleLabel(role)) }}</span></div>
                <template v-if="selectedWorkflow.connectors.length"><h4>{{ $ui('Suggested tools') }}</h4><p>{{ selectedWorkflow.connectors.filter(kind => supportedConnectors.has(kind)).map(connectorLabel).join(' · ') }}</p></template>
                <p class="template-selection__review"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span>{{ $ui('You stay in control of sensitive actions.') }}</p>
              </template>
              <template v-else><span class="template-selection__icon material-symbols-outlined" aria-hidden="true">groups</span><h3>{{ $ui('Start with the result you want') }}</h3><p>{{ $ui('Choose a workflow to see its inputs, saved results and the agents behind it.') }}</p><ol class="selection-path"><li>{{ $ui('Choose the work') }}</li><li>{{ $ui('Add your context') }}</li><li>{{ $ui('Review your team') }}</li></ol></template>
            </aside>
          </div>
        </div>
        <div v-else-if="step === 1" class="wiz-panel setup-panel">
          <div class="setup-intro"><span class="template-selection__icon material-symbols-outlined" aria-hidden="true">{{ selectedCatalogTemplate?.icon || 'workspaces' }}</span><p class="wiz__eyebrow">{{ $ui(selectedCatalogTemplate?.catalogTitle) }}</p><h2>{{ $ui('Make it yours') }}</h2><p>{{ $ui(isPersonalWorkflow ? 'Keep a name and any preferences for future runs. Choose the inputs for each new task after opening the workflow.' : 'Add the context your agents should remember. You can connect tools and import records after setup.') }}</p><ul class="template-outcomes"><li v-for="outcome in previewOutcomes" :key="outcome"><span class="material-symbols-outlined" aria-hidden="true">check</span><span>{{ $ui(outcome) }}</span></li></ul></div>
          <div class="setup-fields">
            <div class="quick-setup-grid">
              <div class="wiz-field"><label for="company-business-name">{{ $ui(contextNameLabel) }}</label><input id="company-business-name" v-model.trim="answers.businessName" class="input" :placeholder="isPersonalWorkflow ? $ui(selectedCatalogTemplate?.catalogTitle) : $ui('Business name')" :required="!isPersonalWorkflow" maxlength="120" /></div>
              <div v-if="!selectedWorkflow?.executionWorkflowId" class="wiz-field"><label for="company-business-type">{{ $ui('Business activity (optional)') }}</label><input id="company-business-type" v-model.trim="answers.businessType" class="input" :placeholder="$ui('For example: HVAC installation and maintenance')" /></div>
              <div class="wiz-field wiz-field--wide"><label for="company-workflow">{{ $ui(selectedWorkflow?.executionWorkflowId ? 'Standing instructions (optional)' : 'How do you handle this work today? (optional)') }}</label><textarea id="company-workflow" v-model.trim="answers.currentWorkflow" class="textarea" rows="5" :placeholder="$ui(selectedWorkflow?.executionWorkflowId ? 'Audience, tone, source material and what a good result looks like.' : 'For example: our assistant collects documents by email and tracks applications in a spreadsheet.')"></textarea></div>
              <div v-for="question in paperasseQuestions" :key="question.id" class="wiz-field"><label :for="`paperasse-${question.id}`">{{ $ui(question.label) }} *</label><input :id="`paperasse-${question.id}`" v-model.trim="answers[question.id]" class="input" required /></div>
            </div>
            <section v-if="!selectedWorkflow?.executionWorkflowId" class="connector-section"><h3>{{ $ui('Existing tools (optional)') }}</h3><div class="conn-grid"><button v-for="conn in recommendedConnectors" :key="conn.kind" class="conn-tile" :aria-pressed="pickedConnectors.has(conn.kind)" @click="toggleConnector(conn.kind)"><span class="material-symbols-outlined" aria-hidden="true">{{ conn.icon }}</span><span>{{ conn.name }}</span><span v-if="pickedConnectors.has(conn.kind)" class="material-symbols-outlined" aria-hidden="true">check</span></button></div></section>
            <p class="setup-note"><span class="material-symbols-outlined" aria-hidden="true">shield</span>{{ $ui(isPersonalWorkflow ? 'Your inputs and saved results stay on this device by default. Sharing and publishing remain separate actions.' : 'You approve sensitive actions on this device. AI team members are shown in the next step.') }}</p>
          </div>
        </div>
        <div v-else class="wiz-panel review-layout">
          <section class="review-intro"><span class="wiz__eyebrow">{{ $ui('Ready to start') }}</span><h2>{{ defaultName }}</h2><p>{{ $ui(selectedCatalogTemplate?.catalogDescription) }}</p><div v-if="!isPersonalWorkflow" class="wiz-field"><label for="team-display-name">{{ $ui('Workspace name') }}</label><input id="team-display-name" v-model.trim="companyName" class="input" :placeholder="defaultName" /></div><h3>{{ $ui('What you get') }}</h3><ul class="template-outcomes"><li v-for="outcome in previewOutcomes" :key="outcome"><span class="material-symbols-outlined" aria-hidden="true">check</span><span>{{ $ui(outcome) }}</span></li></ul></section>
          <section class="review-details">
            <div v-if="isPersonalWorkflow" class="review-detail"><span class="material-symbols-outlined" aria-hidden="true">play_circle</span><div><h3>{{ $ui('Your first task') }}</h3><p>{{ $ui(selectedWorkflow.firstValue) }}</p></div></div><div class="review-detail"><span class="material-symbols-outlined" aria-hidden="true">groups</span><div><h3>{{ $ui('Your team') }}</h3><div class="role-preview"><span v-for="role in workspacePreview.recommendedRoles" :key="role">{{ $ui(roleLabel(role)) }}</span></div></div></div>
            <div class="review-detail"><span class="material-symbols-outlined" aria-hidden="true">view_sidebar</span><div><h3>{{ $ui('Your workspace') }}</h3><div class="workspace-preview__channels"><span v-for="channel in previewViews" :key="channel.key"><span class="material-symbols-outlined" aria-hidden="true">{{ channel.icon }}</span>{{ $ui(channel.label) }}</span></div></div></div>
            <div class="review-detail"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span><div><h3>{{ $ui(isPersonalWorkflow ? 'Review your result' : 'You approve sensitive actions') }}</h3><p>{{ $ui(isPersonalWorkflow ? selectedWorkflow.review : 'Review external actions and inspect saved results from your workspace.') }}</p></div></div>
            <div v-if="initialGoals.length" class="review-detail"><span class="material-symbols-outlined" aria-hidden="true">checklist</span><div><h3>{{ $ui('First tasks') }}</h3><ul class="first-work-list"><li v-for="goal in initialGoals" :key="goal">{{ $ui(goal) }}</li></ul></div></div>
            <label v-if="!selectedWorkflow?.executionWorkflowId" class="demo-row"><input type="checkbox" role="switch" v-model="demoMode" /><span>{{ $ui('Show sample work immediately') }}</span></label>
          </section>
        </div>
      </div>
      <p v-if="errorMessage" class="wiz-error" role="alert">{{ errorMessage }} <button v-if="step === 0" class="bz-btn bz-btn--ghost bz-btn--sm" @click="loadWorkflowCatalog">{{ $ui('Retry') }}</button></p>
      <footer class="wiz__actions"><button v-if="step > 0" class="bz-btn bz-btn--ghost" :disabled="busy" @click="step--"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>{{ $ui('Back') }}</button><span class="wiz__selection-label">{{ selectedCatalogTemplate ? $ui(selectedCatalogTemplate.catalogTitle) : $ui('Select a template to continue') }}</span><div class="wiz__actions-right"><button v-if="step < steps.length - 1" class="bz-btn bz-btn--primary" :disabled="!canAdvance" @click="step++">{{ $ui('Next') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button><button v-else class="bz-btn bz-btn--primary" :class="{ 'bz-btn--running': busy }" :disabled="busy || !canForm" @click="formCompany">{{ $ui(busy ? 'Creating workflow…' : 'Open workspace') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></div></footer>
    </div>
  </div>
</template>

<script>
import { getAvailableAgentWorkflows } from "../../services/agentWorkflows.js";
import { workflowTeamPresets } from "../../services/company/workflowTeams.js";
import { WORKFLOW_PRESETS, WORKFLOW_PROFILES } from "../../services/company/workspacePresets.js";
import "./company-design.css";
import {teamGettingStarted} from '../../services/company/gettingStarted.js';
import { TEMPLATE_GROUPS, filterTemplates, templatePresentation } from "../../services/company/templateCatalog.js";
import {operationText} from "../../i18n/operations.js";
import { PAPERASSE_TEMPLATES } from "../../services/company/paperasseTeams.js";
import { reactive, ref, computed, onMounted, watch, nextTick } from "vue";
import { useModalAccessibility } from "../../composables/useModalAccessibility.js";
import { useI18n } from "../../i18n/index.js";
import companyStore from "../../stores/companyStore.js";
import { COMPANY_CONNECTOR_CATALOG } from "../../config/companyConnectors.js";
import BzCloseButton from "../BzCloseButton.vue";
import { workspaceNavigation } from "../../services/company/workspaceNavigation.js";
import { buildWorkspaceBlueprint } from "../../services/company/workspaceBlueprints.js";
import { formatRoleTitle } from "../../services/company/presentation.js";

/**
 * The intake wizard. Self-contained — opens, runs, returns
 * a charter id (or null if cancelled). Parent handles the cancel/done
 * routing via `done` + `cancel` events.
 */

const CONNECTOR_CATALOG = COMPANY_CONNECTOR_CATALOG;
const SUPPORTED_CONNECTORS = new Set(CONNECTOR_CATALOG.map((connector) => connector.kind));

const WORKFLOW_TEMPLATE_ID = "business_ops_team";

export default {
  name: "CompanyIntakeWizard",
  components: { BzCloseButton },
  props: { initialWorkflowId: { type: String, default: "" }, initialTemplateId: { type: String, default: "" } },
  emits: ["done", "cancel"],
  setup(_props, { emit }) {
    const store = companyStore;
    const { t, locale } = useI18n();
    const dialogRef = ref(null);
    const contentRef = ref(null);
    const catalogLoading = ref(false);
    const selectedWorkflowId = ref(null);
    const creationPresets = ref([]);
    async function loadWorkflowCatalog() {
      catalogLoading.value = true;
      errorMessage.value = '';
      try {
        creationPresets.value = workflowTeamPresets(await getAvailableAgentWorkflows());
        const requested = _props.initialTemplateId || _props.initialWorkflowId;
        if (requested && !selectedWorkflowId.value && workflows.value.some(item => item.id === requested)) { selectWorkflow(requested); step.value = 1; }
      } catch (error) { errorMessage.value = error.message || 'Unable to load team templates.'; }
      finally { catalogLoading.value = false; }
    }
    onMounted(loadWorkflowCatalog);
    const templateQuery = ref('');
    const templateCategory = ref('all');
    const templateGroups = TEMPLATE_GROUPS;
    const errorMessage = ref("");
    useModalAccessibility(dialogRef, { onClose: confirmCancel });
    const answers = reactive({});
    const treasury = reactive({ currency: "USD", reserveFloor: 10000, perHeartbeatSpendCap: 100 });
    const pickedConnectors = ref(new Set());
    const initialGoals = ref([]);
    const companyName = ref("");
    const step = ref(0);
    watch(step, async () => { await nextTick(); contentRef.value?.scrollTo({ top: 0 }); });
    const busy = ref(false);
    const demoMode = ref(true);

    const steps = computed(() => [
      { id: "purpose", label: "Workflow", icon: "task_alt" },
      { id: "context", label: isPersonalWorkflow.value ? "Preferences" : "Context", icon: "tune" },
      { id: "workspace", label: "Review", icon: "view_sidebar" },
    ]);

    const paperasseQuestions = computed(() => (PAPERASSE_TEMPLATES[selectedWorkflowId.value]?.intakeQuestions || []).filter(q => q.id !== "businessName"));
    const workflows = computed(() => [
      ...creationPresets.value,
      ...WORKFLOW_PRESETS.filter((workflow) => ["hvac_gmao", "purchasing_team", "sales_team"].includes(workflow.id)),
      WORKFLOW_PRESETS.find((workflow) => workflow.id === "report"),
      ...WORKFLOW_PRESETS.filter((workflow) => ["invoice", "collections", "payments", "leads", "stay_turnover"].includes(workflow.id)),
      ...WORKFLOW_PRESETS.filter((workflow) => !["hvac_gmao", "purchasing_team", "sales_team", "report", "invoice", "collections", "payments", "leads", "stay_turnover"].includes(workflow.id)),
    ].filter(Boolean).map((workflow) => workflow.id === "hvac_gmao" && locale.value !== "fr" ? {
      ...workflow,
      title: "HVAC maintenance",
      pain: "Sites, maintenance visits, emergencies, evidence, and contract deadlines are scattered.",
      summary: "Centralize sites and equipment, schedule preventive work, and track each work order to completion.",
      outcome: "Maintenance contracts under control",
      firstValue: "BonzAI prepares ST1/ST2/ST3 maintenance, P0–P3 service levels, and the weekly register.",
      review: "Equipment, scheduling, work orders, on-call coverage, compliance, quotes, and penalties.",
      stakeholders: ["Contract manager", "Planner", "Safety and quality", "Technician", "Billing"],
      businessType: "multi-site HVAC maintenance business",
      currentWorkflow: "Inventory equipment, schedule preventive visits, triage requests, assign technicians, verify restoration, collect evidence, and approve completed work.",
      workflowPlaceholder: "Request -> priority/service level -> assignment -> visit -> evidence -> approval -> billing",
      goals: ["Verify the initial ST1/ST2/ST3 equipment inventory", "Plan preventive visits and work orders", "Monitor P0–P3 service levels and penalty risks", "Review safety documents, subcontractors, and qualifications", "Prepare the weekly register and billing evidence"],
    } : workflow));
    watch(() => _props.initialTemplateId || _props.initialWorkflowId, id => { if (id && workflows.value.some(item => item.id === id)) { selectWorkflow(id); step.value = 1; } });
    const selectedWorkflow = computed(() =>
      workflows.value.find((workflow) => workflow.id === selectedWorkflowId.value) || null,
    );

    const categoryCounts = computed(() => {
      const matching = filterTemplates(workflows.value, { query: templateQuery.value, locale: locale.value });
      return matching.reduce((counts, workflow) => ({ ...counts, [workflow.category]: (counts[workflow.category] || 0) + 1 }), { all: matching.length });
    });
    const visibleWorkflows = computed(() => filterTemplates(workflows.value, { category: templateCategory.value, query: templateQuery.value, locale: locale.value }));
    const groupedWorkflows = computed(() => TEMPLATE_GROUPS.filter(group => group.id !== 'all').map(group => ({ ...group, workflows: visibleWorkflows.value.filter(workflow => workflow.category === group.id) })).filter(group => group.workflows.length));
    const selectedCatalogTemplate = computed(() => selectedWorkflow.value ? templatePresentation(selectedWorkflow.value, locale.value) : null);

    const isPersonalWorkflow = computed(() => Boolean(selectedWorkflow.value?.executionWorkflowId));
    const contextNameLabel = computed(() => isPersonalWorkflow.value ? "Workspace name (optional)" : PAPERASSE_TEMPLATES[selectedWorkflowId.value] ? "Dossier name *" : "Business name *");
    const defaultName = computed(() => {
      const name = answers.businessName?.trim();
      if (isPersonalWorkflow.value) return name || operationText(selectedCatalogTemplate.value?.catalogTitle || "My workspace", locale.value);
      return name ? `${name} · ${operationText(selectedCatalogTemplate.value?.catalogTitle || "Team", locale.value)}` : operationText("New team", locale.value);
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
      answers.businessType = answers.businessType || "";
      answers.currentWorkflow = answers.currentWorkflow || "";
      answers.systemsOfRecord = connectors.map(connectorLabel).join(", ");
      answers.approvalOwner = "the local human operator";
      answers.stakeholders = "";
      answers.invoiceCadence = workflow.id === "invoice" ? "Milestone-based and monthly" : "Weekly";
      answers.operatingRule = "Draft first. Ask before sending, charging, reconciling, or changing customer records.";
      initialGoals.value = workflow.goals.map(goal => operationText(goal, locale.value));
      pickedConnectors.value = new Set(connectors);
      treasury.currency = workflow.templateId === "hvac_residential" || PAPERASSE_TEMPLATES[workflow.id] ? "EUR" : "USD";
      if (workflow.executionWorkflowId || PAPERASSE_TEMPLATES[workflow.id] || ["purchasing_team","sales_team"].includes(workflow.id)) { treasury.reserveFloor = 0; treasury.perHeartbeatSpendCap = 0; demoMode.value = false; }
    }

    function selectWorkflow(id) {
      selectedWorkflowId.value = id;
      if (selectedWorkflow.value) seedWorkflow(selectedWorkflow.value);
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

    const composedAnswers = computed(() => ({
      ...Object.fromEntries(paperasseQuestions.value.map(q => [q.id, answers[q.id]])),
      businessName: answers.businessName || (isPersonalWorkflow.value ? defaultName.value : "My Business"),
      businessType: answers.businessType || (selectedWorkflow.value?.executionWorkflowId ? selectedWorkflow.value.title : ""),
      currentWorkflow: answers.currentWorkflow || "",
      systemsOfRecord: answers.systemsOfRecord || [...pickedConnectors.value].map(connectorLabel).join(", "),
      approvalOwner: "the local human operator",
      stakeholders: "",
      invoiceCadence: answers.invoiceCadence || "Weekly",
      operatingRule: answers.operatingRule || "Draft first. Ask before sensitive actions.",
      metro: selectedWorkflow.value?.templateId === "hvac_residential" ? "Martinique" : undefined,
      emergencyPhone: answers.emergencyPhone || "",
      marketNumber: answers.marketNumber || "",
      vatRate: selectedWorkflow.value?.templateId === "hvac_residential" ? 8.5 : undefined,
      workflowId: selectedWorkflow.value?.id,
      executionWorkflowId: selectedWorkflow.value?.executionWorkflowId,
      workspaceProfile: WORKFLOW_PROFILES[selectedWorkflow.value?.id] || workspacePreview.value.profile,
    }));

    const workspacePreview = computed(() => buildWorkspaceBlueprint({
      templateId: selectedWorkflow.value?.templateId || WORKFLOW_TEMPLATE_ID,
      profile: WORKFLOW_PROFILES[selectedWorkflow.value?.id],
      executionWorkflowId: selectedWorkflow.value?.executionWorkflowId,
      workflowId: selectedWorkflow.value?.id,
      businessType: answers.businessType || selectedWorkflow.value?.businessType,
      currentWorkflow: answers.currentWorkflow || "",
    }));
    const roleLabel = (role) => formatRoleTitle(role);
    const previewViews = computed(() => workspaceNavigation(workspacePreview.value.channels).filter(item => !item.utility && item.key !== 'settings'));

    // ─── nav guards ───
    const canAdvance = computed(() => {
      if (step.value === 0) return !!selectedWorkflow.value;
      if (step.value === 1) {
        return (isPersonalWorkflow.value || Boolean(answers.businessName?.trim())) && paperasseQuestions.value.every(q => answers[q.id]?.trim());
      }
      return true;
    });
    const previewOutcomes=computed(()=>selectedCatalogTemplate.value?.catalogDeliverables?.length ? selectedCatalogTemplate.value.catalogDeliverables : teamGettingStarted({template:{id:selectedWorkflow.value?.templateId},workspace:workspacePreview.value}).outcomes);
    const canForm = computed(() => !!selectedWorkflow.value && (isPersonalWorkflow.value || Boolean(answers.businessName?.trim())) && paperasseQuestions.value.every(q => answers[q.id]?.trim()));

    function goTo(i) {
      if (i < step.value) step.value = i;
    }

    function confirmCancel() {
      if (busy.value) return;
      emit("cancel");
    }

    async function formCompany() {
      if (!canForm.value || busy.value) return;
      busy.value = true;
      errorMessage.value = "";
      try {
        const c = await store.formFromTemplate(selectedWorkflow.value?.templateId || WORKFLOW_TEMPLATE_ID, composedAnswers.value, {
          name: companyName.value || defaultName.value,
          treasury: { ...treasury },
          mode: "solo",
          includeOptionalHumans: false,
          demoMode: demoMode.value,
          connectorKinds: [...pickedConnectors.value],
          initialGoals: [...initialGoals.value],
        });
        // The durable company now exists: close immediately. Connector and
        // starter-goal provisioning is useful but must never hold the modal
        // open or make the primary creation look stuck.
        emit("done", c.id);
        void seedStarterWork(c.id, {
          connectorKinds: [...pickedConnectors.value],
          goals: [...initialGoals.value],
          workflowTitle: selectedWorkflow.value?.title,
        });
      } catch (err) {
        errorMessage.value = operationText("Failed to create workspace: {error}", locale.value, { error: err.message || err });
        busy.value = false;
      }
    }

    async function seedStarterWork(companyId, seed) {
      for (const kind of seed.connectorKinds) {
        try {
          await store.createConnectorForCompany(companyId, {
            kind,
            authType: CONNECTOR_CATALOG.find(connector => connector.kind === kind)?.authType || "apiKey",
            label: connectorLabel(kind),
          });
        } catch {}
      }
      for (const title of seed.goals) {
        if (!title?.trim()) continue;
        try {
          await store.createGoalForCompany(companyId, {
            title: title.trim(),
            rationale: `Imported from ${seed.workflowTitle} setup.`,
          });
        } catch {}
      }
    }

    return {
      t, locale, dialogRef, contentRef, catalogLoading, loadWorkflowCatalog, categoryCounts, errorMessage, visibleWorkflows, templateQuery, templateCategory, templateGroups, groupedWorkflows, selectedCatalogTemplate, supportedConnectors: SUPPORTED_CONNECTORS, connectorLabel,
      step, steps, busy, answers, treasury, initialGoals, companyName,
      demoMode,
      workflows, paperasseQuestions, selectedWorkflowId, selectedWorkflow, selectWorkflow, recommendedConnectors,
      previewOutcomes, workspacePreview, previewViews, roleLabel, isPersonalWorkflow, contextNameLabel,
      defaultName, pickedConnectors, toggleConnector,
      canAdvance, canForm, goTo, confirmCancel, formCompany,
    };
  },
};
</script>

<style scoped>
.wiz-overlay, .wiz-overlay * { box-sizing: border-box; }
.wiz-overlay { position: fixed; inset: 0; z-index: 9998; display: grid; place-items: center; padding: var(--bz-space-5); color: var(--bz-fg); background: var(--bz-overlay); backdrop-filter: blur(8px); }
.wiz { display: flex; flex-direction: column; width: 100%; min-width: 0; height: min(920px, calc(100dvh - 40px)); min-height: 0; overflow: hidden; border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-lg); background: var(--bz-canvas); font: 400 14px/1.5 var(--bz-font-body); }
.wiz__head { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: var(--bz-space-6); padding: var(--bz-space-5) var(--bz-space-6); border-bottom: 1px solid var(--bz-border); }
.wiz__head > div { min-width: 0; }
.wiz__eyebrow { margin: 0 0 var(--bz-space-1); color: var(--bz-fg-mid); font: 500 12px/1.5 var(--bz-font-body); }
.wiz__title { margin: 0; font: 900 italic 30px/1.2 var(--bz-font-metric); color: var(--bz-fg); }
.wiz__rail { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-5); margin-left: auto; }
.wiz-step { display: inline-flex; gap: var(--bz-space-2); align-items: center; min-height: 40px; padding: 4px; border: 0; background: transparent; color: var(--bz-fg-mid); font: inherit; }
.wiz-step:disabled { opacity: 1; }
.wiz-step.is-active { color: var(--bz-fg); font-weight: 600; }
.wiz-step__number { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--bz-border-strong); border-radius: 50%; font-size: 12px; flex-shrink: 0; }
.is-active .wiz-step__number { background: var(--bz-accent-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.is-done .wiz-step__number { border-color: transparent; color: var(--bz-accent); }
.wiz-step__number .material-symbols-outlined { font-size: 19px; }
.wiz__content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--bz-border-strong) transparent; }
.wiz-panel { padding: var(--bz-space-6); }
.wiz h2 { margin: 0 0 var(--bz-space-2); font: 900 italic clamp(24px, 2vw, 30px)/1.25 var(--bz-font-metric); color: var(--bz-fg); }
.wiz h3 { margin: 0; color: var(--bz-fg); font: 500 16px/1.4 var(--bz-font-body); }
.catalog-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--bz-space-5); margin-bottom: var(--bz-space-6); }
.catalog-heading p { margin: 0; color: var(--bz-fg-mid); max-width: 64ch; }
.template-search { display: flex; gap: var(--bz-space-2); align-items: center; width: min(340px, 100%); min-width: 0; border: 1px solid var(--bz-border); border-radius: var(--bz-r); padding: 0 var(--bz-space-3); background: var(--bz-panel); }
.template-search > span { font-size: 21px; color: var(--bz-fg-mid); }
.wiz .template-search input { width: 100%; min-width: 0; min-height: 44px; border: 0 !important; background: transparent !important; box-shadow: none !important; padding: 8px 0; font: inherit; }
.template-search:focus-within { border-color: var(--bz-border-brand); }
.template-search button { flex-shrink: 0; width: 28px; height: 28px; }
.template-layout { display: grid; grid-template-columns: 214px minmax(0, 1fr) 280px; gap: var(--bz-space-5); align-items: start; }
.template-categories { display: flex; flex-direction: column; gap: var(--bz-space-1); min-width: 0; }
.template-categories button { display: flex; align-items: center; gap: 10px; text-align: left; min-height: 42px; width: 100%; border: 1px solid transparent; border-radius: var(--bz-r); padding: 9px 10px; color: var(--bz-fg-mid); background: transparent; font: inherit; font-size: 13px; cursor: pointer; }
.template-categories button > span:nth-child(2) { min-width: 0; flex: 1; }
.template-categories button .material-symbols-outlined { flex-shrink: 0; font-size: 20px; }
.template-categories small { font-size: 12px; font-variant-numeric: tabular-nums; }
.template-categories button:hover { background: var(--bz-panel); color: var(--bz-fg); }
.template-categories button[aria-pressed=true] { background: var(--bz-accent-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.template-results { min-width: 0; display: grid; gap: var(--bz-space-6); }
.template-group header { display: flex; align-items: center; gap: var(--bz-space-2); margin-bottom: var(--bz-space-3); }
.template-group header h3 { font-size: 14px; }
.template-group header > span { color: var(--bz-fg-mid); font-size: 12px; }
.workflow-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-3); }
.workflow-card { display: grid; grid-template-columns: 28px minmax(0, 1fr) 20px; align-items: start; gap: var(--bz-space-3); width: 100%; min-width: 0; padding: var(--bz-space-4); background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); text-align: left; cursor: pointer; font: inherit; transition: border-color var(--bz-dur-fast), background var(--bz-dur-fast); }
.workflow-card:hover { background: var(--bz-raised); border-color: var(--bz-border-strong); }
.workflow-card.is-selected { border-color: var(--bz-border-brand); background: var(--bz-accent-soft); }
.workflow-card__copy { display: grid; gap: var(--bz-space-2); min-width: 0; overflow-wrap: anywhere; }
.workflow-card__icon { color: var(--bz-fg-mid); font-size: 25px; }
.workflow-card__check { color: var(--bz-fg-low); font-size: 18px; }
.is-selected .workflow-card__check, .is-selected .workflow-card__icon { color: var(--bz-accent); }
.workflow-card strong { font: 500 16px/1.4 var(--bz-font-body); }
.workflow-card__description { color: var(--bz-fg-mid); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.workflow-card__outcome { padding-top: var(--bz-space-2); border-top: 1px solid var(--bz-border); font-size: 12px; color: var(--bz-fg-mid); }
.template-selection { padding: var(--bz-space-5); background: var(--bz-panel); border: 1px solid var(--bz-border); border-radius: var(--bz-r-lg); min-width: 0; }
.template-selection__icon { display: grid; place-items: center; width: 44px; height: 44px; background: var(--bz-accent-soft); border: 1px solid var(--bz-border); border-radius: var(--bz-r); color: var(--bz-accent); font-size: 25px; margin-bottom: var(--bz-space-4); }
.template-selection h3 { font: 900 italic 25px/1.25 var(--bz-font-metric); margin: 0 0 var(--bz-space-3); }
.template-selection p, .setup-intro p, .review-intro > p { color: var(--bz-fg-mid); font-size: 13px; line-height: 1.65; margin: 0 0 var(--bz-space-3); }
.template-selection h4 { font: 500 13px/1.5 var(--bz-font-body); margin: var(--bz-space-5) 0 var(--bz-space-2); color: var(--bz-fg); }
.wiz .template-outcomes { list-style: none; display: grid; gap: var(--bz-space-3); padding: 0; margin: 0; }
.wiz .template-outcomes li { display: flex; align-items: start; gap: var(--bz-space-2); color: var(--bz-fg-mid); font-size: 13px; line-height: 1.6; }
.template-outcomes li > .material-symbols-outlined { font-size: 17px; flex-shrink: 0; margin-top: 3px; color: var(--bz-accent); }
.role-preview { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--bz-fg-mid); font-size: 13px; }
.role-preview > span { padding-block: 2px; }
.template-selection .template-selection__review { display: flex; align-items: start; gap: 8px; margin: var(--bz-space-5) 0 0; padding-top: var(--bz-space-4); border-top: 1px solid var(--bz-border); font-size: 12px; }
.template-selection__review > span { font-size: 18px; }
.selection-path { display: grid; gap: 14px; list-style-position: inside; padding: 0; margin-top: var(--bz-space-5); font-size: 13px; color: var(--bz-fg-mid); }
.template-empty { text-align: center; padding: var(--bz-space-7) var(--bz-space-4); color: var(--bz-fg-mid); }
.template-empty h3 { margin: 16px 0; }
.catalog-loading { color: var(--bz-fg-mid); }
.setup-panel, .review-layout { display: grid; grid-template-columns: minmax(240px, .75fr) minmax(0, 1.4fr); gap: clamp(28px, 5vw, 80px); width: 100%; margin: 0; }
.setup-intro, .review-intro { min-width: 0; }
.setup-intro .template-outcomes { margin-top: var(--bz-space-6); }
.quick-setup-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--bz-space-5); }
.wiz-field { min-width: 0; display: flex; flex-direction: column; gap: var(--bz-space-2); }
.wiz-field--wide { grid-column: 1 / -1; }
.wiz-field label { font: 500 13px/1.5 var(--bz-font-body); color: var(--bz-fg); }
.wiz-field :is(input, textarea) { width: 100%; font: 400 14px/1.6 var(--bz-font-body); padding: 12px 14px; border-radius: var(--bz-r); resize: vertical; }
.connector-section { margin-top: var(--bz-space-6); }
.connector-section h3 { margin-bottom: var(--bz-space-3); }
.conn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: var(--bz-space-2); }
.conn-tile { display: flex; align-items: center; gap: var(--bz-space-2); padding: 12px; border: 1px solid var(--bz-border); border-radius: var(--bz-r); color: var(--bz-fg-mid); background: var(--bz-panel); font: inherit; font-size: 13px; min-height: 48px; text-align: left; }
.conn-tile[aria-pressed=true] { color: var(--bz-fg); border-color: var(--bz-border-brand); background: var(--bz-accent-soft); }
.conn-tile .material-symbols-outlined { font-size: 21px; }
.conn-tile > span:nth-child(2) { flex: 1; }
.setup-note { display: flex; align-items: start; gap: 10px; margin-top: var(--bz-space-6); color: var(--bz-fg-mid); font-size: 13px; }
.setup-note .material-symbols-outlined { flex-shrink: 0; font-size: 20px; }
.review-intro .wiz-field { margin: var(--bz-space-5) 0; }
.review-intro h3 { margin-bottom: var(--bz-space-3); }
.review-details { min-width: 0; }
.review-detail { display: flex; align-items: start; gap: var(--bz-space-4); padding: var(--bz-space-5) 0; border-bottom: 1px solid var(--bz-border); }
.review-detail:first-child { padding-top: 0; }
.review-detail > span { color: var(--bz-fg-mid); font-size: 23px; }
.review-detail > div { min-width: 0; }
.review-detail h3 { margin-bottom: var(--bz-space-3); }
.review-detail p { margin: 0; color: var(--bz-fg-mid); font-size: 13px; }
.workspace-preview__channels { display: flex; flex-wrap: wrap; gap: 12px 18px; }
.workspace-preview__channels > span { display: inline-flex; align-items: center; gap: 7px; color: var(--bz-fg-mid); font-size: 13px; }
.workspace-preview__channels .material-symbols-outlined { font-size: 18px; }
.first-work-list { margin: 0; padding-left: 18px; display: grid; gap: 10px; color: var(--bz-fg-mid); font-size: 13px; }
.demo-row { display: flex; align-items: center; gap: 12px; margin-top: var(--bz-space-4); color: var(--bz-fg-mid); }
.wiz .demo-row input { appearance: none; width: 38px; min-width: 38px; height: 22px; min-height: 22px; padding: 0; border: 1px solid var(--bz-border-strong); border-radius: 14px; background: var(--bz-raised); position: relative; }
.demo-row input::after { content: ''; width: 14px; height: 14px; border-radius: 50%; background: var(--bz-fg-mid); position: absolute; left: 3px; top: 3px; transition: transform var(--bz-dur-fast); }
.wiz .demo-row input:checked { background: var(--bz-control-selected-bg); border-color: var(--bz-control-selected-border); }
.demo-row input:checked::after { transform: translateX(16px); background: var(--bz-control-selected-fg); }
.wiz__actions { display: flex; flex: 0 0 auto; align-items: center; gap: var(--bz-space-4); padding: var(--bz-space-4) var(--bz-space-6); border-top: 1px solid var(--bz-border); background: var(--bz-panel); }
.wiz__selection-label { color: var(--bz-fg-mid); font-size: 13px; min-width: 0; overflow-wrap: anywhere; }
.wiz__actions-right { margin-left: auto; min-width: 0; }
.wiz__actions .bz-btn { max-width: 100%; height: auto; min-height: 44px; white-space: normal; text-align: center; line-height: 1.35; padding-block: 10px; }
.wiz__actions .material-symbols-outlined { flex-shrink: 0; }
.wiz-step { text-align: left; }
.wiz__head h1 { overflow-wrap: anywhere; }
.wiz-error { padding: 12px var(--bz-space-6); margin: 0; color: var(--bz-danger); overflow-wrap: anywhere; border-top: 1px solid var(--bz-border); }
.wiz button:focus-visible, .wiz__content:focus-visible { outline: 2px solid var(--bz-accent); outline-offset: -2px; }
@media (min-height: 900px) and (min-width: 1200px) { .template-selection { position: sticky; top: 0; } }
@media (max-width: 1200px) { .template-layout { grid-template-columns: 190px minmax(0, 1fr); } .template-selection { grid-column: 2; } .wiz__head { gap: 20px; } .wiz__rail { gap: 12px; } }
@media (max-width: 760px) { .wiz-overlay { padding: 10px; } .wiz { height: calc(100dvh - 20px); } .wiz__head { flex-wrap: wrap; padding: 16px; gap: 16px; } .wiz__head > .bz-close-button { margin-left: auto; } .wiz__rail { order: 3; width: 100%; justify-content: space-between; } .wiz__head > :last-child { margin-left: auto; } .wiz__title { font-size: 26px; } .wiz-panel { padding: 20px 16px; } .catalog-heading { gap: 16px; margin-bottom: 20px; } .template-search { width: 100%; } .template-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; } .template-categories { flex-direction: row; overflow-x: auto; scrollbar-width: thin; padding-bottom: 8px; } .template-categories button { flex: 0 0 auto; width: auto; max-width: 220px; } .template-selection { grid-column: auto; } .setup-panel, .review-layout { grid-template-columns: minmax(0, 1fr); gap: 28px; } .setup-intro .template-outcomes { display: none; } .quick-setup-grid { grid-template-columns: minmax(0, 1fr); } .wiz__actions { padding: 12px 16px; gap: 10px; } .wiz__selection-label { font-size: 12px; } }
@media (max-width: 500px) { .wiz__selection-label { display: none; } .wiz__actions-right { max-width: 68%; } .wiz__actions > .bz-btn { flex-shrink: 0; } }
@media (prefers-reduced-motion: reduce) { .wiz * { transition: none !important; } }
</style>
