/** Pure, deterministic assistance used before optional local-LLM enrichment. */

const DOCUMENT_PATTERNS = Object.freeze({
  work_order: [/ordre d['’ ]intervention/i, /\b(?:oi|ot)[ _:#-]*\d{4,}\b/i, /statut\s+oi/i],
  attachment_sheet: [/feuille d['’ ]attachement/i, /signature technicien/i, /date d['’ ]arriv[ée]e/i],
  supplier_proforma: [/\bpro\s?forma\b/i, /fournisseur/i],
  quote: [/\bdevis\b/i, /validit[ée]\s*:/i, /bon pour accord/i],
  purchase_order: [/bon de commande/i, /\bbc\s*(?:n[°o]|#)/i],
  service_acceptance: [/service fait/i, /\bsf\s*(?:n[°o]|#|:)/i],
  invoice: [/\bfacture\b/i, /total\s+ttc/i, /date d['’ ][ée]mission/i],
});

export function classifyGmaoDocument(input = {}) {
  const text = `${input.filename || ""}\n${input.text || ""}`.replace(/\s+/g, " ").trim();
  const scores = Object.entries(DOCUMENT_PATTERNS).map(([type, patterns]) => ({
    type,
    matches: patterns.filter((pattern) => pattern.test(text)).length,
    total: patterns.length,
  })).sort((a, b) => b.matches - a.matches || b.total - a.total);
  const winner = scores[0];
  const documentType = winner?.matches ? winner.type : "unknown";
  const confidence = winner?.matches ? Math.min(0.98, 0.45 + winner.matches / winner.total * 0.5) : 0.15;
  const extracted = extractDocumentFields(text, documentType);
  return {
    documentType,
    confidence: round(confidence),
    extracted,
    evidence: scores.filter((item) => item.matches > 0),
    needsReview: confidence < 0.82 || documentType === "unknown",
  };
}

export function extractDocumentFields(text, documentType = "unknown") {
  const source = String(text || "");
  const field = (patterns) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  };
  const amount = (label) => {
    const value = field([new RegExp(`${label}[^\\d]{0,20}([\\d .]+(?:,\\d{2})?)\\s*€`, "i")]);
    if (!value) return null;
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    return Number.isFinite(Number(normalized)) ? Math.round(Number(normalized) * 100) : null;
  };
  return {
    documentType,
    clientOiNumber: field([/\bN[°o]\s*(?:OI)?\s*[:#-]?\s*([A-Z0-9/-]{5,})/i, /\bOI[_ :#-]+([A-Z0-9/-]{5,})/i]),
    quoteNumber: field([/devis\s*(?:n[°o]|#)?\s*[:#-]?\s*([A-Z0-9/-]{5,})/i]),
    purchaseOrder: field([/bon de commande\s*(?:n[°o]|#)?\s*[:#-]?\s*([A-Z0-9/-]{3,})/i]),
    serviceAcceptanceReference: field([/(?:service fait|\bSF)\s*(?:n[°o]|#)?\s*[:#-]?\s*([A-Z0-9/-]{3,})/i]),
    invoiceNumber: field([/facture\s*(?:n[°o]|#)?\s*[:#-]?\s*([A-Z0-9/-]{3,})/i]),
    siteTrigram: field([/\bsite\s*[:#-]?\s*([A-Z]{2,5})\b/i]),
    buildingCode: field([/\b(?:b[aâ]timent|composant)\s*[:#-]?\s*([A-Z0-9]{3,12})/i]),
    equipmentNumber: field([/n(?:um[ée]ro|[°o])\s*(?:de l['’ ]?)?[ée]quipement\s*[:#-]?\s*([A-Z0-9/-]{3,})/i]),
    requester: field([/(?:demandeur|client|raison sociale)\s*[:#-]?\s*([^\n;]{3,80})/i]),
    totalHtCents: amount("total\\s*h\\.?t\\.?"),
    totalTtcCents: amount("total\\s*ttc"),
  };
}

export function recommendWorkOrderTriage(input = {}) {
  const text = `${input.title || ""} ${input.description || ""} ${input.extractedText || ""}`.toLowerCase();
  const rules = [
    { priority: "P0", confidence: 0.94, words: ["danger", "arrêt total", "vital", "plus de froid", "indisponibilité totale", "gaz détecté", "fuite gaz"] },
    { priority: "P1", confidence: 0.87, words: ["alarme", "bloquant", "température haute", "service dégradé", "important", "fuite fluide"] },
    { priority: "P3", confidence: 0.72, words: ["non urgent", "confort", "bruit léger", "esthétique", "à surveiller"] },
  ];
  const hit = rules.find((rule) => rule.words.some((word) => text.includes(word)));
  const priority = hit?.priority || input.assetCriticality || "P2";
  const matchedWords = hit?.words.filter((word) => text.includes(word)) || [];
  return {
    priority,
    confidence: hit?.confidence || (input.assetCriticality ? 0.78 : 0.62),
    rationale: matchedWords.length
      ? `Termes détectés : ${matchedWords.join(", ")}.`
      : input.assetCriticality ? `Criticité de l'équipement : ${input.assetCriticality}.` : "Aucun signal d'urgence explicite, priorité normale proposée.",
    requiresHumanReview: priority === "P0" || (hit?.confidence || 0) < 0.8,
  };
}

export function scoreTechnicianCandidate(candidate = {}, context = {}) {
  const required = new Set((context.requiredSkills || []).map(normalize));
  const actual = new Set((candidate.skills || []).map(normalize));
  const matched = [...required].filter((skill) => actual.has(skill)).length;
  const skillScore = required.size ? matched / required.size : 1;
  const availabilityScore = candidate.available === false ? 0 : 1;
  const distanceKm = Math.max(0, Number(candidate.distanceKm || 0));
  const distanceScore = Math.max(0, 1 - distanceKm / 100);
  const loadScore = Math.max(0, 1 - Math.max(0, Number(candidate.openWorkOrders || 0)) / 10);
  const onCallScore = context.onCallRequired ? (candidate.onCall ? 1 : 0) : 1;
  const score = skillScore * 0.4 + availabilityScore * 0.25 + distanceScore * 0.15 + loadScore * 0.1 + onCallScore * 0.1;
  return {
    candidateId: candidate.id,
    score: round(score),
    explanation: { skillScore: round(skillScore), availabilityScore, distanceScore: round(distanceScore), loadScore: round(loadScore), onCallScore },
  };
}

export function campaignForDate(value = Date.now()) {
  const date = new Date(value);
  const first = date.getUTCMonth() < 6;
  return { campaign: first ? "C1" : "C2", color: first ? "ROUGE" : "VERT" };
}

export function evaluateAssetRisk(input = {}) {
  const rawCondition = Number(input.condition);
  const condition = String(input.condition) === "out_of_service" ? 3
    : Math.max(1, Math.min(3, Number.isFinite(rawCondition) ? rawCondition : 1));
  const corrective90d = Math.max(0, Number(input.corrective90d || 0));
  const unresolved90d = Math.max(0, Number(input.unresolved90d || 0));
  const severeSignals = Math.max(0, Number(input.severeSignals || 0));
  const overdueDays = Math.max(0, Number(input.preventiveOverdueDays || 0));
  const penalty = (condition - 1) * 18 + corrective90d * 8 + unresolved90d * 12 + severeSignals * 15 + Math.min(25, overdueDays / 4);
  const healthScore = Math.max(0, Math.round(100 - penalty));
  const risk = healthScore < 40 ? "critical" : healthScore < 65 ? "high" : healthScore < 82 ? "medium" : "low";
  return {
    healthScore,
    risk,
    rationale: `État ${condition}, ${corrective90d} correctif(s) sur 90 jours, ${unresolved90d} non résolu(s), ${severeSignals} signal(aux) sévère(s), ${Math.round(overdueDays)} jour(s) de retard préventif.`,
  };
}

export function reconcileBilling(input = {}) {
  const issues = [];
  if (!input.serviceAcceptanceReference) issues.push("Service fait absent");
  if (input.quoteRequired && !input.purchaseOrder) issues.push("Bon de commande absent");
  if (input.quoteRequired && !input.quoteTotalCents) issues.push("Montant du devis absent");
  if (input.invoiceTotalCents == null) issues.push("Montant de facture absent");
  if (input.quoteTotalCents != null && input.invoiceTotalCents != null && input.quoteTotalCents !== input.invoiceTotalCents) {
    issues.push(`Écart devis/facture de ${input.invoiceTotalCents - input.quoteTotalCents} centimes`);
  }
  return { ok: issues.length === 0, issues };
}

export function nextBestAction(workOrder = {}, context = {}) {
  if (workOrder.status === "reported") return action("Confirmer la réception", "gmao.transitionWorkOrder", "high", "L'OI client attend sa prise en charge.");
  if (workOrder.status === "triaged" && !workOrder.scheduledAt) return action("Programmer l'intervention", "field.prepareWorkOrder", "high", "Aucune date d'intervention n'est enregistrée.");
  if (workOrder.status === "waiting_parts" && workOrder.repairMode === "with_quote") {
    if (!context.quote) return action("Préparer le devis", "gmao.createQuote", "high", "La réparation nécessite un devis.");
    if (context.quote.status === "draft") return action("Envoyer le devis", "gmao.updateQuote", "high", "Le devis reste en brouillon.");
    if (context.quote.status === "sent") return action("Relancer l'approbation client", "gmao.notifyClient", "normal", "Le devis attend l'approbation du client.");
    if (context.quote.status === "accepted") return action("Enregistrer le bon de commande", "gmao.updateQuote", "high", "Le client a approuvé le devis, le bon de commande manque.");
  }
  if (workOrder.status === "restored") return action("Obtenir le service fait", "gmao.recordServiceAcceptance", "high", "L'intervention est terminée mais le SF client manque.");
  if (workOrder.billingStatus === "ready_to_invoice") return action("Créer la facture", "gmao.saveInvoice", "high", "Le service fait rend l'OI facturable.");
  if (workOrder.billingStatus === "invoice_draft") return action("Envoyer la facture", "gmao.saveInvoice", "normal", "La facture est prête mais non envoyée.");
  return null;
}

function action(title, proposedAction, priority, rationale) {
  return { title, proposedAction, priority, rationale, confidence: 0.96 };
}
function normalize(value) { return String(value || "").trim().toLowerCase(); }
function round(value) { return Math.round(value * 1000) / 1000; }
