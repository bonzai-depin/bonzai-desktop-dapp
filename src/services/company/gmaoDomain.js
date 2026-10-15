/**
 * Deterministic HVAC/GMAO business rules shared by the renderer, the
 * agentic runtime and tests. No Electron or browser dependency belongs here.
 */

export const HVAC_TECHNICAL_SECTIONS = Object.freeze({
  ST1: "Climatisation, déshumidification et groupes froids",
  ST2: "Ventilation et hottes",
  ST3: "Gaz combustible, équipements sous pression et compresseurs",
});

export const HVAC_DOMAIN_CODES = Object.freeze({
  IFC: "Installations frigorifiques et climatisation",
  AER: "Aéraulique et ventilation",
  HOT: "Hottes et extraction de cuisine",
  REG: "Réseaux de gaz",
  ESP: "Équipements sous pression et compresseurs",
});

export const GMAO_PRIORITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
export const GMAO_WORK_ORDER_STATUSES = Object.freeze([
  "reported", "triaged", "assigned", "acknowledged", "en_route", "on_site",
  "waiting_parts", "restored", "completed", "cancelled",
]);

// DI = délai d'intervention, DRS = délai de rétablissement du service.
export const SLA_POLICIES = Object.freeze({
  P0: { interventionHours: 4, restorationHours: 4, maxDowntimeHours: 24, onCall: true, label: "Vital" },
  P1: { interventionHours: 24, restorationHours: 24, maxDowntimeHours: 48, onCall: true, label: "Important" },
  P2: { interventionHours: 24 * 7, restorationHours: 0, maxDowntimeHours: 24 * 15, onCall: true, label: "Normal" },
  P3: { interventionHours: null, restorationHours: null, maxDowntimeHours: null, onCall: false, label: "Non opérationnel" },
});

export const ON_CALL_WINDOWS = Object.freeze([
  { days: [1, 2], startsAt: "17:00", endsAt: "06:30", label: "Lundi et mardi" },
  { days: [3, 4, 5, 6, 0], startsAt: "13:00", endsAt: "06:30", label: "Mercredi au lundi matin" },
]);

export const GMAO_REFERENCE_SITES = Object.freeze([
  { name: "Fort et Morne Desaix", trigram: "FMD", commune: "Fort-de-France", antenna: "IA1", referenceOrganization: "DICOM" },
  { name: "Fort Saint-Louis", trigram: "FSL", commune: "Fort-de-France", antenna: "IA1", referenceOrganization: "Base Navale" },
  { name: "Quartier Gerbault", trigram: "QGE", commune: "Fort-de-France", antenna: "IA1", referenceOrganization: "CSN" },
  { name: "Parc aux Huiles", trigram: "PAH", commune: "Fort-de-France", antenna: "IA1", referenceOrganization: "Base Navale" },
  { name: "Pointe des Nègres", trigram: "PDN", commune: "Fort-de-France", antenna: "IA1", referenceOrganization: "Base Navale" },
  { name: "Pointe des Sables", trigram: "PDS", commune: "Fort-de-France", antenna: "IA2", referenceOrganization: "DANZ" },
  { name: "CAOME", trigram: "CAOME", commune: "Le François", antenna: "IA2", referenceOrganization: "33ème RIMA" },
  { name: "Pôle Aéronautique Étatique", trigram: "PAE", commune: "Le Lamentin", antenna: "IA2", referenceOrganization: "EMIA" },
  { name: "Station Rivière Salée", trigram: "SRS", commune: "Rivière-Salée", antenna: "IA2", referenceOrganization: "DANZ" },
  { name: "Village Caritan", trigram: "VVF", commune: "Sainte-Anne", antenna: "Logement", referenceOrganization: "IGESA" },
]);

export const PENALTY_POLICIES = Object.freeze({
  late_document: { rateCents: 5000, unit: "day", label: "Document contractuel en retard" },
  late_visit_notice: { rateCents: 10000, unit: "day", label: "Préavis de visite en retard" },
  missed_on_call: { rateCents: 30000, unit: "hour", label: "Astreinte non respectée" },
  late_corrective: { rateCents: 5000, unit: "day", label: "Correctif en retard" },
  late_p0_preventive: { rateCents: 50000, unit: "day", label: "Préventif P0 en retard" },
  p0_downtime: { rateCents: 5000, unit: "hour", label: "Indisponibilité P0" },
});

export const STANDARD_MAINTENANCE_PLANS = Object.freeze([
  {
    technicalSection: "ST1", equipmentType: "climatisation",
    name: "Préventif climatisation et groupes froids", periodicityMonths: 6,
    checklist: [
      "Consigner l'installation et sécuriser la zone",
      "Contrôler températures hydrauliques et frigorifiques, pressions HP/BP et pressostats",
      "Contrôler circuits hydrauliques, pertes de charge, antigel et approches échangeurs",
      "Contrôler batteries, condensats, pompes de relevage, courroies et silentblocs",
      "Contrôler moteurs, compresseurs, ventilateurs, intensités, tensions et isolements",
      "Nettoyer et détartrer condenseurs et évaporateurs, traiter ou remplacer les filtres",
      "Contrôler déshydrateurs, voyants liquides, commandes, sécurités et programmation",
      "Relever les paramètres, analyser les dérives et mettre à jour le livret de climatisation",
    ],
  },
  {
    technicalSection: "ST2", equipmentType: "ventilation",
    name: "Préventif ventilation et hottes", periodicityMonths: 6,
    checklist: [
      "Contrôler débits, sens de rotation et vibrations",
      "Contrôler bouches, VMC, gaines, moteurs, centrales d'aspiration et CTA",
      "Protéger la zone puis vérifier l'étanchéité et ouvrir les trappes de visite",
      "Dégraisser hottes, gaines, extracteurs, turbines, filtres, murs, sols et caniveaux",
      "Désinfecter selon les produits et normes applicables puis récupérer les déchets",
      "Rincer, remonter les filtres et remettre l'installation en état de fonctionnement",
    ],
  },
  {
    technicalSection: "ST3", equipmentType: "gaz et pression",
    name: "Préventif gaz, équipements sous pression et compresseurs", periodicityMonths: 12,
    checklist: [
      "Vérifier la marche des équipements de sécurité et l'étanchéité globale du réseau gaz",
      "Contrôler les vannes de sécurité, le détendeur, les organes de coupure et la signalétique",
      "Nettoyer les filtres et remettre les réseaux GPL en service",
      "Contrôler production, stockage et distribution d'air comprimé jusqu'aux points de puisage",
      "Contrôler puissance, commande électrique, cuves, ballons et réservoirs",
      "Tracer les non-conformités, mesures, photos et directives dans le rapport de visite",
    ],
  },
]);

export const STANDARD_FRANCHISE_RULES = Object.freeze([
  { technicalSection: "ST1", equipmentType: "groupe froid", label: "Franchise groupes froids", amountCents: 150_000 },
  { technicalSection: "ST1", equipmentType: "climat", label: "Franchise climatiseurs et déshumidificateurs", amountCents: 50_000 },
  { technicalSection: "ST1", equipmentType: null, label: "Franchise autres équipements ST1", amountCents: 10_000 },
  { technicalSection: "ST2", equipmentType: "hotte", label: "Franchise hottes de cuisine", amountCents: 30_000 },
  { technicalSection: "ST2", equipmentType: "cta", label: "Franchise CTA", amountCents: 30_000 },
  { technicalSection: "ST2", equipmentType: null, label: "Franchise autres équipements ST2", amountCents: 10_000 },
  { technicalSection: "ST3", equipmentType: "gaz", label: "Franchise équipements gaz", amountCents: 30_000 },
  { technicalSection: "ST3", equipmentType: "compresseur", label: "Franchise compresseurs", amountCents: 30_000 },
]);

const TRANSITIONS = Object.freeze({
  reported: ["triaged", "assigned", "cancelled"],
  triaged: ["assigned", "cancelled"],
  assigned: ["acknowledged", "en_route", "cancelled"],
  acknowledged: ["en_route", "on_site", "waiting_parts", "cancelled"],
  en_route: ["on_site", "waiting_parts", "cancelled"],
  on_site: ["waiting_parts", "restored", "cancelled"],
  waiting_parts: ["assigned", "en_route", "on_site", "restored", "cancelled"],
  restored: ["completed", "on_site"],
  completed: [],
  cancelled: [],
});

export function assertTransition(from, to) {
  if (!GMAO_WORK_ORDER_STATUSES.includes(to)) throw new Error(`Statut GMAO invalide : ${to}`);
  if (from === to) return true;
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw new Error(`Transition GMAO interdite : ${from} → ${to}`);
  }
  return true;
}

const QUOTE_TRANSITIONS = Object.freeze({
  draft: ["sent"],
  sent: ["accepted", "rejected"],
  accepted: ["purchase_order_received"],
  purchase_order_received: [],
  rejected: [],
});

export function assertQuoteTransition(from, to, purchaseOrder = null) {
  if (from !== to && !(QUOTE_TRANSITIONS[from] || []).includes(to)) {
    throw new Error(`Transition de devis interdite : ${from} → ${to}`);
  }
  if (to === "purchase_order_received" && !String(purchaseOrder || "").trim()) {
    throw new Error("La référence du bon de commande est obligatoire.");
  }
  return true;
}

export function workOrderSchedule(priority, reportedAt = Date.now()) {
  const normalized = GMAO_PRIORITIES.includes(priority) ? priority : "P2";
  const policy = SLA_POLICIES[normalized];
  const interventionDueAt = policy.interventionHours == null
    ? null : reportedAt + policy.interventionHours * 3_600_000;
  const restorationDueAt = policy.restorationHours == null || interventionDueAt == null
    ? null : interventionDueAt + policy.restorationHours * 3_600_000;
  const maxUnavailabilityAt = policy.maxDowntimeHours == null
    ? null : reportedAt + policy.maxDowntimeHours * 3_600_000;
  return { priority: normalized, onCall: policy.onCall, interventionDueAt, restorationDueAt, maxUnavailabilityAt };
}

export function validateCompletion(workOrder, evidence = {}) {
  const errors = [];
  if (!workOrder?.restoredAt && workOrder?.status !== "restored") {
    errors.push("Le service doit être rétabli avant la clôture.");
  }
  if (!String(evidence.notes || workOrder?.result?.notes || "").trim()) {
    errors.push("Un compte-rendu d'intervention est obligatoire.");
  }
  const photos = evidence.photoRefs || evidence.photoUrls || workOrder?.result?.photoRefs || [];
  if ((workOrder?.evidenceRequirements || []).includes("photo") && (!Array.isArray(photos) || photos.length === 0)) {
    errors.push("Au moins une preuve photo est obligatoire.");
  }
  if (evidence.serviceAcceptance !== true && workOrder?.serviceAcceptance !== true) {
    errors.push("La validation du service fait est obligatoire.");
  }
  return { ok: errors.length === 0, errors };
}

export function calculateQuote(input = {}) {
  const partsCents = cents(input.partsCents ?? input.parts);
  const laborCents = cents(input.laborCents ?? input.labor);
  const travelCents = cents(input.travelCents ?? input.travel);
  const accessCents = cents(input.accessCents ?? input.access);
  const franchiseCents = cents(input.franchiseCents ?? input.franchise);
  const coefficient = Math.max(0, finite(input.coefficient, 1));
  const vatRate = Math.max(0, finite(input.vatRate, 8.5));
  const quoteType = input.quoteType || "outside_bpu";
  let chargeablePartsCents = partsCents;
  let partsAfterCoefficientCents = partsCents;
  let subtotalCents;
  if (quoteType === "outside_bpu") {
    // Contract rule: below the applicable franchise the entire corrective
    // intervention is included. Above it, only the excess part × K is billed;
    // labour, travel and access are already included in the prestation.
    chargeablePartsCents = Math.max(0, partsCents - franchiseCents);
    partsAfterCoefficientCents = Math.round(chargeablePartsCents * coefficient);
    subtotalCents = partsCents <= franchiseCents ? 0 : partsAfterCoefficientCents;
  } else if (quoteType === "improvement") {
    chargeablePartsCents = partsCents;
    partsAfterCoefficientCents = Math.round(partsCents * coefficient);
    subtotalCents = partsAfterCoefficientCents + laborCents + travelCents + accessCents;
  } else {
    subtotalCents = partsCents + laborCents + travelCents + accessCents;
  }
  const vatCents = Math.round(subtotalCents * vatRate / 100);
  return {
    quoteType, partsCents, laborCents, travelCents, accessCents, franchiseCents,
    coefficient, chargeablePartsCents, partsAfterCoefficientCents, subtotalCents, vatRate, vatCents,
    totalCents: subtotalCents + vatCents,
  };
}

export function evaluateWorkOrderSla(workOrder, now = Date.now()) {
  const status = workOrder.status;
  if (status === "cancelled") return { interventionLateMs: 0, restorationLateMs: 0, penalties: [] };
  const terminalReference = workOrder.completedAt || now;
  const interventionReference = workOrder.interventionStartedAt || terminalReference;
  const restorationReference = workOrder.restoredAt || terminalReference;
  const interventionLateMs = workOrder.interventionDueAt
    ? Math.max(0, interventionReference - workOrder.interventionDueAt) : 0;
  const restorationLateMs = workOrder.restorationDueAt
    ? Math.max(0, restorationReference - workOrder.restorationDueAt) : 0;
  const penalties = [];
  if (interventionLateMs > 0) {
    if (workOrder.type === "preventive" && workOrder.priority === "P0") {
      penalties.push(makePenalty("late_p0_preventive", interventionLateMs));
    } else if (workOrder.onCall) {
      penalties.push(makePenalty("missed_on_call", interventionLateMs));
    }
  }
  if (workOrder.type === "corrective" && restorationLateMs > 0) {
    penalties.push(makePenalty("late_corrective", restorationLateMs));
  }
  if (workOrder.priority === "P0" && restorationLateMs > 0) {
    penalties.push(makePenalty("p0_downtime", restorationLateMs));
  }
  return { interventionLateMs, restorationLateMs, penalties };
}

export function evaluateComplianceSla(record, now = Date.now()) {
  if (!record?.validUntil || record.validUntil >= now || record.status === "valid") return [];
  const type = String(record.recordType || "").toUpperCase();
  if (type === "VISIT_NOTICE") return [makePenalty("late_visit_notice", now - record.validUntil)];
  if (["DOCUMENT_DUE", "CONTRACT_DOCUMENT"].includes(type)) return [makePenalty("late_document", now - record.validUntil)];
  return [];
}

export function complianceStatus(record, now = Date.now()) {
  if (["rejected", "missing", "expired"].includes(record?.status)) return record.status;
  if (record?.validUntil && record.validUntil < now) return "expired";
  if (record?.validUntil && record.validUntil - now <= 30 * 86_400_000) return "expiring";
  return record?.status === "valid" ? "valid" : "pending";
}

export function deterministicDocumentFilename(input = {}) {
  const date = normalizeDate(input.date || Date.now());
  const tokens = [
    input.g2dNumber || input.propertyNumber || "IMMEUBLE",
    input.siteTrigram || "SITE",
    input.buildingCode || "BATIMENT",
    input.domainCode || "GMAO",
    input.periodicity || "PONCTUEL",
    date.slice(0, 4), date.slice(4, 6), date.slice(6, 8),
    input.conformity === false ? "NC" : "C",
  ].map(slug).filter(Boolean);
  const ext = String(input.ext || "pdf").replace(/^\./, "").toLowerCase();
  return `${tokens.join("_")}.${slug(ext).toLowerCase() || "pdf"}`;
}

export function workOrderNumber(sequence, at = Date.now()) {
  const d = new Date(at);
  return `OT-${d.getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export function quoteNumber(sequence, at = Date.now()) {
  const d = new Date(at);
  return `DEV-${d.getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export function rowsToCsv(headers, rows, delimiter = ";") {
  const keys = Object.keys(headers);
  const lines = [keys.map((key) => csvCell(headers[key], delimiter)).join(delimiter)];
  for (const row of rows || []) {
    lines.push(keys.map((key) => csvCell(row?.[key] ?? "", delimiter)).join(delimiter));
  }
  // UTF-8 BOM keeps accents intact when opened directly in Excel.
  return `\uFEFF${lines.join("\r\n")}`;
}

function makePenalty(key, lateMs) {
  const policy = PENALTY_POLICIES[key];
  const divisor = policy.unit === "hour" ? 3_600_000 : 86_400_000;
  const quantity = Math.max(1, Math.ceil(lateMs / divisor));
  return { key, ...policy, quantity, amountCents: quantity * policy.rateCents };
}

function csvCell(value, delimiter) {
  const str = String(value ?? "");
  return str.includes(delimiter) || /["\r\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function cents(value) {
  const n = finite(value, 0);
  return Math.max(0, Math.round(n));
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "DATE";
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function slug(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
