import { MEDIA_TEAM_ROLES } from '../../skills/mediaProduction.js';
import { PAPERASSE_TEMPLATES } from "./paperasseTeams.js";
const CORE_CHANNELS = Object.freeze({
  approvals: { key: "approvals", label: "Approvals", icon: "rule", view: "approvals", group: "conversations", badge: "approvals", description: "Sensitive actions waiting for a human decision." },
  work: { key: "work", label: "Work", icon: "flag", view: "issues", group: "workspace", badge: "openWork", description: "Tasks, blockers, handoffs, and work created from conversations." },
  results: { key: "results", label: "Results", icon: "task_alt", view: "deliverables", group: "workspace", badge: "results", description: "Completed work, generated files, and execution evidence." },
  team: { key: "team", label: "Team", icon: "groups", view: "org", group: "workspace", description: "AI teammates and human owners participating in this workspace." },
  tools: { key: "tools", label: "Tools", icon: "cable", view: "connectors", group: "workspace", badge: "toolIssues", description: "Connected business systems. Credentials stay in the OS keychain." },
  settings: { key: "settings", label: "Settings", icon: "edit_note", view: "charter", group: "workspace", description: "Guardrails, autonomy, models, schedules, and workspace behavior." },
});

const channel = (key, label, icon, view, description, options = {}) => ({
  key, label, icon, view, description, group: "conversations", ...options,
});

const PROFILE_BLUEPRINTS = Object.freeze({
  grants: {label:"Grants and incentives",roles:["CEO","DocumentController","CFO"],channels:[channel("grants","Grant dossiers","account_balance","grants","Applications, documents and receipts."),channel("grants-chat","Chat","chat_bubble","command","Instructions and team coordination."),CORE_CHANNELS.approvals,CORE_CHANNELS.results]},
  purchasing: {label:"Purchasing", roles:["CEO","PurchasingManager","CFO"], channels:[channel("purchasing-room","Purchasing","forum","command","Supplier requests and purchasing work."),CORE_CHANNELS.work,CORE_CHANNELS.approvals,CORE_CHANNELS.results]},
  general: {
    label: "Business operations",
    roles: ["CEO", "COO", "ProcessAnalyst"],
    channels: [channel("operations", "Operations", "forum", "command", "Brief the team and coordinate the business from one shared conversation."), CORE_CHANNELS.approvals, CORE_CHANNELS.work, CORE_CHANNELS.results],
  },
  revenue: {
    label: "Revenue operations",
    roles: ["CEO", "BusinessDevelopment", "ClientSuccess"],
    channels: [channel("revenue", "Revenue room", "forum", "command", "Coordinate pipeline, follow-ups, customer commitments, and the next best action."), channel("pipeline", "Customers & sales", "handshake", "sales", "Qualified opportunities, next touches, meetings, and commercial blockers.", { badge: "openWork" }), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  finance: {
    label: "Finance operations",
    roles: ["CEO", "CFO", "InvoicingSpecialist", "PaymentsSpecialist", "AccountingSpecialist"],
    channels: [channel("cash", "Cash room", "forum", "command", "Coordinate invoices, collections, payments, exceptions, and owner decisions."), channel("receivables", "Receivables", "receipt_long", "issues", "Invoice preparation, overdue follow-ups, payment matching, and exceptions.", { badge: "openWork" }), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  support: {
    label: "Customer operations",
    roles: ["CEO", "COO", "ClientSuccess"],
    channels: [channel("customer-ops", "Customer operations", "forum", "command", "Triage requests, coordinate responses, and escalate customer risk."), channel("inbox", "Customer inbox", "support_agent", "issues", "Requests, complaints, response drafts, and unresolved customer commitments.", { badge: "openWork" }), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  hospitality: {
    label: "Stay operations",
    roles: ["CEO", "COO", "ClientSuccess", "ProcessAnalyst"],
    channels: [channel("stay-ops", "Stay operations", "forum", "command", "Coordinate guest experience, turnovers, property exceptions, and owner visibility."), channel("turnovers", "Turnovers", "cleaning_services", "issues", "Upcoming departures, cleaning, inspections, and readiness risks.", { badge: "openWork" }), channel("guest-inbox", "Guest inbox", "chat", "issues", "Guest messages, response drafts, complaints, and escalation risk."), channel("exceptions", "Property exceptions", "home_repair_service", "issues", "Maintenance, damage, blocked-night risk, vendors, and evidence."), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  hvac: {
    label: "HVAC operations",
    roles: ["CEO", "MaintenanceContractManager", "MaintenancePlanner", "DispatchCoordinator", "QHSEManager", "BillingController"],
    channels: [channel("maintenance-cockpit", "Cockpit", "space_dashboard", "gmao", "Priorités, clients et prochaines actions de maintenance.", {domainView:"today"}), channel("operations", "Équipes", "forum", "command", "Coordonner les agents autour des dossiers de maintenance."), channel("dispatch", "Dispatch", "assignment", "gmao", "Triage incoming requests, assign technicians, and keep every intervention moving.", { domainView: "work-orders", badge: "gmao.openWorkOrders" }), channel("preventive", "Preventive", "event_repeat", "gmao", "Plan recurring maintenance before equipment and commitments are at risk.", { domainView: "preventive", badge: "gmao.duePreventive" }), channel("sla-risk", "SLA risk", "timer", "gmao", "See urgent work, response deadlines, restoration risk, and potential penalties.", { domainView: "cockpit", badge: "gmao.slaAtRisk" }), channel("billing", "Billing", "request_quote", "gmao", "Move completed interventions through acceptance, evidence, and invoicing.", { domainView: "finance", badge: "gmao.billing" }), CORE_CHANNELS.approvals],
  },
  creative: {
    label: "Creative studio",
    roles: ["CEO", "CPO", "CMO", "Producer:text", "Producer:image", "Producer:video"],
    channels: [channel("studio", "Studio", "forum", "command", "Turn briefs into coordinated creative work and client-ready campaigns."), channel("production", "Production", "movie_edit", "issues", "Concepts, copy, images, video, revisions, and production blockers.", { badge: "openWork" }), channel("client-review", "Client review", "rate_review", "approvals", "Creative and publishing decisions waiting for review.", { badge: "approvals" }), CORE_CHANNELS.results],
  },
  commerce: {
    label: "Commerce operations",
    roles: ["CEO", "CPO", "CMO", "CSO", "COO", "Producer:image", "Producer:text"],
    channels: [channel("commerce", "Commerce room", "forum", "command", "Coordinate products, storefront, campaigns, fulfillment, and customer issues."), channel("catalog", "Catalog", "inventory_2", "issues", "Products, listings, creative assets, pricing, and launch work.", { badge: "openWork" }), channel("fulfillment", "Fulfillment", "local_shipping", "issues", "Orders, production exceptions, shipping, and customer handoffs."), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  legal: {
    label: "Matter operations",
    roles: ["CEO", "GeneralCounsel", "COO", "Producer:text"],
    channels: [channel("matters", "Matter room", "forum", "command", "Coordinate matters, deadlines, documents, client communication, and review."), channel("casework", "Casework", "gavel", "issues", "Research, drafting, filing deadlines, evidence, and matter blockers.", { badge: "openWork" }), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  product: {
    label: "Product operations",
    roles: ["CEO", "CPO", "CSO", "COO", "RnDLead"],
    channels: [channel("product", "Product room", "forum", "command", "Coordinate customer signal, roadmap work, delivery, and operating decisions."), channel("delivery", "Delivery", "deployed_code", "issues", "Product work, incidents, experiments, releases, and blockers.", { badge: "openWork" }), channel("customers", "Customers", "support_agent", "issues", "Feedback, support patterns, renewals, and customer risk."), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
  knowledge: {
    label: "Knowledge business",
    roles: ["CEO", "CPO", "CMO", "CSO", "Producer:text", "Producer:video", "Producer:audio"],
    channels: [channel("program", "Program room", "forum", "command", "Coordinate curriculum, audience, content production, and learner outcomes."), channel("content", "Content", "edit_note", "issues", "Research, lessons, scripts, media, and publishing work.", { badge: "openWork" }), channel("learners", "Learners", "school", "issues", "Questions, progress, feedback, and learner success risks."), CORE_CHANNELS.approvals, CORE_CHANNELS.results],
  },
});

const TEMPLATE_PROFILES = Object.freeze({
  government_grants: "grants",
  hvac_residential: "hvac",
  purchasing_team: "purchasing",
  sales_team: "revenue",
  ugc_campaign_studio: "creative",
  marketing_agency: "creative",
  newsletter_creator: "creative",
  affiliate_operator: "creative",
  pod_shop: "commerce",
  solo_law: "legal",
  indie_saas: "product",
  course_creator: "knowledge",
  coaching_practice: "knowledge",
  bookkeeping_firm: "finance",
});

export function inferWorkspaceProfile(input = {}) {
  if (input.profile && PROFILE_BLUEPRINTS[input.profile]) return input.profile;
  if (PAPERASSE_TEMPLATES[input.templateId]) return "finance";
  if (TEMPLATE_PROFILES[input.templateId]) return TEMPLATE_PROFILES[input.templateId];
  const text = `${input.workflowId || ""} ${input.businessType || ""} ${input.currentWorkflow || ""}`.toLowerCase();
  if (/purchasing|procurement|achats|approvisionnement/.test(text)) return "purchasing";
  if (/hvac|gmao|climatisation|maintenance préventive|work order|sla/.test(text)) return "hvac";
  if (/stay_|hospital|rental|property|guest|turnover|housekeep|reservation/.test(text)) return "hospitality";
  if (/invoice|collection|receivable|payment|bookkeep|account|cash|reconcil/.test(text)) return "finance";
  if (/lead|sales|crm|pipeline|prospect|business development/.test(text)) return "revenue";
  if (/support|inbox|complaint|refund|customer success/.test(text)) return "support";
  if (/campaign|creative|marketing|content|newsletter|affiliate/.test(text)) return "creative";
  if (/shop|commerce|retail|fulfillment|catalog/.test(text)) return "commerce";
  if (/law|legal|attorney|matter/.test(text)) return "legal";
  if (/saas|software|product|startup/.test(text)) return "product";
  if (/course|coach|education|learner/.test(text)) return "knowledge";
  return "general";
}

export function buildWorkspaceBlueprint(input = {}) {
  const profile = input.executionWorkflowId ? 'general' : inferWorkspaceProfile(input);
  const definition = PROFILE_BLUEPRINTS[profile] || PROFILE_BLUEPRINTS.general;
  const paperasse = PAPERASSE_TEMPLATES[input.templateId];
  const domainChannels = input.executionWorkflowId ? [channel('studio', 'Workflow', 'auto_awesome', 'studio', 'Create tasks and review their outputs.'), { ...CORE_CHANNELS.work, label: 'Tasks' }, { ...CORE_CHANNELS.approvals, label: 'Review' }, CORE_CHANNELS.results] : paperasse ? [
    channel('operations', 'Operations', 'forum', 'command', ''),
    channel('evidence', 'Evidence', 'folder_open', 'issues', ''),
    channel('preparation', ({paperasse_accounting:'Reconciliation', paperasse_tax_review:'Tax review', paperasse_audit:'Preparation', paperasse_personal_tax:'Tax preparation', paperasse_property:'Property work', paperasse_notarial:'Casework'})[input.templateId] || 'Preparation', 'assignment', 'issues', ''),
    CORE_CHANNELS.approvals, CORE_CHANNELS.results,
  ] : definition.channels;
  return {
    schemaVersion: 1,
    ...(input.executionWorkflowId ? { executionWorkflowId: input.executionWorkflowId } : {}),
    templateId: input.templateId || null,
    profile,
    label: input.executionWorkflowId ? "Smart workflow" : definition.label,
    source: input.workflowId ? "workflow" : input.templateId ? "template" : "inferred",
    defaultChannel: domainChannels[0].key,
    channels: [...domainChannels.map((item) => ({ ...item })), CORE_CHANNELS.team, CORE_CHANNELS.tools, CORE_CHANNELS.settings].map((item) => ({ ...item })),
    recommendedRoles: input.executionWorkflowId ? (MEDIA_TEAM_ROLES[input.executionWorkflowId] || ["CEO"]) : PAPERASSE_TEMPLATES[input.templateId] ? Object.keys(PAPERASSE_TEMPLATES[input.templateId].defaultRoles) : [...definition.roles],
  };
}

export function hydrateWorkspaceChannels(workspace, state = {}, templateId = workspace?.templateId) {
  const blueprint = PAPERASSE_TEMPLATES[templateId] ? buildWorkspaceBlueprint({ templateId }) : workspace?.channels?.length ? workspace : buildWorkspaceBlueprint({});
  const channels=blueprint.channels.filter(item=>!(blueprint.profile==='hvac' && item.key==='purchasing'));
  return channels.map((item) => ({ ...item, ...(blueprint.profile === "revenue" && item.key === "pipeline" ? {view:"sales",label:"Customers & sales",icon:"handshake"} : {}), badgeValue: resolveBadge(item.badge, state) || null }));
}

function resolveBadge(badge, state) {
  if (!badge) return 0;
  if (badge === "approvals") return state.approvals?.length || 0;
  if (badge === "openWork") return state.goalCounts?.active || state.issueCounts?.open || 0;
  if (badge === "results") return state.issueCounts?.done || 0;
  if (badge === "toolIssues") return (state.connectorHealth?.needs_auth || 0) + (state.connectorHealth?.broken || 0);
  if (badge === "gmao.billing") return (state.gmao?.kpis?.serviceAcceptancePending || 0) + (state.gmao?.kpis?.invoicesToSend || 0);
  if (badge.startsWith("gmao.")) return state.gmao?.kpis?.[badge.slice(5)] || 0;
  return 0;
}
