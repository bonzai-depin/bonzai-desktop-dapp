import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as issues from "../../../src/main/db/repos/issues.js";
import * as approvals from "../../../src/main/db/repos/approvals.js";
import * as maintenance from "../../../src/main/db/repos/gmaoMaintenance.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import { makeCharter } from "../../../src/services/company/charter.js";
const { db } = get(),
  now = Date.now(),
  day = 86400000,
  company = "maintenance-fixture";
companies.save({
  ...makeCharter({
    name: "Maintenance controls fixture",
    mission: "Verify evidenced contractual gates",
  }),
  id: company,
  status: "active",
});
companies.save({
  ...makeCharter({ name: "Foreign company", mission: "Isolation fixture" }),
  id: "foreign-maintenance",
  status: "active",
});
gmao.bootstrap(company);
const site = gmao.saveSite(company, { name: "Validated site", trigram: "V01" }),
  other = gmao.saveSite(company, { name: "Other site", trigram: "V02" });
const asset = gmao.saveAsset(company, {
  siteId: site.id,
  assetCode: "VESSEL1",
  equipmentType: "ESP",
  technicalSection: "ST3",
  domainCode: "ESP",
});
const wo = gmao.createWorkOrder(company, {
  siteId: site.id,
  assetId: asset.id,
  title: "Pressure vessel fault",
  receivedAt: now - day,
  type: "corrective",
  assigneeHuman: "Camille",
});
assert.equal(
  wo.reportedAt,
  now - day,
  "SLA starts when the call was received, not when data entry occurred",
);
assert.doesNotThrow(
  () => maintenance.assertDispatch(company, wo),
  "Unrelated SMB contracts do not inherit military-site restrictions",
);
const policy = {
  name: "Validated CCTP",
  sourceReference: "Supplied prescriptions p7–24",
  timezone: "Europe/Paris",
  enabled: true,
  validatedBy: "Contract manager",
  calendarValidated: true,
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
  onCallReportHour: 9,
  periodicReportHour: 17,
  equipmentReportCadence: "weekly",
  st1MonthlyReport: false,
  st2SemesterReport: true,
  openingHoursPerDay: 8,
  decisions: {
    report_frequency: "Weekly confirmed",
    st3_reporting_scope: "Gas equipment confirmed",
    esp_frequency: "48 months confirmed",
  },
};
assert.throws(
  () =>
    maintenance.saveRecord(company, {
      kind: "policy",
      siteId: site.id,
      data: policy,
    }),
  /Confirmez/,
);
const savedPolicy = maintenance.saveRecord(company, {
  kind: "policy",
  siteId: site.id,
  data: policy,
  confirmed: true,
});
assert.throws(
  () => maintenance.assertDispatch(company, wo),
  /Dossier intervenant/,
);
const doc = (
  label,
  workOrderId = null,
  siteId = site.id,
  category = "maintenance_evidence",
) =>
  gmao.addDocument(company, {
    siteId,
    workOrderId,
    originalName: label + ".pdf",
    blobId: label,
    blobExt: "pdf",
    category,
  });
const identity = doc("identity"),
  cpr = doc("cpr"),
  qualification = doc("qualification"),
  prevention = doc("prevention"),
  inspection = doc("inspection");
const person = {
  name: "Camille",
  birthDate: "1985-03-20",
  birthPlace: "Paris",
  nationality: "French",
  employer: "Fixture",
  visitPurpose: "Maintenance",
  visitedService: "SID",
  identityType: "national_id",
  identityDocumentId: identity.id,
  cprDocumentId: cpr.id,
  identityValidUntil: now + day * 400,
  accessValidUntil: now + day * 60,
  approvedBy: "Site authority",
  renewalSubmittedAt: now,
  qualifications: ["Pressure systems"],
  qualificationsDocumentId: qualification.id,
  qualificationsValidUntil: now + day * 100,
};
const personRecord = maintenance.saveRecord(company, {
  kind: "person",
  siteId: site.id,
  data: person,
  confirmed: true,
});
maintenance.saveRecord(company, {
  kind: "site_safety",
  siteId: site.id,
  data: {
    jointInspectionDocumentId: inspection.id,
    preventionDocumentId: prevention.id,
    validUntil: now + day * 40,
    approvedBy: "Site authority",
  },
  confirmed: true,
});
assert.doesNotThrow(() => maintenance.assertDispatch(company, wo));
maintenance.saveRecord(company, {
  id: personRecord.id,
  kind: "person",
  siteId: site.id,
  data: { ...person, qualificationsValidUntil: now - day },
  confirmed: true,
});
assert.throws(
  () => maintenance.assertDispatch(company, wo),
  /Habilitations.*expirées/,
);
assert.throws(
  () =>
    maintenance.saveRecord(company, {
      kind: "field_report",
      siteId: other.id,
      workOrderId: wo.id,
      data: { siteRepresentative: "A", causes: "B", finalState: "operational" },
    }),
  /hors site/,
);
assert.throws(
  () =>
    maintenance.saveRecord("foreign-maintenance", {
      kind: "person",
      siteId: site.id,
      data: person,
    }),
  /Référence/,
);
assert.throws(
  () => maintenance.assertCompletion(company, wo),
  /Signature du technicien/,
);
const signed = doc(
  "signed-intervention",
  wo.id,
  site.id,
  "intervention_report",
);
assert.throws(
  () =>
    maintenance.signIntervention(company, {
      workOrderId: wo.id,
      role: "technician",
      name: "Camille",
      documentId: signed.id,
      confirmed: true,
    }),
  /feuille terrain/,
);
db.prepare(
  "UPDATE gmao_work_orders SET status='on_site',intervention_started_at=? WHERE id=?",
).run(now - 3600000, wo.id);
maintenance.saveRecord(company, {
  kind: "field_report",
  siteId: site.id,
  workOrderId: wo.id,
  data: {
    siteRepresentative: "Site manager",
    causes: "Worn seal",
    consumables: "Sealant",
    finalState: "operational",
    safetyConfirmed: true,
    userInformed: true,
    registerUpdated: true,
  },
});
const field = gmao.recordAttachmentSheet(company, wo.id, {
  technicianName: "Camille",
  startedAt: now - 3600000,
  endedAt: now,
  workPerformed: "Replaced seal",
  diagnosis: "Worn seal",
  resolved: true,
});
assert.equal(field.details.siteRepresentative, "Site manager");
assert.equal(field.details.consumables, "Sealant");
maintenance.signIntervention(company, {
  workOrderId: wo.id,
  role: "technician",
  name: "Camille",
  documentId: signed.id,
  confirmed: true,
});
assert.throws(() => maintenance.assertCompletion(company, wo), /responsable/);

db.prepare(
  "UPDATE gmao_work_orders SET status='restored',restored_at=? WHERE id=?",
).run(now, wo.id);
maintenance.signIntervention(company, {
  workOrderId: wo.id,
  role: "contract_manager",
  name: "Manager",
  documentId: signed.id,
  confirmed: true,
});
assert.doesNotThrow(() => maintenance.assertCompletion(company, wo));

assert.equal(
  maintenance.dossierContext(company, {
    ...wo,
    status: "restored",
    restoredAt: now,
  }).reportDeadline.dueAt,
  now + 2 * day,
);
const reg = maintenance.saveRecord(company, {
  kind: "regulatory",
  siteId: site.id,
  assetId: asset.id,
  data: {
    equipmentFamily: "ESP",
    lastInspectionAt: now - 100 * day,
    lastRequalificationAt: now - 200 * day,
    inspectionDocumentId: inspection.id,
    requalificationDocumentId: inspection.id,
    createPlans: true,
  },
  confirmed: true,
});
const plans = gmao
  .snapshot(company)
  .plans.filter((p) => p.assetId === asset.id);
assert.equal(plans.length, 2);
assert.deepEqual(
  plans.map((p) => p.periodicityMonths).sort((a, b) => a - b),
  [48, 120],
);
maintenance.saveRecord(company, { ...reg, data: reg.data, confirmed: true });
assert.equal(
  gmao.snapshot(company).plans.filter((p) => p.assetId === asset.id).length,
  2,
  "Regulatory updates must not duplicate plans",
);
const sample = {
  name: "ESP checks",
  technicalSection: "ST3",
  assetIds: [asset.id],
  periodicityMonths: 6,
  nextDueAt: now + 30 * day,
  checklist: ["Pressure reading"],
  source: { filename: "fixture.xls", sheet: "ESP", headerRow: 12 },
};
maintenance.importPlans(company, { plans: [sample], confirmed: true });
maintenance.importPlans(company, { plans: [sample], confirmed: true });
assert.equal(
  gmao.snapshot(company).plans.filter((p) => p.name === "ESP checks").length,
  1,
  "Importing the same source does not create duplicate work",
);
assert.throws(
  () =>
    maintenance.importPlans(company, {
      plans: [{ ...sample, technicalSection: "ST1" }],
      confirmed: true,
    }),
  /section/,
);
const plan = gmao.snapshot(company).plans.find((p) => p.name === "ESP checks");
const preventive = gmao.createWorkOrder(company, {
  siteId: site.id,
  assetId: asset.id,
  title: "Scheduled check",
  type: "preventive",
  maintenancePlanId: plan.id,
  scheduledAt: now + 30 * day,
  assigneeHuman: "Camille",
});
assert.throws(
  () =>
    maintenance.assertScheduleChange(company, preventive, {
      scheduledAt: now + 31 * day,
    }),
  /valider le déplacement/,
);
maintenance.saveRecord(company, {
  kind: "reschedule",
  siteId: site.id,
  workOrderId: preventive.id,
  data: {
    fromAt: preventive.scheduledAt,
    toAt: now + 31 * day,
    reason: "Occupant availability",
    approvedBy: "SID",
    approvalDocumentId: inspection.id,
  },
  confirmed: true,
});
assert.doesNotThrow(() =>
  maintenance.assertScheduleChange(company, preventive, {
    scheduledAt: now + 31 * day,
  }),
);
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: site.id,
      assetId: asset.id,
      title: "Conflicting corrective",
      type: "corrective",
      scheduledAt: preventive.scheduledAt,
      assigneeHuman: "Different person",
    }),
  /équipement/,
);
const state = maintenance.snapshot(company, { now: now + 3 * day });
assert.ok(
  state.obligations.some(
    (o) =>
      o.workOrderId === wo.id &&
      o.kind === "intervention_report" &&
      o.status === "late",
  ),
);
assert.ok(
  state.obligations.some(
    (o) => o.recordId === personRecord.id && o.status === "late",
  ),
);
assert.ok(state.obligations.some((o) => o.kind === "periodic_report"));
const report = maintenance
  .snapshot(company)
  .obligations.find((o) => o.kind === "periodic_report");
const prepared = maintenance.prepareReportTask(company, {
  siteId: site.id,
  reportId: report.reportId,
});
assert.equal(
  maintenance.prepareReportTask(company, {
    siteId: site.id,
    reportId: report.reportId,
  }).issueId,
  prepared.issueId,
);
assert.equal(
  issues.getById(company, prepared.issueId).assigneeRole,
  "DocumentController",
);
assert.ok(
  db
    .prepare("SELECT id FROM published_content WHERE id=? AND company_id=?")
    .get(prepared.contentId, company),
);
assert.throws(
  () =>
    maintenance.recordReportDelivery(company, {
      siteId: site.id,
      reportId: report.reportId,
      issueId: prepared.issueId,
    }),
  /Aucun envoi approuvé/,
);
const action = {
  type: "email.send",
  to: "test@example.invalid",
  subject: "Verified site report",
  html: "<p>Maintenance report for the validated site and period</p>",
};
const approval = approvals.enqueue(company, {
  cls: "external",
  action,
  role: "DocumentController",
  issueId: prepared.issueId,
  stepId: "report_send",
});
const step = {
  id: "report_send",
  action,
  resolvedAction: action,
  approvalId: approval.id,
  status: "completed",
  finishedAt: now,
  output: {
    status: "submitted",
    externalId: "fixture-receipt",
    receipt: { provider: "sendgrid", httpStatus: 202, recipient: action.to },
  },
};
db.prepare("UPDATE issues SET execution=? WHERE id=?").run(
  JSON.stringify({ version: 1, steps: [step] }),
  prepared.issueId,
);
assert.throws(
  () =>
    maintenance.recordReportDelivery(company, {
      siteId: site.id,
      reportId: report.reportId,
      issueId: prepared.issueId,
    }),
  /Aucun envoi approuvé/,
  "a receipt without owner approval cannot discharge the report",
);
approvals.approve(company, approval.id);
const sent = maintenance.recordReportDelivery(company, {
  siteId: site.id,
  reportId: report.reportId,
  issueId: prepared.issueId,
});
assert.equal(sent.data.externalId, "fixture-receipt");
assert.equal(
  maintenance
    .snapshot(company)
    .obligations.find((o) => o.reportId === report.reportId).status,
  "sent",
);
step.output.simulated = true;
db.prepare("UPDATE issues SET execution=? WHERE id=?").run(
  JSON.stringify({ version: 1, steps: [step] }),
  prepared.issueId,
);
assert.throws(
  () =>
    maintenance.recordReportDelivery(company, {
      siteId: site.id,
      reportId: report.reportId,
      issueId: prepared.issueId,
    }),
  /Aucun envoi approuvé/,
  "simulation cannot satisfy delivery",
);
assert.throws(
  () =>
    maintenance.recordReportDelivery(company, {
      siteId: other.id,
      reportId: report.reportId,
      issueId: prepared.issueId,
    }),
  /tâche de préparation/,
);

assert.equal(state.metrics.find((m) => m.assetId === asset.id).failureCount, 1);
assert.ok(
  db
    .prepare(
      "SELECT COUNT(*) n FROM audit_entries WHERE company_id=? AND action LIKE 'maintenance.%'",
    )
    .get(company).n > 5,
);
assert.ok(
  db.prepare("PRAGMA foreign_key_list(gmao_maintenance_records)").all()
    .length === 4,
);
assert.equal(
  gmao
    .exportWeeklyRegister(company, { from: now - day / 2, to: now + day })
    .rows.some((row) => row.numero === wo.workOrderNumber),
  true,
  "Weekly export includes older interventions that had activity this week",
);
// A restore must enforce the same documentary boundaries as live writes.
const otherAsset = gmao.saveAsset(company, {
  siteId: other.id,
  assetCode: "OTHER1",
  equipmentType: "ESP",
  technicalSection: "ST3",
});
const otherPlan = gmao.savePlan(company, {
  assetId: otherAsset.id,
  name: "Other site's inspection",
  technicalSection: "ST3",
});
const commonPlan = gmao.savePlan(company, {
  name: "Common contract checks",
  technicalSection: "ST3",
});
const otherWork = gmao.createWorkOrder(company, {
  siteId: other.id,
  assetId: otherAsset.id,
  title: "Other intervention",
});
db.prepare(
  "UPDATE gmao_work_orders SET status='on_site',intervention_started_at=? WHERE id=?",
).run(now - 3600000, otherWork.id);
const otherVisit = gmao.recordAttachmentSheet(company, otherWork.id, {
  technicianName: "Other technician",
  startedAt: now - 3600000,
  endedAt: now,
  workPerformed: "Other visit",
  diagnosis: "Other fault",
  resolved: true,
});
const otherProof = doc("other-signed-visit", otherWork.id, other.id);
const commonProof = doc("common-contract-approval", null, null);
const programme = maintenance.saveRecord(company, {
  kind: "programme",
  siteId: site.id,
  data: {
    name: "Annual schedule",
    year: new Date().getFullYear(),
    planIds: [plan.id, commonPlan.id],
  },
});
maintenance.approveProgramme(company, {
  programmeId: programme.id,
  approver: "Contract manager",
  documentId: commonProof.id,
  confirmed: true,
});
// Fixture documents use stable storage references, not pretend blob hashes.
db.prepare(
  "UPDATE gmao_documents SET storage_ref='fixture:' || id,blob_id=NULL WHERE company_id=?",
).run(company);
const backup = portability.exportBundle(company);
for (const [kind, patch, error] of [
  ["signature", { documentId: otherProof.id }, /same intervention/],
  ["signature", { attachmentSheetId: otherVisit.id }, /same intervention/],
  ["signature", { documentId: commonProof.id }, /same intervention/],
  ["programme", { approvalDocumentId: otherProof.id }, /another site/],
  ["programme", { planIds: [otherPlan.id] }, /plan from another site/],
]) {
  const corrupted = structuredClone(backup);
  const entry = corrupted.tables.gmao_maintenance_records.find(
    (row) => row.kind === kind,
  );
  entry.data = JSON.stringify({ ...JSON.parse(entry.data), ...patch });
  const count = db.prepare("SELECT count(*) n FROM companies").get().n;
  assert.throws(() => portability.importBundle(corrupted), error);
  assert.equal(
    db.prepare("SELECT count(*) n FROM companies").get().n,
    count,
    "Rejected restore creates no partial company",
  );
}
const restored = portability.importBundle(backup);
const restoredState = gmao.snapshot(restored.id);
const restoredWork = restoredState.workOrders.find(
  (row) => row.title === wo.title,
);
assert.doesNotThrow(
  () => maintenance.assertCompletion(restored.id, restoredWork),
  "Correct intervention signatures survive remapping",
);
const restoredProgramme = maintenance
  .snapshot(restored.id)
  .records.find((row) => row.kind === "programme");
assert.equal(
  restoredProgramme.data.status,
  "approved",
  "Unscoped common contract proof remains valid after restore",
);
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
console.log(
  "Maintenance evidence, deadline, import, dispatch and scoped restore fixtures passed. No live sends.",
);
