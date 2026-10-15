import test from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_FRANCHISE_RULES,
  assertQuoteTransition,
  assertTransition,
  calculateQuote,
  complianceStatus,
  deterministicDocumentFilename,
  evaluateComplianceSla,
  evaluateWorkOrderSla,
  rowsToCsv,
  validateCompletion,
  workOrderSchedule,
} from "../src/services/company/gmaoDomain.js";
import {
  campaignForDate,
  classifyGmaoDocument,
  evaluateAssetRisk,
  nextBestAction,
  reconcileBilling,
  recommendWorkOrderTriage,
  scoreTechnicianCandidate,
} from "../src/services/company/gmaoIntelligence.js";
import { routeGoalToRole } from "../src/services/company/charter.js";
import { applyTemplate } from "../src/services/company/templates.js";

test("P0 calcule un DI de 4 h puis un DRS de 4 h", () => {
  const at = Date.UTC(2026, 8, 11, 8);
  const result = workOrderSchedule("P0", at);
  assert.equal(result.interventionDueAt, at + 4 * 3_600_000);
  assert.equal(result.restorationDueAt, at + 8 * 3_600_000);
  assert.equal(result.onCall, true);
});

test("le correctif hors BPU facture uniquement le dépassement de franchise multiplié par K", () => {
  const quote = calculateQuote({
    partsCents: 10_000,
    laborCents: 5_000,
    travelCents: 2_000,
    accessCents: 1_000,
    coefficient: 1.2,
    franchiseCents: 1_600,
    vatRate: 8.5,
  });
  assert.equal(quote.subtotalCents, 10_080);
  assert.equal(quote.vatCents, 857);
  assert.equal(quote.totalCents, 10_937);
});

test("un correctif sous franchise est intégralement inclus", () => {
  const quote = calculateQuote({ quoteType: "outside_bpu", partsCents: 9_000, franchiseCents: 10_000, coefficient: 1.3, laborCents: 50_000 });
  assert.equal(quote.totalCents, 0);
});

test("un amélioratif conserve main-d'œuvre, déplacement et accès", () => {
  const quote = calculateQuote({ quoteType: "improvement", partsCents: 10_000, laborCents: 5_000, travelCents: 2_000, accessCents: 1_000, coefficient: 1.2, vatRate: 0 });
  assert.equal(quote.subtotalCents, 20_000);
});

test("les franchises ST1, ST2 et ST3 reprennent les seuils contractuels", () => {
  const rules = Object.fromEntries(STANDARD_FRANCHISE_RULES.map((rule) => [
    `${rule.technicalSection}:${rule.equipmentType || "autre"}`,
    rule.amountCents,
  ]));
  assert.deepEqual(rules, {
    "ST1:groupe froid": 150_000,
    "ST1:climat": 50_000,
    "ST1:autre": 10_000,
    "ST2:hotte": 30_000,
    "ST2:cta": 30_000,
    "ST2:autre": 10_000,
    "ST3:gaz": 30_000,
    "ST3:compresseur": 30_000,
  });
});

test("la clôture impose rétablissement, compte-rendu, photo si exigée et accord client", () => {
  const workOrder = { status: "restored", restoredAt: Date.now(), serviceAcceptance: false, evidenceRequirements:["photo"] };
  assert.equal(validateCompletion(workOrder, { notes: "RAS", photoRefs: ["preuve.jpg"], serviceAcceptance: true }).ok, true);
  const invalid = validateCompletion(workOrder, { notes: "", photoRefs: [], serviceAcceptance: false });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.length, 3);
});

test("les transitions sautées sont refusées", () => {
  assert.throws(() => assertTransition("reported", "completed"), /interdite/i);
  assert.doesNotThrow(() => assertTransition("on_site", "restored"));
});

test("le devis attend l'approbation puis un bon de commande avant replanification", () => {
  assert.doesNotThrow(() => assertQuoteTransition("draft", "sent"));
  assert.doesNotThrow(() => assertQuoteTransition("sent", "accepted"));
  assert.throws(() => assertQuoteTransition("accepted", "purchase_order_received"), /bon de commande/i);
  assert.doesNotThrow(() => assertQuoteTransition("accepted", "purchase_order_received", "BC-2026-0042"));
  assert.throws(() => assertQuoteTransition("sent", "purchase_order_received", "BC-2026-0042"), /interdite/i);
});

test("le dépassement P0 chiffre astreinte et indisponibilité", () => {
  const at = Date.UTC(2026, 8, 11, 8);
  const schedule = workOrderSchedule("P0", at);
  const result = evaluateWorkOrderSla({
    status: "on_site", type: "corrective", priority: "P0", onCall: true,
    interventionDueAt: schedule.interventionDueAt,
    restorationDueAt: schedule.restorationDueAt,
  }, at + 10 * 3_600_000);
  assert.deepEqual(result.penalties.map((item) => item.key), ["missed_on_call", "late_corrective", "p0_downtime"]);
  assert.equal(result.penalties[0].amountCents, 6 * 30_000);
  assert.equal(result.penalties[1].amountCents, 5_000);
});

test("un correctif P2 ne compte qu'une fois la pénalité journalière", () => {
  const at = Date.UTC(2026, 8, 11, 8);
  const schedule = workOrderSchedule("P2", at);
  const result = evaluateWorkOrderSla({
    status: "on_site", type: "corrective", priority: "P2", onCall: false,
    interventionDueAt: schedule.interventionDueAt,
    restorationDueAt: schedule.restorationDueAt,
  }, schedule.restorationDueAt + 3_600_000);
  assert.deepEqual(result.penalties.map((item) => item.key), ["late_corrective"]);
  assert.equal(result.penalties[0].amountCents, 5_000);
});

test("les retards documentaires reprennent les barèmes du marché", () => {
  const now = Date.UTC(2026, 8, 11, 12);
  const visit = evaluateComplianceSla({ recordType: "VISIT_NOTICE", status: "pending", validUntil: now - 2 * 86_400_000 }, now);
  const document = evaluateComplianceSla({ recordType: "DOCUMENT_DUE", status: "pending", validUntil: now - 3 * 86_400_000 }, now);
  assert.equal(visit[0].amountCents, 2 * 10_000);
  assert.equal(document[0].amountCents, 3 * 5_000);
});

test("le nom documentaire est déterministe et normalisé", () => {
  const filename = deterministicDocumentFilename({
    buildingCode: "Bât. A", siteTrigram: "FDF", buildingName: "Cuisine centrale",
    domainCode: "HOT", periodicity: "semestriel", date: Date.UTC(2026, 8, 11), conformity: false, ext: "PDF",
  });
  assert.equal(filename, "IMMEUBLE_FDF_BAT-A_HOT_SEMESTRIEL_2026_09_11_NC.pdf");
});

test("l'IA locale classe une OI et extrait sa référence", () => {
  const result = classifyGmaoDocument({ filename: "OI.pdf", text: "Ordre d'intervention N° OI : OI-2026-00452 Statut OI" });
  assert.equal(result.documentType, "work_order");
  assert.equal(result.extracted.clientOiNumber, "OI-2026-00452");
  assert.ok(result.confidence >= 0.8);
});

test("le triage détecte une urgence gaz avec revue humaine", () => {
  const result = recommendWorkOrderTriage({ title: "Fuite gaz détectée" });
  assert.equal(result.priority, "P0");
  assert.equal(result.requiresHumanReview, true);
});

test("l'ordonnancement explicite compétences et astreinte", () => {
  const qualified = scoreTechnicianCandidate({ id: "a", skills: ["st3", "reg"], available: true, distanceKm: 5, openWorkOrders: 1, onCall: true }, { requiredSkills: ["ST3", "REG"], onCallRequired: true });
  const unavailable = scoreTechnicianCandidate({ id: "b", skills: ["st3"], available: false, distanceKm: 5, openWorkOrders: 1, onCall: false }, { requiredSkills: ["ST3", "REG"], onCallRequired: true });
  assert.ok(qualified.score > unavailable.score);
  assert.equal(qualified.explanation.skillScore, 1);
});

test("les campagnes suivent les semestres rouge puis vert", () => {
  assert.deepEqual(campaignForDate(Date.UTC(2026, 0, 15)), { campaign: "C1", color: "ROUGE" });
  assert.deepEqual(campaignForDate(Date.UTC(2026, 6, 1)), { campaign: "C2", color: "VERT" });
});

test("la santé équipement combine état, récurrence, signaux et retard", () => {
  const risk = evaluateAssetRisk({ condition: 3, corrective90d: 4, unresolved90d: 2, severeSignals: 1, preventiveOverdueDays: 60 });
  assert.equal(risk.risk, "critical");
  assert.ok(risk.healthScore < 40);
});

test("le rapprochement bloque une facture sans SF et avec écart", () => {
  const result = reconcileBilling({ quoteRequired: true, purchaseOrder: "BC-1", quoteTotalCents: 1000, invoiceTotalCents: 1200 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("Service fait")));
  assert.ok(result.issues.some((issue) => issue.includes("Écart")));
});

test("l'agent propose la prochaine action sans l'exécuter", () => {
  const result = nextBestAction({ status: "reported", workOrderNumber: "OT-1" });
  assert.equal(result.proposedAction, "gmao.transitionWorkOrder");
  assert.equal(result.confidence, 0.96);
});

test("la conformité distingue valide, à échéance et expirée", () => {
  const now = Date.UTC(2026, 8, 11);
  assert.equal(complianceStatus({ status: "valid", validUntil: now + 40 * 86_400_000 }, now), "valid");
  assert.equal(complianceStatus({ status: "valid", validUntil: now + 10 * 86_400_000 }, now), "expiring");
  assert.equal(complianceStatus({ status: "valid", validUntil: now - 1 }, now), "expired");
});

test("l'export CSV reste lisible par Excel et protège les séparateurs", () => {
  const csv = rowsToCsv({ site: "Site", note: "Commentaire" }, [{ site: "FDF", note: "filtre; remplacé" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"filtre; remplacé"/);
});

test("le modèle HVAC actif conserve ses rôles et compétences GMAO locales", () => {
  const { draft, requiredSkills } = applyTemplate("hvac_residential", { businessName: "Clima 972" }, { demoMode: false });
  assert.ok(requiredSkills.includes("skill.gmao_maintenance"));
  assert.ok(draft.roles.MaintenancePlanner.grantedSkills.includes("skill.gmao_maintenance"));
  assert.ok(draft.roles.DispatchCoordinator.grantedSkills.includes("skill.field_coordination"));
  assert.ok(draft.roles.FieldTech.grantedSkills.includes("skill.gmao_maintenance"));
  assert.equal(draft.rules.currency, "EUR");
});

test("les objectifs français sont routés vers le bon métier", () => {
  assert.equal(routeGoalToRole({ directive: "Générer le préventif" }), "MaintenancePlanner");
  assert.equal(routeGoalToRole({ directive: "Contrôler les SLA P0" }), "MaintenanceContractManager");
  assert.equal(routeGoalToRole({ directive: "Vérifier les CPR" }), "QHSEManager");
  assert.equal(routeGoalToRole({ directive: "Préparer le registre" }), "DocumentController");
});
