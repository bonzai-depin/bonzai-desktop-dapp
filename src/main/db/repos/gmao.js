/** Local-first HVAC GMAO repository. Main process only. */


import { calculateGasContractQuote, gasProfileApplies } from "../../../services/company/gmaoProcess.js";
import { calculateContractQuote } from '../../../services/company/contractPricing.js';
import * as localBlobs from "../blobs.js";
import { operationsSnapshot } from "./gmaoOperations.js";
import { owned, scopeInput, validateSchedule } from "./gmaoIntegrity.js";
import { assertDispatch, assertCompletion, assertScheduleChange, policyFor, fieldDetails } from "./gmaoMaintenance.js";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import * as purchasingTeams from "./teamCommunication.js";
import {
  STANDARD_MAINTENANCE_PLANS,
  STANDARD_FRANCHISE_RULES,
  GMAO_REFERENCE_SITES,
  assertQuoteTransition,
  assertTransition,
  calculateQuote as calculateQuoteDomain,
  complianceStatus,
  deterministicDocumentFilename,
  evaluateComplianceSla,
  evaluateWorkOrderSla,
  quoteNumber,
  rowsToCsv,
  validateCompletion,
  workOrderNumber,
  workOrderSchedule,
} from "../../../services/company/gmaoDomain.js";
import {
  campaignForDate,
  classifyGmaoDocument,
  evaluateAssetRisk,
  nextBestAction,
  recommendWorkOrderTriage,
  reconcileBilling,
  scoreTechnicianCandidate,
} from "../../../services/company/gmaoIntelligence.js";

const JSON_FIELDS = new Set([
  "items",
  "details",
  "config",
  "metadata",
  "checklist",
  "evidenceRequirements",
  "result",
  "cost",
  "contact",
  "personnel",
  "calculation",
  "evidence",
  "measurements",
  "partsUsed",
  "photoRefs",
  "extractedData",
  "sourceData",
  "actions",
]);
function evidenceRequirements(wo) {
  const plan = wo.maintenancePlanId ? get().db.prepare('SELECT evidence_requirements FROM gmao_maintenance_plans WHERE id=? AND company_id=?').get(wo.maintenancePlanId,wo.companyId) : null;
  return plan?.evidence_requirements ? JSON.parse(plan.evidence_requirements) : [];
}
const BOOL_FIELDS = new Set([
  "obligationOfResult",
  "active",
  "operational",
  "onCall",
  "serviceAcceptance",
  "declared",
  "paymentApproved",
  "included",
  "resolved",
  "repairRequired",
]);

export function bootstrap(companyId, input = {}) {
  const { db } = get();
  const existing = db
    .prepare("SELECT * FROM gmao_contracts WHERE company_id = ?")
    .get(companyId);
  if (existing) {
    return contractRow(existing);
  }
  const now = Date.now();
  const id = uuid();
  const contract = {
    id,
    companyId,
    name: input.name || "Paramètres maintenance",
    marketNumber: input.marketNumber ?? null,
    lotNumber: input.lotNumber ?? null,
    engagementNumber: input.engagementNumber ?? null,
    holderName: input.holderName ?? null,
    department: input.department || "",
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    renewalType: input.renewalType || "annual",
    obligationOfResult: input.obligationOfResult === true ? 1 : 0,
    emergencyPhone: input.emergencyPhone ?? null,
    timezone: input.timezone || "UTC",
    currency: input.currency || "EUR",
    vatRate: finite(input.vatRate, 0),
    status: input.status || "active",
    clientContactName: input.clientContactName ?? null,
    clientEmail: input.clientEmail ?? null,
    clientPhone: input.clientPhone ?? null,
    config: JSON.stringify({ ...(input.config || {}) }),
    createdAt: now,
    updatedAt: now,
  };
  const insertContract = db.prepare(`
    INSERT INTO gmao_contracts (
      id, company_id, name, market_number, lot_number, engagement_number, holder_name,
      department, starts_at, ends_at, renewal_type, obligation_of_result,
      emergency_phone, timezone, currency, vat_rate, status, client_contact_name,
      client_email, client_phone, config, created_at, updated_at
    ) VALUES (
      @id, @companyId, @name, @marketNumber, @lotNumber, @engagementNumber, @holderName,
      @department, @startsAt, @endsAt, @renewalType, @obligationOfResult,
      @emergencyPhone, @timezone, @currency, @vatRate, @status, @clientContactName,
      @clientEmail, @clientPhone, @config, @createdAt, @updatedAt
    )
  `);
  const insertPlan = db.prepare(`
    INSERT INTO gmao_maintenance_plans (
      id, company_id, asset_id, technical_section, equipment_type, name,
      description, periodicity_months, checklist, evidence_requirements,
      active, next_due_at, last_generated_at, created_at, updated_at
    ) VALUES (
      @id, @companyId, NULL, @technicalSection, @equipmentType, @name,
      @description, @periodicityMonths, @checklist, @evidenceRequirements,
      1, @nextDueAt, NULL, @createdAt, @updatedAt
    )
  `);
  const insertRate = db.prepare(`INSERT INTO gmao_rate_rules (
    id, company_id, label, technical_section, equipment_type, rate_type,
    amount_cents, coefficient, vat_rate, included, effective_from, effective_until,
    metadata, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'franchise', ?, NULL, ?, 1, ?, NULL, ?, ?, ?)`);
  db.transaction(() => {
    insertContract.run(contract);
    for (const plan of input.demoData === true
      ? STANDARD_MAINTENANCE_PLANS
      : []) {
      insertPlan.run({
        id: uuid(),
        companyId,
        technicalSection: plan.technicalSection,
        equipmentType: plan.equipmentType,
        name: plan.name,
        description:
          "Gamme contractuelle standard à adapter au patrimoine réel.",
        periodicityMonths: plan.periodicityMonths,
        checklist: JSON.stringify(plan.checklist),
        evidenceRequirements: JSON.stringify([
          "compte_rendu",
          "photo_avant",
          "photo_apres",
          "mesures",
          "service_fait",
        ]),
        nextDueAt: input.firstPreventiveDueAt ?? addMonths(now, 1),
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const rule of input.demoData === true
      ? STANDARD_FRANCHISE_RULES
      : []) {
      insertRate.run(
        uuid(),
        companyId,
        rule.label,
        rule.technicalSection,
        rule.equipmentType,
        rule.amountCents,
        contract.vatRate,
        now,
        JSON.stringify({ source: "cahier_parametrage" }),
        now,
        now,
      );
    }
    if (input.demoData === true) seedReferenceData(db, companyId, id, now);
  })();
  return contractRow(
    db.prepare("SELECT * FROM gmao_contracts WHERE id = ?").get(id),
  );
}

function seedReferenceData(db, companyId, contractId, now) {
  const insertSite = db.prepare(`INSERT INTO gmao_sites (
    id, company_id, contract_id, name, trigram, department, commune, address,
    kind, scope, exclusions, active, metadata, antenna, reference_organization,
    g2d_number, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, '972', ?, NULL, 'defense', 'ST1, ST2, ST3', NULL, 1,
    ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id, trigram) DO UPDATE SET
    contract_id=excluded.contract_id, antenna=excluded.antenna,
    reference_organization=excluded.reference_organization, updated_at=excluded.updated_at`);
  for (const site of GMAO_REFERENCE_SITES) {
    insertSite.run(
      uuid(),
      companyId,
      contractId,
      site.name,
      site.trigram,
      site.commune,
      JSON.stringify({ source: "marche_25_004_lot_03" }),
      site.antenna,
      site.referenceOrganization,
      site.g2dNumber || null,
      now,
      now,
    );
  }
  const updatePlan =
    db.prepare(`UPDATE gmao_maintenance_plans SET checklist = ?,
    evidence_requirements = ?, updated_at = ? WHERE company_id = ? AND technical_section = ?`);
  for (const plan of STANDARD_MAINTENANCE_PLANS) {
    updatePlan.run(
      JSON.stringify(plan.checklist),
      JSON.stringify([
        "compte_rendu",
        "photo_avant",
        "photo_apres",
        "mesures",
        "service_fait",
        "sticker_campagne",
      ]),
      now,
      companyId,
      plan.technicalSection,
    );
  }
}

export function snapshot(companyId, now = Date.now()) {
  const { db } = get();
  const contract = contractRow(
    db
      .prepare("SELECT * FROM gmao_contracts WHERE company_id = ?")
      .get(companyId),
  );
  const sites = db
    .prepare(
      "SELECT * FROM gmao_sites WHERE company_id = ? ORDER BY active DESC, name",
    )
    .all(companyId)
    .map(siteRow);
  const assets = db
    .prepare(
      "SELECT * FROM gmao_assets WHERE company_id = ? ORDER BY asset_code",
    )
    .all(companyId)
    .map(assetRow);
  const plans = db
    .prepare(
      "SELECT * FROM gmao_maintenance_plans WHERE company_id = ? ORDER BY technical_section, name",
    )
    .all(companyId)
    .map(planRow);
  const workOrders = db
    .prepare(
      "SELECT * FROM gmao_work_orders WHERE company_id = ? ORDER BY reported_at DESC",
    )
    .all(companyId)
    .map(workOrderRow);
  const events = db
    .prepare(
      "SELECT * FROM gmao_work_order_events WHERE company_id = ? ORDER BY happened_at DESC",
    )
    .all(companyId)
    .map(eventRow);
  const documents = db
    .prepare(
      "SELECT * FROM gmao_documents WHERE company_id = ? ORDER BY created_at DESC",
    )
    .all(companyId)
    .map(documentRow);
  const compliance = db
    .prepare(
      "SELECT * FROM gmao_compliance_records WHERE company_id = ? ORDER BY valid_until, created_at DESC",
    )
    .all(companyId)
    .map((row) => {
      const parsed = complianceRow(row);
      return { ...parsed, effectiveStatus: complianceStatus(parsed, now) };
    });
  const subcontractors = db
    .prepare(
      "SELECT * FROM gmao_subcontractors WHERE company_id = ? ORDER BY name",
    )
    .all(companyId)
    .map(subcontractorRow);
  const rates = db
    .prepare(
      "SELECT * FROM gmao_rate_rules WHERE company_id = ? ORDER BY rate_type, label",
    )
    .all(companyId)
    .map(rateRow);
  const quotes = db
    .prepare(
      "SELECT * FROM gmao_quotes WHERE company_id = ? ORDER BY created_at DESC",
    )
    .all(companyId)
    .map(quoteRow);
  const invoices = db
    .prepare(
      "SELECT * FROM gmao_invoices WHERE company_id = ? ORDER BY issued_at DESC",
    )
    .all(companyId)
    .map(invoiceRow);
  const penalties = db
    .prepare(
      "SELECT * FROM gmao_penalties WHERE company_id = ? ORDER BY detected_at DESC",
    )
    .all(companyId)
    .map(penaltyRow);
  const onCall = db
    .prepare(
      "SELECT * FROM gmao_on_call_shifts WHERE company_id = ? ORDER BY starts_at DESC",
    )
    .all(companyId)
    .map(onCallRow);
  const attachmentSheets = db
    .prepare(
      "SELECT * FROM gmao_attachment_sheets WHERE company_id = ? ORDER BY ended_at DESC",
    )
    .all(companyId)
    .map(attachmentSheetRow);
  const procurements = db
    .prepare(
      "SELECT * FROM gmao_procurements WHERE company_id = ? ORDER BY requested_at DESC",
    )
    .all(companyId)
    .map(procurementRow);
  const notifications = db
    .prepare(
      "SELECT n.*, COALESCE(o.status,n.delivery_status) AS delivery_status, COALESCE(o.submitted_at,n.sent_at) AS sent_at FROM gmao_customer_notifications n LEFT JOIN gmao_outbox o ON o.id=json_extract(n.metadata,'$.outboxId') AND o.company_id=n.company_id WHERE n.company_id = ? ORDER BY n.prepared_at DESC",
    )
    .all(companyId)
    .map(notificationRow);
  const documentIntake = db
    .prepare(
      "SELECT * FROM gmao_document_intake WHERE company_id = ? ORDER BY received_at DESC",
    )
    .all(companyId)
    .map(documentIntakeRow);
  const recommendations = db
    .prepare(
      "SELECT * FROM gmao_agent_recommendations WHERE company_id = ? ORDER BY created_at DESC",
    )
    .all(companyId)
    .map(recommendationRow);
  const exceptions = db
    .prepare(
      "SELECT * FROM gmao_exceptions WHERE company_id = ? ORDER BY detected_at DESC",
    )
    .all(companyId)
    .map(exceptionRow);
  const automationRuns = db
    .prepare(
      "SELECT * FROM gmao_automation_runs WHERE company_id = ? ORDER BY started_at DESC LIMIT 100",
    )
    .all(companyId)
    .map(automationRunRow);
  const assetSignals = db
    .prepare(
      "SELECT * FROM gmao_asset_signals WHERE company_id = ? ORDER BY observed_at DESC",
    )
    .all(companyId)
    .map(assetSignalRow);
  const billingLines = db
    .prepare(
      "SELECT * FROM gmao_billing_lines WHERE company_id = ? ORDER BY created_at DESC",
    )
    .all(companyId)
    .map(billingLineRow);
  const sla = workOrders.map((workOrder) => ({
    workOrderId: workOrder.id,
    ...evaluateWorkOrderSla(workOrder, now),
  }));
  const activeStatuses = new Set([
    "reported",
    "triaged",
    "assigned",
    "acknowledged",
    "en_route",
    "on_site",
    "waiting_parts",
    "restored",
  ]);
  const open = workOrders.filter((wo) => activeStatuses.has(wo.status));
  const atRiskIds = new Set(
    sla
      .filter(
        (item) => item.interventionLateMs > 0 || item.restorationLateMs > 0,
      )
      .map((item) => item.workOrderId),
  );
  const duePreventive = plans.filter(
    (plan) => plan.active && plan.nextDueAt && plan.nextDueAt <= now,
  ).length;
  const validCompliance = compliance.filter(
    (record) => record.effectiveStatus === "valid",
  ).length;
  const penaltyAmounts = new Map();
  for (const item of sla) {
    for (const penalty of item.penalties)
      penaltyAmounts.set(
        `${item.workOrderId}:${penalty.key}`,
        penalty.amountCents,
      );
  }
  for (const penalty of penalties) {
    if (
      penalty.status === "potential" &&
      !penaltyAmounts.has(penalty.penaltyKey)
    ) {
      penaltyAmounts.set(penalty.penaltyKey, penalty.amountCents);
    }
  }
  const potentialPenaltyCents = [...penaltyAmounts.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  return {
    ...operationsSnapshot(companyId),
    fetchedAt: now,
    contract,
    sites,
    assets,
    plans,
    workOrders,
    events,
    documents,
    compliance,
    subcontractors,
    rates,
    quotes,
    invoices,
    penalties,
    onCall,
    attachmentSheets,
    procurements,
    notifications,
    documentIntake,
    recommendations,
    exceptions,
    automationRuns,
    assetSignals,
    billingLines,
    sla,
    kpis: {
      sites: sites.filter((site) => site.active).length,
      assets: assets.length,
      openWorkOrders: open.length,
      p0Open: open.filter((wo) => wo.priority === "P0").length,
      slaAtRisk: open.filter((wo) => atRiskIds.has(wo.id)).length,
      duePreventive,
      compliancePct: compliance.length
        ? Math.round((validCompliance / compliance.length) * 100)
        : null,
      potentialPenaltyCents,
      serviceAcceptancePending: workOrders.filter(
        (wo) => wo.status === "restored" && !wo.serviceAcceptance,
      ).length,
      notificationsReady: notifications.filter(
        (item) => item.deliveryStatus === "ready",
      ).length,
      procurementsOpen: procurements.filter(
        (item) => !["received", "cancelled"].includes(item.status),
      ).length,
      invoicesToSend: invoices.filter((item) => item.status === "draft").length,
      documentsToReview: documentIntake.filter(
        (item) => item.status === "to_review",
      ).length,
      openExceptions: exceptions.filter((item) => item.status === "open")
        .length,
      criticalAssets: assets.filter((item) => item.failureRisk === "critical")
        .length,
    },
  };
}

export function saveContract(companyId, input = {}) {
  const contract = bootstrap(companyId, input);
  const fields = {
    name: input.name,
    market_number: input.marketNumber,
    lot_number: input.lotNumber,
    engagement_number: input.engagementNumber,
    holder_name: input.holderName,
    department: input.department,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    renewal_type: input.renewalType,
    obligation_of_result:
      input.obligationOfResult == null
        ? undefined
        : bool(input.obligationOfResult),
    emergency_phone: input.emergencyPhone,
    timezone: input.timezone,
    currency: input.currency,
    vat_rate: input.vatRate,
    status: input.status,
    client_contact_name: input.clientContactName,
    client_email: input.clientEmail,
    client_phone: input.clientPhone,
    config: input.config == null ? undefined : JSON.stringify(input.config),
  };
  updateById("gmao_contracts", contract.id, fields);
  return contractRow(
    get()
      .db.prepare("SELECT * FROM gmao_contracts WHERE id = ?")
      .get(contract.id),
  );
}

export function saveSite(companyId, input = {}) {
  scopeInput("gmao_sites", companyId, input);
  if (!input.name?.trim()) throw new Error("Le nom du site est obligatoire.");
  const contract = bootstrap(companyId);
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  if (input.id) {
    const old = owned("gmao_sites", companyId, id);
    input = {
      clientId: old.client_id,
      serviceContractId: old.service_contract_id,
      ...input,
    };
    scopeInput("gmao_sites", companyId, input);
    if (
      (input.clientId !== old.client_id ||
        input.serviceContractId !== old.service_contract_id) &&
      db
        .prepare("SELECT id FROM gmao_work_orders WHERE site_id=? LIMIT 1")
        .get(id)
    )
      throw new Error(
        "Ce site possède des interventions : créez un nouveau site pour changer de client ou de contrat sans réattribuer l’historique.",
      );
  }
  const row = {
    id,
    companyId,
    contractId: input.contractId || contract.id,
    name: input.name.trim(),
    trigram: normalizeCode(input.trigram || input.name.slice(0, 3)),
    department: input.department || "",
    commune: input.commune ?? null,
    address: input.address ?? null,
    kind: input.kind || "tertiary",
    antenna: input.antenna ?? null,
    referenceOrganization: input.referenceOrganization ?? null,
    g2dNumber: input.g2dNumber ?? null,
    scope: input.scope ?? "ST1, ST2, ST3",
    exclusions: input.exclusions ?? null,
    active: input.active === false ? 0 : 1,
    metadata: json(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_sites (
    id, company_id, contract_id, name, trigram, department, commune, address,
    kind, scope, exclusions, active, metadata, antenna, reference_organization, g2d_number, created_at, updated_at
  ) VALUES (
    @id, @companyId, @contractId, @name, @trigram, @department, @commune, @address,
    @kind, @scope, @exclusions, @active, @metadata, @antenna, @referenceOrganization, @g2dNumber, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET
    contract_id=excluded.contract_id, name=excluded.name, trigram=excluded.trigram,
    department=excluded.department, commune=excluded.commune, address=excluded.address,
    kind=excluded.kind, scope=excluded.scope, exclusions=excluded.exclusions,
    active=excluded.active, metadata=excluded.metadata, antenna=excluded.antenna,
    reference_organization=excluded.reference_organization, g2d_number=excluded.g2d_number,
    updated_at=excluded.updated_at
  `,
  ).run(row);
  db.prepare(
    "UPDATE gmao_sites SET client_id = ?, service_contract_id = ? WHERE id = ?",
  ).run(input.clientId || null, input.serviceContractId || null, id);
  return siteRow(
    db
      .prepare("SELECT * FROM gmao_sites WHERE id = ? AND company_id = ?")
      .get(id, companyId),
  );
}

export function saveAsset(companyId, input = {}) {
  scopeInput("gmao_assets", companyId, input);
  if (!input.siteId) throw new Error("Le site est obligatoire.");
  if (!input.equipmentType?.trim())
    throw new Error("Le type d'équipement est obligatoire.");
  if (String(input.condition) === "3" && !String(input.photoRef || "").trim()) {
    throw new Error(
      "Une photo est obligatoire pour un équipement en état 3 (dégradé).",
    );
  }
  const { db } = get();
  const site = db
    .prepare("SELECT * FROM gmao_sites WHERE id = ? AND company_id = ?")
    .get(input.siteId, companyId);
  if (!site) throw new Error("Site introuvable.");
  const now = Date.now();
  const id = input.id || uuid();
  const assetCode = normalizeCode(
    input.assetCode ||
      `${site.trigram}-${input.technicalSection || "ST1"}-${shortId(id)}`,
  );
  const previous = input.id
    ? owned("gmao_assets", companyId, input.id)
    : db
        .prepare(
          "SELECT * FROM gmao_assets WHERE company_id=? AND asset_code=?",
        )
        .get(companyId, assetCode);
  if (
    previous &&
    previous.site_id !== input.siteId &&
    db
      .prepare("SELECT id FROM gmao_work_orders WHERE asset_id=? LIMIT 1")
      .get(previous.id)
  )
    throw new Error(
      "Cet équipement possède des interventions : son site historique doit être conservé.",
    );
  if (input.id && previous.asset_code !== assetCode)
    throw new Error(
      "La référence d’un équipement existant doit être conservée.",
    );
  const row = {
    id,
    companyId,
    siteId: input.siteId,
    assetCode,
    buildingCode: input.buildingCode ?? null,
    buildingName: input.buildingName ?? null,
    occupant: input.occupant ?? null,
    technicalSection: input.technicalSection || "ST1",
    domainCode: input.domainCode || "IFC",
    equipmentType: input.equipmentType.trim(),
    quantity: positiveInt(input.quantity, 1),
    powerKw: nullableNumber(input.powerKw),
    capacityLiters: nullableNumber(input.capacityLiters),
    brand: input.brand ?? null,
    modelReference: input.modelReference ?? null,
    serialNumber: input.serialNumber ?? null,
    condition: String(input.condition || "2"),
    operational: input.operational === false ? 0 : 1,
    criticality: ["P0", "P1", "P2", "P3"].includes(input.criticality)
      ? input.criticality
      : "P2",
    location: input.location ?? null,
    photoRef: input.photoRef ?? null,
    comments: input.comments ?? null,
    lastServiceAt: input.lastServiceAt ?? null,
    nextServiceAt: input.nextServiceAt ?? null,
    healthScore: Math.max(
      0,
      Math.min(100, Math.round(input.healthScore ?? 100)),
    ),
    failureRisk: input.failureRisk || "low",
    lastRiskEvaluatedAt: input.lastRiskEvaluatedAt ?? null,
    metadata: json(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_assets (
    id, company_id, site_id, asset_code, building_code, building_name, occupant,
    technical_section, domain_code, equipment_type, quantity, power_kw, capacity_liters,
    brand, model_reference, serial_number, condition, operational, criticality, location,
    photo_ref, comments, last_service_at, next_service_at, health_score, failure_risk,
    last_risk_evaluated_at, metadata, created_at, updated_at
  ) VALUES (
    @id, @companyId, @siteId, @assetCode, @buildingCode, @buildingName, @occupant,
    @technicalSection, @domainCode, @equipmentType, @quantity, @powerKw, @capacityLiters,
    @brand, @modelReference, @serialNumber, @condition, @operational, @criticality, @location,
    @photoRef, @comments, @lastServiceAt, @nextServiceAt, @healthScore, @failureRisk,
    @lastRiskEvaluatedAt, @metadata, @createdAt, @updatedAt
  ) ON CONFLICT(company_id, asset_code) DO UPDATE SET
    site_id=excluded.site_id, building_code=excluded.building_code, building_name=excluded.building_name,
    occupant=excluded.occupant, technical_section=excluded.technical_section, domain_code=excluded.domain_code,
    equipment_type=excluded.equipment_type, quantity=excluded.quantity, power_kw=excluded.power_kw,
    capacity_liters=excluded.capacity_liters, brand=excluded.brand, model_reference=excluded.model_reference,
    serial_number=excluded.serial_number, condition=excluded.condition, operational=excluded.operational,
    criticality=excluded.criticality, location=excluded.location, photo_ref=excluded.photo_ref,
    comments=excluded.comments, last_service_at=excluded.last_service_at,
    next_service_at=excluded.next_service_at, health_score=excluded.health_score,
    failure_risk=excluded.failure_risk, last_risk_evaluated_at=excluded.last_risk_evaluated_at,
    metadata=excluded.metadata, updated_at=excluded.updated_at
  `,
  ).run(row);
  return assetRow(
    db
      .prepare(
        "SELECT * FROM gmao_assets WHERE company_id = ? AND asset_code = ?",
      )
      .get(companyId, assetCode),
  );
}

export function importAssets(companyId, rows = []) {
  const { db } = get();
  const run = db.transaction((items) =>
    items.map((item) => saveAsset(companyId, item)),
  );
  const saved = run(rows);
  return { imported: saved.length, assets: saved };
}

export function savePlan(companyId, input = {}) {
  scopeInput("gmao_maintenance_plans", companyId, input);
  if (!input.name?.trim())
    throw new Error("Le nom de la gamme est obligatoire.");
  if (
    !Number.isInteger(Number(input.periodicityMonths ?? 12)) ||
    Number(input.periodicityMonths ?? 12) < 1 ||
    Number(input.periodicityMonths ?? 12) > 120
  )
    throw new Error("Périodicité attendue : 1 à 120 mois.");
  if (
    input.nextDueAt != null &&
    (!Number.isFinite(input.nextDueAt) || input.nextDueAt <= 0)
  )
    throw new Error("Date de prochaine visite invalide.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const row = {
    id,
    companyId,
    assetId: input.assetId ?? null,
    technicalSection: input.technicalSection || "ST1",
    equipmentType: input.equipmentType ?? null,
    name: input.name.trim(),
    description: input.description ?? null,
    periodicityMonths: Number(input.periodicityMonths ?? 12),
    checklist: JSON.stringify(input.checklist || []),
    evidenceRequirements: JSON.stringify(
      input.evidenceRequirements || ["compte_rendu", "photo", "service_fait"],
    ),
    active: input.active === false ? 0 : 1,
    nextDueAt:
      input.nextDueAt ??
      addMonths(now, positiveInt(input.periodicityMonths, 12)),
    lastGeneratedAt: input.lastGeneratedAt ?? null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_maintenance_plans (
    id, company_id, asset_id, technical_section, equipment_type, name, description,
    periodicity_months, checklist, evidence_requirements, active, next_due_at,
    last_generated_at, created_at, updated_at
  ) VALUES (
    @id, @companyId, @assetId, @technicalSection, @equipmentType, @name, @description,
    @periodicityMonths, @checklist, @evidenceRequirements, @active, @nextDueAt,
    @lastGeneratedAt, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET asset_id=excluded.asset_id,
    technical_section=excluded.technical_section, equipment_type=excluded.equipment_type,
    name=excluded.name, description=excluded.description, periodicity_months=excluded.periodicity_months,
    checklist=excluded.checklist, evidence_requirements=excluded.evidence_requirements,
    active=excluded.active, next_due_at=excluded.next_due_at,
    last_generated_at=excluded.last_generated_at, updated_at=excluded.updated_at
  `,
  ).run(row);
  return planRow(
    db
      .prepare(
        "SELECT * FROM gmao_maintenance_plans WHERE id = ? AND company_id = ?",
      )
      .get(id, companyId),
  );
}

export function createWorkOrder(companyId, input = {}) {
  scopeInput("gmao_work_orders", companyId, input);
  if (input.status && input.status !== "reported")
    throw new Error("Une nouvelle intervention commence à réceptionner.");
  for (const key of [
    "acknowledgedAt",
    "interventionStartedAt",
    "restoredAt",
    "completedAt",
    "serviceAcceptance",
    "receiptConfirmedAt",
    "purchaseOrder",
    "serviceAcceptanceReference",
    "serviceAcceptanceReceivedAt",
    "result",
  ])
    if (input[key])
      throw new Error(
        "Utilisez l’action métier pour enregistrer cette preuve.",
      );
  for (const [key, initial] of Object.entries({
    quoteStatus: "not_required",
    closureStatus: "not_ready",
    billingStatus: "not_ready",
    repairMode: "none",
  }))
    if (input[key] != null && input[key] !== initial)
      throw new Error(
        "Une nouvelle intervention ne peut pas contenir un état d’exécution.",
      );
  validateSchedule(companyId, input.id, input);
  if (!input.siteId) throw new Error("Le site est obligatoire.");
  if (!input.title?.trim()) throw new Error("L'objet de l'OT est obligatoire.");
  const contract = bootstrap(companyId);
  const { db } = get();
  const site = db
    .prepare("SELECT id FROM gmao_sites WHERE id = ? AND company_id = ?")
    .get(input.siteId, companyId);
  if (!site) throw new Error("Site introuvable.");
  const now = input.receivedAt || input.reportedAt || Date.now();
  if (!Number.isFinite(now) || now <= 0 || now > Date.now() + 60_000) throw new Error("Heure de réception de la demande invalide.");
  const clientTerms = db
    .prepare(
      "SELECT c.settings FROM gmao_sites s LEFT JOIN gmao_service_contracts c ON c.id=s.service_contract_id WHERE s.id=? AND s.company_id=?",
    )
    .get(input.siteId, companyId);
  const policy = parseJson(clientTerms?.settings, {})?.sla?.[
    input.priority || "P2"
  ];
  const schedule = workOrderSchedule(input.priority, now);
  schedule.interventionDueAt =
    policy?.interventionHours != null
      ? now + Number(policy.interventionHours) * 3600000
      : null;
  schedule.restorationDueAt =
    policy?.restorationHours != null
      ? now + Number(policy.restorationHours) * 3600000
      : null;
  schedule.maxUnavailabilityAt =
    policy?.maxDowntimeHours != null
      ? now + Number(policy.maxDowntimeHours) * 3600000
      : null;
  schedule.onCall = policy?.onCall === true;
  const id = input.id || uuid();
  if (input.requestKey) {
    const existing = db
      .prepare(
        "SELECT id FROM gmao_work_orders WHERE company_id = ? AND request_key = ?",
      )
      .get(companyId, input.requestKey);
    if (existing) return getWorkOrder(companyId, existing.id);
  }
  const sequence =
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM gmao_work_orders WHERE company_id = ?",
      )
      .get(companyId).n + 1;
  const number = input.workOrderNumber || workOrderNumber(sequence, now);
  const row = {
    id,
    companyId,
    contractId: input.contractId || contract.id,
    siteId: input.siteId,
    assetId: input.assetId ?? null,
    maintenancePlanId: input.maintenancePlanId ?? null,
    issueId: input.issueId ?? null,
    workOrderNumber: number,
    type: input.type || "corrective",
    status: input.status || "reported",
    priority: schedule.priority,
    title: input.title.trim(),
    description: input.description ?? null,
    source: input.source || "manual",
    reportedAt: now,
    acknowledgedAt: input.acknowledgedAt ?? null,
    interventionDueAt: input.interventionDueAt ?? schedule.interventionDueAt,
    interventionStartedAt: input.interventionStartedAt ?? null,
    restorationDueAt:
      input.restorationDueAt === undefined
        ? schedule.restorationDueAt
        : input.restorationDueAt,
    restoredAt: input.restoredAt ?? null,
    completedAt: input.completedAt ?? null,
    unavailableFrom: input.unavailableFrom ?? null,
    unavailableUntil: input.unavailableUntil ?? null,
    assigneeRole: input.assigneeRole || "DispatchCoordinator",
    assigneeCompanion: input.assigneeCompanion ?? null,
    assigneeHuman: input.assigneeHuman ?? null,
    onCall: input.onCall == null ? bool(schedule.onCall) : bool(input.onCall),
    quoteStatus: input.quoteStatus || "not_required",
    purchaseOrder: input.purchaseOrder ?? null,
    serviceAcceptance: bool(input.serviceAcceptance),
    campaignColor: input.campaignColor ?? null,
    result: json(input.result),
    cost: json(input.cost),
    clientOiNumber: input.clientOiNumber ?? null,
    receivedAt: input.receivedAt ?? now,
    receiptConfirmedAt: input.receiptConfirmedAt ?? null,
    scheduledAt: input.scheduledAt ?? null,
    repairMode: input.repairMode || "none",
    closureStatus: input.closureStatus || "not_ready",
    sourceDocumentId: input.sourceDocumentId ?? null,
    requesterName: input.requesterName ?? null,
    requesterContact: input.requesterContact ?? null,
    integratedAt: input.integratedAt ?? now,
    blockageLevel: input.blockageLevel ?? null,
    locationDetail: input.locationDetail ?? null,
    predictedCategory: input.predictedCategory ?? null,
    aiConfidence: nullableNumber(input.aiConfidence),
    maxUnavailabilityAt:
      input.maxUnavailabilityAt ?? schedule.maxUnavailabilityAt,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_work_orders (
    id, company_id, contract_id, site_id, asset_id, maintenance_plan_id, issue_id,
    work_order_number, type, status, priority, title, description, source, reported_at,
    acknowledged_at, intervention_due_at, intervention_started_at, restoration_due_at,
    restored_at, completed_at, unavailable_from, unavailable_until, assignee_role,
    assignee_companion, assignee_human, on_call, quote_status, purchase_order,
    service_acceptance, campaign_color, result, cost, client_oi_number, received_at,
    receipt_confirmed_at, scheduled_at, repair_mode, closure_status, source_document_id,
    requester_name, requester_contact, integrated_at, blockage_level, location_detail,
    predicted_category, ai_confidence, max_unavailability_at, created_at, updated_at
  ) VALUES (
    @id, @companyId, @contractId, @siteId, @assetId, @maintenancePlanId, @issueId,
    @workOrderNumber, @type, @status, @priority, @title, @description, @source, @reportedAt,
    @acknowledgedAt, @interventionDueAt, @interventionStartedAt, @restorationDueAt,
    @restoredAt, @completedAt, @unavailableFrom, @unavailableUntil, @assigneeRole,
    @assigneeCompanion, @assigneeHuman, @onCall, @quoteStatus, @purchaseOrder,
    @serviceAcceptance, @campaignColor, @result, @cost, @clientOiNumber, @receivedAt,
    @receiptConfirmedAt, @scheduledAt, @repairMode, @closureStatus, @sourceDocumentId,
    @requesterName, @requesterContact, @integratedAt, @blockageLevel, @locationDetail,
    @predictedCategory, @aiConfidence, @maxUnavailabilityAt, @createdAt, @updatedAt
  )`,
  ).run(row);
  db.prepare(
    "UPDATE gmao_work_orders SET duration_minutes = ?, preventive_due_at = ?, request_key = ? WHERE id = ?",
  ).run(
    input.durationMinutes || 60,
    input.preventiveDueAt || null,
    input.requestKey || null,
    id,
  );
  addEvent(companyId, id, {
    eventType: "created",
    toStatus: row.status,
    actorRole: input.actorRole,
    note: input.description || input.title,
    evidence: input.evidence,
  });
  return getWorkOrder(companyId, id);
}

export function getWorkOrder(companyId, id) {
  return workOrderRow(
    get()
      .db.prepare(
        "SELECT * FROM gmao_work_orders WHERE id = ? AND company_id = ?",
      )
      .get(id, companyId),
  );
}

export function updateWorkOrder(companyId, id, input = {}) {
  const current = getWorkOrder(companyId, id);
  if (!current) throw new Error("Ordre de travail introuvable.");
  if (["completed", "cancelled"].includes(current.status))
    throw new Error("Ce dossier clôturé est en lecture seule.");
  scopeInput("gmao_work_orders", companyId, {
    siteId: current.siteId,
    ...input,
    id,
  });
  for (const key of [
    "status",
    "serviceAcceptance",
    "repairMode",
    "serviceAcceptanceReference",
    "serviceAcceptanceReceivedAt",
    "quoteStatus",
    "purchaseOrder",
    "closureStatus",
    "billingStatus",
  ])
    if (input[key] !== undefined)
      throw new Error(
        "Utilisez l’action métier dédiée pour modifier cet état.",
      );
  assertScheduleChange(companyId, current, input);
  validateSchedule(companyId, id, input, current);
  const mapping = {
    durationMinutes: "duration_minutes",
    priority: "priority",
    title: "title",
    description: "description",
    assetId: "asset_id",
    assigneeRole: "assignee_role",
    assigneeCompanion: "assignee_companion",
    assigneeHuman: "assignee_human",
    quoteStatus: "quote_status",
    purchaseOrder: "purchase_order",
    campaignColor: "campaign_color",
    serviceAcceptance: "service_acceptance",
    result: "result",
    cost: "cost",
    unavailableFrom: "unavailable_from",
    unavailableUntil: "unavailable_until",
    clientOiNumber: "client_oi_number",
    scheduledAt: "scheduled_at",
    repairMode: "repair_mode",
    closureStatus: "closure_status",
    serviceAcceptanceReference: "service_acceptance_reference",
    serviceAcceptanceReceivedAt: "service_acceptance_received_at",
    billingStatus: "billing_status",
    sourceDocumentId: "source_document_id",
    requesterName: "requester_name",
    requesterContact: "requester_contact",
    integratedAt: "integrated_at",
    blockageLevel: "blockage_level",
    locationDetail: "location_detail",
    predictedCategory: "predicted_category",
    aiConfidence: "ai_confidence",
    maxUnavailabilityAt: "max_unavailability_at",
  };
  const fields = {};
  for (const [key, column] of Object.entries(mapping)) {
    if (input[key] === undefined) continue;
    let value = input[key];
    if (BOOL_FIELDS.has(key)) value = bool(value);
    if (JSON_FIELDS.has(key)) value = json(value);
    fields[column] = value;
  }
  updateById("gmao_work_orders", id, fields);
  if (input.scheduledAt !== undefined || input.assigneeHuman !== undefined)
    addEvent(companyId, id, {
      eventType: "scheduled",
      actorName: input.actorName,
      note: input.note || "Créneau mis à jour",
      evidence: {
        previous: current.scheduledAt,
        scheduledAt: input.scheduledAt ?? current.scheduledAt,
        durationMinutes: input.durationMinutes ?? current.durationMinutes,
        assigneeHuman: input.assigneeHuman ?? current.assigneeHuman,
      },
    });
  if (input.note || input.evidence)
    addEvent(companyId, id, {
      eventType: "updated",
      actorRole: input.actorRole,
      actorName: input.actorName,
      note: input.note,
      evidence: input.evidence,
    });
  return getWorkOrder(companyId, id);
}

export function transitionWorkOrder(companyId, id, toStatus, input = {}) {
  const { db } = get();
  const current = getWorkOrder(companyId, id);
  if (!current) throw new Error("Ordre de travail introuvable.");
  assertTransition(current.status, toStatus);
  if (current.status === toStatus) return current;
  assertScheduleChange(companyId, current, input);
  validateSchedule(companyId, id, input, current);
  if (
    ["assigned", "acknowledged", "en_route", "on_site"].includes(toStatus) &&
    !String(input.assigneeHuman || current.assigneeHuman || "").trim()
  )
    throw new Error("Affectez un intervenant avant de poursuivre.");
  if (current.status === "waiting_parts" && toStatus !== "cancelled") {
    const pending = db
      .prepare(
        "SELECT id FROM gmao_procurements WHERE company_id = ? AND work_order_id = ? AND status NOT IN ('received','cancelled')",
      )
      .get(companyId, id);
    if (pending)
      throw new Error(
        "Réceptionnez les pièces avant de reprendre l’intervention.",
      );
    if (current.purchaseOrder && current.quoteStatus === 'purchase_order_received' && !processFact(companyId, id, 'purchase_order_returned')) throw new Error('Le BC signé doit être retourné au client avant la reprise.');
    if (
      current.repairMode === "with_quote" &&
      current.quoteStatus !== "purchase_order_received"
    )
      throw new Error("Le bon de commande client est attendu.");
  }
  if (
    toStatus === "restored" &&
    !db
      .prepare(
        "SELECT id FROM gmao_attachment_sheets WHERE company_id = ? AND work_order_id = ? AND resolved = 1",
      )
      .get(companyId, id)
  )
    throw new Error(
      "Enregistrez un compte-rendu terrain résolu avant le rétablissement.",
    );
  if (["en_route", "on_site"].includes(toStatus)) assertDispatch(companyId, {...current, ...input});
  if (toStatus === "completed") assertCompletion(companyId, current);
  const now = input.happenedAt || Date.now();
  const fields = { status: toStatus };
  if (["triaged", "assigned"].includes(toStatus) && !current.receiptConfirmedAt)
    fields.receipt_confirmed_at = now;
  if (toStatus === "assigned" && input.scheduledAt !== undefined)
    fields.scheduled_at = input.scheduledAt;
  if (toStatus === "acknowledged" && !current.acknowledgedAt)
    fields.acknowledged_at = now;
  if (toStatus === "on_site") {
    if (!current.interventionStartedAt) fields.intervention_started_at = now;
    if (current.type === "preventive" && !current.unavailableFrom) fields.unavailable_from = now;
  }
  if (toStatus === "restored") {
    fields.restored_at = now;
    fields.closure_status = "to_close";
    if (input.unavailableUntil == null && current.unavailableFrom)
      fields.unavailable_until = now;
  }
  if (toStatus === "completed") {
    if (input.serviceAcceptance !== true)
      throw new Error(
        "Confirmez explicitement le service fait avec sa preuve.",
      );
    if (!input.documentId && !String(input.customerSignatory || "").trim())
      throw new Error("Joignez le service fait ou identifiez le signataire.");
    scopeInput("gmao_work_orders", companyId, {
      workOrderId: id,
      documentId: input.documentId,
    });
    const serviceAcceptanceReference =
      input.serviceAcceptanceReference || current.serviceAcceptanceReference;
    if (current.purchaseOrder && !String(serviceAcceptanceReference || "").trim()) {
      throw new Error(
        "La référence du service fait client est obligatoire avant clôture.",
      );
    }
    const attachment = attachmentSheetRow(
      db
        .prepare(
          `SELECT * FROM gmao_attachment_sheets
      WHERE company_id = ? AND work_order_id = ? AND resolved = 1 ORDER BY ended_at DESC LIMIT 1`,
        )
        .get(companyId, id),
    );
    const completionEvidence = {
      ...input,
      notes: input.notes || attachment?.workPerformed,
      photoRefs:
        input.photoRefs || input.photoUrls || attachment?.photoRefs || [],
      checklist: input.checklist || attachment?.measurements || [],
    };
    const validation = validateCompletion({...current,evidenceRequirements:evidenceRequirements(current)}, completionEvidence);
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    if (current.purchaseOrder && !processFact(companyId, id, 'billing_requested')) throw new Error('Transmettez le dossier au service facturation avant clôture.');
    fields.completed_at = now;
    fields.service_acceptance = 1;
    fields.service_acceptance_reference = serviceAcceptanceReference ? String(serviceAcceptanceReference).trim() : null;
    fields.service_acceptance_received_at =
      current.serviceAcceptanceReceivedAt || input.serviceAcceptanceReceivedAt || now;
    fields.billing_status = current.purchaseOrder ? current.billingStatus : "not_billable";
    fields.closure_status = "closed";
    fields.result = JSON.stringify({
      ...(current.result || {}),
      notes: completionEvidence.notes,
      photoRefs: completionEvidence.photoRefs,
      checklist: completionEvidence.checklist,
      attachmentSheetId: attachment?.id,
      completedAt: now,
    });
  }
  if (input.assigneeHuman !== undefined)
    fields.assignee_human = input.assigneeHuman;
  if (input.assigneeRole !== undefined)
    fields.assignee_role = input.assigneeRole;
  updateById("gmao_work_orders", id, fields, now);
  addEvent(companyId, id, {
    eventType: toStatus === "completed" ? "service_accepted" : "status_changed",
    fromStatus: current.status,
    toStatus,
    actorRole: input.actorRole,
    actorName: input.actorName,
    note: input.notes || input.note,
    evidence: input,
    happenedAt: now,
  });
  const updated = getWorkOrder(companyId, id);
  queueCustomerNotification(companyId, updated, `${toStatus}-${uuid()}`, {
    subject: `OI ${updated.clientOiNumber || updated.workOrderNumber} : état validé`,
    message: `L’état de votre intervention a été validé : ${{triaged:'prise en compte',assigned:'planifiée',acknowledged:'confirmée',en_route:'technicien en route',on_site:'technicien sur site',waiting_parts:'travaux en attente',restored:'travaux terminés par le technicien',completed:'clôturée après votre accord',cancelled:'annulée'}[toStatus] || toStatus}.`,
  });
  if (
    toStatus === "completed" &&
    updated.assetId &&
    updated.type === "preventive"
  ) {
    const plan = db
      .prepare(
        "SELECT periodicity_months FROM gmao_maintenance_plans WHERE id = ? AND company_id = ?",
      )
      .get(updated.maintenancePlanId, companyId);
    db.prepare(
      "UPDATE gmao_assets SET last_service_at = ?, next_service_at = ?, updated_at = ? WHERE id = ? AND company_id = ?",
    ).run(
      now,
      plan
        ? addMonths(updated.preventiveDueAt || now, plan.periodicity_months)
        : null,
      now,
      updated.assetId,
      companyId,
    );
  }
  return updated;
}

export function addEvent(companyId, workOrderId, input = {}) {
  if (String(input.eventType || '').startsWith('process_')) throw new Error('Utilisez la validation métier pour cette étape.');
  return recordEvent(companyId, workOrderId, input);
}
function recordEvent(companyId, workOrderId, input = {}) {
  owned("gmao_work_orders", companyId, workOrderId);
  const { db } = get();
  const id = input.id || uuid();
  db.prepare(
    `INSERT INTO gmao_work_order_events (
    id, company_id, work_order_id, event_type, from_status, to_status,
    actor_role, actor_name, note, evidence, happened_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    workOrderId,
    input.eventType || "note",
    input.fromStatus ?? null,
    input.toStatus ?? null,
    input.actorRole ?? null,
    input.actorName ?? null,
    input.note ?? null,
    json(input.evidence),
    input.happenedAt || Date.now(),
  );
  return eventRow(
    db.prepare("SELECT * FROM gmao_work_order_events WHERE id = ?").get(id),
  );
}

export function recordAttachmentSheet(companyId, workOrderId, input = {}) {
  scopeInput("gmao_attachment_sheets", companyId, { ...input, workOrderId });
  const { db } = get();
  const workOrder = getWorkOrder(companyId, workOrderId);
  if (!workOrder) throw new Error("Ordre d'intervention introuvable.");
  if (workOrder.status !== "on_site")
    throw new Error(
      "La feuille d'attachement se renseigne lorsque le technicien est sur site.",
    );
  if (!input.technicianName?.trim() || !input.workPerformed?.trim()) {
    throw new Error("Le technicien et les travaux réalisés sont obligatoires.");
  }
  if (input.photoRefs != null && !Array.isArray(input.photoRefs)) throw new Error('Liste de photos invalide.');
  if (evidenceRequirements(workOrder).includes('photo') && !input.photoRefs?.length) throw new Error('Joignez les photos exigées par cette intervention.');
  for (const ref of input.photoRefs || []) {
    const photo = owned("gmao_documents", companyId, ref);
    if (
      photo.work_order_id !== workOrderId ||
      !/^image\//.test(photo.mime_type || "") ||
      !/^[a-f0-9]{64}$/.test(photo.blob_id || "") ||
      !/^[a-z0-9]+$/i.test(photo.blob_ext || "") ||
      !localBlobs.exists(photo.blob_id, photo.blob_ext)
    )
      throw new Error("Chaque photo doit être un fichier local du dossier.");
  }
  const waiting = input.waiting === true;
  const resolved = !waiting && input.resolved === true;
  const repairMode = waiting ? workOrder.repairMode || "none" : resolved ? workOrder.repairMode || "none" : input.repairMode;
  if (!resolved && !waiting && !["without_quote", "with_quote"].includes(repairMode)) {
    throw new Error("Choisissez une réparation avec ou sans devis.");
  }
  const now = input.endedAt || Date.now();
  const arrival = input.startedAt ?? workOrder.interventionStartedAt;
  if (!Number.isFinite(arrival) || arrival <= 0 || !Number.isFinite(now) || now < arrival) throw new Error('Les heures d’arrivée et de départ doivent être valides et ordonnées.');
  const contractPolicy = policyFor(companyId, workOrder.siteId);
  const sticker = contractPolicy?.campaignColor ? {campaign: contractPolicy.campaignName || "contract",color:contractPolicy.campaignColor} : campaignForDate(now);
  const details = input.details || fieldDetails(companyId, workOrderId);
  if (contractPolicy?.enabled) {
    for (const field of ["siteRepresentative", "causes", "finalState"]) if (!String(details[field] || "").trim()) throw new Error(`Complétez le rapport terrain : ${field}`);
    if (details.safetyConfirmed !== true || details.userInformed !== true || details.registerUpdated !== true) throw new Error("Confirmez mise en sécurité, information des usagers et mise à jour du registre.");
    if (workOrder.maintenancePlanId) {
      const checks = parseJson(owned("gmao_maintenance_plans", companyId, workOrder.maintenancePlanId).checklist, []);
      if (checks.some(label => !details.checklistChecks?.some(c => c.label === label && (c.done === true || c.note?.trim())))) throw new Error("Renseignez chaque contrôle de la gamme ou justifiez son absence.");
    }
  }
  const id = input.id || uuid();
  const visitNumber =
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM gmao_attachment_sheets WHERE company_id = ? AND work_order_id = ?",
      )
      .get(companyId, workOrderId).n + 1;
  const row = {
    id,
    companyId,
    workOrderId,
    visitNumber,
    technicianName: input.technicianName.trim(),
    startedAt: input.startedAt ?? workOrder.interventionStartedAt ?? null,
    endedAt: now,
    diagnosis: input.diagnosis ?? null,
    workPerformed: input.workPerformed.trim(),
    details: json(details),
    measurements: json(input.measurements || []),
    partsUsed: json(input.partsUsed || []),
    photoRefs: json(input.photoRefs || []),
    resolved: bool(resolved),
    repairRequired: bool(!resolved && !waiting),
    repairMode,
    customerSignatory: input.customerSignatory ?? null,
    customerSignature: input.customerSignature ?? null,
    status: waiting ? "waiting" : "recorded",
    stickerCampaign: input.stickerCampaign || sticker.campaign,
    stickerColor: input.stickerColor || sticker.color,
    stickerAppliedAt:
      input.stickerAppliedAt ?? (input.stickerApplied ? now : null),
    createdAt: now,
    updatedAt: now,
  };
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO gmao_attachment_sheets (
      id, company_id, work_order_id, visit_number, technician_name, started_at, ended_at,
      diagnosis, work_performed, measurements, parts_used, photo_refs, resolved,
      repair_required, repair_mode, customer_signatory, customer_signature, status,
      sticker_campaign, sticker_color, sticker_applied_at, details,
      created_at, updated_at
    ) VALUES (
      @id, @companyId, @workOrderId, @visitNumber, @technicianName, @startedAt, @endedAt,
      @diagnosis, @workPerformed, @measurements, @partsUsed, @photoRefs, @resolved,
      @repairRequired, @repairMode, @customerSignatory, @customerSignature, @status,
      @stickerCampaign, @stickerColor, @stickerAppliedAt, @details,
      @createdAt, @updatedAt
    )`,
    ).run(row);
    updateById(
      "gmao_work_orders",
      workOrderId,
      { repair_mode: repairMode },
      now,
    );
    addEvent(companyId, workOrderId, {
      eventType: "attachment_recorded",
      actorRole: input.actorRole || "FieldTech",
      actorName: input.technicianName,
      note: input.diagnosis || input.workPerformed,
      evidence: {
        attachmentSheetId: id,
        resolved,
        repairMode,
        photoRefs: input.photoRefs || [],
      },
      happenedAt: now,
    });
    if (resolved) {
      transitionWorkOrder(companyId, workOrderId, "restored", {
        actorRole: input.actorRole || "FieldTech",
        actorName: input.technicianName,
        note: "Intervention résolue, OI prête à clôturer",
        happenedAt: now,
      });
    } else if (waiting) {
      queueCustomerNotification(companyId, getWorkOrder(companyId,workOrderId), "visit-waiting-" + uuid(), {message:"Le technicien a enregistré son compte-rendu. L’intervention reste en attente."});
    } else {
      transitionWorkOrder(companyId, workOrderId, "waiting_parts", {
        actorRole: input.actorRole || "FieldTech",
        actorName: input.technicianName,
        note:
          repairMode === "with_quote"
            ? "Réparation avec devis requise"
            : "Approvisionnement sans devis requis",
        happenedAt: now,
      });
      saveProcurement(companyId, {
        workOrderId,
        attachmentSheetId: id,
        requestType: repairMode === "with_quote" ? "proforma" : "supply",
        supplierName: input.supplierName,
        description:
          input.repairDescription || input.diagnosis || input.workPerformed,
        notes: input.repairNotes,
      });
    }
  });
  run();
  return attachmentSheetRow(
    db.prepare("SELECT * FROM gmao_attachment_sheets WHERE id = ?").get(id),
  );
}

export function saveProcurement(companyId, input = {}) {
  return get().db.transaction(() => {
    const result = saveProcurementRecord(companyId, input);
    const charter = JSON.parse(get().db.prepare('SELECT charter FROM companies WHERE id=?').get(companyId)?.charter || '{}');
    const targetTeamId = input.targetTeamId || charter.purchasingTeamId;
    if (targetTeamId && !get().db.prepare("SELECT id FROM team_threads WHERE source_company_id=? AND target_company_id=? AND json_extract(context,'$.procurementId')=?").get(companyId,targetTeamId,result.id)) {
      purchasingTeams.request(companyId, {
        targetTeamId, targetRole: input.targetRole || charter.purchasingRole || 'PurchasingManager',
        subject: result.description.slice(0,200), body: result.description,
        procurementId: result.id, requestKey: `procurement:${result.id}:${targetTeamId}`,
      }, { role: 'owner' });
    }
    return result;
  })();
}
function saveProcurementRecord(companyId, input = {}) {
  scopeInput("gmao_procurements", companyId, input);
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const existing = input.id
    ? db
        .prepare(
          "SELECT * FROM gmao_procurements WHERE id = ? AND company_id = ?",
        )
        .get(id, companyId)
    : null;
  const workOrderId = input.workOrderId || existing?.work_order_id;
  const description = input.description ?? existing?.description;
  scopeInput("gmao_procurements", companyId, { ...input, workOrderId });
  if (existing && workOrderId !== existing.work_order_id)
    throw new Error("Un achat ne peut pas changer de dossier.");
  if (!workOrderId) throw new Error("L'ordre d'intervention est obligatoire.");
  if (!description?.trim())
    throw new Error("Le besoin d'approvisionnement doit être décrit.");
  const status = input.status || existing?.status || "requested";
  const allowed = {
    requested: ["proforma_received", "ordered", "cancelled"],
    proforma_received: ["ordered", "cancelled"],
    ordered: ["partially_received", "received", "cancelled"],
    partially_received: ["partially_received", "received"],
    received: [],
    cancelled: [],
  };
  if (!existing && status !== "requested")
    throw new Error("Une demande achats commence au statut demandé.");
  if (
    existing &&
    status !== existing.status &&
    !(allowed[existing.status] || []).includes(status)
  )
    throw new Error("Transition achats interdite.");
  if (existing && ["received", "cancelled"].includes(existing.status))
    throw new Error("Cette demande clôturée est en lecture seule.");
  if (
    input.amountCents != null &&
    (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
  )
    throw new Error("Montant fournisseur invalide.");
  const supplierId = input.supplierId ?? existing?.supplier_id ?? null;
  const items = input.items ?? parseJson(existing?.items, []);
  if (existing && input.items && JSON.stringify(items.map(i=>[i.label,Number(i.quantity)])) !== JSON.stringify(parseJson(existing.items,[]).map(i=>[i.label,Number(i.quantity)]))) {
    const linked=db.prepare("SELECT i.id FROM company_billing_invoices i, json_each(i.data,'$.lines') l WHERE i.company_id=? AND json_extract(l.value,'$.procurementId')=? LIMIT 1").get(companyId,id);
    if(linked)throw new Error('Ces pièces sont liées à une facture. Conservez leur désignation et leur quantité.');
  }

  if (
    !Array.isArray(items) ||
    items.some(
      (i) =>
        !String(i.label || "").trim() ||
        !Number.isFinite(Number(i.quantity)) ||
        Number(i.quantity) <= 0 ||
        !Number.isFinite(Number(i.received || 0)) ||
        Number(i.received || 0) < 0 ||
        Number(i.received || 0) > Number(i.quantity),
    )
  )
    throw new Error("Les lignes achats et quantités reçues sont invalides.");
  if (existing && ["ordered", "partially_received"].includes(existing.status)) {
    const previous = parseJson(existing.items, []);
    if (
      previous.length &&
      (items.length !== previous.length ||
        items.some(
          (item, i) =>
            item.label !== previous[i].label ||
            Number(item.quantity) !== Number(previous[i].quantity) ||
            Number(item.received || 0) < Number(previous[i].received || 0),
        ))
    )
      throw new Error(
        "Conservez les lignes commandées et les quantités déjà réceptionnées.",
      );
    if (
      supplierId !== existing.supplier_id ||
      (input.orderReference &&
        input.orderReference !== existing.order_reference)
    )
      throw new Error("La commande fournisseur est déjà enregistrée.");
  }
  if (
    ["requested", "proforma_received", "ordered"].includes(status) &&
    items.some((i) => Number(i.received || 0) > 0)
  )
    throw new Error("Enregistrez les quantités reçues avec une réception.");
  if (
    status === "proforma_received" &&
    !(input.proformaReference || existing?.proforma_reference)
  )
    throw new Error("Référence proforma obligatoire.");
  if (status === "ordered") {
    if (
      !(input.orderReference || existing?.order_reference) ||
      !(supplierId || input.supplierName || existing?.supplier_name)
    )
      throw new Error("Fournisseur et référence de commande obligatoires.");
    const wo = getWorkOrder(companyId, workOrderId);
    if (
      wo.repairMode === "with_quote" &&
      wo.quoteStatus !== "purchase_order_received"
    )
      throw new Error(
        "Le bon de commande client est requis avant la commande fournisseur.",
      );
  }
  if (["partially_received", "received"].includes(status)) {
    if (!(input.receiptReference || existing?.receipt_reference))
      throw new Error("Référence du bon de livraison obligatoire.");
    if (!items.length || !items.some((i) => Number(i.received) > 0))
      throw new Error("Renseignez les quantités reçues.");
    if (
      status === "received" &&
      items.some((i) => Number(i.received) < Number(i.quantity))
    )
      throw new Error("La réception est partielle.");
  }
  const row = {
    id,
    companyId,
    workOrderId,
    attachmentSheetId:
      input.attachmentSheetId ?? existing?.attachment_sheet_id ?? null,
    requestType: input.requestType || existing?.request_type || "supply",
    supplierName: input.supplierName ?? existing?.supplier_name ?? null,
    description: description.trim(),
    status,
    requestedAt: existing?.requested_at || input.requestedAt || now,
    proformaReceivedAt:
      input.proformaReceivedAt ??
      existing?.proforma_received_at ??
      (status === "proforma_received" ? now : null),
    orderedAt:
      input.orderedAt ??
      existing?.ordered_at ??
      (status === "ordered" ? now : null),
    receivedAt:
      input.receivedAt ??
      existing?.received_at ??
      (status === "received" ? now : null),
    proformaReference:
      input.proformaReference ?? existing?.proforma_reference ?? null,
    proformaDocumentId:
      input.proformaDocumentId ?? existing?.proforma_document_id ?? null,
    amountCents: input.amountCents ?? existing?.amount_cents ?? null,
    notes: input.notes ?? existing?.notes ?? null,
    createdAt: existing?.created_at || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_procurements (
    id, company_id, work_order_id, attachment_sheet_id, request_type, supplier_name,
    description, status, requested_at, proforma_received_at, ordered_at, received_at,
    proforma_reference, proforma_document_id, amount_cents, notes, created_at, updated_at
  ) VALUES (
    @id, @companyId, @workOrderId, @attachmentSheetId, @requestType, @supplierName,
    @description, @status, @requestedAt, @proformaReceivedAt, @orderedAt, @receivedAt,
    @proformaReference, @proformaDocumentId, @amountCents, @notes, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET supplier_name=excluded.supplier_name,
    description=excluded.description, status=excluded.status,
    proforma_received_at=excluded.proforma_received_at, ordered_at=excluded.ordered_at,
    received_at=excluded.received_at, proforma_reference=excluded.proforma_reference,
    proforma_document_id=excluded.proforma_document_id, amount_cents=excluded.amount_cents,
    notes=excluded.notes, updated_at=excluded.updated_at`,
  ).run(row);
  addEvent(companyId, workOrderId, {
    eventType: "procurement_updated",
    actorRole: input.actorRole || "BillingController",
    note: `${row.requestType} · ${row.status}`,
    evidence: { procurementId: id, status: row.status },
  });
  db.prepare(
    "UPDATE gmao_procurements SET supplier_id=?,items=?,order_reference=?,receipt_reference=?,responsible=?,due_at=? WHERE id=?",
  ).run(
    supplierId,
    JSON.stringify(items),
    input.orderReference ?? existing?.order_reference ?? null,
    input.receiptReference ?? existing?.receipt_reference ?? null,
    input.responsible ?? existing?.responsible ?? null,
    input.dueAt ?? existing?.due_at ?? null,
    id,
  );
  db.prepare(
    "INSERT INTO gmao_handoffs(id,company_id,work_order_id,procurement_id,source_team,target_team,status,created_at,updated_at) VALUES(?,?,?,?,'maintenance','purchasing','requested',?,?) ON CONFLICT(company_id,procurement_id) DO NOTHING",
  ).run(uuid(), companyId, workOrderId, id, now, now);
  const handoff = db
    .prepare(
      "SELECT id FROM gmao_handoffs WHERE company_id=? AND procurement_id=?",
    )
    .get(companyId, id);
  if (["received", "cancelled"].includes(status))
    db.prepare(
      "UPDATE gmao_handoffs SET status=?,note=?,updated_at=? WHERE company_id=? AND procurement_id=?",
    ).run(
      status === "received" ? "completed" : "cancelled",
      status === "received"
        ? "Pièces réceptionnées : intervention à replanifier."
        : "Demande annulée.",
      now,
      companyId,
      id,
    );
  return procurementRow(
    db.prepare("SELECT * FROM gmao_procurements WHERE id = ?").get(id),
  );
}

export function saveNotification(companyId, input = {}) {
  scopeInput("gmao_customer_notifications", companyId, input);
  if (!input.workOrderId || !input.notificationType)
    throw new Error("OI et type de notification obligatoires.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  bootstrap(companyId);
  const contact = db
    .prepare(
      "SELECT c.email,c.phone FROM gmao_work_orders w JOIN gmao_sites s ON s.id=w.site_id LEFT JOIN gmao_clients c ON c.id=s.client_id WHERE w.id=? AND w.company_id=?",
    )
    .get(input.workOrderId, companyId);
  const status = input.deliveryStatus || "ready";
  if (status !== "ready")
    throw new Error(
      "Les envois passent par la boîte d’envoi et un reçu fournisseur.",
    );
  const row = {
    id,
    companyId,
    workOrderId: input.workOrderId,
    notificationType: input.notificationType,
    channel: input.channel || "email",
    recipient:
      input.recipient ??
      (input.channel === "sms" ? contact?.phone : contact?.email) ??
      null,
    subject: input.subject || "Information sur votre ordre d'intervention",
    message:
      input.message ||
      "Une mise à jour de votre ordre d'intervention est disponible.",
    deliveryStatus: status,
    preparedAt: input.preparedAt || now,
    sentAt: input.sentAt ?? (status === "sent" ? now : null),
    error: input.error ?? null,
    metadata: json(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_customer_notifications (
    id, company_id, work_order_id, notification_type, channel, recipient, subject,
    message, delivery_status, prepared_at, sent_at, error, metadata, created_at, updated_at
  ) VALUES (
    @id, @companyId, @workOrderId, @notificationType, @channel, @recipient, @subject,
    @message, @deliveryStatus, @preparedAt, @sentAt, @error, @metadata, @createdAt, @updatedAt
  ) ON CONFLICT(company_id, work_order_id, notification_type) DO UPDATE SET
    channel=excluded.channel, recipient=excluded.recipient, subject=excluded.subject,
    message=excluded.message, delivery_status=excluded.delivery_status,
    sent_at=excluded.sent_at, error=excluded.error, metadata=excluded.metadata,
    updated_at=excluded.updated_at`,
  ).run(row);
  return notificationRow(
    db
      .prepare(
        "SELECT * FROM gmao_customer_notifications WHERE company_id = ? AND work_order_id = ? AND notification_type = ?",
      )
      .get(companyId, input.workOrderId, input.notificationType),
  );
}

function queueCustomerNotification(
  companyId,
  workOrder,
  notificationType,
  overrides = {},
) {
  const templates = {
    receipt_confirmed: {
      subject: `Prise en charge de l'OI ${workOrder.clientOiNumber || workOrder.workOrderNumber}`,
      message: `Nous confirmons la réception et la prise en charge de l'ordre d'intervention ${workOrder.clientOiNumber || workOrder.workOrderNumber}. La programmation de l'intervention va être communiquée.`,
    },
    intervention_completed: {
      subject: `Intervention terminée pour l'OI ${workOrder.clientOiNumber || workOrder.workOrderNumber}`,
      message: `L'intervention liée à l'ordre ${workOrder.clientOiNumber || workOrder.workOrderNumber} est terminée. Merci de nous transmettre le service fait.`,
    },
    quote_sent: {
      subject: `Devis transmis pour l'OI ${workOrder.clientOiNumber || workOrder.workOrderNumber}`,
      message: `Le devis relatif à l'ordre ${workOrder.clientOiNumber || workOrder.workOrderNumber} vous a été transmis et reste en attente de votre approbation.`,
    },
    invoice_sent: {
      subject: `Facture transmise pour l'OI ${workOrder.clientOiNumber || workOrder.workOrderNumber}`,
      message: `La facture relative à l'ordre ${workOrder.clientOiNumber || workOrder.workOrderNumber} vous a été transmise.`,
    },
  };
  const template = templates[notificationType] || {
    subject: `Mise à jour de l'OI ${workOrder.clientOiNumber || workOrder.workOrderNumber}`,
    message: `Une mise à jour de l'ordre ${workOrder.clientOiNumber || workOrder.workOrderNumber} est disponible.`,
  };
  return saveNotification(companyId, {
    workOrderId: workOrder.id,
    notificationType,
    ...template,
    ...overrides,
    metadata: {
      workOrderNumber: workOrder.workOrderNumber,
      status: workOrder.status,
      ...(overrides.metadata || {}),
    },
  });
}

export function addDocument(companyId, input = {}) {
  scopeInput("gmao_documents", companyId, input);
  const { db } = get();
  const contract = bootstrap(companyId);
  const now = Date.now();
  const id = input.id || uuid();
  const site = input.siteId
    ? db
        .prepare("SELECT * FROM gmao_sites WHERE id = ? AND company_id = ?")
        .get(input.siteId, companyId)
    : null;
  const asset = input.assetId
    ? db
        .prepare("SELECT * FROM gmao_assets WHERE id = ? AND company_id = ?")
        .get(input.assetId, companyId)
    : null;
  const filename =
    input.filename ||
    deterministicDocumentFilename({
      g2dNumber: site?.g2d_number,
      buildingCode: asset?.building_code,
      siteTrigram: site?.trigram,
      domainCode: asset?.domain_code || input.domainCode,
      periodicity: input.periodicity,
      date: input.date || now,
      conformity: input.conformity,
      ext: input.blobExt || extension(input.originalName),
    });
  const row = {
    id,
    companyId,
    contractId: input.contractId || contract.id,
    siteId: input.siteId ?? null,
    assetId: input.assetId ?? null,
    workOrderId: input.workOrderId ?? null,
    category: input.category || "technical_report",
    filename,
    originalName: input.originalName ?? null,
    mimeType: input.mimeType ?? null,
    blobId: input.blobId ?? null,
    blobExt: input.blobExt ?? null,
    storageRef: input.storageRef ?? null,
    sha256: input.sha256 ?? null,
    status: input.status || "valid",
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    metadata: json(input.metadata),
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_documents (
    id, company_id, contract_id, site_id, asset_id, work_order_id, category,
    filename, original_name, mime_type, blob_id, blob_ext, storage_ref, sha256,
    status, valid_from, valid_until, metadata, created_at, updated_at
  ) VALUES (
    @id, @companyId, @contractId, @siteId, @assetId, @workOrderId, @category,
    @filename, @originalName, @mimeType, @blobId, @blobExt, @storageRef, @sha256,
    @status, @validFrom, @validUntil, @metadata, @createdAt, @updatedAt
  )`,
  ).run(row);
  return documentRow(
    db.prepare("SELECT * FROM gmao_documents WHERE id = ?").get(id),
  );
}

export function saveCompliance(companyId, input = {}) {
  scopeInput("gmao_compliance_records", companyId, input);
  if (!input.recordType || !input.subjectName?.trim())
    throw new Error("Type et sujet de conformité obligatoires.");
  if (
    input.status === "valid" &&
    !input.documentId &&
    !String(input.notes || "").trim()
  )
    throw new Error(
      "Une pièce ou une référence vérifiable est requise pour valider cette exigence.",
    );
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const row = {
    id,
    companyId,
    siteId: input.siteId ?? null,
    subcontractorId: input.subcontractorId ?? null,
    documentId: input.documentId ?? null,
    recordType: input.recordType,
    subjectName: input.subjectName.trim(),
    status: input.status || "pending",
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    ownerRole: input.ownerRole || "QHSEManager",
    notes: input.notes ?? null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_compliance_records (
    id, company_id, site_id, subcontractor_id, document_id, record_type,
    subject_name, status, valid_from, valid_until, owner_role, notes, created_at, updated_at
  ) VALUES (
    @id, @companyId, @siteId, @subcontractorId, @documentId, @recordType,
    @subjectName, @status, @validFrom, @validUntil, @ownerRole, @notes, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET site_id=excluded.site_id, subcontractor_id=excluded.subcontractor_id,
    document_id=excluded.document_id, record_type=excluded.record_type, subject_name=excluded.subject_name,
    status=excluded.status, valid_from=excluded.valid_from, valid_until=excluded.valid_until,
    owner_role=excluded.owner_role, notes=excluded.notes, updated_at=excluded.updated_at
  `,
  ).run(row);
  return complianceRow(
    db.prepare("SELECT * FROM gmao_compliance_records WHERE id = ?").get(id),
  );
}

export function saveSubcontractor(companyId, input = {}) {
  scopeInput("gmao_subcontractors", companyId, input);
  if (!input.name?.trim())
    throw new Error("Le nom du sous-traitant est obligatoire.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const row = {
    id,
    companyId,
    name: input.name.trim(),
    registration: input.registration ?? null,
    contact: json(input.contact),
    declared: bool(input.declared),
    dc4Status: input.dc4Status || "missing",
    paymentApproved: bool(input.paymentApproved),
    status: input.status || "pending",
    personnel: json(input.personnel || []),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_subcontractors (
    id, company_id, name, registration, contact, declared, dc4_status,
    payment_approved, status, personnel, created_at, updated_at
  ) VALUES (
    @id, @companyId, @name, @registration, @contact, @declared, @dc4Status,
    @paymentApproved, @status, @personnel, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET name=excluded.name, registration=excluded.registration,
    contact=excluded.contact, declared=excluded.declared, dc4_status=excluded.dc4_status,
    payment_approved=excluded.payment_approved, status=excluded.status,
    personnel=excluded.personnel, updated_at=excluded.updated_at
  `,
  ).run(row);
  return subcontractorRow(
    db.prepare("SELECT * FROM gmao_subcontractors WHERE id = ?").get(id),
  );
}

export function saveRate(companyId, input = {}) {
  scopeInput("gmao_rate_rules", companyId, input);
  if (!input.label?.trim() || !input.rateType)
    throw new Error("Libellé et type de tarif obligatoires.");
  for (const key of ["amountCents", "coefficient", "vatRate"])
    if (
      input[key] != null &&
      (!Number.isFinite(Number(input[key])) || Number(input[key]) < 0)
    )
      throw new Error("Tarif invalide.");
  if (Number(input.vatRate) > 100) throw new Error("TVA invalide.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const row = {
    id,
    companyId,
    label: input.label.trim(),
    technicalSection: input.technicalSection ?? null,
    equipmentType: input.equipmentType ?? null,
    rateType: input.rateType,
    amountCents:
      input.amountCents == null ? null : Math.round(Number(input.amountCents)),
    coefficient: input.coefficient == null ? null : Number(input.coefficient),
    vatRate: finite(input.vatRate, 0),
    included: bool(input.included),
    effectiveFrom: input.effectiveFrom ?? now,
    effectiveUntil: input.effectiveUntil ?? null,
    metadata: json(input.metadata),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_rate_rules (
    id, company_id, label, technical_section, equipment_type, rate_type,
    amount_cents, coefficient, vat_rate, included, effective_from, effective_until,
    metadata, created_at, updated_at
  ) VALUES (
    @id, @companyId, @label, @technicalSection, @equipmentType, @rateType,
    @amountCents, @coefficient, @vatRate, @included, @effectiveFrom, @effectiveUntil,
    @metadata, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET label=excluded.label, technical_section=excluded.technical_section,
    equipment_type=excluded.equipment_type, rate_type=excluded.rate_type, amount_cents=excluded.amount_cents,
    coefficient=excluded.coefficient, vat_rate=excluded.vat_rate, included=excluded.included,
    effective_from=excluded.effective_from, effective_until=excluded.effective_until,
    metadata=excluded.metadata, updated_at=excluded.updated_at
  `,
  ).run(row);
  return rateRow(
    db.prepare("SELECT * FROM gmao_rate_rules WHERE id = ?").get(id),
  );
}

export function createQuote(companyId, workOrderId, input = {}) {
  if (input.status && input.status !== "draft")
    throw new Error("Un devis est créé en brouillon.");
  for (const key of [
    "partsCents",
    "laborCents",
    "travelCents",
    "accessCents",
    "franchiseCents",
    "coefficient",
    "vatRate",
  ])
    if (
      input[key] != null &&
      (!Number.isFinite(Number(input[key])) || Number(input[key]) < 0)
    )
      throw new Error("Montant ou taux invalide.");
  scopeInput("gmao_quotes", companyId, { ...input, workOrderId });
  const { db } = get();
  const workOrder = getWorkOrder(companyId, workOrderId);
  if (!workOrder) throw new Error("Ordre de travail introuvable.");
  const contract = bootstrap(companyId);
  const now = Date.now();
  const asset = workOrder.assetId
    ? db
        .prepare(
          "SELECT technical_section, domain_code, equipment_type FROM gmao_assets WHERE id = ? AND company_id = ?",
        )
        .get(workOrder.assetId, companyId)
    : null;
  const rateRows = db
    .prepare(
      `SELECT * FROM gmao_rate_rules WHERE company_id = ?
    AND (effective_from IS NULL OR effective_from <= ?)
    AND (effective_until IS NULL OR effective_until >= ?)
    ORDER BY (technical_section IS NOT NULL) DESC, created_at DESC`,
    )
    .all(companyId, now, now)
    .map(rateRow);
  const rate = (type) =>
    rateRows
      .filter(
        (item) =>
          item.rateType === type &&
          (!item.technicalSection ||
            item.technicalSection === asset?.technical_section) &&
          (!item.equipmentType ||
            String(asset?.equipment_type || "")
              .toLowerCase()
              .includes(item.equipmentType.toLowerCase())),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.equipmentType)) - Number(Boolean(a.equipmentType)),
      )[0];
  const clientContract = db
    .prepare(
      "SELECT c.* FROM gmao_sites s JOIN gmao_service_contracts c ON c.id=s.service_contract_id WHERE s.id=? AND s.company_id=?",
    )
    .get(workOrder.siteId, companyId);
  const priced = {
    ...input,
    quoteType: input.quoteType || "outside_bpu",
    laborCents:
      input.laborCents ??
      input.labor ??
      rate("labor")?.amountCents ??
      rate("bpu")?.amountCents ??
      0,
    travelCents:
      input.travelCents ?? input.travel ?? rate("travel")?.amountCents ?? 0,
    accessCents:
      input.accessCents ?? input.access ?? rate("access")?.amountCents ?? 0,
    franchiseCents:
      input.franchiseCents ??
      input.franchise ??
      rate("franchise")?.amountCents ??
      0,
    coefficient: input.coefficient ?? rate("coefficient")?.coefficient ?? 1,
    vatRate: input.vatRate ?? clientContract?.vat_rate ?? contract.vatRate,
  };
  const profile = clientContract?.settings ? JSON.parse(clientContract.settings).gasFranchise : null;
  const useGasProfile = gasProfileApplies(profile, asset && {domainCode:asset.domain_code,technicalSection:asset.technical_section}, priced.quoteType);
  const pricingProfile = clientContract?.settings ? JSON.parse(clientContract.settings).pricingProfile : null;
  const usePricingProfile = pricingProfile && priced.quoteType === 'outside_bpu' && asset?.domain_code !== 'REG';
  const computed = useGasProfile ? calculateGasContractQuote(priced, profile)
    : usePricingProfile ? calculateContractQuote(priced, pricingProfile, asset && {technicalSection: asset.technical_section, domainCode: asset.domain_code})
    : calculateQuoteDomain(priced);
  const id = input.id || uuid();
  const sequence =
    db
      .prepare("SELECT COUNT(*) AS n FROM gmao_quotes WHERE company_id = ?")
      .get(companyId).n + 1;
  const row = {
    id,
    companyId,
    workOrderId,
    quoteNumber: input.quoteNumber || quoteNumber(sequence, now),
    quoteType: input.quoteType || "outside_bpu",
    status: input.status || "draft",
    ...computed,
    purchaseOrder: input.purchaseOrder ?? null,
    procurementId: input.procurementId ?? null,
    supplierProformaRef: input.supplierProformaRef ?? null,
    sentAt: input.sentAt ?? (input.status === "sent" ? now : null),
    acceptedAt: input.acceptedAt ?? (input.status === "accepted" ? now : null),
    validUntil: input.validUntil ?? addMonths(now, 3),
    calculation: JSON.stringify({
      formula:
        computed.formula || (computed.contractTerms ? "pièces ≤ 300 € HT : tout inclus ; sinon total HT − 350 € − main-d’œuvre jusqu’à 8 h − déplacement" : computed.quoteType === "outside_bpu"
          ? "si pièces ≤ franchise : 0 € ; sinon (pièces - franchise) × K + TVA"
          : computed.quoteType === "improvement"
            ? "pièces × K + main-d'œuvre + déplacement + accès + TVA"
            : "BPU contractuel + TVA"),
      source: rateRows.length ? "catalogue_et_saisie" : "saisie",
      ...priced,
      ...(useGasProfile ? { contractProfile: profile, contractTerms: computed.contractTerms, includedLaborCents: computed.includedLaborCents } : {}),
      ...(usePricingProfile ? { contractProfile: pricingProfile, contractTerms: computed.contractTerms, includedLaborCents: computed.includedLaborCents } : {}),
    }),
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_quotes (
    id, company_id, work_order_id, quote_number, quote_type, status,
    parts_cents, labor_cents, travel_cents, access_cents, franchise_cents,
    coefficient, subtotal_cents, vat_rate, vat_cents, total_cents,
    purchase_order, calculation, procurement_id, supplier_proforma_ref, sent_at, accepted_at, valid_until,
    created_at, updated_at
  ) VALUES (
    @id, @companyId, @workOrderId, @quoteNumber, @quoteType, @status,
    @partsCents, @laborCents, @travelCents, @accessCents, @franchiseCents,
    @coefficient, @subtotalCents, @vatRate, @vatCents, @totalCents,
    @purchaseOrder, @calculation, @procurementId, @supplierProformaRef, @sentAt, @acceptedAt, @validUntil,
    @createdAt, @updatedAt
  )`,
  ).run(row);
  db.prepare(
    "UPDATE gmao_work_orders SET quote_status = ?, updated_at = ? WHERE id = ? AND company_id = ?",
  ).run(row.status, now, workOrderId, companyId);
  return quoteRow(db.prepare("SELECT * FROM gmao_quotes WHERE id = ?").get(id));
}

export function updateQuote(companyId, quoteId, input = {}) {
  const { db } = get();
  const raw = db
    .prepare("SELECT * FROM gmao_quotes WHERE id = ? AND company_id = ?")
    .get(quoteId, companyId);
  if (!raw) throw new Error("Devis introuvable.");
  const quote = quoteRow(raw);
  const status = input.status || quote.status;
  if (status === "sent" && quote.status !== "sent")
    throw new Error("Envoyez ce devis depuis la boîte d’envoi avec son PDF.");
  if (
    status !== quote.status &&
    ["accepted", "purchase_order_received", "rejected"].includes(status) &&
    !input.documentId &&
    !String(input.evidenceReference || "").trim()
  )
    throw new Error("Joignez une preuve de la décision client.");
  scopeInput("gmao_quotes", companyId, {
    ...input,
    workOrderId: quote.workOrderId,
  });
  const purchaseOrder = input.purchaseOrder ?? quote.purchaseOrder;
  assertQuoteTransition(quote.status, status, purchaseOrder);
  const now = Date.now();
  db.prepare(
    `UPDATE gmao_quotes SET status = ?, purchase_order = ?, sent_at = ?,
    accepted_at = ?, purchase_order_received_at = ?, rejection_reason = ?, updated_at = ?
    WHERE id = ? AND company_id = ?`,
  ).run(
    status,
    purchaseOrder || null,
    quote.sentAt || (status === "sent" ? now : null),
    quote.acceptedAt ||
      (status === "accepted" || status === "purchase_order_received"
        ? now
        : null),
    quote.purchaseOrderReceivedAt ||
      (status === "purchase_order_received" ? now : null),
    input.rejectionReason ?? quote.rejectionReason ?? null,
    now,
    quoteId,
    companyId,
  );
  db.prepare(
    "UPDATE gmao_work_orders SET quote_status = ?, purchase_order = ?, updated_at = ? WHERE id = ? AND company_id = ?",
  ).run(status, purchaseOrder || null, now, quote.workOrderId, companyId);
  addEvent(companyId, quote.workOrderId, {
    eventType:
      status === "purchase_order_received"
        ? "purchase_order_received"
        : "quote_updated",
    actorRole: input.actorRole || "BillingController",
    note: input.note || `Devis ${status}`,
    evidence: {
      quoteId,
      status,
      purchaseOrder: purchaseOrder || null,
      documentId: input.documentId || null,
      evidenceReference: input.evidenceReference || null,
    },
    happenedAt: now,
  });

  return quoteRow(
    db.prepare("SELECT * FROM gmao_quotes WHERE id = ?").get(quoteId),
  );
}

export function recordServiceAcceptance(companyId, workOrderId, input = {}) {
  scopeInput("gmao_work_orders", companyId, { ...input, workOrderId });
  const { db } = get();
  const workOrder = getWorkOrder(companyId, workOrderId);
  if (!workOrder) throw new Error("Ordre d'intervention introuvable.");
  if (workOrder.status !== "restored")
    throw new Error(
      "Le service fait se réceptionne après la fin de l'intervention.",
    );
  if (!input.reference?.trim())
    throw new Error("La référence du service fait est obligatoire.");
  const attachment = attachmentSheetRow(
    db
      .prepare(
        `SELECT * FROM gmao_attachment_sheets
    WHERE company_id = ? AND work_order_id = ? AND resolved = 1 ORDER BY ended_at DESC LIMIT 1`,
      )
      .get(companyId, workOrderId),
  );
  if (!attachment)
    throw new Error("Aucune feuille d'attachement résolue n'est disponible.");
  const now = input.receivedAt || Date.now();
  db.transaction(() => {
    if (!input.documentId && !String(input.customerSignatory || '').trim()) throw new Error('Joignez le service fait ou identifiez le signataire.');
    if (workOrder.purchaseOrder && !processFact(companyId, workOrderId, 'service_acceptance_requested')) throw new Error('Validez la demande de service fait transmise au client.');
    updateById(
      "gmao_work_orders",
      workOrderId,
      {
        service_acceptance_reference: input.reference.trim(),
        service_acceptance_received_at: now,
        service_acceptance: 1,
        billing_status: "acceptance_received",
      },
      now,
    );
    addEvent(companyId, workOrderId, {
      eventType: "service_acceptance_received",
      actorRole: input.actorRole || "BillingController",
      actorName: input.actorName,
      note: `Service fait reçu : ${input.reference.trim()}`,
      evidence: {
        reference: input.reference.trim(),
        documentId: input.documentId || null,
        customerSignatory: String(input.customerSignatory || '').trim() || null,
      },
      happenedAt: now,
    });
    queueCustomerNotification(companyId, getWorkOrder(companyId,workOrderId), 'service-acceptance-' + uuid(), {message:`Service fait reçu pour votre intervention : ${input.reference.trim()}.`});
  })();
  return getWorkOrder(companyId, workOrderId);
}

function processFact(companyId, workOrderId, kind) {
  const order = getWorkOrder(companyId, workOrderId);
  return get().db.prepare("SELECT * FROM gmao_work_order_events WHERE company_id=? AND work_order_id=? AND event_type=? ORDER BY happened_at DESC").all(companyId, workOrderId, 'process_' + kind).map(eventRow).find(e => !e.evidence?.purchaseOrder || e.evidence.purchaseOrder === order.purchaseOrder);
}
export function validateProcessStep(companyId, workOrderId, input = {}) {
  return get().db.transaction(() => {
    const wo = getWorkOrder(companyId, workOrderId);
    if (!wo || ['completed','cancelled'].includes(wo.status)) throw new Error('Dossier introuvable ou clôturé.');
    if (input.confirmed !== true) throw new Error('Confirmez explicitement cette validation.');
    const step = input.step;
    if (!['purchase_order_signed','purchase_order_returned','service_acceptance_requested','billing_requested','close'].includes(step)) throw new Error('Étape inconnue.');
    if (processFact(companyId, workOrderId, step)) return wo;
    const evidence = { purchaseOrder: wo.purchaseOrder || null };
    if (step === 'purchase_order_signed') {
      if (wo.quoteStatus !== 'purchase_order_received') throw new Error('Le BC client doit être reçu.');
      const doc = owned('gmao_documents', companyId, input.documentId);
      if (doc.work_order_id !== workOrderId || !doc.blob_id || !doc.blob_ext || !localBlobs.exists(doc.blob_id, doc.blob_ext)) throw new Error('Joignez le BC signé conservé dans ce dossier.');
      if (!String(input.signer || '').trim()) throw new Error('Identifiez le signataire du BC.');
      Object.assign(evidence, { documentId: doc.id, signer: input.signer.trim() });
    }
    if (step === 'purchase_order_returned' || step === 'service_acceptance_requested') {
      if (!wo.purchaseOrder) throw new Error('Cette étape nécessite un BC client.');
      if (step === 'service_acceptance_requested' && wo.status !== 'restored') throw new Error('Terminez les travaux avant la demande de service fait.');
      const sent = owned('gmao_outbox', companyId, input.outboxId);
      const contact = get().db.prepare('SELECT c.email FROM gmao_work_orders w JOIN gmao_sites s ON s.id=w.site_id JOIN gmao_clients c ON c.id=s.client_id WHERE w.id=? AND w.company_id=?').get(workOrderId, companyId);
      if (sent.work_order_id !== workOrderId || sent.channel !== 'email' || !['submitted','delivered'].includes(sent.status) || !contact?.email || sent.recipient.toLowerCase() !== contact.email.toLowerCase()) throw new Error('Choisissez l’email au client avec un reçu d’envoi confirmé.');
      if (step === 'purchase_order_returned') {
        const signed = processFact(companyId, workOrderId, 'purchase_order_signed');
        if (!signed || sent.document_id !== signed.evidence.documentId) throw new Error('L’envoi doit contenir le BC signé validé.');
      }
      if (step === 'service_acceptance_requested' && (!sent.submitted_at || sent.submitted_at < wo.restoredAt || processFact(companyId,workOrderId,'purchase_order_returned')?.evidence?.outboxId === sent.id)) throw new Error('La demande de service fait doit être envoyée après la fin des travaux.');
      Object.assign(evidence, { outboxId: sent.id, documentId: sent.document_id, providerId: sent.provider_id });
    }
    if (step === 'billing_requested') {
      if (!wo.serviceAcceptanceReceivedAt || !wo.serviceAcceptanceReference || wo.status !== 'restored') throw new Error('Réceptionnez le numéro de service fait avant de transmettre à la facturation.');
      updateById('gmao_work_orders', workOrderId, {billing_status:'ready_to_invoice'});
      evidence.reference = wo.serviceAcceptanceReference;
    }
    if (step === 'close') {
      if (!String(input.customerSignatory || '').trim() || !String(input.evidenceReference || '').trim()) throw new Error('Identifiez le client ayant donné son accord et la référence de cet accord.');
      transitionWorkOrder(companyId, workOrderId, 'completed', {serviceAcceptance:true, customerSignatory:input.customerSignatory, notes:input.evidenceReference, serviceAcceptanceReference:wo.serviceAcceptanceReference, actorName:input.actorName});
      Object.assign(evidence, {customerSignatory:input.customerSignatory, reference:input.evidenceReference});
    }
    recordEvent(companyId, workOrderId, {eventType:'process_' + step, actorRole:input.actorRole || 'Owner', actorName:input.actorName, evidence});
    if (step !== 'close') queueCustomerNotification(companyId, getWorkOrder(companyId,workOrderId), 'process_' + step + '-' + uuid(), {message: input.note || `La validation « ${{purchase_order_signed:'BC signé',purchase_order_returned:'BC retourné',service_acceptance_requested:'demande de service fait',billing_requested:'transmis au service facturation',close:'clôture'}[step]} » a été enregistrée pour votre intervention.`});
    return getWorkOrder(companyId, workOrderId);
  })();
}

export function saveInvoice(companyId, input = {}) {
  scopeInput("gmao_invoices", companyId, input);
  const { db } = get();
  const now = Date.now();
  const existing = input.id
    ? invoiceRow(
        db
          .prepare(
            "SELECT * FROM gmao_invoices WHERE id = ? AND company_id = ?",
          )
          .get(input.id, companyId),
      )
    : null;
  const workOrderId = input.workOrderId || existing?.workOrderId;
  scopeInput("gmao_invoices", companyId, {
    ...input,
    quoteId: input.quoteId || existing?.quoteId,
    workOrderId,
  });
  if (existing && existing.workOrderId !== workOrderId)
    throw new Error("Une facture ne peut pas changer d’intervention.");
  const workOrder = workOrderId ? getWorkOrder(companyId, workOrderId) : null;
  if (!workOrder) throw new Error("Ordre d'intervention introuvable.");
  if (!workOrder.serviceAcceptance || !workOrder.serviceAcceptanceReceivedAt) {
    throw new Error(
      "La facture ne peut être créée qu'après réception du service fait.",
    );
  }
  if (workOrder.billingStatus === 'acceptance_received') throw new Error('Validez la transmission au service facturation avant de préparer la facture.');
  const quote = input.quoteId
    ? quoteRow(
        db
          .prepare("SELECT * FROM gmao_quotes WHERE id = ? AND company_id = ?")
          .get(input.quoteId, companyId),
      )
    : quoteRow(
        db
          .prepare(
            "SELECT * FROM gmao_quotes WHERE work_order_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get(workOrderId, companyId),
      );
  const count =
    db
      .prepare("SELECT COUNT(*) AS n FROM gmao_invoices WHERE company_id = ?")
      .get(companyId).n + 1;
  const issuedAt = input.issuedAt || existing?.issuedAt || now;
  const status = input.status || existing?.status || "draft";
  if (!["draft", "sent"].includes(status))
    throw new Error("Statut de facture invalide.");
  if (status === "sent" && existing?.status !== "sent")
    throw new Error("Envoyez la facture via la boîte d’envoi.");
  if (!existing && status === "sent")
    throw new Error("La facture doit être créée avant son envoi.");
  if (existing?.status === "sent")
    throw new Error(
      "Une facture envoyée est immuable. Créez un document correctif distinct.",
    );
  const subtotalCents =
    input.subtotalCents ?? existing?.subtotalCents ?? quote?.subtotalCents ?? 0;
  const vatRate = input.vatRate ?? existing?.vatRate ?? quote?.vatRate ?? 0;
  if (
    !Number.isSafeInteger(subtotalCents) ||
    subtotalCents < 0 ||
    !Number.isFinite(vatRate) ||
    vatRate < 0 ||
    vatRate > 100
  )
    throw new Error("Montants de facture invalides.");
  const vatCents = Math.round((subtotalCents * vatRate) / 100);
  if (
    (input.vatCents != null && input.vatCents !== vatCents) ||
    (input.totalCents != null && input.totalCents !== subtotalCents + vatCents)
  )
    throw new Error("Le total doit correspondre au HT et à la TVA.");
  const row = {
    id: input.id || uuid(),
    companyId,
    workOrderId,
    quoteId: input.quoteId ?? existing?.quoteId ?? quote?.id ?? null,
    invoiceNumber:
      input.invoiceNumber?.trim() ||
      existing?.invoiceNumber ||
      `FAC-${new Date(issuedAt).getUTCFullYear()}-${String(count).padStart(5, "0")}`,
    status,
    subtotalCents,
    vatRate,
    vatCents,
    totalCents: subtotalCents + vatCents,
    issuedAt,
    sentAt:
      input.sentAt ?? existing?.sentAt ?? (status === "sent" ? now : null),
    recipient:
      input.recipient ??
      existing?.recipient ??
      db
        .prepare("SELECT client_email FROM gmao_contracts WHERE company_id = ?")
        .get(companyId)?.client_email ??
      null,
    documentId: input.documentId ?? existing?.documentId ?? null,
    notes: input.notes ?? existing?.notes ?? null,
    planningExportStatus:
      input.planningExportStatus ?? existing?.planningExportStatus ?? "pending",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_invoices (
    id, company_id, work_order_id, quote_id, invoice_number, status, subtotal_cents,
    vat_rate, vat_cents, total_cents, issued_at, sent_at, recipient, document_id,
    notes, planning_export_status, created_at, updated_at
  ) VALUES (
    @id, @companyId, @workOrderId, @quoteId, @invoiceNumber, @status, @subtotalCents,
    @vatRate, @vatCents, @totalCents, @issuedAt, @sentAt, @recipient, @documentId,
    @notes, @planningExportStatus, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET status=excluded.status, sent_at=excluded.sent_at, subtotal_cents=excluded.subtotal_cents,vat_rate=excluded.vat_rate,vat_cents=excluded.vat_cents,total_cents=excluded.total_cents,
    recipient=excluded.recipient, document_id=excluded.document_id, notes=excluded.notes,
    planning_export_status=excluded.planning_export_status,
    updated_at=excluded.updated_at`,
  ).run(row);
  updateById(
    "gmao_work_orders",
    workOrderId,
    { billing_status: status === "sent" ? "invoice_sent" : "invoice_draft" },
    now,
  );
  addEvent(companyId, workOrderId, {
    eventType: status === "sent" ? "invoice_sent" : "invoice_created",
    actorRole: input.actorRole || "BillingController",
    note: `${row.invoiceNumber} · ${status}`,
    evidence: {
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      totalCents: row.totalCents,
    },
    happenedAt: now,
  });

  return invoiceRow(
    db.prepare("SELECT * FROM gmao_invoices WHERE id = ?").get(row.id),
  );
}

export function saveOnCallShift(companyId, input = {}) {
  scopeInput("gmao_on_call_shifts", companyId, input);
  if (
    !input.personName?.trim() ||
    !input.phone?.trim() ||
    !input.startsAt ||
    !input.endsAt
  ) {
    throw new Error(
      "Intervenant, téléphone, début et fin d'astreinte obligatoires.",
    );
  }
  if (input.endsAt <= input.startsAt)
    throw new Error("La fin d'astreinte doit suivre son début.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  const row = {
    id,
    companyId,
    siteId: input.siteId ?? null,
    personName: input.personName.trim(),
    phone: input.phone.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: input.status || "planned",
    notes: input.notes ?? null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO gmao_on_call_shifts (
    id, company_id, site_id, person_name, phone, starts_at, ends_at,
    status, notes, created_at, updated_at
  ) VALUES (
    @id, @companyId, @siteId, @personName, @phone, @startsAt, @endsAt,
    @status, @notes, @createdAt, @updatedAt
  ) ON CONFLICT(id) DO UPDATE SET site_id=excluded.site_id, person_name=excluded.person_name,
    phone=excluded.phone, starts_at=excluded.starts_at, ends_at=excluded.ends_at,
    status=excluded.status, notes=excluded.notes, updated_at=excluded.updated_at
  `,
  ).run(row);
  return onCallRow(
    db.prepare("SELECT * FROM gmao_on_call_shifts WHERE id = ?").get(id),
  );
}

export function generatePreventive(
  companyId,
  now = Date.now(),
  horizon = now + 90 * 86400000,
) {
  const { db } = get();
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(horizon) ||
    horizon < now ||
    horizon > now + 366 * 86400000
  )
    throw new Error("Horizon préventif invalide.");
  const plans = db
    .prepare(
      "SELECT * FROM gmao_maintenance_plans WHERE company_id=? AND active=1 AND next_due_at IS NOT NULL AND next_due_at<=?",
    )
    .all(companyId, horizon)
    .map(planRow);
  const created = [];
  const skipped = [];
  const norm = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  db.transaction(() => {
    for (const plan of plans) {
      const assets = db
        .prepare(
          "SELECT a.* FROM gmao_assets a JOIN gmao_sites s ON s.id=a.site_id WHERE a.company_id=? AND a.operational=1 AND s.active=1 AND a.technical_section=?",
        )
        .all(companyId, plan.technicalSection)
        .filter(
          (a) =>
            (!plan.assetId || a.id === plan.assetId) &&
            (!plan.equipmentType ||
              norm(a.equipment_type) === norm(plan.equipmentType)),
        );
      if (!assets.length) {
        skipped.push({
          planId: plan.id,
          reason: "Aucun équipement correspondant",
        });
        continue;
      }
      let due = plan.nextDueAt,
        cycles = 0;
      while (due <= horizon && cycles++ < (plan.metadata?.periodicityDays ? 3660 : 120)) {
        for (const asset of assets) {
          const duplicate = db
            .prepare(
              "SELECT id FROM gmao_work_orders WHERE company_id=? AND maintenance_plan_id=? AND asset_id=? AND preventive_due_at=?",
            )
            .get(companyId, plan.id, asset.id, due);
          if (duplicate) continue;
          created.push(
            createWorkOrder(companyId, {
              siteId: asset.site_id,
              assetId: asset.id,
              maintenancePlanId: plan.id,
              type: "preventive",
              priority: asset.criticality,
              title: plan.name + " — " + asset.asset_code,
              description: [
                plan.description,
                "Contrôles prévus :",
                ...plan.checklist,
              ]
                .filter(Boolean)
                .join("\n"),
              source: "preventive_program",
              scheduledAt: null,
              preventiveDueAt: due,
              interventionDueAt: due,
              restorationDueAt: null,
              campaignColor: campaignForDate(due).color,
            }),
          );
        }
        due = plan.metadata?.periodicityDays ? due + plan.metadata.periodicityDays * 86400000 : addMonths(due, plan.periodicityMonths);
      }
      db.prepare(
        "UPDATE gmao_maintenance_plans SET last_generated_at=?,next_due_at=?,updated_at=? WHERE id=?",
      ).run(now, due, now, plan.id);
    }
  })();
  return { generated: created.length, workOrders: created, skipped };
}

export function evaluateAndRecordSla(companyId, now = Date.now()) {
  const { db } = get();
  const workOrders = db
    .prepare(
      "SELECT * FROM gmao_work_orders WHERE company_id = ? AND status != 'cancelled'",
    )
    .all(companyId)
    .map(workOrderRow);
  const recorded = [];
  const stmt = db.prepare(`INSERT INTO gmao_penalties (
    id, company_id, work_order_id, document_id, penalty_key, label, rate_cents,
    unit, quantity, amount_cents, status, reason, detected_at, resolved_at, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'potential', ?, ?, NULL, NULL)
  ON CONFLICT(company_id, penalty_key) DO UPDATE SET
    quantity=excluded.quantity, amount_cents=excluded.amount_cents,
    reason=excluded.reason, detected_at=excluded.detected_at`);
  db.transaction(() => {
    for (const workOrder of workOrders) {
      const result = evaluateWorkOrderSla(workOrder, now);
      for (const penalty of parseJson(
        db
          .prepare("SELECT config FROM gmao_contracts WHERE company_id=?")
          .get(companyId)?.config,
        {},
      )?.referencePenaltiesConfirmed === true
        ? result.penalties
        : []) {
        const key = `${workOrder.id}:${penalty.key}`;
        stmt.run(
          uuid(),
          companyId,
          workOrder.id,
          null,
          key,
          penalty.label,
          penalty.rateCents,
          penalty.unit,
          penalty.quantity,
          penalty.amountCents,
          `${workOrder.workOrderNumber} — ${penalty.label}`,
          now,
        );
        recorded.push({
          workOrderId: workOrder.id,
          penaltyKey: key,
          ...penalty,
        });
      }
    }
    const compliance = db
      .prepare(
        `SELECT * FROM gmao_compliance_records
      WHERE company_id = ? AND status != 'valid' AND valid_until IS NOT NULL AND valid_until < ?`,
      )
      .all(companyId, now)
      .map(complianceRow);
    for (const record of compliance) {
      for (const penalty of parseJson(
        db
          .prepare("SELECT config FROM gmao_contracts WHERE company_id=?")
          .get(companyId)?.config,
        {},
      )?.referencePenaltiesConfirmed === true
        ? evaluateComplianceSla(record, now)
        : []) {
        const key = `compliance:${record.id}:${penalty.key}`;
        stmt.run(
          uuid(),
          companyId,
          null,
          record.documentId || null,
          key,
          penalty.label,
          penalty.rateCents,
          penalty.unit,
          penalty.quantity,
          penalty.amountCents,
          `${record.subjectName} — ${penalty.label}`,
          now,
        );
        recorded.push({ complianceId: record.id, penaltyKey: key, ...penalty });
      }
    }
  })();
  return { evaluated: workOrders.length, recorded };
}

export function ingestDocument(companyId, input = {}) {
  scopeInput("gmao_document_intake", companyId, input);
  if (!input.originalName?.trim())
    throw new Error("Le nom du document est obligatoire.");
  const { db } = get();
  bootstrap(companyId);
  const now = input.receivedAt || Date.now();
  const analysis = classifyGmaoDocument({
    filename: input.originalName,
    text: input.extractedText,
  });
  const extracted = { ...analysis.extracted, ...(input.extractedData || {}) };
  let matchedWorkOrderId = input.matchedWorkOrderId || null;
  if (!matchedWorkOrderId && extracted.clientOiNumber) {
    matchedWorkOrderId =
      db
        .prepare(
          `SELECT id FROM gmao_work_orders
      WHERE company_id = ? AND (client_oi_number = ? OR work_order_number = ?) LIMIT 1`,
        )
        .get(companyId, extracted.clientOiNumber, extracted.clientOiNumber)
        ?.id || null;
  }
  if (!matchedWorkOrderId && extracted.quoteNumber) {
    matchedWorkOrderId =
      db
        .prepare(
          `SELECT work_order_id AS id FROM gmao_quotes
      WHERE company_id = ? AND quote_number = ? LIMIT 1`,
        )
        .get(companyId, extracted.quoteNumber)?.id || null;
  }
  if (matchedWorkOrderId)
    owned("gmao_work_orders", companyId, matchedWorkOrderId);
  const id = input.id || uuid();
  db.prepare(
    `INSERT INTO gmao_document_intake (
    id, company_id, blob_id, original_name, mime_type, source_channel, sender,
    received_at, extracted_text, document_type, confidence, extracted_data, status,
    matched_work_order_id, reviewed_by, reviewed_at, error, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  ).run(
    id,
    companyId,
    input.blobId ?? null,
    input.originalName.trim(),
    input.mimeType ?? null,
    input.sourceChannel || "manual",
    input.sender ?? null,
    now,
    input.extractedText ?? null,
    input.documentType || analysis.documentType,
    input.confidence ?? analysis.confidence,
    JSON.stringify(extracted),
    "to_review",
    matchedWorkOrderId,
    now,
    now,
  );
  if (input.extractionError)
    db.prepare("UPDATE gmao_document_intake SET error=? WHERE id=?").run(
      input.extractionError,
      id,
    );
  saveRecommendation(companyId, {
    workOrderId: matchedWorkOrderId,
    recommendationType: "document_review",
    title: `Valider le document ${input.originalName.trim()}`,
    rationale: `Type proposé : ${input.documentType || analysis.documentType}. Confiance ${Math.round((input.confidence ?? analysis.confidence) * 100)} %.`,
    confidence: input.confidence ?? analysis.confidence,
    priority: analysis.needsReview ? "high" : "normal",
    proposedAction: "gmao.applyDocumentIntake",
    sourceData: {
      documentIntakeId: id,
      evidence: analysis.evidence,
      extracted,
    },
  });
  return documentIntakeRow(
    db.prepare("SELECT * FROM gmao_document_intake WHERE id = ?").get(id),
  );
}

export function applyDocumentIntake(companyId, intakeId, input = {}) {
  const { db } = get();
  const intake = documentIntakeRow(
    db
      .prepare(
        "SELECT * FROM gmao_document_intake WHERE id = ? AND company_id = ?",
      )
      .get(intakeId, companyId),
  );
  if (!intake) throw new Error("Document entrant introuvable.");
  if (intake.status !== "to_review")
    throw new Error("Ce document a déjà été traité.");
  const data = {
    ...(intake.extractedData || {}),
    ...(input.extractedData || {}),
  };
  const type = input.documentType || intake.documentType;
  let workOrderId = input.workOrderId || intake.matchedWorkOrderId || null;
  scopeInput("gmao_document_intake", companyId, { ...input, workOrderId });
  let result = null;
  db.transaction(() => {
    let document = null;
    if (workOrderId && intake.blobId)
      document = addDocument(companyId, {
        workOrderId,
        blobId: intake.blobId,
        blobExt: intake.originalName.split(".").pop().toLowerCase(),
        originalName: intake.originalName,
        mimeType: intake.mimeType,
        category: type,
        metadata: { intakeId },
      });
    if (type === "work_order") {
      if (!workOrderId) {
        if (!input.siteId)
          throw new Error("Choisissez le site avant de créer l'OI.");
        const triage = recommendWorkOrderTriage({
          title: input.title,
          description: input.description,
          extractedText: intake.extractedText,
        });
        result = createWorkOrder(companyId, {
          siteId: input.siteId,
          assetId: input.assetId,
          source: "document_intake",
          sourceDocumentId: intakeId,
          clientOiNumber: data.clientOiNumber,
          title:
            input.title ||
            `OI client ${data.clientOiNumber || intake.originalName}`,
          description:
            input.description || intake.extractedText?.slice(0, 1500),
          requesterName: data.requester,
          requesterContact: input.requesterContact,
          priority: input.priority || triage.priority,
          predictedCategory: input.predictedCategory || "corrective",
          aiConfidence: triage.confidence,
          blockageLevel: input.blockageLevel,
          locationDetail: input.locationDetail,
          actorRole: input.reviewerRole || "DispatchCoordinator",
        });
        workOrderId = result.id;
      }
    } else if (type === "purchase_order") {
      const matches = db
        .prepare(
          "SELECT * FROM gmao_quotes WHERE company_id=? AND work_order_id=?",
        )
        .all(companyId, workOrderId)
        .filter((q) =>
          input.quoteId
            ? q.id === input.quoteId
            : data.quoteNumber
              ? q.quote_number === data.quoteNumber
              : true,
        );
      if (matches.length !== 1)
        throw new Error(
          "Choisissez le devis exact associé au bon de commande.",
        );
      const quote = matches[0];
      if (quote.status === "sent")
        updateQuote(companyId, quote.id, {
          status: "accepted",
          documentId: document?.id,
          evidenceReference: data.purchaseOrder,
          actorRole: input.reviewerRole,
        });
      result = updateQuote(companyId, quote.id, {
        status: "purchase_order_received",
        purchaseOrder: data.purchaseOrder,
        documentId: document?.id,
        evidenceReference: data.purchaseOrder,
        actorRole: input.reviewerRole,
      });
    } else if (type === "service_acceptance") {
      result = recordServiceAcceptance(companyId, workOrderId, {
        reference: data.serviceAcceptanceReference,
        documentId: document?.id,
        customerSignatory: input.customerSignatory,
        actorRole: input.reviewerRole,
      });
    }
    if (type === "supplier_proforma") {
      if (!input.procurementId)
        throw new Error("Choisissez la demande achats concernée.");
      result = saveProcurement(companyId, {
        id: input.procurementId,
        workOrderId,
        status: "proforma_received",
        proformaReference:
          data.proformaReference || data.quoteNumber || intake.originalName,
        proformaDocumentId: document?.id,
        amountCents: data.totalHtCents,
      });
    } else if (
      ["quote", "invoice", "attachment_sheet", "unknown"].includes(type)
    ) {
      if (!workOrderId || !document)
        throw new Error("Rattachez le fichier à une intervention.");
      result = {
        document,
        summary: "Document classé ; aucun état métier modifié automatiquement.",
      };
    }
    if (type === "work_order" && !result)
      result = getWorkOrder(companyId, workOrderId);
    if (!result)
      throw new Error("Ce type de document n’a pas de traitement disponible.");
    if (type === "work_order" && intake.blobId && !document)
      addDocument(companyId, {
        workOrderId,
        blobId: intake.blobId,
        blobExt: intake.originalName.split(".").pop().toLowerCase(),
        originalName: intake.originalName,
        mimeType: intake.mimeType,
        category: type,
        metadata: { intakeId },
      });
    const now = Date.now();
    db.prepare(
      `UPDATE gmao_document_intake SET document_type = ?, extracted_data = ?, status = 'accepted',
      matched_work_order_id = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      type,
      JSON.stringify(data),
      workOrderId,
      input.reviewedBy || input.reviewerRole || "Utilisateur",
      now,
      now,
      intakeId,
    );
    db.prepare(
      `UPDATE gmao_agent_recommendations SET status = 'accepted', resolved_at = ?, updated_at = ?
      WHERE company_id = ? AND recommendation_type = 'document_review' AND json_extract(source_data, '$.documentIntakeId') = ? AND status = 'proposed'`,
    ).run(now, now, companyId, intakeId);
  })();
  return {
    intake: documentIntakeRow(
      db
        .prepare("SELECT * FROM gmao_document_intake WHERE id = ?")
        .get(intakeId),
    ),
    result,
  };
}

export function saveRecommendation(companyId, input = {}) {
  scopeInput("gmao_agent_recommendations", companyId, input);
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  db.prepare(
    `INSERT INTO gmao_agent_recommendations (
    id, company_id, work_order_id, asset_id, recommendation_type, title, rationale,
    confidence, priority, proposed_action, status, source_data, created_at, updated_at, resolved_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title=excluded.title, rationale=excluded.rationale,
    confidence=excluded.confidence, priority=excluded.priority, proposed_action=excluded.proposed_action,
    status=excluded.status, source_data=excluded.source_data, updated_at=excluded.updated_at,
    resolved_at=excluded.resolved_at`,
  ).run(
    id,
    companyId,
    input.workOrderId ?? null,
    input.assetId ?? null,
    input.recommendationType || "next_action",
    input.title,
    input.rationale || "",
    finite(input.confidence, 0.5),
    input.priority || "normal",
    input.proposedAction ?? null,
    input.status || "proposed",
    json(input.sourceData),
    input.createdAt || now,
    now,
    input.resolvedAt ?? null,
  );
  return recommendationRow(
    db.prepare("SELECT * FROM gmao_agent_recommendations WHERE id = ?").get(id),
  );
}

export function resolveRecommendation(companyId, id, status, input = {}) {
  if (!["accepted", "dismissed"].includes(status))
    throw new Error("Décision de recommandation invalide.");
  const { db } = get();
  const now = Date.now();
  db.prepare(
    `UPDATE gmao_agent_recommendations SET status = ?, resolved_at = ?, updated_at = ?
    WHERE id = ? AND company_id = ?`,
  ).run(status, now, now, id, companyId);
  return recommendationRow(
    db
      .prepare(
        "SELECT * FROM gmao_agent_recommendations WHERE id = ? AND company_id = ?",
      )
      .get(id, companyId),
  );
}

export function recommendSchedule(companyId, workOrderId, candidates = []) {
  const workOrder = getWorkOrder(companyId, workOrderId);
  if (!workOrder) throw new Error("Ordre d'intervention introuvable.");
  const { db } = get();
  const asset = workOrder.assetId
    ? assetRow(
        db
          .prepare("SELECT * FROM gmao_assets WHERE id = ?")
          .get(workOrder.assetId),
      )
    : null;
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      ...scoreTechnicianCandidate(candidate, {
        requiredSkills: [asset?.technicalSection, asset?.domainCode].filter(
          Boolean,
        ),
        onCallRequired: workOrder.onCall,
      }),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return { ranked: [], recommendation: null };
  const recommendation = saveRecommendation(companyId, {
    workOrderId,
    recommendationType: "schedule",
    title: `Affecter ${best.candidate.name || best.candidate.id}`,
    rationale: `Score ${Math.round(best.score * 100)} % : compétences, disponibilité, distance, charge et astreinte.`,
    confidence: best.score,
    priority: workOrder.priority === "P0" ? "critical" : "high",
    proposedAction: "field.prepareWorkOrder",
    sourceData: { ranked },
  });
  return { ranked, recommendation };
}

export function recordAssetSignal(companyId, assetId, input = {}) {
  scopeInput("gmao_asset_signals", companyId, { ...input, assetId });
  const { db } = get();
  const asset = assetRow(
    db
      .prepare("SELECT * FROM gmao_assets WHERE id = ? AND company_id = ?")
      .get(assetId, companyId),
  );
  if (!asset) throw new Error("Équipement introuvable.");
  const now = input.observedAt || Date.now();
  const id = input.id || uuid();
  db.prepare(
    `INSERT INTO gmao_asset_signals (id, company_id, asset_id, work_order_id,
    signal_type, value, unit, severity, observed_at, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    assetId,
    input.workOrderId ?? null,
    input.signalType || "measurement",
    nullableNumber(input.value),
    input.unit ?? null,
    input.severity || "info",
    now,
    json(input.metadata),
    now,
  );
  evaluateAssetHealth(db, companyId, assetId, now);
  return assetSignalRow(
    db.prepare("SELECT * FROM gmao_asset_signals WHERE id = ?").get(id),
  );
}

export function saveBillingLine(companyId, input = {}) {
  scopeInput("gmao_billing_lines", companyId, input);
  if (!input.invoiceId || !input.workOrderId)
    throw new Error("Facture et OI obligatoires.");
  const { db } = get();
  const now = Date.now();
  const id = input.id || uuid();
  db.prepare(
    `INSERT INTO gmao_billing_lines (id, company_id, invoice_id, work_order_id,
    component_code, component_name, equipment_number, intervention_at, comments,
    service_acceptance_reference, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET component_code=excluded.component_code,
    component_name=excluded.component_name, equipment_number=excluded.equipment_number,
    intervention_at=excluded.intervention_at, comments=excluded.comments,
    service_acceptance_reference=excluded.service_acceptance_reference, updated_at=excluded.updated_at`,
  ).run(
    id,
    companyId,
    input.invoiceId,
    input.workOrderId,
    input.componentCode ?? null,
    input.componentName ?? null,
    input.equipmentNumber ?? null,
    input.interventionAt ?? null,
    input.comments ?? null,
    input.serviceAcceptanceReference ?? null,
    input.createdAt || now,
    now,
  );
  return billingLineRow(
    db.prepare("SELECT * FROM gmao_billing_lines WHERE id = ?").get(id),
  );
}

export function reconcileWorkOrderBilling(companyId, workOrderId) {
  const { db } = get();
  const workOrder = getWorkOrder(companyId, workOrderId);
  if (!workOrder) throw new Error("Ordre d'intervention introuvable.");
  const quote = quoteRow(
    db
      .prepare(
        "SELECT * FROM gmao_quotes WHERE company_id = ? AND work_order_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(companyId, workOrderId),
  );
  const invoice = invoiceRow(
    db
      .prepare(
        "SELECT * FROM gmao_invoices WHERE company_id = ? AND work_order_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(companyId, workOrderId),
  );
  const result = reconcileBilling({
    serviceAcceptanceReference: workOrder.serviceAcceptanceReference,
    quoteRequired: workOrder.repairMode === "with_quote",
    purchaseOrder: workOrder.purchaseOrder,
    quoteTotalCents: quote?.totalCents,
    invoiceTotalCents: invoice?.totalCents,
  });
  upsertException(
    db,
    companyId,
    workOrderId,
    "billing_mismatch",
    result.ok
      ? null
      : {
          severity: "critical",
          title: "Écart de facturation",
          details: result.issues.join(" · "),
          ownerRole: "BillingController",
        },
  );
  return { ...result, workOrderId, quote, invoice };
}

export function runAutomation(companyId, now = Date.now()) {
  const { db } = get();
  const runId = uuid();
  db.prepare(
    `INSERT INTO gmao_automation_runs (id, company_id, trigger_type, status, actions,
    explanation, started_at) VALUES (?, ?, 'scheduled_control', 'running', '[]', ?, ?)`,
  ).run(
    runId,
    companyId,
    "Contrôles déterministes locaux ; aucune action externe exécutée.",
    now,
  );
  const actions = [];
  try {
    const workOrders = db
      .prepare(
        "SELECT * FROM gmao_work_orders WHERE company_id = ? AND status NOT IN ('completed','cancelled')",
      )
      .all(companyId)
      .map(workOrderRow);
    const quotes = db
      .prepare("SELECT * FROM gmao_quotes WHERE company_id = ?")
      .all(companyId)
      .map(quoteRow);
    for (const workOrder of workOrders) {
      const sla = evaluateWorkOrderSla(workOrder, now);
      upsertException(
        db,
        companyId,
        workOrder.id,
        "sla_risk",
        sla.interventionLateMs || sla.restorationLateMs
          ? {
              severity: workOrder.priority === "P0" ? "critical" : "warning",
              title: `SLA en dépassement — ${workOrder.workOrderNumber}`,
              details: `${Math.ceil(Math.max(sla.interventionLateMs, sla.restorationLateMs) / 3_600_000)} h de dépassement potentiel.`,
              ownerRole: "MaintenanceContractManager",
              dueAt: now,
            }
          : null,
      );
      if (workOrder.maxUnavailabilityAt) {
        upsertException(
          db,
          companyId,
          workOrder.id,
          "max_unavailability",
          !workOrder.restoredAt && now > workOrder.maxUnavailabilityAt
            ? {
                severity: "critical",
                title: `Indisponibilité maximale dépassée — ${workOrder.workOrderNumber}`,
                details:
                  "Le délai maximal contractuel d'indisponibilité est dépassé.",
                ownerRole: "DispatchCoordinator",
                dueAt: workOrder.maxUnavailabilityAt,
              }
            : null,
        );
      }
      const quote = quotes.find((item) => item.workOrderId === workOrder.id);
      const next = nextBestAction(workOrder, { quote });
      if (
        next &&
        !db
          .prepare(
            `SELECT 1 FROM gmao_agent_recommendations WHERE company_id = ? AND work_order_id = ?
        AND recommendation_type = 'next_action' AND proposed_action = ? AND status = 'proposed'`,
          )
          .get(companyId, workOrder.id, next.proposedAction)
      ) {
        actions.push(
          saveRecommendation(companyId, {
            workOrderId: workOrder.id,
            recommendationType: "next_action",
            ...next,
          }),
        );
      }
    }
    const assetIds = db
      .prepare("SELECT id FROM gmao_assets WHERE company_id = ?")
      .all(companyId);
    for (const { id } of assetIds) evaluateAssetHealth(db, companyId, id, now);
    evaluateAndRecordSla(companyId, now);
    db.prepare(
      `UPDATE gmao_automation_runs SET status = 'completed', actions = ?, completed_at = ? WHERE id = ?`,
    ).run(JSON.stringify(actions.map((item) => item.id)), Date.now(), runId);
  } catch (error) {
    db.prepare(
      `UPDATE gmao_automation_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
    ).run(error.message, Date.now(), runId);
    throw error;
  }
  return automationRunRow(
    db.prepare("SELECT * FROM gmao_automation_runs WHERE id = ?").get(runId),
  );
}

function evaluateAssetHealth(db, companyId, assetId, now) {
  const asset = db
    .prepare("SELECT * FROM gmao_assets WHERE id = ? AND company_id = ?")
    .get(assetId, companyId);
  if (!asset) return null;
  const since = now - 90 * 86_400_000;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS corrective90d,
    SUM(CASE WHEN status NOT IN ('restored','completed','cancelled') THEN 1 ELSE 0 END) AS unresolved90d
    FROM gmao_work_orders WHERE company_id = ? AND asset_id = ? AND type = 'corrective' AND reported_at >= ?`,
    )
    .get(companyId, assetId, since);
  const severeSignals = db
    .prepare(
      `SELECT COUNT(*) AS n FROM gmao_asset_signals WHERE company_id = ?
    AND asset_id = ? AND severity IN ('warning','critical') AND observed_at >= ?`,
    )
    .get(companyId, assetId, since).n;
  const overdueDays =
    asset.next_service_at && asset.next_service_at < now
      ? (now - asset.next_service_at) / 86_400_000
      : 0;
  const risk = evaluateAssetRisk({
    condition: asset.condition,
    corrective90d: stats.corrective90d,
    unresolved90d: stats.unresolved90d || 0,
    severeSignals,
    preventiveOverdueDays: overdueDays,
  });
  db.prepare(
    `UPDATE gmao_assets SET health_score = ?, failure_risk = ?, last_risk_evaluated_at = ?, updated_at = ? WHERE id = ?`,
  ).run(risk.healthScore, risk.risk, now, now, assetId);
  return risk;
}

function upsertException(db, companyId, workOrderId, type, value) {
  const existing = db
    .prepare(
      "SELECT id FROM gmao_exceptions WHERE company_id = ? AND work_order_id = ? AND exception_type = ?",
    )
    .get(companyId, workOrderId, type);
  if (!value) {
    if (existing)
      db.prepare(
        "UPDATE gmao_exceptions SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'",
      ).run(Date.now(), existing.id);
    return;
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO gmao_exceptions (id, company_id, work_order_id, exception_type,
    severity, title, details, owner_role, status, due_at, detected_at, resolved_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, ?)
    ON CONFLICT(company_id, work_order_id, exception_type) DO UPDATE SET severity=excluded.severity,
    title=excluded.title, details=excluded.details, owner_role=excluded.owner_role,
    status='open', due_at=excluded.due_at, detected_at=excluded.detected_at, resolved_at=NULL,
    metadata=excluded.metadata`,
  ).run(
    existing?.id || uuid(),
    companyId,
    workOrderId,
    type,
    value.severity || "warning",
    value.title,
    value.details ?? null,
    value.ownerRole ?? null,
    value.dueAt ?? null,
    now,
    json(value.metadata),
  );
}

export function exportWeeklyRegister(companyId, options = {}) {
  const from = options.from || Date.now() - 7 * 86_400_000;
  const to = options.to || Date.now();
  const { db } = get();
  const rows = db
    .prepare(
      `SELECT w.*, s.name AS site_name, s.trigram AS site_trigram,
      a.asset_code, a.equipment_type,
      (SELECT ended_at FROM gmao_attachment_sheets x WHERE x.work_order_id = w.id ORDER BY ended_at DESC LIMIT 1) AS attachment_at,
      (SELECT work_performed FROM gmao_attachment_sheets x WHERE x.work_order_id = w.id ORDER BY ended_at DESC LIMIT 1) AS attachment_work,
      (SELECT resolved FROM gmao_attachment_sheets x WHERE x.work_order_id = w.id ORDER BY ended_at DESC LIMIT 1) AS attachment_resolved
    FROM gmao_work_orders w
    JOIN gmao_sites s ON s.id = w.site_id
    LEFT JOIN gmao_assets a ON a.id = w.asset_id
    WHERE w.company_id = ? AND w.reported_at <= ? AND (w.status NOT IN ('completed','cancelled') OR w.reported_at >= ? OR w.completed_at >= ? OR w.restored_at >= ? OR EXISTS (SELECT 1 FROM gmao_work_order_events e WHERE e.work_order_id=w.id AND e.happened_at BETWEEN ? AND ?) OR EXISTS (SELECT 1 FROM gmao_attachment_sheets a WHERE a.work_order_id=w.id AND a.ended_at BETWEEN ? AND ?))
    ORDER BY w.reported_at`,
    )
    .all(companyId, to, from, from, from, from, to, from, to)
    .map((row) => ({
      numero: row.work_order_number,
      oiClient: row.client_oi_number || "",
      site: row.site_name,
      trigram: row.site_trigram,
      equipement: row.asset_code || row.equipment_type || "",
      type: row.type,
      priorite: row.priority,
      statut: row.status,
      recuLe: iso(row.received_at || row.reported_at),
      priseEnChargeLe: iso(row.receipt_confirmed_at),
      programmeLe: iso(row.scheduled_at),
      interventionPrevue: iso(row.intervention_due_at),
      interventionDebutee: iso(row.intervention_started_at),
      retabliLe: iso(row.restored_at),
      clotureLe: iso(row.completed_at),
      technicien: row.assignee_human || "",
      attachementLe: iso(row.attachment_at),
      travaux: row.attachment_work || "",
      resolu:
        row.attachment_resolved == null
          ? ""
          : row.attachment_resolved
            ? "oui"
            : "non",
      reparation: row.repair_mode || "none",
      devis: row.quote_status || "",
      bonCommande: row.purchase_order || "",
      serviceFait: row.service_acceptance ? "oui" : "non",
      referenceSF: row.service_acceptance_reference || "",
      facturation: row.billing_status || "",
    }));
  const headers = {
    numero: "N° OT",
    oiClient: "N° OI client",
    site: "Site",
    trigram: "Trigramme",
    equipement: "Équipement",
    type: "Type",
    priorite: "Priorité",
    statut: "Statut",
    recuLe: "Reçu le",
    priseEnChargeLe: "Prise en charge confirmée le",
    programmeLe: "Intervention programmée le",
    interventionPrevue: "Intervention prévue",
    interventionDebutee: "Intervention débutée",
    retabliLe: "Rétabli le",
    clotureLe: "Clôturé le",
    technicien: "Intervenant",
    attachementLe: "Feuille d'attachement le",
    travaux: "Travaux réalisés",
    resolu: "Résolu",
    reparation: "Circuit réparation",
    devis: "Statut devis",
    bonCommande: "Bon de commande",
    serviceFait: "Service fait",
    referenceSF: "Référence SF",
    facturation: "Statut facturation",
  };
  return {
    filename: `registre-gmao-${new Date(to).toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv;charset=utf-8",
    csv: rowsToCsv(headers, rows),
    rows,
  };
}

export function exportInventory(companyId) {
  const { db } = get();
  const rows = db
    .prepare(
      `SELECT a.*, s.name AS site_name, s.trigram AS site_trigram
    FROM gmao_assets a JOIN gmao_sites s ON s.id = a.site_id
    WHERE a.company_id = ? ORDER BY s.name, a.asset_code`,
    )
    .all(companyId)
    .map((row) => ({
      site: row.site_name,
      trigram: row.site_trigram,
      batiment: row.building_name || "",
      occupant: row.occupant || "",
      section: row.technical_section,
      domaine: row.domain_code,
      type: row.equipment_type,
      quantite: row.quantity,
      numero: row.asset_code,
      puissance: row.power_kw ?? "",
      capacite: row.capacity_liters ?? "",
      marque: row.brand || "",
      reference: row.model_reference || "",
      serie: row.serial_number || "",
      etat: row.condition,
      operationnel: row.operational ? "oui" : "non",
      criticite: row.criticality,
      photo: row.photo_ref || "",
      commentaires: row.comments || "",
    }));
  const headers = {
    site: "Site",
    trigram: "Trigramme",
    batiment: "Bâtiment",
    occupant: "Occupant",
    section: "Section technique",
    domaine: "Domaine",
    type: "Type d'équipement",
    quantite: "Quantité",
    numero: "N° équipement",
    puissance: "Puissance kW",
    capacite: "Capacité litres",
    marque: "Marque",
    reference: "Référence",
    serie: "N° série",
    etat: "État",
    operationnel: "Opérationnel",
    criticite: "Criticité",
    photo: "Photo",
    commentaires: "Commentaires",
  };
  return {
    filename: `inventaire-gmao-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv;charset=utf-8",
    csv: rowsToCsv(headers, rows),
    rows,
  };
}

function updateById(table, id, fields, now = Date.now()) {
  const entries = Object.entries(fields).filter(
    ([, value]) => value !== undefined,
  );
  if (!entries.length) return;
  const assignments = entries
    .map(([column]) => `${column} = @${column}`)
    .join(", ");
  get()
    .db.prepare(
      `UPDATE ${table} SET ${assignments}, updated_at = @updated_at WHERE id = @id`,
    )
    .run({ id, updated_at: now, ...Object.fromEntries(entries) });
}

function mapRow(row, mapping) {
  if (!row) return null;
  const out = {};
  for (const [column, key] of Object.entries(mapping)) {
    let value = row[column];
    if (JSON_FIELDS.has(key))
      value = parseJson(
        value,
        key === "checklist" ||
          key === "evidenceRequirements" ||
          key === "personnel"
          ? []
          : null,
      );
    if (BOOL_FIELDS.has(key)) value = Boolean(value);
    out[key] = value;
  }
  return out;
}

const BASE = {
  id: "id",
  company_id: "companyId",
  created_at: "createdAt",
  updated_at: "updatedAt",
};
const contractRow = (row) =>
  mapRow(row, {
    ...BASE,
    name: "name",
    market_number: "marketNumber",
    lot_number: "lotNumber",
    engagement_number: "engagementNumber",
    holder_name: "holderName",
    department: "department",
    starts_at: "startsAt",
    ends_at: "endsAt",
    renewal_type: "renewalType",
    obligation_of_result: "obligationOfResult",
    emergency_phone: "emergencyPhone",
    timezone: "timezone",
    currency: "currency",
    vat_rate: "vatRate",
    status: "status",
    config: "config",
    client_contact_name: "clientContactName",
    client_email: "clientEmail",
    client_phone: "clientPhone",
  });
const siteRow = (row) =>
  mapRow(row, {
    ...BASE,
    client_id: "clientId",
    service_contract_id: "serviceContractId",
    contract_id: "contractId",
    name: "name",
    trigram: "trigram",
    department: "department",
    commune: "commune",
    address: "address",
    kind: "kind",
    scope: "scope",
    exclusions: "exclusions",
    active: "active",
    metadata: "metadata",
    antenna: "antenna",
    reference_organization: "referenceOrganization",
    g2d_number: "g2dNumber",
  });
const assetRow = (row) =>
  mapRow(row, {
    ...BASE,
    site_id: "siteId",
    asset_code: "assetCode",
    building_code: "buildingCode",
    building_name: "buildingName",
    occupant: "occupant",
    technical_section: "technicalSection",
    domain_code: "domainCode",
    equipment_type: "equipmentType",
    quantity: "quantity",
    power_kw: "powerKw",
    capacity_liters: "capacityLiters",
    brand: "brand",
    model_reference: "modelReference",
    serial_number: "serialNumber",
    condition: "condition",
    operational: "operational",
    criticality: "criticality",
    location: "location",
    photo_ref: "photoRef",
    comments: "comments",
    last_service_at: "lastServiceAt",
    next_service_at: "nextServiceAt",
    health_score: "healthScore",
    failure_risk: "failureRisk",
    last_risk_evaluated_at: "lastRiskEvaluatedAt",
    metadata: "metadata",
  });
const planRow = (row) =>
  mapRow(row, {
    ...BASE,
    asset_id: "assetId",
    technical_section: "technicalSection",
    equipment_type: "equipmentType",
    name: "name",
    description: "description",
    periodicity_months: "periodicityMonths",
    checklist: "checklist",
    evidence_requirements: "evidenceRequirements",
    active: "active",
    next_due_at: "nextDueAt",
    last_generated_at: "lastGeneratedAt",
    metadata: "metadata",
  });
const workOrderRow = (row) =>
  mapRow(row, {
    ...BASE,
    duration_minutes: "durationMinutes",
    preventive_due_at: "preventiveDueAt",
    request_key: "requestKey",
    contract_id: "contractId",
    site_id: "siteId",
    asset_id: "assetId",
    maintenance_plan_id: "maintenancePlanId",
    issue_id: "issueId",
    work_order_number: "workOrderNumber",
    type: "type",
    status: "status",
    priority: "priority",
    title: "title",
    description: "description",
    source: "source",
    reported_at: "reportedAt",
    acknowledged_at: "acknowledgedAt",
    intervention_due_at: "interventionDueAt",
    intervention_started_at: "interventionStartedAt",
    restoration_due_at: "restorationDueAt",
    restored_at: "restoredAt",
    completed_at: "completedAt",
    unavailable_from: "unavailableFrom",
    unavailable_until: "unavailableUntil",
    assignee_role: "assigneeRole",
    assignee_companion: "assigneeCompanion",
    assignee_human: "assigneeHuman",
    on_call: "onCall",
    quote_status: "quoteStatus",
    purchase_order: "purchaseOrder",
    service_acceptance: "serviceAcceptance",
    campaign_color: "campaignColor",
    result: "result",
    cost: "cost",
    client_oi_number: "clientOiNumber",
    received_at: "receivedAt",
    receipt_confirmed_at: "receiptConfirmedAt",
    scheduled_at: "scheduledAt",
    repair_mode: "repairMode",
    closure_status: "closureStatus",
    service_acceptance_reference: "serviceAcceptanceReference",
    service_acceptance_received_at: "serviceAcceptanceReceivedAt",
    billing_status: "billingStatus",
    source_document_id: "sourceDocumentId",
    requester_name: "requesterName",
    requester_contact: "requesterContact",
    integrated_at: "integratedAt",
    blockage_level: "blockageLevel",
    location_detail: "locationDetail",
    predicted_category: "predictedCategory",
    ai_confidence: "aiConfidence",
    max_unavailability_at: "maxUnavailabilityAt",
  });
const eventRow = (row) =>
  mapRow(row, {
    id: "id",
    company_id: "companyId",
    work_order_id: "workOrderId",
    event_type: "eventType",
    from_status: "fromStatus",
    to_status: "toStatus",
    actor_role: "actorRole",
    actor_name: "actorName",
    note: "note",
    evidence: "evidence",
    happened_at: "happenedAt",
  });
const documentRow = (row) =>
  mapRow(row, {
    ...BASE,
    contract_id: "contractId",
    site_id: "siteId",
    asset_id: "assetId",
    work_order_id: "workOrderId",
    category: "category",
    filename: "filename",
    original_name: "originalName",
    mime_type: "mimeType",
    blob_id: "blobId",
    blob_ext: "blobExt",
    storage_ref: "storageRef",
    sha256: "sha256",
    status: "status",
    valid_from: "validFrom",
    valid_until: "validUntil",
    metadata: "metadata",
  });
const complianceRow = (row) =>
  mapRow(row, {
    ...BASE,
    site_id: "siteId",
    subcontractor_id: "subcontractorId",
    document_id: "documentId",
    record_type: "recordType",
    subject_name: "subjectName",
    status: "status",
    valid_from: "validFrom",
    valid_until: "validUntil",
    owner_role: "ownerRole",
    notes: "notes",
  });
const subcontractorRow = (row) =>
  mapRow(row, {
    ...BASE,
    name: "name",
    registration: "registration",
    contact: "contact",
    declared: "declared",
    dc4_status: "dc4Status",
    payment_approved: "paymentApproved",
    status: "status",
    personnel: "personnel",
  });
const rateRow = (row) =>
  mapRow(row, {
    ...BASE,
    label: "label",
    technical_section: "technicalSection",
    equipment_type: "equipmentType",
    rate_type: "rateType",
    amount_cents: "amountCents",
    coefficient: "coefficient",
    vat_rate: "vatRate",
    included: "included",
    effective_from: "effectiveFrom",
    effective_until: "effectiveUntil",
    metadata: "metadata",
  });
const quoteRow = (row) =>
  mapRow(row, {
    ...BASE,
    work_order_id: "workOrderId",
    quote_number: "quoteNumber",
    quote_type: "quoteType",
    status: "status",
    parts_cents: "partsCents",
    labor_cents: "laborCents",
    travel_cents: "travelCents",
    access_cents: "accessCents",
    franchise_cents: "franchiseCents",
    coefficient: "coefficient",
    subtotal_cents: "subtotalCents",
    vat_rate: "vatRate",
    vat_cents: "vatCents",
    total_cents: "totalCents",
    purchase_order: "purchaseOrder",
    calculation: "calculation",
    procurement_id: "procurementId",
    supplier_proforma_ref: "supplierProformaRef",
    sent_at: "sentAt",
    accepted_at: "acceptedAt",
    purchase_order_received_at: "purchaseOrderReceivedAt",
    rejection_reason: "rejectionReason",
    valid_until: "validUntil",
  });
const invoiceRow = (row) =>
  mapRow(row, {
    ...BASE,
    work_order_id: "workOrderId",
    quote_id: "quoteId",
    invoice_number: "invoiceNumber",
    status: "status",
    subtotal_cents: "subtotalCents",
    vat_rate: "vatRate",
    vat_cents: "vatCents",
    total_cents: "totalCents",
    issued_at: "issuedAt",
    sent_at: "sentAt",
    recipient: "recipient",
    document_id: "documentId",
    notes: "notes",
    planning_export_status: "planningExportStatus",
  });
const penaltyRow = (row) =>
  mapRow(row, {
    id: "id",
    company_id: "companyId",
    work_order_id: "workOrderId",
    document_id: "documentId",
    penalty_key: "penaltyKey",
    label: "label",
    rate_cents: "rateCents",
    unit: "unit",
    quantity: "quantity",
    amount_cents: "amountCents",
    status: "status",
    reason: "reason",
    detected_at: "detectedAt",
    resolved_at: "resolvedAt",
    notes: "notes",
  });
const onCallRow = (row) =>
  mapRow(row, {
    ...BASE,
    site_id: "siteId",
    person_name: "personName",
    phone: "phone",
    starts_at: "startsAt",
    ends_at: "endsAt",
    status: "status",
    notes: "notes",
  });
const attachmentSheetRow = (row) =>
  mapRow(row, {
    details: "details",
    ...BASE,
    work_order_id: "workOrderId",
    visit_number: "visitNumber",
    technician_name: "technicianName",
    started_at: "startedAt",
    ended_at: "endedAt",
    diagnosis: "diagnosis",
    work_performed: "workPerformed",
    measurements: "measurements",
    parts_used: "partsUsed",
    photo_refs: "photoRefs",
    resolved: "resolved",
    repair_required: "repairRequired",
    repair_mode: "repairMode",
    customer_signatory: "customerSignatory",
    customer_signature: "customerSignature",
    status: "status",
    sticker_campaign: "stickerCampaign",
    sticker_color: "stickerColor",
    sticker_applied_at: "stickerAppliedAt",
  });
const procurementRow = (row) =>
  mapRow(row, {
    ...BASE,
    supplier_id: "supplierId",
    items: "items",
    order_reference: "orderReference",
    receipt_reference: "receiptReference",
    responsible: "responsible",
    due_at: "dueAt",
    work_order_id: "workOrderId",
    attachment_sheet_id: "attachmentSheetId",
    request_type: "requestType",
    supplier_name: "supplierName",
    description: "description",
    status: "status",
    requested_at: "requestedAt",
    proforma_received_at: "proformaReceivedAt",
    ordered_at: "orderedAt",
    received_at: "receivedAt",
    proforma_reference: "proformaReference",
    proforma_document_id: "proformaDocumentId",
    amount_cents: "amountCents",
    notes: "notes",
  });
const notificationRow = (row) =>
  mapRow(row, {
    ...BASE,
    work_order_id: "workOrderId",
    notification_type: "notificationType",
    channel: "channel",
    recipient: "recipient",
    subject: "subject",
    message: "message",
    delivery_status: "deliveryStatus",
    prepared_at: "preparedAt",
    sent_at: "sentAt",
    error: "error",
    metadata: "metadata",
  });
const documentIntakeRow = (row) =>
  mapRow(row, {
    ...BASE,
    blob_id: "blobId",
    original_name: "originalName",
    mime_type: "mimeType",
    source_channel: "sourceChannel",
    sender: "sender",
    received_at: "receivedAt",
    extracted_text: "extractedText",
    document_type: "documentType",
    confidence: "confidence",
    extracted_data: "extractedData",
    status: "status",
    matched_work_order_id: "matchedWorkOrderId",
    reviewed_by: "reviewedBy",
    reviewed_at: "reviewedAt",
    error: "error",
  });
const recommendationRow = (row) =>
  mapRow(row, {
    ...BASE,
    work_order_id: "workOrderId",
    asset_id: "assetId",
    recommendation_type: "recommendationType",
    title: "title",
    rationale: "rationale",
    confidence: "confidence",
    priority: "priority",
    proposed_action: "proposedAction",
    status: "status",
    source_data: "sourceData",
    resolved_at: "resolvedAt",
  });
const exceptionRow = (row) =>
  mapRow(row, {
    id: "id",
    company_id: "companyId",
    work_order_id: "workOrderId",
    exception_type: "exceptionType",
    severity: "severity",
    title: "title",
    details: "details",
    owner_role: "ownerRole",
    status: "status",
    due_at: "dueAt",
    detected_at: "detectedAt",
    resolved_at: "resolvedAt",
    metadata: "metadata",
  });
const automationRunRow = (row) =>
  mapRow(row, {
    id: "id",
    company_id: "companyId",
    trigger_type: "triggerType",
    entity_type: "entityType",
    entity_id: "entityId",
    status: "status",
    actions: "actions",
    explanation: "explanation",
    started_at: "startedAt",
    completed_at: "completedAt",
    error: "error",
  });
const assetSignalRow = (row) =>
  mapRow(row, {
    id: "id",
    company_id: "companyId",
    asset_id: "assetId",
    work_order_id: "workOrderId",
    signal_type: "signalType",
    value: "value",
    unit: "unit",
    severity: "severity",
    observed_at: "observedAt",
    metadata: "metadata",
    created_at: "createdAt",
  });
const billingLineRow = (row) =>
  mapRow(row, {
    ...BASE,
    invoice_id: "invoiceId",
    work_order_id: "workOrderId",
    component_code: "componentCode",
    component_name: "componentName",
    equipment_number: "equipmentNumber",
    intervention_at: "interventionAt",
    comments: "comments",
    service_acceptance_reference: "serviceAcceptanceReference",
  });

function json(value) {
  return value == null ? null : JSON.stringify(value);
}
function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function bool(value) {
  return value ? 1 : 0;
}
function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function nullableNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positiveInt(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function addMonths(timestamp, months) {
  const d = new Date(timestamp),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.getTime();
}
function normalizeCode(value) {
  return String(value || "GMAO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
function shortId(id) {
  return String(id).replaceAll("-", "").slice(0, 6).toUpperCase();
}
function extension(name) {
  const raw = String(name || "");
  return raw.includes(".") ? raw.split(".").pop() : "pdf";
}
function iso(value) {
  return value ? new Date(value).toISOString() : "";
}
