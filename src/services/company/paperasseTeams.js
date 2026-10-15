// Adapted workflow structure from romainsimon/paperasse (MIT).
// Source: f2e15c43112ddda9b80f53822185a21b6ad3b099; license: src/skills/paperasse/LICENSE.
const COMMON = `Work from evidence, not assumptions. Start by listing and reading existing company evidence with records.listSharedEvidence and records.readSharedEvidence for explicitly shared operational evidence (do not duplicate source records), then finance.listEvidence and finance.readEvidence. Use finance.reconcilePayouts for deterministic settlement candidate matching. Separate facts, assumptions, calculations, exceptions and actions. Each deliverable must identify its period, source record IDs, missing documents, reviewer and next step. Imported bank transactions are not a certified ledger. Do not infer VAT deductibility from a merchant name or equate Stripe gross charges with bank deposits. Compare gross, fees, refunds, net and payout dates separately, by currency. Never invent balances, tax rates, legal citations or completed filings. Request missing company identity, fiscal regime, period and source documents before definitive conclusions. Legal rates and deadlines require current official evidence (impots.gouv.fr, BOFiP, URSSAF or service-public.fr) supplied by the owner; without that evidence mark them unverified. You have no implicit browser, filing system or professional signing authority. Produce local draft deliverables with produce/text using actual evidence. External changes require approval. A report is preparation for a qualified human reviewer, not a statutory certification.`;
const DEFINITIONS = [
  ['accounting', 'French accounting & close', 'receipt_long', 'Prepare a traceable monthly close from bank and payment records.', ['CEO', 'CFO', 'AccountingSpecialist', 'PaymentsSpecialist', 'InvoicingSpecialist'],
    'Inventory evidence → import settled Qonto transactions and Stripe balance entries → categorize with proposed PCG accounts → reconcile bank, fees and payouts → list unsupported entries → prepare draft VAT workpapers and close checklist → hand off to the accountant. Keep proposed entries separate from posted entries; require balanced debit/credit entries and receipt references.',
    ['Inventory the company profile, accounting period and missing evidence', 'Reconcile Stripe payouts against Qonto settlements and list unmatched records', 'Prepare a draft close pack with proposed entries, missing receipts and reviewer sign-off checklist']],
  ['audit', 'French audit preparation', 'fact_check', 'Cross-check financial statements and assemble a reviewable evidence pack.', ['CEO', 'CFO', 'AccountingSpecialist', 'ProcessAnalyst'],
    'Plan the scope and materiality with the reviewer → inspect FEC structure and ledger integrity → reconcile balance sheet → check profit and loss → cross-check tax pack → review legal documents and subsequent events → draft findings and evidence index. Distinguish tested, failed and not tested. Never issue a statutory audit opinion. Independence matters: review supplied evidence rather than affirming another agent’s unsupported conclusion.',
    ['Agree audit scope, period, materiality and source inventory', 'Cross-check ledger, balance sheet, profit and loss and bank evidence', 'Produce an audit preparation report separating exceptions from untested assertions']],
  ['tax_review', 'French tax review', 'policy', 'Find unsupported treatments before the accountant reviews the return.', ['CEO', 'CFO', 'AccountingSpecialist', 'GeneralCounsel'],
    'Collect company and period context → inspect ledger integrity → review deductible expenses → review VAT support → examine revenue completeness → assess depreciation and provisions → inspect related-party balances → review tax adjustments → check filing consistency. For each finding give source IDs, factual basis, proposed correction, current legal evidence or an explicit verification gap. Never assert a tax reassessment as fact or submit a return.',
    ['Inventory fiscal regime, period, prior returns and accounting evidence', 'Prepare an exception register for unsupported expenses and VAT treatments', 'Draft a tax-review handoff with questions for the accountant']],
  ['personal_tax', 'Founder tax preparation', 'calculate', 'Organize a founder’s personal tax evidence and comparison scenarios.', ['CEO', 'CFO', 'GeneralCounsel'],
    'Collect fiscal residence, household, tax year, income categories, investment and property evidence → separate salary, dividends, capital gains and business income → inventory options and missing inputs → calculate only with verified current rates and deterministic arithmetic → compare scenarios with explicit assumptions → prepare a reviewer checklist. Never mix company cash with household taxable income or silently assume tax elections.',
    ['Collect residence, household, tax year and source income statements', 'Build a categorized income and missing-document register', 'Prepare scenario inputs and questions for a qualified tax adviser']],
  ['property', 'Copropriété operations', 'apartment', 'Coordinate co-ownership records, budgets, works and meeting preparation.', ['CEO', 'COO', 'CFO', 'GeneralCounsel'],
    'Collect building identity, lots, allocation keys, mandates and voted budgets → reconcile charges and owner balances → prepare meeting agenda, resolutions and evidence → track suppliers, quotations and works approvals → draft unpaid-charge follow-up → maintain a dated management journal. Never assume allocation keys, voting majorities or authority to order works. Ask for the governing documents. Keep every building’s accounts and documents separate.',
    ['Inventory building documents, lot allocation keys and approved budget', 'Prepare charge reconciliation and supplier-invoice exceptions', 'Draft an assembly preparation pack and works decision register']],
  ['notarial', 'Property & succession dossier', 'folder_shared', 'Prepare a complete evidence dossier for a notary.', ['CEO', 'GeneralCounsel', 'CFO', 'ProcessAnalyst'],
    'Identify sale, inheritance, gift or family-company matter → collect location, ownership, dates, parties, marital regime and asset evidence → list applicable checks and missing documents → prepare scenario calculations only from verified rates → produce a structured notary handoff. For a sale check title, diagnostics, co-ownership and encumbrances; for succession check heirs, will, prior gifts and asset inventory. Never draft a document as an executed authentic deed or claim registration.',
    ['Identify the matter, parties, dates and governing documents', 'Build an asset and missing-document inventory', 'Prepare the notary handoff with unresolved legal and valuation questions']],
];
const financeSkills = ['skill.finance_reconciliation', 'skill.qonto_finance', 'skill.stripe_finance'];
export const PAPERASSE_TEMPLATES = Object.fromEntries(DEFINITIONS.map(([key, name, icon, summary, roles, workflow, goals]) => {
  const id = `paperasse_${key}`;
  return [id, {
    id, vertical: id, name, summary, badgeIcon: icon, version: '1.0', paperasse: true,
    skillPacks: ['paperasse_finance'], hybridRoles: [], vetoOverrides: {},
    treasuryDefaults: { currency: 'EUR', reserveFloor: 0, perHeartbeatSpendCap: 0 },
    defaultRoles: Object.fromEntries(roles.map(role => [role, {
      companion: role === 'CEO' ? 'james' : role === 'GeneralCounsel' ? 'marcus' : role === 'COO' ? 'priya' : 'arjun',
      llm: 'llm_qwen3_5_9b_q2', pipelines: ['text'],
      grantedSkills: role === 'InvoicingSpecialist' ? [...financeSkills, 'skill.qonto_invoicing', 'skill.stripe_invoicing'] : [...financeSkills],
    }])),
    missionTemplate: a => `${name} for ${a.businessName || '[identity required]'}. Jurisdiction: France. Identity and legal form: ${a.legalIdentity || '[required]'}. Fiscal regime: ${a.fiscalRegime || '[required]'}. Period: ${a.period || '[required]'}. Evidence: ${a.evidence || '[not supplied]'}. Human reviewer: ${a.reviewer || '[required]'}. Workflow: ${workflow}`,
    initialGoals: goals,
    intakeQuestions: [
      { id: 'businessName', label: 'Business or dossier name', type: 'text', required: true },
      { id: 'legalIdentity', label: 'Identity, SIREN / legal form or parties', type: 'text', required: true },
      { id: 'fiscalRegime', label: 'Tax and VAT regime (or not applicable)', type: 'text', required: true },
      { id: 'period', label: 'Accounting period or relevant dates', type: 'text', required: true },
      { id: 'evidence', label: 'Available documents and missing evidence', type: 'text', required: true },
      { id: 'reviewer', label: 'Accountant, notary or owner who will review', type: 'text', required: true },
    ],
    operatingGuide: `${COMMON}\nWORKFLOW: ${workflow}`,
  }];
}));
export function paperasseGuide(charter, roleKey) {
  const template = PAPERASSE_TEMPLATES[charter?.template?.id];
  if (!template) return '';
  return `${template.operatingGuide}\nROLE FOCUS (${roleKey}): ${roleKey === 'CEO' ? 'Coordinate intake, assign evidence review, and summarize blockers. Do not mark the dossier complete until the requested deliverables exist.' : roleKey === 'GeneralCounsel' ? 'Identify legal verification gaps and prepare the human professional review.' : 'Collect and reconcile evidence within the assigned task; preserve source IDs and disclose missing pages.'}`;
}
