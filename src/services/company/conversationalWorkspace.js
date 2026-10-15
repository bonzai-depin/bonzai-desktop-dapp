export const COMPANY_BRIEF_STARTERS = Object.freeze([
  {id:"grants",icon:"account_balance",label:"Grants and incentives",copy:"Prepare applications and track payments.",prompt:"Préparer les dossiers de primes CEE pour nos installations en Martinique et Guyane, réutiliser les pièces de l’entreprise et suivre les dépôts et versements."},
  { id: "pay", icon: "payments", label: "Get paid faster", copy: "Draft invoices, follow up, and reconcile payments.", prompt: "We need to get invoices out faster, follow up on overdue customers, and reconcile Stripe payments with QuickBooks without losing the human approval step." },
  { id: "lead", icon: "person_search", label: "Never lose a lead", copy: "Turn quiet opportunities into a daily follow-up queue.", prompt: "Our leads live in HubSpot and email. Warm opportunities go quiet because nobody owns the next follow-up or meeting." },
  { id: "inbox", icon: "support_agent", label: "Tame the customer inbox", copy: "Triage requests and escalate the risky ones.", prompt: "Customer questions arrive across email and Slack. We need routine replies drafted quickly and urgent or sensitive requests escalated to the owner." },
  { id: "report", icon: "monitoring", label: "Know what happened", copy: "Prepare one weekly operating brief from every tool.", prompt: "Every Friday I open five tools to understand revenue, unpaid invoices, pipeline movement, customer issues, and what the team should do next." },
]);

export const COMPANY_WORKSPACE_PLANS = Object.freeze({
  grants:{id:'grants',templateId:'government_grants',title:'Grants and incentives',outcome:'Eligibility, documents, portal receipts and payments.',businessType:'Government grants',workspaceProfile:'grants',connectors:[],goals:['Review official eligibility rules for the installation territory','Prepare the document checklist and reuse valid company evidence','Prepare the first application for owner review','Track requests for complements and reconcile confirmed payments']},
  hvac: {
    id: "hvac",
    templateId: "hvac_residential",
    title: "HVAC operations",
    outcome: "Every intervention moves from request to verified service and invoice in one shared operating room.",
    businessType: "HVAC maintenance company",
    workspaceProfile: "hvac",
    connectors: ["quickbooks", "sendgrid", "google_calendar", "slack"],
    goals: ["Triage open interventions and protect the next SLA deadlines", "Build the preventive maintenance schedule", "Collect service evidence and customer acceptance", "Move accepted work into the billing queue"],
  },
  collections: {
    id: "collections",
    title: "Cashflow room",
    outcome: "Every invoice has a clear next action.",
    businessType: "service business",
    workspaceProfile: "finance",
    connectors: ["quickbooks", "stripe", "sendgrid", "hubspot"],
    goals: ["Find overdue invoices and rank them by risk", "Draft customer-specific payment reminders", "Reconcile payments and flag exceptions", "Bring sensitive follow-ups back for approval"],
  },
  leads: {
    id: "leads",
    title: "Revenue room",
    outcome: "No qualified lead goes quiet.",
    businessType: "sales-led small business",
    workspaceProfile: "revenue",
    connectors: ["hubspot", "sendgrid", "google_calendar", "slack"],
    goals: ["Build a prioritized daily follow-up queue", "Draft the next useful touch for each opportunity", "Propose meetings and update tasks", "Escalate high-value replies to the owner"],
  },
  support: {
    id: "support",
    title: "Customer operations room",
    outcome: "Routine requests move; risky ones reach a human.",
    businessType: "customer-facing small business",
    workspaceProfile: "support",
    connectors: ["sendgrid", "slack", "hubspot", "notion"],
    goals: ["Classify incoming requests by urgency and risk", "Draft answers from approved company context", "Escalate refunds, complaints, and commitments", "Summarize unresolved customer issues daily"],
  },
  reporting: {
    id: "reporting",
    title: "Weekly operating room",
    outcome: "One conversation explains the state of the business.",
    businessType: "small business",
    workspaceProfile: "general",
    connectors: ["quickbooks", "stripe", "hubspot", "notion", "slack"],
    goals: ["Prepare the weekly revenue and cash summary", "Surface pipeline and customer risks", "List decisions waiting for the owner", "Draft the next-action brief for the team"],
  },
});

export function classifyCompanyBrief(value) {
  const text = String(value || "").toLowerCase();
  if (/\bcee\b|bar-th-|grant|subvention|prime.*(edf|energie|énergie)|aides? (publiques?|financières?)|agir ?plus/.test(text)) return 'grants';
  if (/hvac|gmao|climatisation|ventilation|maintenance|technicien|intervention|ordre de travail|service fait|préventi|preventi|sla/.test(text)) return "hvac";
  if (/invoice|payment|paid|cash|quickbooks|stripe|overdue|receivable/.test(text)) return "collections";
  if (/lead|sales|prospect|crm|hubspot|proposal|pipeline/.test(text)) return "leads";
  if (/support|customer|guest|inbox|ticket|complaint|refund|request/.test(text)) return "support";
  return "reporting";
}

export function buildCompanyWorkspacePlan(value) {
  const key = classifyCompanyBrief(value);
  const plan = COMPANY_WORKSPACE_PLANS[key];
  return { ...plan, connectors: [...plan.connectors], goals: [...plan.goals] };
}
