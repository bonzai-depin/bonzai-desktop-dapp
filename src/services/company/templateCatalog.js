// Presentation only: template IDs still select the existing workflows and roles.
export const TEMPLATE_GROUPS = [
  { id: 'all', label: 'All templates', frLabel: 'Tous les modèles', icon: 'apps', description: 'Find a team by the work you need done.', frDescription: 'Trouvez une équipe selon le travail à accomplir.' },
  { id: 'operations', label: 'Maintenance & field service', frLabel: 'Maintenance et interventions', icon: 'engineering', description: 'Plan interventions, maintain equipment and collect service evidence.', frDescription: 'Planifier les interventions, entretenir les équipements et réunir les preuves.' },
  { id: 'purchasing', label: 'Purchasing & logistics', frLabel: 'Achats et logistique', icon: 'local_shipping', description: 'Source parts, manage suppliers and track deliveries.', frDescription: 'Approvisionner les pièces, gérer les fournisseurs et suivre les livraisons.' },
  { id: 'sales', label: 'Sales & customer relations', frLabel: 'Ventes et relation client', icon: 'handshake', description: 'Qualify enquiries, prepare proposals and follow up with customers.', frDescription: 'Qualifier les demandes, préparer les devis et suivre les clients.' },
  { id: 'finance', label: 'Billing & cash flow', frLabel: 'Facturation et trésorerie', icon: 'receipt_long', description: 'Prepare invoices, follow up on payments and monitor cash flow.', frDescription: 'Préparer les factures, relancer les paiements et suivre la trésorerie.' },
  { id: 'grants', label: 'Grants & incentives', frLabel: 'Aides et primes', icon: 'account_balance', description: 'Prepare applications, manage evidence and track settlements.', frDescription: 'Préparer les dossiers, gérer les justificatifs et suivre les versements.' },
  { id: 'accounting', label: 'Accounting & tax', frLabel: 'Comptabilité et fiscalité', icon: 'calculate', description: 'Organize accounts and prepare evidence for financial professionals.', frDescription: 'Organiser les comptes et préparer les pièces pour les professionnels.' },
  { id: 'compliance', label: 'Legal & audit', frLabel: 'Juridique et audit', icon: 'fact_check', description: 'Review evidence, identify exceptions and prepare professional handoffs.', frDescription: 'Contrôler les pièces, relever les anomalies et préparer les dossiers professionnels.' },
  { id: 'property', label: 'Property & hospitality', frLabel: 'Immobilier et hébergement', icon: 'apartment', description: 'Coordinate properties, guest stays, maintenance and owner reporting.', frDescription: 'Coordonner les logements, les séjours, l’entretien et les rapports propriétaires.' },
  { id: 'media', label: 'Video & content creation', frLabel: 'Vidéo et création de contenus', icon: 'movie', description: 'Create visual content, caption videos and support live productions.', frDescription: 'Créer des contenus visuels, sous-titrer des vidéos et animer des directs.' },
  { id: 'wellness', label: 'Wellness & audio', frLabel: 'Bien-être et audio', icon: 'spa', description: 'Produce guided meditations and personalized audio experiences.', frDescription: 'Produire des méditations guidées et des expériences audio personnalisées.' },
  { id: 'markets', label: 'Markets & investment', frLabel: 'Marchés et investissement', icon: 'monitoring', description: 'Research markets, compare signals and review investment decisions.', frDescription: 'Étudier les marchés, comparer les signaux et examiner les décisions d’investissement.' },
  { id: 'research', label: 'Research & model comparison', frLabel: 'Recherche et comparaison de modèles', icon: 'science', description: 'Compare answers, evaluate models and organize research.', frDescription: 'Comparer les réponses, évaluer les modèles et organiser les recherches.' },
  { id: 'collectibles', label: 'Collectibles & appraisal', frLabel: 'Collections et estimation', icon: 'style', description: 'Identify collectible cards, assess condition and check market prices.', frDescription: 'Identifier les cartes de collection, évaluer leur état et consulter les prix.' },
  { id: 'custom', label: 'Custom workflows', frLabel: 'Workflows personnalisés', icon: 'extension', description: 'Use an installed workflow tailored to your own process.', frDescription: 'Utiliser un workflow installé pour votre propre activité.' },
];
const definitions = [
  ['hvac_gmao', 'operations', 'HVAC maintenance', 'Equipment, preventive visits, work orders and service evidence.', 'Maintenance CVC', 'Équipements, visites préventives, interventions et preuves du service fait.'],
  ['government_grants','grants','Grants and incentives','Eligibility, reusable documents, portal applications and payments.','Aides et primes','Éligibilité, pièces réutilisables, dépôts sur les portails et versements.'],
  ['purchasing_team', 'purchasing', 'Purchasing', 'Supplier requests, quotations, orders and receipts.', 'Achats', 'Demandes fournisseurs, devis, commandes et réceptions.'],
  ['sales_team', 'sales', 'Sales', 'Prospect qualification, proposals and customer follow-up.', 'Ventes', 'Qualification des prospects, propositions et suivi client.'],
  ['leads', 'sales', 'Lead follow-up', 'A daily queue of prospects, draft replies and meeting requests.', 'Suivi des prospects', 'File quotidienne des prospects, brouillons de réponse et demandes de rendez-vous.'],
  ['invoice', 'finance', 'Invoicing', 'Draft invoices from approved work, with missing details flagged.', 'Facturation', 'Brouillons de factures à partir du travail validé et pièces manquantes à compléter.'],
  ['collections', 'finance', 'Payment reminders', 'Overdue invoices, draft reminders and disputed payments.', 'Relances clients', 'Factures échues, brouillons de relance et paiements contestés.'],
  ['payments', 'finance', 'Payment reconciliation', 'Match payments to invoices and review differences.', 'Rapprochement des paiements', 'Rapprochement des paiements et des factures, avec revue des écarts.'],
  ['report', 'finance', 'Weekly reporting', 'Revenue, unpaid invoices, open requests and next actions.', 'Reporting hebdomadaire', 'Revenus, impayés, demandes ouvertes et prochaines actions.'],
  ['stay_turnover', 'property', 'Stay turnover', 'Departure, cleaning, inspection and arrival handoffs.', 'Rotation des séjours', 'Coordination des départs, du ménage, des contrôles et des arrivées.'],
  ['stay_guest_messaging', 'property', 'Guest messaging', 'Guest questions, draft replies and requests needing review.', 'Messages voyageurs', 'Questions des voyageurs, réponses préparées et demandes à valider.'],
  ['stay_maintenance', 'property', 'Property maintenance', 'Property issues, contractor coordination and repair follow-up.', 'Entretien des logements', 'Incidents, coordination des prestataires et suivi des réparations.'],
  ['stay_owner_reporting', 'property', 'Owner reporting', 'Stay activity, maintenance exceptions and owner reports.', 'Rapports propriétaires', 'Activité des séjours, incidents techniques et rapports aux propriétaires.'],
  ['paperasse_accounting', 'accounting', 'French accounting & close', 'Reconciliation, proposed entries and a close pack for the accountant.', 'Comptabilité et clôture', 'Rapprochements, écritures proposées et dossier de clôture pour le comptable.'],
  ['paperasse_audit', 'compliance', 'French audit preparation', 'Evidence index, cross-checks and exceptions for the auditor.', 'Préparation à l’audit', 'Index des pièces, contrôles croisés et anomalies pour l’auditeur.'],
  ['paperasse_tax_review', 'accounting', 'French tax review', 'Document unsupported treatments and questions for the tax reviewer.', 'Revue fiscale', 'Traitements non justifiés et questions à soumettre au professionnel.'],
  ['paperasse_personal_tax', 'accounting', 'Founder tax preparation', 'Personal income evidence and comparison inputs for an adviser.', 'Fiscalité du dirigeant', 'Justificatifs de revenus personnels et éléments de comparaison pour le conseil.'],
  ['paperasse_property', 'property', 'Co-ownership management', 'Budgets, charges, works and meeting preparation.', 'Gestion de copropriété', 'Budgets, charges, travaux et préparation des assemblées.'],
  ['paperasse_notarial', 'compliance', 'Property & succession dossier', 'Property and succession evidence, missing documents and notary handoff.', 'Dossier immobilier et succession', 'Pièces immobilières et successorales, documents manquants et dossier pour le notaire.'],
];
export const TEMPLATE_PRESENTATION = Object.fromEntries(definitions.map(([id, category, title, description, frTitle, frDescription]) => [id, { category, title, description, frTitle, frDescription }]));
const BUSINESS_DELIVERABLES = {
  hvac_gmao: [['Scheduled work orders', 'Intervention reports', 'Service evidence'], ['Interventions planifiées', 'Rapports d’intervention', 'Preuves du service fait']],
  government_grants: [['Application dossier', 'Eligibility evidence', 'Settlement tracking'], ['Dossier de demande', 'Justificatifs d’éligibilité', 'Suivi des versements']],
  purchasing_team: [['Supplier comparisons', 'Purchase orders', 'Delivery and margin tracking'], ['Comparatifs fournisseurs', 'Commandes fournisseurs', 'Suivi des livraisons et des marges']],
  sales_team: [['Qualified opportunities', 'Draft proposals', 'Customer follow-up'], ['Opportunités qualifiées', 'Propositions commerciales', 'Suivi des clients']],
  leads: [['Prospect queue', 'Draft replies', 'Meeting requests'], ['File de prospects', 'Brouillons de réponse', 'Demandes de rendez-vous']],
  invoice: [['Draft invoices', 'Readiness checks', 'Supporting documents'], ['Brouillons de factures', 'Contrôles de facturation', 'Justificatifs']],
  collections: [['Overdue invoice queue', 'Draft reminders', 'Dispute tracking'], ['File des impayés', 'Brouillons de relance', 'Suivi des litiges']],
  payments: [['Payment matches', 'Reconciliation exceptions', 'Confirmed-payment records'], ['Paiements rapprochés', 'Écarts de rapprochement', 'Paiements confirmés']],
  report: [['Weekly activity report', 'Cash-flow overview', 'Prioritized next actions'], ['Rapport d’activité hebdomadaire', 'Vue de trésorerie', 'Prochaines actions priorisées']],
  stay_turnover: [['Turnover schedule', 'Cleaning instructions', 'Arrival readiness checks'], ['Planning des rotations', 'Consignes de ménage', 'Contrôles avant arrivée']],
  stay_guest_messaging: [['Draft guest replies', 'Guest request queue', 'Escalations for review'], ['Brouillons aux voyageurs', 'File des demandes', 'Demandes à valider']],
  stay_maintenance: [['Repair requests', 'Contractor coordination', 'Completion evidence'], ['Demandes de réparation', 'Coordination des prestataires', 'Preuves de réalisation']],
  stay_owner_reporting: [['Owner activity report', 'Maintenance exceptions', 'Supporting records'], ['Rapport d’activité propriétaire', 'Incidents techniques', 'Pièces justificatives']],
  paperasse_accounting: [['Proposed journal entries', 'Reconciliation checks', 'Accountant close pack'], ['Écritures proposées', 'Contrôles de rapprochement', 'Dossier de clôture comptable']],
  paperasse_audit: [['Evidence index', 'Cross-check results', 'Auditor exception list'], ['Index des pièces', 'Résultats des contrôles croisés', 'Liste d’anomalies pour l’auditeur']],
  paperasse_tax_review: [['Tax evidence pack', 'Unsupported-treatment review', 'Questions for the tax adviser'], ['Dossier fiscal', 'Revue des traitements non justifiés', 'Questions au conseil fiscal']],
  paperasse_personal_tax: [['Personal income evidence', 'Tax comparison inputs', 'Adviser review pack'], ['Justificatifs de revenus personnels', 'Éléments de comparaison fiscale', 'Dossier pour le conseil']],
  paperasse_property: [['Co-ownership budget', 'Works and charges follow-up', 'Meeting preparation pack'], ['Budget de copropriété', 'Suivi des travaux et des charges', 'Dossier de préparation d’assemblée']],
  paperasse_notarial: [['Property and succession dossier', 'Missing-document checklist', 'Notary handoff pack'], ['Dossier immobilier et successoral', 'Liste des pièces manquantes', 'Dossier pour le notaire']],
};
export function templatePresentation(workflow, locale = 'en') {
  const entry = TEMPLATE_PRESENTATION[workflow.id];
  const french = String(locale).toLowerCase().startsWith('fr');
  const requestedCategory = entry?.category || workflow.category;
  const category = TEMPLATE_GROUPS.some(group => group.id !== 'all' && group.id === requestedCategory) ? requestedCategory : 'custom';
  const group = TEMPLATE_GROUPS.find(group => group.id === category);
  const deliverables = BUSINESS_DELIVERABLES[workflow.id];
  return { ...workflow, category, icon: workflow.icon || group.icon,
    catalogTitle: (french ? entry?.frTitle : entry?.title) || workflow.title,
    catalogDescription: (french ? entry?.frDescription || workflow.frSummary || workflow.frOutcome : entry?.description) || workflow.summary || workflow.pain,
    catalogOutcome: (french ? workflow.frOutcome : null) || workflow.outcome || (french ? entry?.frTitle : entry?.title) || workflow.title,
    catalogDeliverables: (french ? deliverables?.[1] || workflow.frDeliverables : deliverables?.[0]) || workflow.deliverables || [],
    catalogCategory: (french ? group.frLabel : group.label),
  };
}
const searchable = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
export function filterTemplates(workflows, { category = 'all', query = '', locale = 'en' } = {}) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  return workflows.map(workflow => templatePresentation(workflow, locale)).filter(workflow =>
    (category === 'all' || workflow.category === category) && words.every(word => searchable(`${workflow.catalogTitle} ${workflow.catalogDescription} ${workflow.catalogOutcome} ${workflow.catalogCategory} ${workflow.catalogDeliverables.join(' ')} ${(workflow.tags || []).join(' ')} ${(workflow.stakeholders || []).join(' ')} ${(workflow.connectors || []).join(' ')}`).includes(word)));
}
